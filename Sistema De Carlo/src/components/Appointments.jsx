import { useEffect, useMemo, useState } from 'react'
import { Ban, BellRing, CalendarDays, Camera, Check, Pencil, Search, CircleCheck, ClipboardList, Clock, MessageCircle, Sparkles, UserRound, UserX } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Modal, StatusBadge } from './ui'
import Checkout from './Checkout'
import { anamneseAlerts, ClientModal } from '../pages/staff/Cadastros'
import { PortfolioModal } from './Loyalty'
import { ClientPackages, packageFor, sellPackage } from './Packages'
import { ComandaCheckout, comandaOf } from './Comanda'
import ReceiptButtons from './Receipt'
import ReviewButtons from './Review'
import { addCredit, saveCredit } from '../lib/credit'
import { canCharge as canChargeFn, cls, fmtDateLong, fmtPhone, freeSlots, maskPhone, money, onlyDigits, relDay, today, toHHMM, toMin, waLink, weekday , PAYMENTS, parseMoney } from '../lib/utils'
import { msg as fillMsg } from '../lib/messages'
import { db, isDemo } from '../data'
import { doesService, totalDuration } from '../lib/commission'

/** Balão "OBS" nos cards da agenda quando o agendamento tem observação (o texto aparece ao passar o mouse) */
export const obsText = (notes) => String(notes || '').replace(/^Sessão de pacote(\s·\s)?/, '').trim()
export function ObsTag({ notes }) {
  const t = obsText(notes)
  return t ? <span className="obs-tag" title={t} aria-label={`Observação: ${t}`}>OBS</span> : null
}

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
  const askMsg = fillMsg(data.settings, 'askConfirm', { nome: appt.clientName.split(' ')[0], servicos: lines, data: relDay(appt.date).toLowerCase() + ' · ' + fmtDateLong(appt.date), link: `${location.origin}${location.pathname}#/confirmar/${appt.id}?t=${appt.confirmToken || 'demo'}` })
  const reminder = fillMsg(data.settings, 'reminder', { nome: appt.clientName.split(' ')[0], servico: svc, data: relDay(appt.date).toLowerCase(), hora: appt.time, profissional: barber?.name })
  const client = data.clients.find((c) => c.id === appt.clientId)
  const alerts = anamneseAlerts(client?.anamnese)
  const hasPhone = onlyDigits(appt.clientPhone).length >= 10
  const nPhotos = data.photos.filter((p) => p.clientId === appt.clientId).length
  if (ficha && client) return <ClientModal c={client} restricted={session?.role !== 'admin'} initialTab={typeof ficha === 'string' ? ficha : 'cadastro'} onClose={() => setFicha(false)} />
  if (port && client) return <PortfolioModal client={client} photos={data.photos} onClose={() => setPort(false)} />

  if (editing) return <NewAppointmentModal open edit={appt} lockBarber={session?.role !== 'admin'} onClose={() => { setEditing(false); onClose() }} />

  const isAdmin = session?.role === 'admin'
  const sale = data.sales?.find((s) => s.id === appt.saleId) || data.sales?.find((s) => s.appointmentId === appt.id)
  const comanda = comandaOf(data.appointments, appt)

  if (charging) {
    return (
      <Modal open onClose={() => setCharging(false)} title={`${charging === 'fix' ? 'Corrigir' : charging === 'comanda' ? 'Comanda' : 'Cobrar'} · ${appt.clientName}`} wide>
        {charging === 'fix' ? <Checkout sale={sale} onDone={onClose} /> : charging === 'comanda' ? <ComandaCheckout appts={comanda} onDone={onClose} /> : <Checkout appointment={appt} lockBarber onDone={onClose} />}
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Agendamento">
      {client && (
        <div className="ficha-tabs" role="tablist">
          <button type="button" className="on" aria-selected>Agendamento</button>
          {[['anamnese', 'Anamnese'], ['prontuario', 'Prontuário'], ['pacotes', 'Pacotes'], ['comandas', 'Comandas'], ['agendamentos', 'Histórico'], ['anexos', 'Anexos'], ['cadastro', 'Cadastro']].map(([k, l]) => <button key={k} type="button" onClick={() => setFicha(k)}>{l}</button>)}
        </div>
      )}
      <div className="appt-detail">
        <div className="appt-head">
          <div><h4>{appt.clientName}</h4>{hasPhone ? <a href={`tel:${appt.clientPhone}`}>{fmtPhone(appt.clientPhone)}</a> : <small className="muted">Contato visível só para a gestão</small>}</div>
          <StatusBadge status={appt.status} />
        </div>
        {alerts.length > 0 && <div className="an-alerts"><b>Atenção na ficha</b>{alerts.map((t) => <span key={t} className="badge badge-warn">{t}</span>)}</div>}
        <div className="summary">
          <div><Sparkles size={18} /><span>{svc}{(() => { const pk = appt.serviceIds.map((id) => packageFor(data.packages, appt.clientId, id)).find(Boolean); return pk && open ? <small className="muted"> · sessão do pacote "{pk.pkg.name}" (restam {pk.left})</small> : null })()}</span><b>{money(appt.total)}</b></div>
          <div><CalendarDays size={18} /><span>{fmtDateLong(appt.date)}</span><b>{appt.time}</b></div>
          <div><Clock size={18} /><span>Duração</span><b>{appt.duration} min</b></div>
          <div><UserRound size={18} /><span>{barber?.name}</span><b>{appt.source === 'online' ? 'App' : 'Balcão'}</b></div>
        </div>
        {(() => {
          if (!sale) return null
          const extras = sale.items.filter((i) => i.type === 'extra')
          const prods = sale.items.filter((i) => i.type === 'product')
          return (
            <div className="appt-charged">
              <b>Cobrado no caixa</b>
              {prods.map((i, k) => <span key={`p${k}`}><em>{i.qty > 1 ? `${i.qty}x ` : ''}{i.name}</em><i>+{money(i.price * i.qty)}</i></span>)}
              {extras.map((i, k) => <span key={`e${k}`}><em>{i.name}</em><i>+{money(i.price)}</i></span>)}
              {Number(sale.discount) > 0 && <span><em>{sale.benefit?.label && Number(sale.benefit.amount) >= Number(sale.discount) ? sale.benefit.label : 'Desconto'}</em><i>-{money(sale.discount)}</i></span>}
              <span className="tot"><em>Total pago{sale.payment ? ` · ${PAYMENTS[sale.payment] || sale.payment}` : ''}</em><i>{money(sale.total)}</i></span>
              <ReceiptButtons sales={data.sales.filter((s) => s.date === sale.date && (sale.clientId ? s.clientId === sale.clientId : s.id === sale.id))} phone={appt.clientPhone} />
              <ReviewButtons sales={[sale]} phone={appt.clientPhone} />
            </div>
          )
        })()}
        {appt.notes && <p className="appt-notes"><b>Observações:</b> {appt.notes}</p>}
        {client && Number(client.credit || 0) > 0.009 && <p className="appt-notes"><b>Crédito em haver:</b> {money(Number(client.credit))}{isAdmin ? ' · usar em "Saldo da cliente" ao cobrar' : ''}{isAdmin && <> · <button type="button" className="link" onClick={() => setFicha('creditos')}>abrir créditos</button></>}</p>}
        {client && (isAdmin || (data.packages || []).some((p) => p.clientId === client.id && p.active)) && <ClientPackages client={client} canSell={isAdmin} barberId={appt.barberId} />}
        {client && (
          <div className="appt-links">
            <Button variant="ghost" size="sm" icon={ClipboardList} onClick={() => setFicha(true)}>Ficha da cliente</Button>
            <Button variant="ghost" size="sm" icon={Camera} onClick={() => setPort(true)}>Portfólio ({nPhotos})</Button>
          </div>
        )}
        <div className="appt-actions">
          {hasPhone && open && (appt.confirmToken || isDemo) && <a className="btn btn-wa" href={waLink(appt.clientPhone, askMsg)} target="_blank" rel="noreferrer"><Check size={18} /> Pedir confirmação{sameDay.length > 1 ? ` (${sameDay.length} horários)` : ''}</a>}
          {hasPhone && <a className="btn btn-wa" href={waLink(appt.clientPhone, reminder)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Lembrar no WhatsApp</a>}
          {open && <Button variant="ghost" icon={BellRing} disabled={pinging} onClick={ping}>{pinging ? 'Enviando…' : 'Notificar no celular'}</Button>}
          {open && <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>}
          {!open && sale && isAdmin && <Button variant="ghost" icon={Pencil} onClick={() => setCharging('fix')}>Corrigir atendimento</Button>}
          {open && appt.status === 'agendado' && <Button variant="ghost" icon={Check} onClick={() => set('confirmado', 'Confirmado')}>Confirmar</Button>}
          {open && canCharge && isAdmin && comanda.length > 1 && <Button icon={CircleCheck} onClick={() => setCharging('comanda')}>Fechar comanda ({comanda.length} atendimentos)</Button>}
          {open && canCharge && canChargeFn(data.settings, session) && <Button variant={comanda.length > 1 && isAdmin ? 'ghost' : 'primary'} icon={CircleCheck} onClick={() => setCharging(true)}>{comanda.length > 1 && isAdmin ? 'Cobrar só este' : 'Concluir e cobrar'}</Button>}
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
  const [overlap, setOverlap] = useState(false) // sobrepor horário (tempo de pausa, ex.: tinta agindo)
  useEffect(() => { if (open && !edit) setF((x) => ({ ...x, date: initialDate || x.date, time: initialTime || '', barberId: initialBarber || x.barberId || data.barbers.find((b) => b.active)?.id, serviceIds: x.serviceIds.length ? x.serviceIds : [data.services.find((s) => s.active && doesService(data.barbers.find((b) => b.id === (initialBarber || x.barberId)), s.id))?.id].filter(Boolean) })); if (open && !edit && initialTime) { const h = data.settings.hours?.[weekday(initialDate || today())]; setExtra(!h || toMin(initialTime) < toMin(h[0]) || toMin(initialTime) >= toMin(h[1])) } }, [open, initialDate, initialTime, initialBarber]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && f.date) actions.busy(f.date).then(setBusy) }, [open, f.date, actions])

  const isAdmin = !lockBarber
  const [assign, setAssign] = useState({}) // serviço → profissional (dividir o atendimento)
  const [prices, setPrices] = useState({}) // serviço → valor cobrado (editável pela gestão)
  const [gTimes, setGTimes] = useState({}) // horário das outras profissionais
  const [pk, setPk] = useState({ on: false, sessions: '5', price: '', payment: 'pix' }) // vender pacote junto com o agendamento
  const [cr, setCr] = useState({ on: false, amount: '', payment: 'pix' }) // pagou adiantado → crédito em haver
  const bOf = (id) => assign[id] || f.barberId
  const svcOf = (id) => data.services.find((s) => s.id === id)
  // sessão de pacote: cliente com pacote ativo desse serviço → R$ 0 no agendamento (abate ao concluir)
  const [usePkg, setUsePkg] = useState(true)
  const pkgClientId = edit ? edit.clientId : (f.clientId || data.clients.find((c) => onlyDigits(f.phone).length >= 10 && onlyDigits(c.phone) === onlyDigits(f.phone))?.id)
  const pkgOf = (id) => (pkgClientId ? packageFor(data.packages, pkgClientId, id) : null)
  const priceOf = (id) => { if (usePkg && pkgOf(id)) return 0; const v = prices[id]; return v !== undefined && v !== '' ? Number(String(v).replace(',', '.')) || 0 : Number(svcOf(id)?.price || 0) }
  const mainIds = f.serviceIds.filter((id) => bOf(id) === f.barberId)
  const chosen = mainIds.map(svcOf).filter(Boolean)
  const barber = data.barbers.find((b) => b.id === f.barberId)
  const service = chosen.length ? { duration: totalDuration(chosen, barber), price: mainIds.reduce((a, id) => a + priceOf(id), 0) } : null
  const others = [...new Set(f.serviceIds.map(bOf).filter((b) => b !== f.barberId))]
  const [sq, setSq] = useState('')
  const [cat, setCat] = useState('')
  // categoria = início da descrição do serviço antes de " · " (ex.: "Facial · limpeza de pele")
  const catOf = (s) => ((s.description || '').includes(' · ') ? s.description.split(' · ')[0].trim() : '')
  const offered =data.services.filter((s) => s.active && (isAdmin || doesService(barber, s.id)))
  // serviço marcado que a profissional não faz some da seleção (antes travava o botão Agendar sem aviso)
  const okFor = (id) => doesService(data.barbers.find((b) => b.id === bOf(id)), id)
  useEffect(() => { if (!isAdmin && barber && f.serviceIds.some((id) => !okFor(id))) setF((x) => ({ ...x, serviceIds: x.serviceIds.filter(okFor), time: '' })) }, [barber, f.serviceIds]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSvc = (id) => setF({ ...f, time: '', serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] })
  const slots = useMemo(() => {
    if (!service || !barber) return []
    if (barber.daysOff?.includes(weekday(f.date))) return []
    return freeSlots({ date: f.date, hours: data.settings.hours[weekday(f.date)], duration: Number(service.duration), step: Number(data.settings.slotStep || 30), breakTime: barber.lunch || data.settings.breakTime, busy: busy.filter((b) => b.barberId === barber.id && !(edit && f.date === edit.date && b.barberId === edit.barberId && b.time === edit.time)) })
  }, [service, barber, f.date, busy, data.settings, edit])

  const picked = !edit && !!f.clientId
  const match = f.phone.length >= 4 ? data.clients.find((c) => onlyDigits(c.phone).endsWith(onlyDigits(f.phone)) && onlyDigits(f.phone).length >= 10) : null
  const groupTime = (bid, i) => gTimes[bid] || toHHMM(toMin(f.time || '00:00') + Number(service?.duration || 0) + others.slice(0, i).reduce((a, o) => a + totalDuration(f.serviceIds.filter((id) => bOf(id) === o).map(svcOf), data.barbers.find((b) => b.id === o)), 0))
  const groupBad = (bid, i) => { const t = toMin(groupTime(bid, i)); const d = totalDuration(f.serviceIds.filter((id) => bOf(id) === bid).map(svcOf), data.barbers.find((b) => b.id === bid)); return busy.some((x) => x.barberId === bid && t < toMin(x.time) + Number(x.duration) && t + d > toMin(x.time)) }
  const save = async () => {
    const notesOut = usePkg && mainIds.some((id) => pkgOf(id)) && !String(f.notes || '').includes('Sessão de pacote') ? `Sessão de pacote${f.notes ? ` · ${f.notes}` : ''}` : f.notes
    const clientName = f.name || match?.name || edit?.clientName
    const phone = edit ? (f.phone || edit.clientPhone) : f.phone
    if (edit) {
      if (isAdmin && edit.clientId && (clientName !== edit.clientName || onlyDigits(phone) !== onlyDigits(edit.clientPhone))) await actions.upsert('clients', { id: edit.clientId, name: clientName, phone: onlyDigits(phone) }, null)
      await actions.updateAppointment(edit.id, { clientName, ...(isAdmin ? { clientPhone: onlyDigits(phone) } : {}), notes: notesOut, barberId: f.barberId, serviceIds: mainIds, date: f.date, time: f.time, duration: Number(service.duration), total: Number(service.price) }, 'Agendamento atualizado')
    } else {
      const r = await actions.staffBook({ clientId: picked ? f.clientId : null, clientName, clientPhone: phone, barberId: f.barberId, serviceIds: mainIds, date: f.date, time: f.time, duration: Number(service.duration), total: Number(service.price), notes: notesOut || '' })
      const catalog = mainIds.reduce((a, id) => a + Number(svcOf(id)?.price || 0), 0)
      if (r?.id && Math.abs(catalog - service.price) > 0.001) await actions.updateAppointment(r.id, { total: Number(service.price) })
      if (crAmount > 0) {
        const client = (picked && data.clients.find((c) => c.id === f.clientId)) || await actions.upsertClient({ name: clientName, phone })
        const credit = await addCredit(actions, client, crAmount, cr.payment, f.barberId)
        await saveCredit(actions, client, credit, `Crédito em haver: ${money(credit)}`)
      }
      if (pkOn) {
        const client = picked ? { id: f.clientId, name: clientName } : await actions.upsertClient({ name: clientName, phone })
        await sellPackage(actions, { client, name: `${pkSessions} sessões · ${mainIds.map((id) => svcOf(id)?.name).join(' + ')}`, items: mainIds.map((id) => ({ serviceId: id, name: svcOf(id)?.name || 'Serviço', qty: pkSessions, used: 0 })), price: pkPrice, payment: pk.payment, barberId: f.barberId })
      }
    }
    // outras profissionais: um agendamento para cada, com o valor combinado
    for (const [i, bid] of others.entries()) {
      const ids = f.serviceIds.filter((id) => bOf(id) === bid); const b = data.barbers.find((x) => x.id === bid)
      const total = ids.reduce((a, id) => a + priceOf(id), 0)
      const r = await actions.staffBook({ clientId: picked ? f.clientId : null, clientName, clientPhone: phone, barberId: bid, serviceIds: ids, date: f.date, time: groupTime(bid, i), duration: totalDuration(ids.map(svcOf), b), total, notes: f.notes || '' })
      if (r?.id && Math.abs(ids.reduce((a, id) => a + Number(svcOf(id)?.price || 0), 0) - total) > 0.001) await actions.updateAppointment(r.id, { total })
    }
    if (!edit) setF({ ...f, clientId: null, name: '', phone: '', time: '', notes: '' })
    setAssign({}); setPrices({}); setGTimes({}); setPk({ ...pk, on: false, price: '' }); setCr({ ...cr, on: false, amount: '' }); onClose()
  }
  const tMin = f.time ? toMin(f.time) : null
  const ovCfg = data.settings.privacy?.overlap || {}
  const canOverlap = !!barber && (ovCfg.barbers || []).includes(barber.id)
  const ovOn = canOverlap && overlap
  const cap = ovOn ? Math.max(2, Number(ovCfg.max || 2)) : 1
  const free = extra || ovOn
  const isBlock = (b) => Number(b.duration) >= 1440 || data.blocks.some((k) => k.barberId === barber?.id && k.date === f.date && (k.start || '00:00').slice(0, 5) === b.time)
  const clashes = (t, d) => busy.filter((b) => b.barberId === barber?.id && !(edit && f.date === edit.date && b.barberId === edit.barberId && b.time === edit.time) && t < toMin(b.time) + Number(b.duration) && t + d > toMin(b.time))
  const fits = (t, d) => { const c = clashes(t, d); return c.length < cap && !(c.length && c.some(isBlock)) }
  const extraOk = free && tMin != null && service && fits(tMin, Number(service.duration))
  const keep = !!edit && f.date === edit.date && f.time === edit.time && f.barberId === edit.barberId && Number(service?.duration) <= Number(edit.duration)
  // por que não dá para agendar + sugestão de horário
  const mine = busy.filter((b) => b.barberId === barber?.id && !(edit && f.date === edit.date && b.barberId === edit.barberId && b.time === edit.time))
  const dur = Number(service?.duration || 0)
  const hrs = data.settings.hours?.[weekday(f.date)]
  const lunch = barber?.lunch || data.settings.breakTime
  const hitAt = (t, withLunch) => (fits(t, dur) ? null : clashes(t, dur)[0]) || (withLunch && lunch && t < toMin(lunch[1]) && t + dur > toMin(lunch[0]) ? { lunch: true } : null)
  const suggest = (t) => {
    if (!free) return slots.find((x) => toMin(x) >= t) || slots[slots.length - 1]
    for (let x = t; x + dur <= 23 * 60 + 59; x += 5) if (!hitAt(x, false)) return toHHMM(x)
    return null
  }
  const whoAt = (b) => {
    const a = data.appointments.find((x) => x.date === f.date && x.time === b.time && x.status !== 'cancelado' && x.status !== 'faltou' && (x.barberId === barber.id || (barber.room && data.barbers.find((y) => y.id === x.barberId)?.room?.trim().toLowerCase() === barber.room.trim().toLowerCase())))
    if (a && a.barberId !== barber.id) return `a sala está ocupada às ${b.time} (${a.clientName} com ${data.barbers.find((y) => y.id === a.barberId)?.name.split(' ')[0]})`
    if (a) return `já tem ${a.clientName.split(' ')[0]} agendada às ${b.time} (até ${toHHMM(toMin(b.time) + Number(b.duration))})`
    return Number(b.duration) >= 1440 ? 'o dia está bloqueado na agenda dela' : `esse horário está ocupado/bloqueado das ${b.time} às ${toHHMM(toMin(b.time) + Number(b.duration))}`
  }
  const why = (() => {
    if (!barber) return 'Escolha a profissional.'
    if (!mainIds.length) return 'Escolha pelo menos um serviço.'
    const no = f.serviceIds.find((id) => !okFor(id)); if (no) return `${data.barbers.find((b) => b.id === bOf(no))?.name.split(' ')[0]} não faz ${svcOf(no)?.name}. Escolha outra profissional para esse serviço.`
    if (!edit && !(f.name || match)) return 'Informe o nome da cliente.'
    if (!edit && !picked && onlyDigits(f.phone).length < 10) return 'Informe o WhatsApp com DDD (ex.: 41 99999-9999).'
    if (!f.time) return free ? 'Digite o horário.' : (slots.length ? 'Escolha um horário livre.' : 'Sem horário livre no expediente. Ligue "Encaixe fora do horário" para marcar mesmo assim.')
    const t = toMin(f.time)
    const h = hitAt(t, !free)
    const sug = suggest(t)
    const tip = (sug && sug !== f.time ? ` Minha sugestão: encaixar às ${sug}.` : '') + (canOverlap && !ovOn ? ' Se a cliente estiver em pausa (ex.: tinta agindo), ligue "Sobrepor horário".' : '')
    if (h?.lunch) return `${f.time} cai no almoço dela (${lunch[0]}–${lunch[1]}).${tip} Ou ligue "Encaixe fora do horário".`
    if (h && ovOn && !isBlock(h)) return `Já tem ${clashes(t, dur).length} atendimento(s) nesse horário. O limite de sobreposição é ${cap}.${tip}`
    if (h) { const m = whoAt(h); return `${m[0].toUpperCase()}${m.slice(1)}, e o atendimento leva ${dur} min.${tip}` }
    if (!free && !slots.includes(f.time) && !keep) {
      if (barber.daysOff?.includes(weekday(f.date)) || !hrs) return 'Esse dia é folga/fechado. Ligue "Encaixe fora do horário" para marcar mesmo assim.'
      if (t < toMin(hrs[0]) || t + dur > toMin(hrs[1])) return `${f.time} + ${dur} min passa do horário de funcionamento (${hrs[0]}–${hrs[1]}). Ligue "Encaixe fora do horário" para marcar mesmo assim.`
      return `${f.time} não cabe na grade.${tip}`
    }
    const gb = others.findIndex(groupBad); if (gb >= 0) return `${data.barbers.find((b) => b.id === others[gb])?.name.split(' ')[0]} já tem atendimento às ${groupTime(others[gb], gb)}. Mude o horário dela.`
    return ''
  })()
  const pkSessions = Math.max(1, Number(onlyDigits(pk.sessions)) || 1)
  const pkPrice = parseMoney(pk.price)
  const pkOn = isAdmin && !edit && pk.on && pkPrice > 0
  const crAmount = isAdmin && !edit && cr.on ? parseMoney(cr.amount) : 0
  const crClient = pkgClientId ? data.clients.find((c) => c.id === pkgClientId) : null
  const crNow = Number(crClient?.credit || 0)
  const valid = (edit ? f.name : picked || ((f.name || match) && onlyDigits(f.phone).length >= 10)) && mainIds.length > 0 && f.serviceIds.every(okFor) && !others.some(groupBad) && f.time && (slots.includes(f.time) || keep || extraOk) && service && barber

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Editar agendamento' : 'Novo agendamento'} footer={<>{!valid && why && <p className="form-err mb-sm" style={{ width: '100%' }}>{why}</p>}<Button block disabled={!valid} icon={Check} onClick={save}>{edit ? 'Salvar alterações' : 'Agendar'}</Button></>}>
      <div className="form-grid">
        {!edit && (
          <Field label="Buscar cliente cadastrada" className="span-2">
            <div className="search"><Search size={16} /><input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Nome ou telefone" /></div>
            {cq.trim().length >= 2 && (() => {
              const t = cq.trim().toLowerCase(); const d = onlyDigits(cq)
              const hits = data.clients.filter((c) => c.name.toLowerCase().includes(t) || (d.length >= 3 && onlyDigits(c.phone).includes(d))).slice(0, 6)
              return <div className="client-hits">{hits.map((c) => <button key={c.id} type="button" onClick={() => { setF({ ...f, clientId: c.id, name: c.name, phone: onlyDigits(c.phone).startsWith('sem') ? '' : onlyDigits(c.phone) }); setCq('') }}><b>{c.name}</b><small>{onlyDigits(c.phone).length >= 10 ? fmtPhone(c.phone) : 'WhatsApp oculto'}</small></button>)}{!hits.length && <small className="muted">Nenhuma cliente encontrada. Preencha abaixo para cadastrar.</small>}</div>
            })()}
          </Field>
        )}
        {!edit && (picked
          ? <Field label="Cliente cadastrada"><div className="picked-client"><b>{f.name}</b><small>{onlyDigits(f.phone).length >= 10 ? maskPhone(f.phone) : 'WhatsApp oculto pela privacidade'}</small><button type="button" className="link-btn" onClick={() => setF({ ...f, clientId: null, name: '', phone: '' })}>Trocar</button></div></Field>
          : <Field label="WhatsApp do cliente" required><input inputMode="tel" value={maskPhone(f.phone)} onChange={(e) => setF({ ...f, phone: onlyDigits(e.target.value) })} placeholder="(41) 99999-9999" /></Field>)}
        <Field label="Nome" required hint={match && !edit ? `Cliente encontrado: ${match.name}` : ''}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={match?.name || 'Nome do cliente'} /></Field>
        <Field label={`Serviços${service ? ` · ${money(service.price)} · ${service.duration} min` : ''}`} required className="span-2">
          <div className="days">
            {(() => {
              const cats = [...new Set(offered.map(catOf).filter(Boolean))].sort()
              if (offered.length <= 12 && !cats.length) return null
              return (
                <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
                  {offered.length > 12 && <div className="search svc-search" style={{ flex: '1 1 220px' }}><Search size={16} /><input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Buscar procedimento" /></div>}
                  {cats.length > 0 && (
                    <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: '0 1 200px' }} aria-label="Categoria">
                      <option value="">Todas as categorias</option>
                      {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              )
            })()}
            {offered.filter((s) => f.serviceIds.includes(s.id) || ((!sq.trim() || s.name.toLowerCase().includes(sq.trim().toLowerCase())) && (!cat || catOf(s) === cat))).map((s) => (
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
        {f.serviceIds.some((id) => pkgOf(id)) && (
          <div className="span-2 ov-box">
            <label className="toggle-row"><span><b>Sessão de pacote</b><small>{f.serviceIds.filter((id) => pkgOf(id)).map((id) => `${svcOf(id)?.name}: pacote "${pkgOf(id).pkg.name}" · restam ${pkgOf(id).left}`).join(' · ')}. O agendamento fica R$ 0 e a sessão é abatida ao concluir.</small></span><span className="switch"><input type="checkbox" checked={usePkg} onChange={(e) => setUsePkg(e.target.checked)} /><span /></span></label>
          </div>
        )}
        {picked && (data.packages || []).some((p) => p.clientId === f.clientId) && <div className="span-2"><ClientPackages client={{ id: f.clientId, name: f.name }} canSell={false} /></div>}
        {isAdmin && !edit && (
          <div className="span-2 ov-box">
            <label className="toggle-row"><span><b>Pagou adiantado (crédito em haver)</b><small>{crClient ? (crNow > 0 ? `Hoje ela tem ${money(crNow)} de crédito.` : 'Hoje ela não tem crédito.') : 'O valor entra no caixa agora e fica como crédito da cliente.'} O crédito é usado em "Saldo da cliente" na cobrança.</small></span><span className="switch"><input type="checkbox" checked={cr.on} onChange={(e) => setCr({ ...cr, on: e.target.checked })} /><span /></span></label>
            {cr.on && (
              <div className="form-grid mt-sm">
                <Field label="Valor recebido (R$)"><input inputMode="decimal" value={cr.amount} onChange={(e) => setCr({ ...cr, amount: e.target.value })} placeholder="0,00" /></Field>
                <Field label="Pagamento"><select value={cr.payment} onChange={(e) => setCr({ ...cr, payment: e.target.value })}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></Field>
                {crAmount > 0 && <p className="muted small span-2">Depois de agendar: crédito de {money(Math.max(0, crNow) + crAmount)}.</p>}
              </div>
            )}
          </div>
        )}
        {isAdmin && !edit && mainIds.length > 0 && (
          <div className="span-2 ov-box">
            <label className="toggle-row"><span><b>Vender pacote</b><small>A cliente paga agora o pacote inteiro. Esta e as próximas sessões são abatidas no caixa sem cobrar de novo.</small></span><span className="switch"><input type="checkbox" checked={pk.on} onChange={(e) => setPk({ ...pk, on: e.target.checked })} /><span /></span></label>
            {pk.on && (
              <div className="form-grid mt-sm">
                <Field label="Sessões de cada serviço"><input inputMode="numeric" value={pk.sessions} onChange={(e) => setPk({ ...pk, sessions: onlyDigits(e.target.value) })} /></Field>
                <Field label="Valor do pacote (R$)"><input inputMode="decimal" value={pk.price} onChange={(e) => setPk({ ...pk, price: e.target.value })} placeholder="0,00" /></Field>
                <Field label="Pagamento"><select value={pk.payment} onChange={(e) => setPk({ ...pk, payment: e.target.value })}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></Field>
                <p className="muted small span-2">{mainIds.map((id) => svcOf(id)?.name).join(' + ')} · {pkSessions} sessões{pkPrice > 0 ? ` · comissão de cada sessão sobre ${money(pkPrice / (pkSessions * mainIds.length))}` : ' · informe o valor'}</p>
              </div>
            )}
          </div>
        )}
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
      <label className="toggle-row mb-sm"><span><b>Encaixe fora do horário</b><small>Ex.: bem cedo ou depois de fechar. Só a equipe vê; a cliente não consegue marcar nesses horários pelo site.</small></span><span className="switch"><input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} /><span /></span></label>
      {canOverlap && <label className="toggle-row mb-sm"><span><b>Sobrepor horário (tempo de pausa)</b><small>Ex.: enquanto a tinta age, marque outra cliente no mesmo horário. Até {Math.max(2, Number(ovCfg.max || 2))} atendimentos ao mesmo tempo. Só a equipe usa; o site continua normal.</small></span><span className="switch"><input type="checkbox" checked={overlap} onChange={(e) => setOverlap(e.target.checked)} /><span /></span></label>}
      {free && (
        <Field label={ovOn ? 'Horário (pode sobrepor)' : 'Horário do encaixe'} required >
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </Field>
      )}
      {!free && <Field label="Horário livre" required>
        {keep && <p className="muted small">Mantendo {f.time}. Para mudar, escolha outro horário abaixo.</p>}
        {f.time && !keep && !slots.includes(f.time) && <p className="form-err">{why || `O horário ${f.time} não está na grade.`}</p>}
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
        <b>{a.status === 'confirmado' ? '✅ ' : ''}{a.clientName}<ObsTag notes={a.notes} /></b>
        <small>{serviceNames(a, data.services)}{showBarber && b ? ` · ${b.name.split(' ')[0]}` : ''}</small>
      </span>
      {showBarber && b && <Avatar name={b.name} color={b.color} photo={b?.photo} size={28} />}
      <StatusBadge status={a.status} />
    </button>
  )
}
