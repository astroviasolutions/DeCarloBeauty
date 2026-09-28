import { useState } from 'react'
import { CalendarOff, Medal, Trash2, Trophy } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Modal } from './ui'
import { Stars } from './Loyalty'
import { commissionSummary } from '../lib/commission'
import { cls, endOfMonth, fmtDate, money, relDay, startOfMonth, today, waLink } from '../lib/utils'
import { bookingLink, msg as fillMsg } from '../lib/messages'

/** Ranking do mês com metas (Arena) */
export function useArena() {
  const { data } = useStore()
  const from = startOfMonth(today()); const to = endOfMonth(today())
  const rows = commissionSummary({ sales: data.sales, payouts: [], barbers: data.barbers.filter((b) => b.active), from, to })
    .map((r) => {
      const rs = data.reviews.filter((x) => x.barberId === r.barber.id)
      const rating = rs.length ? rs.reduce((a, x) => a + x.stars, 0) / rs.length : 0
      const products = r.prdValue
      const goal = Number(r.barber.goal || 0)
      return { ...r, rating, reviews: rs.length, products, goal, pct: goal ? Math.min(100, (r.revenue / goal) * 100) : 0 }
    })
    .sort((a, b) => b.revenue - a.revenue)
  // dias úteis restantes no mês (aprox.) para o ritmo
  const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const passed = d.getDate() / last
  return { rows, passed }
}

const MEDALS = ['ouro', 'prata', 'bronze']

export function Arena({ highlightId, only }) {
  const { rows: all, passed } = useArena()
  const rows = only ? all.filter((r) => r.barber.id === only) : all
  const topPrd = [...rows].sort((a, b) => b.products - a.products)[0]
  const topRate = [...rows].filter((r) => r.reviews >= 3).sort((a, b) => b.rating - a.rating)[0]
  return (
    <div className="arena">
      {rows.map((r, i) => (
        <div key={r.barber.id} className={cls('arena-row', highlightId === r.barber.id && 'me')}>
          {!only && <span className={cls('arena-pos', MEDALS[i])}>{i < 3 ? <Medal size={18} /> : i + 1}</span>}
          <Avatar name={r.barber.name} color={r.barber.color} size={36} />
          <div className="arena-main">
            <div className="arena-top">
              <b>{r.barber.name}</b>
              <span>{money(r.revenue)}{r.goal ? <small> / {money(r.goal)}</small> : null}</span>
            </div>
            <div className="arena-track">
              <div className="arena-fill" style={{ width: `${r.pct}%` }} />
              {r.goal > 0 && <i className="arena-pace" style={{ left: `${passed * 100}%` }} title="Ritmo esperado para hoje" />}
            </div>
            <div className="arena-tags">
              <span>{Math.round(r.pct)}% da meta</span>
              {r.reviews > 0 && <span><Stars value={r.rating} size={11} /> {r.rating.toFixed(1)}</span>}
              {topPrd?.barber.id === r.barber.id && r.products > 0 && <span className="tag-gold"><Trophy size={11} /> Destaque home care</span>}
              {topRate?.barber.id === r.barber.id && <span className="tag-gold"><Trophy size={11} /> Mais bem avaliado</span>}
            </div>
          </div>
        </div>
      ))}
      <p className="muted small">A linha fina marca o ritmo esperado para hoje. Quem está à direita dela vai bater a meta.</p>
    </div>
  )
}

/** Bloquear horário / folga */
export function BlockModal({ open, onClose, barberId: fixedBarber, edit = null }) {
  const { data, actions } = useStore()
  const [f, setF] = useState(edit
    ? { barberId: edit.barberId, date: edit.date, full: !edit.start, start: edit.start || '12:00', end: edit.end || '13:00', reason: edit.reason || '' }
    : { barberId: fixedBarber || data.barbers.find((b) => b.active)?.id, date: today(), full: false, start: '12:00', end: '13:00', reason: '' })
  const del = async () => { await actions.remove('blocks', edit.id, 'Bloqueio excluído'); onClose() }
  const save = async () => {
    await actions.upsert('blocks', { ...(edit ? { id: edit.id } : {}), barberId: edit ? f.barberId : (fixedBarber || f.barberId), date: f.date, start: f.full ? null : f.start, end: f.full ? null : f.end, reason: f.reason || (f.full ? 'Folga' : 'Horário bloqueado') }, edit ? 'Bloqueio atualizado' : 'Horário bloqueado')
    onClose()
  }
  const valid = f.date && (f.full || f.start < f.end)
  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Editar bloqueio' : 'Bloquear horário'} footer={<>{edit && <Button variant="danger" onClick={del}>Excluir</Button>}<Button block icon={CalendarOff} disabled={!valid} onClick={save}>{edit ? 'Salvar' : 'Bloquear'}</Button></>}>
      <div className="form-grid">
        {!fixedBarber && !edit && (
          <Field label="Profissional" className="span-2">
            <select value={f.barberId} onChange={(e) => setF({ ...f, barberId: e.target.value })}>{data.barbers.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
        )}
        <Field label="Dia" required><input type="date" min={edit ? undefined : today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Período">
          <div className="days">
            <button type="button" className={cls('pill', !f.full && 'on')} onClick={() => setF({ ...f, full: false })}>Horário</button>
            <button type="button" className={cls('pill', f.full && 'on')} onClick={() => setF({ ...f, full: true })}>Dia inteiro</button>
          </div>
        </Field>
        {!f.full && <Field label="Das"><input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>}
        {!f.full && <Field label="Até"><input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>}
        <Field label="Motivo (opcional)" className="span-2"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex.: curso, compromisso, almoço" /></Field>
      </div>
      <p className="muted small mt">Os clientes não conseguem agendar nesse período. Agendamentos já marcados continuam na agenda.</p>
    </Modal>
  )
}

export function BlocksList({ barberId }) {
  const { data, actions } = useStore()
  const list = data.blocks.filter((b) => b.date >= today() && (!barberId || b.barberId === barberId)).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))
  if (!list.length) return <p className="muted small">Nenhum bloqueio futuro.</p>
  return (
    <div className="list compact">
      {list.map((b) => (
        <div key={b.id} className="sale-row">
          <span className="appt-time">{fmtDate(b.date)}</span>
          <span className="appt-info"><b>{b.reason}</b><small>{relDay(b.date)} · {b.start ? `${b.start}–${b.end}` : 'dia inteiro'}{!barberId ? ` · ${data.barbers.find((x) => x.id === b.barberId)?.name.split(' ')[0]}` : ''}</small></span>
          <button className="icon-btn sm" onClick={() => actions.remove('blocks', b.id, 'Bloqueio removido')} aria-label="Remover bloqueio"><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  )
}

/** Lista de espera: avisar quando abrir horário */
export function WaitlistPanel({ date }) {
  const { data, actions } = useStore()
  const list = data.waitlist.filter((w) => w.status !== 'atendido' && (date ? w.date === date : w.date >= today())).sort((a, b) => a.date.localeCompare(b.date))
  if (!list.length) return <p className="muted small">Ninguém na lista de espera{date ? ' para este dia' : ''}.</p>
  const link = `${location.origin}${location.pathname}#/`
  const period = { manha: 'manhã', tarde: 'tarde', noite: 'noite', qualquer: 'qualquer horário' }
  return (
    <div className="list compact">
      {list.map((w) => {
        const b = data.barbers.find((x) => x.id === w.barberId)
        const svc = (w.serviceIds || []).map((id) => data.services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ')
        const msg = fillMsg(data.settings, 'waitlist', { nome: w.clientName.split(' ')[0], data: `${relDay(w.date).toLowerCase()} (${fmtDate(w.date)})`, profissional: b ? ` com ${b.name.split(' ')[0]}` : '', link })
        return (
          <div key={w.id} className="sale-row wait-row">
            <span className="appt-time">{fmtDate(w.date)}</span>
            <span className="appt-info"><b>{w.clientName}</b><small>{svc || 'Serviço'} · {period[w.period] || w.period}{b ? ` · ${b.name.split(' ')[0]}` : ''}</small></span>
            {w.status === 'avisado' && <span className="badge badge-info">Avisado</span>}
            <a className="btn btn-wa btn-sm" href={waLink(w.phone, msg)} target="_blank" rel="noreferrer" onClick={() => actions.upsert('waitlist', { ...w, status: 'avisado' }, 'Marcado como avisado')}>Avisar</a>
            <button className="icon-btn sm" onClick={() => actions.upsert('waitlist', { ...w, status: 'atendido' }, 'Removido da lista')} aria-label="Remover da lista"><Trash2 size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}

/** Aniversariantes do mês */
export function Birthdays() {
  const { data } = useStore()
  const m = today().slice(5, 7)
  const list = data.clients.filter((c) => c.birthday?.slice(0, 2) === m).sort((a, b) => a.birthday.localeCompare(b.birthday))
  if (!list.length) return <p className="muted small">Nenhum aniversariante este mês.</p>
  const pct = data.settings.birthdayDiscount || 0
  return (
    <div className="list compact">
      {list.slice(0, 8).map((c) => {
        const msg = fillMsg(data.settings, 'birthday', { nome: c.name.split(' ')[0], desconto: pct, link: bookingLink() })
        return (
          <div key={c.id} className="sale-row">
            <span className="appt-time">{c.birthday.slice(3)}/{m}</span>
            <span className="appt-info"><b>{c.name}</b><small>{c.birthday.slice(3) === today().slice(8) ? 'Hoje!' : 'Neste mês'}</small></span>
            <a className="btn btn-ghost btn-sm" href={waLink(c.phone, msg)} target="_blank" rel="noreferrer">Parabenizar</a>
          </div>
        )
      })}
      {list.length > 8 && <p className="muted small">+{list.length - 8} aniversariantes</p>}
    </div>
  )
}
