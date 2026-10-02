import { useEffect, useMemo, useState } from 'react'
import { CalendarOff, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Avatar, Badge, Button, Card, Empty, Segmented, Stat, StatusBadge } from '../../components/ui'
import { BlockModal, BlocksList, WaitlistPanel } from '../../components/Team'
import { WaitlistModal } from '../../components/Loyalty'
import { AppointmentModal, ApptRow, NewAppointmentModal, serviceNames } from '../../components/Appointments'
import {
  addDays, canBook, cls, endOfMonth, fmtDate, fmtDateLong, money, MONTHS, nowMin, parseDate, relDay, startOfMonth, startOfWeek, STATUS, sum, today, toHHMM, toMin, WD_SHORT, weekday,
} from '../../lib/utils'

const PX_PER_MIN = 1.6
const VIEWS = [{ value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'periodo', label: 'Período' }]

/**
 * Agenda com filtros por dia, semana, mês ou período.
 * - Clique num horário vazio (Dia) ou num dia (Semana/Mês) para agendar direto.
 * - `onlyBarberId`: visão da profissional (só a agenda dela).
 */
export default function Agenda({ onlyBarberId }) {
  const { data, session } = useStore()
  const allowBook = canBook(data.settings, session)
  const [view, setView] = useState('dia')
  const [date, setDate] = useState(today())
  const [range, setRange] = useState({ from: today(), to: addDays(today(), 6) })
  const [who, setWho] = useState('all')
  const [status, setStatus] = useState('ativos')
  const [sel, setSel] = useState(null)
  const [newFor, setNewFor] = useState(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [editBlock, setEditBlock] = useState(null)
  const [q, setQ] = useState('')
  const [waitOpen, setWaitOpen] = useState(false)
  const mobile = useMobile()

  const barbers = data.barbers.filter((b) => b.active && (!onlyBarberId || b.id === onlyBarberId) && (onlyBarberId || who === 'all' || b.id === who))
  const ids = new Set(barbers.map((b) => b.id))
  const statusOk = (a) => (status === 'ativos' ? a.status !== 'cancelado' : status === 'todos' ? true : a.status === status)
  const appts = useMemo(() => data.appointments.filter((a) => ids.has(a.barberId) && statusOk(a)), [data.appointments, barbers, status]) // eslint-disable-line react-hooks/exhaustive-deps

  // intervalo da visão atual
  const span = view === 'dia' ? { from: date, to: date }
    : view === 'semana' ? { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) }
      : view === 'mes' ? { from: startOfMonth(date), to: endOfMonth(date) }
        : range
  const inSpan = appts.filter((a) => a.date >= span.from && a.date <= span.to)
  const move = (dir) => {
    if (view === 'dia') setDate(addDays(date, dir))
    else if (view === 'semana') setDate(addDays(date, dir * 7))
    else if (view === 'mes') { const d = parseDate(startOfMonth(date)); d.setMonth(d.getMonth() + dir); setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`) }
  }
  const title = view === 'dia' ? relDay(date)
    : view === 'semana' ? `${fmtDate(span.from)} a ${fmtDate(span.to)}`
      : view === 'mes' ? `${MONTHS[parseDate(date).getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${parseDate(date).getFullYear()}`
        : `${fmtDate(range.from)} a ${fmtDate(range.to)}`
  const openDay = (d) => { setDate(d); setView('dia') }
  const book = (p) => allowBook && setNewFor({ barberId: onlyBarberId || p.barberId || barbers[0]?.id, date: p.date || date, time: p.time || '' })

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">{inSpan.length} atendimentos · {money(sum(inSpan.filter((a) => a.status !== 'cancelado'), (a) => a.total))}</p>
          <h1 className="page-title">{title}</h1>
        </div>
        <div className="head-actions">
          <Button variant="ghost" icon={CalendarOff} onClick={() => setBlockOpen(true)}>Bloquear</Button>
          {allowBook && <Button icon={Plus} onClick={() => book({ date: view === 'dia' ? date : today() })}>Agendar</Button>}
        </div>
      </div>

      <div className="agenda-bar">
        <Segmented value={view} onChange={setView} options={VIEWS} />
        {view !== 'periodo' ? (
          <div className="date-nav">
            <button className="icon-btn" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft size={20} /></button>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Data" />
            <button className="icon-btn" onClick={() => move(1)} aria-label="Próximo"><ChevronRight size={20} /></button>
            {date !== today() && <Button variant="ghost" size="sm" onClick={() => setDate(today())}>Hoje</Button>}
          </div>
        ) : (
          <div className="range">
            <input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label="De" />
            <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label="Até" />
          </div>
        )}
        {!onlyBarberId && !(mobile && view === 'dia') && (
          <select className="agenda-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Profissional">
            <option value="all">Todas as profissionais</option>
            {data.barbers.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="search"><Search size={16} /><input placeholder="Buscar cliente, telefone ou serviço" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="agenda-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ativos">Sem cancelados</option>
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {q.trim().length >= 2 && (() => {
        const t = q.trim().toLowerCase(); const d = t.replace(/\D/g, '')
        const found = appts.filter((a) => a.clientName.toLowerCase().includes(t) || (d.length >= 3 && String(a.clientPhone || '').includes(d)) || serviceNames(a, data.services).toLowerCase().includes(t))
          .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 40)
        return (
          <Card title={`Busca: ${found.length}${found.length === 40 ? '+' : ''} agendamentos`} className="mb">
            <div className="list compact">{found.map((a) => <div key={a.id} className="search-hit"><small className="muted">{fmtDate(a.date)}</small><ApptRow a={a} onClick={() => setSel(a)} /></div>)}
              {!found.length && <Empty icon={Search} title="Nada encontrado" text="Tente outro nome, telefone ou serviço." />}</div>
          </Card>
        )
      })()}
      {view === 'dia' && (mobile ? <MobileDay date={date} setDate={setDate} barbers={barbers} appts={inSpan} onPick={setSel} onBook={allowBook ? book : null} onBlock={setEditBlock} who={onlyBarberId || who} setWho={onlyBarberId ? null : setWho} />
        : <DayGrid date={date} barbers={barbers} appts={inSpan} onPick={setSel} onBook={book} onBlock={setEditBlock} />)}
      {view === 'semana' && <WeekView from={span.from} appts={inSpan} onPick={setSel} onBook={book} onOpenDay={openDay} />}
      {view === 'mes' && <MonthView date={date} appts={inSpan} onOpenDay={openDay} onBook={book} />}
      {view === 'periodo' && <PeriodList appts={inSpan} onPick={setSel} />}

      {view === 'dia' && !onlyBarberId && <Card title={`Lista de espera · ${relDay(date)}`} action={<button className="link" onClick={() => setWaitOpen(true)}>+ Colocar cliente</button>} className="mt"><WaitlistPanel date={date} /></Card>}
      {!onlyBarberId && <Card title="Bloqueios (toque para editar ou excluir)" className="mt"><BlocksList /></Card>}
      {waitOpen && <WaitlistModal open date={date} barberId={who === 'all' ? 'any' : who} serviceIds={[]} me={{ name: '', phone: '' }} barbers={data.barbers} onClose={() => setWaitOpen(false)} />}
      {sel && <AppointmentModal appt={sel} onClose={() => setSel(null)} />}
      <BlockModal open={blockOpen} onClose={() => setBlockOpen(false)} barberId={onlyBarberId} />
      {editBlock && <BlockModal open edit={editBlock} onClose={() => setEditBlock(null)} barberId={onlyBarberId} />}
      <NewAppointmentModal open={!!newFor} onClose={() => setNewFor(null)} date={newFor?.date} time={newFor?.time} barberId={newFor?.barberId} lockBarber={!!onlyBarberId} />
    </div>
  )
}

/* ---------- Dia: grade por profissional (clique no horário vazio agenda) ---------- */
/** agendamentos sobrepostos ficam lado a lado na coluna */
function lanes(list) {
  const sorted = list.filter((a) => !['cancelado', 'faltou'].includes(a.status)).concat(list.filter((a) => ['cancelado', 'faltou'].includes(a.status))).sort((x, y) => toMin(x.time) - toMin(y.time))
  const out = []; let group = []; let end = -1
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => out.push({ ...g, n })); group = [] }
  for (const a of sorted) {
    const s = toMin(a.time), e = s + Number(a.duration)
    if (s >= end && group.length) flush()
    const used = group.filter((g) => toMin(g.a.time) + Number(g.a.duration) > s).map((g) => g.lane)
    let lane = 0; while (used.includes(lane)) lane++
    group.push({ a, lane }); end = Math.max(end, e)
  }
  if (group.length) flush()
  return out
}
const normRoom = (r) => (r || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
function DayGrid({ date, barbers, appts, onPick, onBook, onBlock }) {
  const { data, actions, session } = useStore()
  // sala dividida: a gestão vê os agendamentos das outras; a profissional não vê, então usa os horários ocupados do banco
  const [busy, setBusy] = useState([])
  const shared = barbers.some((b) => b.room)
  useEffect(() => { if (shared) actions.busy(date).then(setBusy).catch(() => setBusy([])) }, [date, shared, data.appointments, actions])
  const roomMarks = (b) => {
    if (!b.room) return []
    if (session?.role === 'admin') {
      return data.appointments.filter((a) => a.date === date && a.barberId !== b.id && !['cancelado', 'faltou'].includes(a.status) && normRoom(data.barbers.find((x) => x.id === a.barberId)?.room) === normRoom(b.room) && a.serviceIds.some((id) => !data.services.find((s) => s.id === id)?.noRoom))
        .map((a) => ({ key: a.id, time: a.time, duration: a.duration, who: data.barbers.find((x) => x.id === a.barberId)?.name.split(' ')[0] }))
    }
    const mine = (x) => data.appointments.some((a) => a.barberId === b.id && a.date === date && a.time === x.time && !['cancelado', 'faltou'].includes(a.status)) || data.blocks.some((k) => k.barberId === b.id && k.date === date && (k.start || '00:00').slice(0, 5) === x.time)
    return busy.filter((x) => x.barberId === b.id && Number(x.duration) < 1440 && !mine(x)).map((x, i) => ({ key: `b${i}`, time: x.time, duration: x.duration, who: '' }))
  }
  const hours = data.settings.hours[weekday(date)] || ['09:00', '19:00']
  const step = Number(data.settings.slotStep || 30)
  // a grade cresce para mostrar encaixes fora do horário (ex.: bem cedo)
  const dayBlocks = data.blocks.filter((x) => x.date === date && x.start)
  const open = Math.floor(Math.min(toMin(hours[0]), ...appts.map((a) => toMin(a.time)), ...dayBlocks.map((x) => toMin(x.start))) / step) * step
  const close = Math.ceil(Math.max(toMin(hours[1]), ...appts.map((a) => toMin(a.time) + Number(a.duration)), ...dayBlocks.map((x) => toMin(x.end))) / step) * step
  const rows = []
  for (let m = open; m < close; m += step) rows.push(m)
  const closed = !data.settings.hours[weekday(date)]
  const showNow = date === today() && nowMin() >= open && nowMin() <= close
  const past = (m) => date < today() || (date === today() && m + step <= nowMin())
  if (!barbers.length) return <Empty title="Nenhuma profissional" text="Cadastre a equipe em Equipe." />
  return (
    <>
      {closed && <p className="notice">Fechado em {fmtDateLong(date).toLowerCase()} pelas configurações de horário.</p>}
      <p className="muted small agenda-hint">Toque num horário vazio para agendar direto.</p>
      <div className="cal" key={date}>
        <div className="cal-head" style={{ gridTemplateColumns: `56px repeat(${barbers.length}, minmax(150px, 1fr))` }}>
          <span />
          {barbers.map((b) => (
            <div key={b.id} className="cal-barber">
              <Avatar name={b.name} color={b.color} photo={b?.photo} size={30} />
              <div><b>{b.name.split(' ')[0]}</b><small>{appts.filter((a) => a.barberId === b.id).length} no dia</small></div>
            </div>
          ))}
        </div>
        <div className="cal-body" style={{ gridTemplateColumns: `56px repeat(${barbers.length}, minmax(150px, 1fr))`, height: (close - open) * PX_PER_MIN }}>
          <div className="cal-times">
            {rows.map((m) => <span key={m} style={{ top: (m - open) * PX_PER_MIN }}>{toHHMM(m)}</span>)}
          </div>
          {barbers.map((b) => {
            const off = b.daysOff?.includes(weekday(date))
            return (
              <div key={b.id} className={cls('cal-col', off && 'off')}>
                {rows.map((m) => (
                  <button key={m} className={cls('cal-cell', past(m) && 'past')} style={{ top: (m - open) * PX_PER_MIN, height: step * PX_PER_MIN }}
                    disabled={off || past(m)} onClick={() => onBook({ barberId: b.id, date, time: toHHMM(m) })} aria-label={`Agendar ${toHHMM(m)} com ${b.name}`}>
                    <span className="cal-plus">+ {toHHMM(m)}</span>
                  </button>
                ))}
                {off && <span className="cal-off">Folga</span>}
                {data.blocks.filter((x) => x.barberId === b.id && x.date === date).map((x) => {
                  const st = x.start ? toMin(x.start) : open
                  const en = x.end ? toMin(x.end) : close
                  return <button key={x.id} type="button" className="cal-block" style={{ top: (st - open) * PX_PER_MIN, height: (en - st) * PX_PER_MIN }} onClick={() => onBlock?.(x)} title="Editar ou excluir bloqueio"><b>{x.reason}</b><small>{x.start ? `${x.start}–${x.end}` : 'Dia inteiro'} · editar</small></button>
                })}
                {roomMarks(b).map((m) => (
                  <div key={`room-${m.key}`} className="cal-room" style={{ top: (toMin(m.time) - open) * PX_PER_MIN, height: m.duration * PX_PER_MIN }}><small>{b.room} ocupada{m.who ? ` · com ${m.who}` : ''}</small></div>
                ))}
                {!off && (b.lunch || data.settings.breakTime) && (() => { const [ls, le] = b.lunch || data.settings.breakTime; return <div className="cal-lunch" style={{ top: (toMin(ls) - open) * PX_PER_MIN, height: (toMin(le) - toMin(ls)) * PX_PER_MIN }}><small>Almoço {ls}–{le}</small></div> })()}
                {lanes(appts.filter((a) => a.barberId === b.id)).map(({ a, lane, n }) => (
                  <button key={a.id} className={cls('cal-ev', `st-${a.status}`, a.duration < 30 && 'short')} style={{ top: (toMin(a.time) - open) * PX_PER_MIN + 1, height: Math.max(26, a.duration * PX_PER_MIN - 3), ...(n > 1 ? { left: `calc(${(lane / n) * 100}% + 2px)`, right: 'auto', width: `calc(${100 / n}% - 4px)` } : {}) }} onClick={() => onPick(a)}>
                    <b>{a.status === 'confirmado' ? '✅ ' : ''}{a.time} · {a.clientName.split(' ')[0]}</b>
                    <small>{serviceNames(a, data.services)}</small>
                  </button>
                ))}
              </div>
            )
          })}
          {showNow && <div className="cal-now" style={{ top: (nowMin() - open) * PX_PER_MIN }} />}
        </div>
      </div>
    </>
  )
}

/* ---------- Semana: 7 colunas com os horários do dia ---------- */
function WeekView({ from, appts, onPick, onBook, onOpenDay }) {
  const { data } = useStore()
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  return (
    <div className="week">
      {days.map((d) => {
        const list = appts.filter((a) => a.date === d).sort((a, b) => a.time.localeCompare(b.time))
        const closed = !data.settings.hours[weekday(d)]
        return (
          <section key={d} className={cls('week-day', d === today() && 'today', closed && 'closed')}>
            <header>
              <button className="week-date" onClick={() => onOpenDay(d)}><small>{WD_SHORT[weekday(d)]}</small><b>{parseDate(d).getDate()}</b></button>
              <span className="muted small">{list.length ? `${list.length} · ${money(sum(list, (a) => a.total))}` : closed ? 'Fechado' : 'Livre'}</span>
            </header>
            <div className="week-list">
              {list.map((a) => {
                const b = data.barbers.find((x) => x.id === a.barberId)
                return (
                  <button key={a.id} className={cls('week-ev', `st-${a.status}`)} onClick={() => onPick(a)} style={{ borderLeftColor: b?.color }}>
                    <b>{a.time} · {a.clientName.split(' ')[0]}</b>
                    <small>{serviceNames(a, data.services)}</small>
                    <small>{b?.name.split(' ')[0]}</small>
                  </button>
                )
              })}
            </div>
            {!closed && d >= today() && <button className="week-add" onClick={() => onBook({ date: d })}><Plus size={14} /> Agendar</button>}
          </section>
        )
      })}
    </div>
  )
}

/* ---------- Mês: calendário com a quantidade de atendimentos por dia ---------- */
function MonthView({ date, appts, onOpenDay, onBook }) {
  const { data } = useStore()
  const first = startOfMonth(date)
  const start = startOfWeek(first)
  const last = endOfMonth(date)
  const cells = []
  for (let d = start; d <= last || weekday(d) !== 1; d = addDays(d, 1)) cells.push(d)
  return (
    <div className="month">
      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => <span key={w} className="month-wd">{w}</span>)}
      {cells.map((d) => {
        const list = appts.filter((a) => a.date === d)
        const out = d.slice(0, 7) !== first.slice(0, 7)
        const closed = !data.settings.hours[weekday(d)]
        return (
          <div key={d} className={cls('month-cell', out && 'out', d === today() && 'today', closed && 'closed')}>
            <button className="month-open" onClick={() => onOpenDay(d)} aria-label={`Abrir ${fmtDateLong(d)}`}>
              <b>{parseDate(d).getDate()}</b>
              {list.length > 0 && <span className="month-count">{list.length}</span>}
              <span className="month-names">{list.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3).map((a) => <i key={a.id}>{a.time} {a.clientName.split(' ')[0]}</i>)}{list.length > 3 && <i>+{list.length - 3}</i>}</span>
            </button>
            {!out && !closed && d >= today() && <button className="month-add" onClick={() => onBook({ date: d })} aria-label={`Agendar em ${fmtDate(d)}`}><Plus size={14} /></button>}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Período: lista agrupada por dia ---------- */
function PeriodList({ appts, onPick }) {
  const { data } = useStore()
  const byDay = {}
  for (const a of appts.slice().sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))) (byDay[a.date] ??= []).push(a)
  const days = Object.keys(byDay)
  if (!days.length) return <Empty icon={Search} title="Nada neste período" text="Mude as datas ou os filtros." />
  const done = appts.filter((a) => a.status === 'concluido')
  return (
    <>
      <div className="stats mb">
        <Stat label="Atendimentos" value={appts.length} sub={`${appts.filter((a) => a.source === 'online').length} pelo site`} />
        <Stat label="Concluídos" value={done.length} />
        <Stat label="Faltas" value={appts.filter((a) => a.status === 'faltou').length} />
        <Stat accent label="Valor agendado" value={money(sum(appts.filter((a) => a.status !== 'cancelado'), (a) => a.total))} />
      </div>
      {days.map((d) => (
        <Card key={d} title={`${fmtDateLong(d)} · ${byDay[d].length}`} pad={false} className="mb">
          <div className="list">
            {byDay[d].map((a) => {
              const b = data.barbers.find((x) => x.id === a.barberId)
              return (
                <button key={a.id} className={`appt-row st-${a.status}`} onClick={() => onPick(a)}>
                  <span className="appt-time">{a.time}</span>
                  <span className="appt-info"><b>{a.clientName}</b><small>{serviceNames(a, data.services)} · {b?.name.split(' ')[0]} · {money(a.total)}</small></span>
                  {a.source === 'online' && <Badge tone="info">Site</Badge>}
                  <StatusBadge status={a.status} />
                </button>
              )
            })}
          </div>
        </Card>
      ))}
    </>
  )
}

/* ---------- Dia no celular: linha do tempo ---------- */
function useMobile() {
  const q = '(max-width: 600px)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(q); if (!mq) return
    const on = () => setM(mq.matches); mq.addEventListener?.('change', on); return () => mq.removeEventListener?.('change', on)
  }, [])
  return m
}
function MobileDay({ date, setDate, barbers, appts, onPick, onBook, onBlock, who, setWho }) {
  const { data } = useStore()
  const all = data.barbers.filter((b) => b.active)
  const one = barbers.length === 1 ? barbers[0] : null
  const step = Number(data.settings.slotStep || 30)
  const hours = data.settings.hours[weekday(date)]
  const ids = new Set(barbers.map((b) => b.id))
  const live = appts.filter((a) => !['cancelado', 'faltou'].includes(a.status))
  const blocks = data.blocks.filter((x) => x.date === date && ids.has(x.barberId))
  const off = one && one.daysOff?.includes(weekday(date))
  const lunch = one && (one.lunch || data.settings.breakTime)
  const open = hours ? toMin(hours[0]) : null, close = hours ? toMin(hours[1]) : null
  // ocupado: para uma profissional, os horários dela; para "todas", só quando ninguém está livre
  const busyAt = (m) => {
    const hit = (b) => live.some((a) => a.barberId === b.id && toMin(a.time) < m + step && toMin(a.time) + Number(a.duration) > m)
      || blocks.some((x) => x.barberId === b.id && (!x.start || (toMin(x.start) < m + step && toMin(x.end) > m)))
      || b.daysOff?.includes(weekday(date))
      || (() => { const l = b.lunch || data.settings.breakTime; return l && toMin(l[0]) < m + step && toMin(l[1]) > m })()
    return barbers.every(hit)
  }
  const past = (m) => date < today() || (date === today() && m + step <= nowMin())
  // itens da linha do tempo
  const items = []
  const sorted = appts.slice().sort((x, y) => toMin(x.time) - toMin(y.time))
  let cl = null
  for (const a of sorted) {
    const s = toMin(a.time), e = s + Number(a.duration)
    if (cl && s < cl.end) { cl.list.push(a); cl.end = Math.max(cl.end, e) } else { cl = { kind: 'ev', at: s, end: e, list: [a] }; items.push(cl) }
  }
  blocks.forEach((x) => items.push({ kind: 'block', at: x.start ? toMin(x.start) : -1, x }))
  if (lunch && !off) items.push({ kind: 'lunch', at: toMin(lunch[0]), l: lunch })
  if (one && hours && !off && onBook) {
    let g = null
    for (let m = open; m < close; m += step) {
      if (!busyAt(m) && !past(m)) { if (g) g.end = m + step; else g = { kind: 'gap', at: m, end: m + step } }
      else if (g) { items.push(g); g = null }
    }
    if (g) items.push(g)
  }
  items.sort((x, y) => x.at - y.at || (x.kind === 'gap') - (y.kind === 'gap'))
  const nowIdx = date === today() ? items.findIndex((it) => it.at > nowMin()) : -2
  const start = startOfWeek(date)
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i))
  const bn = (id) => data.barbers.find((x) => x.id === id)
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`)
  const nowRow = <div key="now" className="mt-now"><span>{toHHMM(nowMin())}</span><i /></div>
  return (
    <div className="mt">
      <div className="mt-days" ref={(el) => { const on = el?.querySelector('.on'); if (on && el.dataset.d !== date) { el.dataset.d = date; el.scrollLeft = on.offsetLeft - el.clientWidth / 2 + on.clientWidth / 2 } }}>
        {days.map((d) => {
          const n = data.appointments.filter((a) => a.date === d && ids.has(a.barberId) && a.status !== 'cancelado').length
          return (
            <button key={d} className={cls('mt-day', d === date && 'on', d === today() && 'today', !data.settings.hours[weekday(d)] && 'closed')} onClick={() => setDate(d)}>
              <small>{WD_SHORT[weekday(d)]}</small><b>{parseDate(d).getDate()}</b>{n > 0 && <i>{n}</i>}
            </button>
          )
        })}
      </div>
      {setWho && all.length > 1 && (
        <div className="mt-pros">
          <button className={cls('mt-pro', who === 'all' && 'on')} onClick={() => setWho('all')}>Todas</button>
          {all.map((b) => <button key={b.id} className={cls('mt-pro', who === b.id && 'on')} onClick={() => setWho(b.id)}><Avatar name={b.name} color={b.color} photo={b.photo} size={22} />{b.name.split(' ')[0]}</button>)}
        </div>
      )}
      {!hours && <p className="notice">Fechado neste dia pelas configurações de horário.</p>}
      {off && <p className="notice">Folga de {one.name.split(' ')[0]} neste dia.</p>}
      <div className="mt-list" key={date}>
        {!items.length && <Empty icon={Plus} title="Dia livre" text={onBook ? 'Nenhum atendimento ainda. Agende a primeira cliente.' : 'Nenhum atendimento neste dia.'} action={onBook ? <Button size="sm" icon={Plus} onClick={() => onBook({ barberId: one?.id, date })}>Agendar</Button> : null} />}
        {items.map((it, i) => {
          const row = (() => {
            if (it.kind === 'gap') {
              return (
                <button key={`g${it.at}`} className="mt-row mt-gap" onClick={() => onBook({ barberId: one?.id, date, time: toHHMM(it.at) })}>
                  <span className="mt-time">{toHHMM(it.at)}</span>
                  <span className="mt-gap-in"><Plus size={15} /> Encaixar <small>livre até {toHHMM(it.end)} · {dur(it.end - it.at)}</small></span>
                </button>
              )
            }
            if (it.kind === 'lunch') return <div key="lunch" className="mt-row mt-soft"><span className="mt-time">{it.l[0]}</span><span className="mt-note">Almoço · até {it.l[1]}</span></div>
            if (it.kind === 'block') {
              const b = bn(it.x.barberId)
              return (
                <button key={it.x.id} className="mt-row mt-soft" onClick={() => onBlock?.(it.x)}>
                  <span className="mt-time">{it.x.start || 'Dia'}</span>
                  <span className="mt-note mt-blk"><b>{it.x.reason || 'Bloqueado'}</b> {it.x.start ? `até ${it.x.end}` : 'inteiro'}{!one && b ? ` · ${b.name.split(' ')[0]}` : ''}</span>
                </button>
              )
            }
            return (
              <div key={`e${it.at}-${i}`} className="mt-row">
                <span className="mt-time">{toHHMM(it.at)}</span>
                <div className={cls('mt-evs', it.list.length > 1 && 'multi')}>
                  {it.list.map((a) => {
                    const b = bn(a.barberId)
                    return (
                      <button key={a.id} className={cls('mt-ev', `st-${a.status}`)} style={{ '--c': b?.color }} onClick={() => onPick(a)}>
                        <span className="mt-ev-top"><b>{a.time}–{toHHMM(toMin(a.time) + Number(a.duration))}</b><StatusBadge status={a.status} /></span>
                        <span className="mt-ev-name">{a.clientName}</span>
                        <small>{serviceNames(a, data.services)}</small>
                        {!one && b && <span className="mt-ev-pro"><Avatar name={b.name} color={b.color} photo={b.photo} size={20} />{b.name.split(' ')[0]}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()
          return i === nowIdx ? [nowRow, row] : row
        })}
        {nowIdx === -1 && items.length > 0 && nowRow}
      </div>
      {onBook && <button className="mt-fab" onClick={() => onBook({ barberId: one?.id, date })} aria-label="Novo agendamento"><Plus size={24} /></button>}
    </div>
  )
}
