import { useEffect, useMemo, useState } from 'react'
import { Ban, BellRing, CalendarDays, Camera, Check, Pencil, Search, CircleCheck, ClipboardList, Clock, MessageCircle, Sparkles, UserRound, UserX } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Modal, StatusBadge } from './ui'
import Checkout from './Checkout'
import { anamneseAlerts, ClientModal } from '../pages/staff/Cadastros'
import { PortfolioModal } from './Loyalty'
import { cls, fmtDateLong, fmtPhone, freeSlots, maskPhone, money, onlyDigits, relDay, today, toHHMM, toMin, waLink, weekday } from '../lib/utils'
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
  // todos os horários da cliente no mesmo dia vão juntos na mensagem
  const sameDay = data.appointments.filter((a) => a.date === appt.date && ['agendado', 'confirmado'].includes(a.status) && (a.clientId ? a.clientId === appt.clientId : a.clientName === appt.clientName)).sort((a, b) => a.time.localeCompare(b.time))
  const lines = (sameDay.length ? sameDay : [appt]).map((a) => `• ${a.time} ${serviceNames(a, data.services)} com ${data.barbers.find((b) => b.id === a.barberId)?.name.split(' ')[0] || ''}`).join('\n')
  const askMsg = fillMsg(data.settings, 'askConfirm', { nome: appt.clientName.split(' ')[0], servicos: lines, data: relDay(appt.date).toLowerCase() + ' · ' + fmtDateLong(appt.date), link: `${location.origin}${location.pathname}#/confirmar/${appt.id}?t=${appt.confirmToken || ''}` })
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
        {appt.notes && <p className="appt-notes"><b>Observações:</b> {appt.notes}</p>}
        {client && (
          <div className="appt-links">
            <Button variant="ghost" size="sm" icon={ClipboardList} onClick={() => setFicha(true)}>Ficha da cliente</Button>
            <Button variant="ghost" size="sm" icon={Camera} onClick={() => setPort(true)}>Portfólio ({nPhotos})</Button>
          </div>
        )}
        <div className="appt-actions">
          {hasPhone && open && appt.confirmToken && <a className="btn btn-wa" href={waLink(appt.clientPhone, askMsg)} target="_blank" rel="noreferrer"><Check size={18} /> Pedir confirmação{sameDay.length > 1 ? ` (${sameDay.length} horários)` : ''}</a>}
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
  const [cq, setCq] = useState('')
  const [extra, setExtra] = useState(false) // encaixe fora do horário (só a equipe vê)
  useEffect(() => { if (open && !edit) setF((x) => ({ ...x, date: initialDate || x.date, time: initialTime || '', barberId: initialBarber || x.barberId || data.barbers.find((b) => b.active)?.id, serviceIds: x.serviceIds.length ? x.serviceIds : [data.services.find((s) => s.active)?.id].filter(Boolean) })) }, [open, initialDate, initialTime, initialBarber]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && f.date) actions.busy(f.date).then(setBusy) }, [open, f.date, actions])

  const isAdmin = !lockBarber
  const [assign, setAssign] = useState({}) // serviço → profissional (dividir o atendimento)
  const [prices, setPrices] = useState({}) // serviço → valor cobrado (editável pela gestão)
  const [gTimes, setGTimes] = useState({}) // horário das outras profissionais
  const bOf = (id) => assign[id] || f.barberId
  const svcOf = (id) => data.services.find((s) => s.id === id)
  const priceOf = (id) => { const v = prices[id]; return v !== undefined && v !== '' ? Number(String(v).replace(',', '.')) || 0 : Number(svcOf(id)?.price || 0) }
  const mainIds = f.serviceIds.filter((id) => bOf(id) === f.barberId)
  const chosen = mainIds.map(svcOf).filter(Boolean)
  const barber = data.barbers.find((b) => b.id === f.barberId)
  const service = chosen.length ? { duration: totalDuration(chosen, barber), price: mainIds.reduce((a, id) => a + priceOf(id), 0) } : null
  const others = [...new Set(f.serviceIds.map(bOf).filter((b) => b !== f.barberId))]
  const [sq, setSq] = useState('')
  const offered = data.services.filter((s) => s.active && (isAdmin || doesService(barber, s.id)))
  // serviço marcado que a profissional não faz some da seleção (antes travava o botão Agendar sem aviso)
  const okFor = (id) => doesService(data.barbers.find((b) => b.id === bOf(id)), id)
  useEffect(() => { if (!isAdmin && barber && f.serviceIds.some((id) => !okFor(id))) setF((x) => ({ ...x, serviceIds: x.serviceIds.filter(okFor), time: '' })) }, [barber, f.serviceIds]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSvc = (id) => setF({ ...f, time: '', serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] })
  const slots = useMemo(() => {
    if (!service || !barber) return []
    if (barber.daysOff?.includes(weekday(f.date))) return []
    return freeSlots({ date: f.date, hours: data.settings.hours[weekday(f.date)], duration: Number(service.duration), step: Number(data.settings.slotStep || 30), breakTime: barber.lunch || data.settings.breakTime, busy: busy.filter((b) => b.barberId === barber.id && !(edit && f.date === edit.date && b.barberId === edit.barberId && b.time === edit.time)) })
  }, [service, barber, f.date, busy, data.settings, edit])

  const match = f.phone.length >= 4 ? data.clients.find((c) => onlyDigits(c.phone).endsWith(onlyDigits(f.phone)) && onlyDigits(f.phone).length >= 10) : null
  const groupTime = (bid, i) => gTimes[bid] || toHHMM(toMin(f.time || '00:00') + Number(service?.duration || 0) + others.slice(0, i).reduce((a, o) => a + totalDuration(f.serviceIds.filter((id) => bOf(id) === o).map(svcOf), data.barbers.find((b) => b.id === o)), 0))
  const groupBad = (bid, i) => { const t = toMin(groupTime(bid, i)); const d = totalDuration(f.serviceIds.filter((id) => bOf(id) === bid).map(svcOf), data.barbers.find((b) => b.id === bid)); return busy.some((x) => x.barberId === bid && t < toMin(x.time) + Number(x.duration) && t + d > toMin(x.time)) }
  const save = async () => {
    const clientName = f.name || match?.name || edit?.clientName
    const phone = edit ? (f.phone || edit.clientPhone) : f.phone
    if (edit) {
      if (isAdmin && edit.clientId && (clientName !== edit.clientName || onlyDigits(phone) !== onlyDigits(edit.clientPhone))) await actions.upsert('clients', { id: edit.clientId, name: clientName, phone: onlyDigits(phone) }, null)
      await actions.updateAppointment(edit.id, { clientName, ...(isAdmin ? { clientPhone: onlyDigits(phone) } : {}), notes: f.notes, barberId: f.barberId, serviceIds: mainIds, date: f.date, time: f.time, duration: Number(service.duration), total: Number(service.price) }, 'Agendamento atualizado')
    } else {
      const r = await actions.staffBook({ clientName, clientPhone: phone, barberId: f.barberId, serviceIds: mainIds, date: f.date, time: f.time, duration: Number(service.duration), total: Number(service.price), notes: f.notes || '' })
      const catalog = mainIds.reduce((a, id) => a + Number(svcOf(id)?.price || 0), 0)
      if (r?.id && Math.abs(catalog - service.price) > 0.001) await actions.updateAppointment(r.id, { total: Number(service.price) })
    }
    // outras profissionais: um agendamento para cada, com o valor combinado
    for (const [i, bid] of others.entries()) {
      const ids = f.serviceIds.filter((id) => bOf(id) === bid); const b = data.barbers.find((x) => x.id === bid)
      const total = ids.reduce((a, id) => a + priceOf(id), 0)
      const r = await actions.staffBook({ clientName, clientPhone: phone, barberId: bid, serviceIds: ids, date: f.date, time: groupTime(bid, i), duration: totalDuration(ids.map(svcOf), b), total, notes: f.notes || '' })
      if (r?.id && Math.abs(ids.reduce((a, id) => a + Number(svcOf(id)?.price || 0), 0) - total) > 0.001) await actions.updateAppointment(r.id, { total })
    }
    if (!edit) setF({ ...f, name: '', phone: '', time: '', notes: '' })
    setAssign({}); setPrices({}); setGTimes({}); onClose()
  }
  const tMin = f.time ? toMin(f.time) : null
  const extraOk = extra && tMin != null && service && !busy.some((b) => b.barberId === barber?.id && !(edit && f.date === edit.date && b.barberId === edit.barberId && b.time === edit.time) && tMin < toMin(b.time) + Number(b.duration) && tMin + Number(service.duration) > toMin(b.time))
  const keep = !!edit && f.date === edit.date && f.time === edit.time && f.barberId === edit.barberId && Number(service?.duration) <= Number(edit.duration)
  const valid = (edit ? f.name : (f.name || match) && onlyDigits(f.phone).length >= 10) && mainIds.length > 0 && f.serviceIds.every(okFor) && !others.some(groupBad) && f.time && (slots.includes(f.time) || keep || extraOk) && service && barber

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Editar agendamento' : 'Novo agendamento'} footer={<Button block disabled={!valid} icon={Check} onClick={save}>{edit ? 'Salvar alterações' : 'Agendar'}</Button>}>
      <div className="form-grid">
        {!edit && (
          <Field label="Buscar cliente cadastrada" className="span-2">
            <div className="search"><Search size={16} /><input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Nome ou telefone" /></div>
            {cq.trim().length >= 2 && (() => {
              const t = cq.trim().toLowerCase(); const d = onlyDigits(cq)
              const hits = data.clients.filter((c) => c.name.toLowerCase().includes(t) || (d.length >= 3 && onlyDigits(c.phone).includes(d))).slice(0, 6)
              return <div className="client-hits">{hits.map((c) => <button key={c.id} type="button" onClick={() => { setF({ ...f, name: c.name, phone: onlyDigits(c.phone).startsWith('sem') ? '' : onlyDigits(c.phone) }); setCq('') }}><b>{c.name}</b><small>{fmtPhone(c.phone)}</small></button>)}{!hits.length && <small className="muted">Nenhuma cliente encontrada. Preencha abaixo para cadastrar.</small>}</div>
            })()}
          </Field>
        )}
        {!edit && <Field label="WhatsApp do cliente" required><input inputMode="tel" value={maskPhone(f.phone)} onChange={(e) => setF({ ...f, phone: onlyDigits(e.target.value) })} placeholder="(41) 99999-9999" /></Field>}
        <Field label="Nome" required hint={match && !edit ? `Cliente encontrado: ${match.name}` : ''}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={match?.name || 'Nome do cliente'} /></Field>
        <Field label={`Serviços${service ? ` · ${money(service.price)} · ${service.duration} min` : ''}`} required className="span-2">
          <div className="days">
            {offered.length > 12 && <div className="search svc-search"><Search size={16} /><input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Buscar procedimento" /></div>}
            {offered.filter((s) => !sq.trim() || f.serviceIds.includes(s.id) || s.name.toLowerCase().includes(sq.trim().toLowerCase())).map((s) => (
              <button key={s.id} type="button" className={`pill ${f.serviceIds.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSvc(s.id)}>{s.name}</button>
            ))}
          </div>
        </Field>
        <Field label="Profissional" required>
          <select value={f.barberId} disabled={lockBarber} onChange={(e) => { const nb = data.barbers.find((b) => b.id === e.target.value); setF({ ...f, barberId: e.target.value, time: '', serviceIds: f.serviceIds.filter((id) => doesService(nb, id)) }) }}>
            {data.barbers.filter((b) => b.active || b.id === f.barberId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Dia" required><input type="date" value={f.date} min={today()} onChange={(e) => setF({ ...f, date: e.target.value, time: '' })} /></Field>
        {edit && isAdmin && <Field label="WhatsApp do cliente"><input inputMode="tel" value={maskPhone(f.phone || '')} onChange={(e) => setF({ ...f, phone: onlyDigits(e.target.value) })} /></Field>}
        <Field label="Observações" className="span-2"><textarea rows={2} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Ex.: alergia, preferência, pedido especial" /></Field>
        {isAdmin && f.serviceIds.length > 0 && (
          <div className="span-2 ov-box">
            <h4 className="sub-title">Quem faz cada serviço e valor</h4>
            <p className="muted small">Troque a profissional de um serviço para dividir o atendimento. Cada profissional recebe o próprio agendamento, com o valor de cada serviço.</p>
            <div className="split-list">
              {f.serviceIds.map((id) => (
                <div key={id} className={cls('split-row', !okFor(id) && 'bad')}>
                  <b>{svcOf(id)?.name}</b>
                  <select value={bOf(id)} onChange={(e) => setAssign({ ...assign, [id]: e.target.value === f.barberId ? undefined : e.target.value })}>
                    {data.barbers.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name.split(' ')[0]}{doesService(b, id) ? '' : ' (não faz)'}</option>)}
                  </select>
                  <input inputMode="decimal" aria-label={`Valor de ${svcOf(id)?.name}`} value={prices[id] ?? String(Number(svcOf(id)?.price || 0))} onChange={(e) => setPrices({ ...prices, [id]: e.target.value.replace(/[^\d.,]/g, '') })} />
                </div>
              ))}
            </div>
            {others.map((bid, i) => (
              <Field key={bid} label={`Horário com ${data.barbers.find((b) => b.id === bid)?.name.split(' ')[0]}`} hint={groupBad(bid, i) ? 'Ela já tem atendimento nesse horário. Escolha outro.' : ''}>
                <input type="time" value={groupTime(bid, i)} onChange={(e) => setGTimes({ ...gTimes, [bid]: e.target.value })} />
              </Field>
            ))}
            <p className="small"><b>Total: {money(f.serviceIds.reduce((a, id) => a + priceOf(id), 0))}</b>{others.length ? ` · ${others.length + 1} profissionais` : ''}</p>
          </div>
        )}
      </div>
      <label className="toggle-row mb-sm"><span><b>Encaixe fora do horário</b><small>Ex.: bem cedo ou depois de fechar. Só a equipe vê; a cliente não consegue marcar nesses horários pelo site.</small></span><span className="switch"><input type="checkbox" checked={extra} onChange={(e) => { setExtra(e.target.checked); setF({ ...f, time: '' }) }} /><span /></span></label>
      {extra && (
        <Field label="Horário do encaixe" required hint={f.time && !extraOk ? 'Esse horário bate com outro atendimento dessa profissional.' : ''}>
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </Field>
      )}
      {!extra && <Field label="Horário livre" required>
        {keep && <p className="muted small">Mantendo {f.time}. Para mudar, escolha outro horário abaixo.</p>}
        {f.time && !keep && !slots.includes(f.time) && slots.length > 0 && <p className="form-err">O horário {f.time} não cabe esse(s) serviço(s) com esta profissional. Escolha outro abaixo.</p>}
        {slots.length ? (
          <div className="slot-grid">{slots.map((t) => <button key={t} className={`slot ${f.time === t ? 'on' : ''}`} onClick={() => setF({ ...f, time: t })}>{t}</button>)}</div>
        ) : <p className="muted">Sem horários livres para esta profissional neste dia.</p>}
      </Field>}
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
        <b>{a.status === 'confirmado' ? '✅ ' : ''}{a.clientName}</b>
        <small>{serviceNames(a, data.services)}{showBarber && b ? ` · ${b.name.split(' ')[0]}` : ''}</small>
      </span>
      {showBarber && b && <Avatar name={b.name} color={b.color} size={28} />}
      <StatusBadge status={a.status} />
    </button>
  )
}
