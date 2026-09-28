import { useEffect, useMemo, useState } from 'react'
import { Ban, BellRing, CalendarDays, Camera, Check, Pencil, CircleCheck, ClipboardList, Clock, MessageCircle, Sparkles, UserRound, UserX } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Modal, StatusBadge } from './ui'
import Checkout from './Checkout'
import { anamneseAlerts, ClientModal } from '../pages/staff/Cadastros'
import { PortfolioModal } from './Loyalty'
import { fmtDateLong, fmtPhone, freeSlots, maskPhone, money, onlyDigits, relDay, today, waLink, weekday } from '../lib/utils'
import { msg as fillMsg } from '../lib/messages'
import { db } from '../data'
import { doesService, totalDuration } from '../lib/commission'

export function serviceNames(appt, services) {
  return appt.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') || 'Serviço'
}

/** Detalhe do agendamento + ações */
export function AppointmentModal({ appt, onClose, canCharge = true }) {
  const { data, actions, session } = useStore()
  const [charging, setCharging] = useState(false)
  const [ficha, setFicha] = useState(false)
  const [port, setPort] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pinging, setPinging] = useState(false)
  const ping = async () => {
    setPinging(true)
    try {
      const r = await db.notifyAppointment(appt.id)
      if (r?.demo) actions.notify('No modo demonstração a notificação não é enviada')
      else actions.notify(`Lembrete enviado · cliente: ${r.client ? 'recebeu' : 'não ativou os lembretes'} · profissional: ${r.pro ? 'recebeu' : 'sem celular ativado'}`, r.client || r.pro ? undefined : 'bad')
    } catch (e) { actions.notify(e.message, 'bad') } finally { setPinging(false) }
  }
  if (!appt) return null
  const barber = data.barbers.find((b) => b.id === appt.barberId)
  const svc = serviceNames(appt, data.services)
  const open = !['concluido', 'cancelado', 'faltou'].includes(appt.status)
  const set = async (status, msg) => { await actions.updateAppointment(appt.id, { status }, msg); onClose() }
  const reminder = fillMsg(data.settings, 'reminder', { nome: appt.clientName.split(' ')[0], servico: svc, data: relDay(appt.date).toLowerCase(), hora: appt.time, profissional: barber?.name })
  const client = data.clients.find((c) => c.id === appt.clientId)
  const alerts = anamneseAlerts(client?.anamnese)
  const hasPhone = onlyDigits(appt.clientPhone).length >= 10
  const nPhotos = data.photos.filter((p) => p.clientId === appt.clientId).length
  if (ficha && client) return <ClientModal c={client} restricted={session?.role !== 'admin'} onClose={() => setFicha(false)} />
  if (port && client) return <PortfolioModal client={client} photos={data.photos} onClose={() => setPort(false)} />

  if (editing) return <NewAppointmentModal open edit={appt} lockBarber={session?.role !== 'admin'} onClose={() => { setEditing(false); onClose() }} />

  if (charging) {
    return (
      <Modal open onClose={() => setCharging(false)} title={`Cobrar · ${appt.clientName}`} wide>
        <Checkout appointment={appt} lockBarber onDone={onClose} />
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Agendamento">
      <div className="appt-detail">
        <div className="appt-head">
          <div><h4>{appt.clientName}</h4>{hasPhone ? <a href={`tel:${appt.clientPhone}`}>{fmtPhone(appt.clientPhone)}</a> : <small className="muted">Contato visível só para a gestão</small>}</div>
          <StatusBadge status={appt.status} />
        </div>
        {alerts.length > 0 && <div className="an-alerts"><b>Atenção na ficha</b>{alerts.map((t) => <span key={t} className="badge badge-warn">{t}</span>)}</div>}
        <div className="summary">
          <div><Sparkles size={18} /><span>{svc}</span><b>{money(appt.total)}</b></div>
          <div><CalendarDays size={18} /><span>{fmtDateLong(appt.date)}</span><b>{appt.time}</b></div>
          <div><Clock size={18} /><span>Duração</span><b>{appt.duration} min</b></div>
          <div><UserRound size={18} /><span>{barber?.name}</span><b>{appt.source === 'online' ? 'App' : 'Balcão'}</b></div>
        </div>
        {client && (
          <div className="appt-links">
            <Button variant="ghost" size="sm" icon={ClipboardList} onClick={() => setFicha(true)}>Ficha da cliente</Button>
            <Button variant="ghost" size="sm" icon={Camera} onClick={() => setPort(true)}>Portfólio ({nPhotos})</Button>
          </div>
        )}
        <div className="appt-actions">
          {hasPhone && <a className="btn btn-wa" href={waLink(appt.clientPhone, reminder)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Lembrar no WhatsApp</a>}
          {open && <Button variant="ghost" icon={BellRing} disabled={pinging} onClick={ping}>{pinging ? 'Enviando…' : 'Notificar no celular'}</Button>}
          {open && <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>}
          {open && appt.status === 'agendado' && <Button variant="ghost" icon={Check} onClick={() => set('confirmado', 'Confirmado')}>Confirmar</Button>}
          {open && canCharge && <Button icon={CircleCheck} onClick={() => setCharging(true)}>Concluir e cobrar</Button>}
          {open && <Button variant="ghost" icon={UserX} onClick={() => set('faltou', 'Marcado como falta')}>Faltou</Button>}
          {open && <Button variant="danger" icon={Ban} onClick={() => set('cancelado', 'Agendamento cancelado')}>Cancelar</Button>}
        </div>
      </div>
    </Modal>
  )
}

/** Novo agendamento pelo balcão/telefone */
export function NewAppointmentModal({ open, onClose, date: initialDate, time: initialTime, barberId: initialBarber, lockBarber = false, edit = null }) {
  const { data, actions } = useStore()
  const [f, setF] = useState(edit
    ? { name: edit.clientName, phone: edit.clientPhone || '', serviceIds: edit.serviceIds, barberId: edit.barberId, date: edit.date, time: edit.time, notes: edit.notes || '' }
    : { name: '', phone: '', serviceIds: [], barberId: initialBarber || '', date: initialDate || today(), time: '' })
  const [busy, setBusy] = useState([])
  useEffect(() => { if (open && !edit) setF((x) => ({ ...x, date: initialDate || x.date, time: initialTime || '', barberId: initialBarber || x.barberId || data.barbers.find((b) => b.active)?.id, serviceIds: x.serviceIds.length ? x.serviceIds : [data.services.find((s) => s.active)?.id].filter(Boolean) })) }, [open, initialDate, initialTime, initialBarber]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && f.date) actions.busy(f.date).then(setBusy) }, [open, f.date, actions])

  const chosen = f.serviceIds.map((id) => data.services.find((s) => s.id === id)).filter(Boolean)
  const barber = data.barbers.find((b) => b.id === f.barberId)
  const service = chosen.length ? { duration: totalDuration(chosen, barber), price: chosen.reduce((a, x) => a + Number(x.price), 0) } : null
  const offered = data.services.filter((s) => s.active && doesService(barber, s.id))
  const toggleSvc = (id) => setF({ ...f, time: '', serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] })
  const slots = useMemo(() => {
    if (!service || !barber) return []
    if (barber.daysOff?.includes(weekday(f.date))) return []
    return freeSlots({ date: f.date, hours: data.settings.hours[weekday(f.date)], duration: Number(service.duration), step: Number(data.settings.slotStep || 30), breakTime: data.settings.breakTime, busy: busy.filter((b) => b.barberId === barber.id && !(edit && f.date === edit.date && b.barberId === edit.barberId && b.time === edit.time)) })
  }, [service, barber, f.date, busy, data.settings, edit])

  const match = f.phone.length >= 4 ? data.clients.find((c) => onlyDigits(c.phone).endsWith(onlyDigits(f.phone)) && onlyDigits(f.phone).length >= 10) : null
  const save = async () => {
    if (edit) {
      await actions.updateAppointment(edit.id, { clientName: f.name || edit.clientName, notes: f.notes, barberId: f.barberId, serviceIds: f.serviceIds, date: f.date, time: f.time, duration: Number(service.duration), total: Number(service.price) }, 'Agendamento atualizado')
      onClose(); return
    }
    await actions.staffBook({ clientName: f.name || match?.name, clientPhone: f.phone, barberId: f.barberId, serviceIds: f.serviceIds, date: f.date, time: f.time, duration: Number(service.duration), total: Number(service.price) })
    setF({ ...f, name: '', phone: '', time: '' }); onClose()
  }
  const keep = !!edit && f.date === edit.date && f.time === edit.time && f.barberId === edit.barberId && Number(service?.duration) <= Number(edit.duration)
  const valid = (edit ? f.name : (f.name || match) && onlyDigits(f.phone).length >= 10) && f.serviceIds.every((id) => doesService(barber, id)) && f.time && (slots.includes(f.time) || keep) && service && barber

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Editar agendamento' : 'Novo agendamento'} footer={<Button block disabled={!valid} icon={Check} onClick={save}>{edit ? 'Salvar alterações' : 'Agendar'}</Button>}>
      <div className="form-grid">
        {!edit && <Field label="WhatsApp do cliente"><input inputMode="tel" value={maskPhone(f.phone)} onChange={(e) => setF({ ...f, phone: onlyDigits(e.target.value) })} placeholder="(41) 99999-9999" /></Field>}
        <Field label="Nome" hint={match && !edit ? `Cliente encontrado: ${match.name}` : ''}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={match?.name || 'Nome do cliente'} /></Field>
        <Field label={`Serviços${service ? ` · ${money(service.price)} · ${service.duration} min` : ''}`} className="span-2">
          <div className="days">
            {offered.map((s) => (
              <button key={s.id} type="button" className={`pill ${f.serviceIds.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSvc(s.id)}>{s.name}</button>
            ))}
          </div>
        </Field>
        <Field label="Profissional">
          <select value={f.barberId} disabled={lockBarber} onChange={(e) => { const nb = data.barbers.find((b) => b.id === e.target.value); setF({ ...f, barberId: e.target.value, time: '', serviceIds: f.serviceIds.filter((id) => doesService(nb, id)) }) }}>
            {data.barbers.filter((b) => b.active || b.id === f.barberId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Dia"><input type="date" value={f.date} min={today()} onChange={(e) => setF({ ...f, date: e.target.value, time: '' })} /></Field>
        {edit && <Field label="Observações" className="span-2"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Opcional" /></Field>}
      </div>
      <Field label="Horário livre">
        {keep && <p className="muted small">Mantendo {f.time}. Para mudar, escolha outro horário abaixo.</p>}
        {f.time && !keep && !slots.includes(f.time) && slots.length > 0 && <p className="form-err">O horário {f.time} não cabe esse(s) serviço(s) com esta profissional. Escolha outro abaixo.</p>}
        {slots.length ? (
          <div className="slot-grid">{slots.map((t) => <button key={t} className={`slot ${f.time === t ? 'on' : ''}`} onClick={() => setF({ ...f, time: t })}>{t}</button>)}</div>
        ) : <p className="muted">Sem horários livres para esta profissional neste dia.</p>}
      </Field>
    </Modal>
  )
}

/** Linha de agendamento em listas */
export function ApptRow({ a, onClick, showBarber = true }) {
  const { data } = useStore()
  const b = data.barbers.find((x) => x.id === a.barberId)
  return (
    <button className={`appt-row st-${a.status}`} onClick={onClick}>
      <span className="appt-time">{a.time}</span>
      <span className="appt-info">
        <b>{a.clientName}</b>
        <small>{serviceNames(a, data.services)}{showBarber && b ? ` · ${b.name.split(' ')[0]}` : ''}</small>
      </span>
      {showBarber && b && <Avatar name={b.name} color={b.color} size={28} />}
      <StatusBadge status={a.status} />
    </button>
  )
}
