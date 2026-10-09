import { useState } from 'react'
import { CalendarDays, CalendarOff, Camera, FileText, Sparkles, Star, Wallet } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Button, Card, Empty, Segmented, Stat } from '../../components/ui'
import { Arena, BlockModal, BlocksList } from '../../components/Team'
import { PortfolioModal, Stars } from '../../components/Loyalty'
import { AppointmentModal, ApptRow } from '../../components/Appointments'
import { commissionSummary } from '../../lib/commission'
import Agenda from './Agenda'
import { PushPanel } from './Config'
import { PERIOD_OPTS, periodOf } from './Relatorios'
import { staffStatementPDF } from '../../lib/pdf'
import { addDays, fmtDate, fmtDateLong, money, PERIODS, relDay, startOfMonth, today } from '../../lib/utils'

export function BarberHome() {
  const { data, session } = useStore()
  const [sel, setSel] = useState(null)
  const [day, setDay] = useState(today())
  const [blockOpen, setBlockOpen] = useState(false)
  const [gallery, setGallery] = useState(false)
  const me = data.barbers.find((b) => b.id === session.barberId)
  const t = today()
  const summary = (p) => commissionSummary({ sales: data.sales, payouts: data.payouts, barbers: [me], ...p })[0]
  const d = summary(PERIODS.hoje()); const w = summary(PERIODS.semana()); const m = summary(PERIODS.mes())
  const due = commissionSummary({ sales: data.sales, payouts: data.payouts, barbers: [me], from: addDays(t, -60), to: t })[0].due
  const list = data.appointments.filter((a) => a.barberId === me.id && a.date === day && a.status !== 'cancelado').sort((a, b) => a.time.localeCompare(b.time))
  const hr = new Date().getHours()
  const hello = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">{fmtDateLong(t)}</p><h1 className="page-title">{hello}, {me.name.split(' ')[0]}</h1></div>
        <div className="head-actions">
          <Button variant="ghost" icon={Camera} onClick={() => setGallery(true)}>Meu portfólio ({data.photos.filter((p) => p.barberId === me.id).length})</Button>
          <Button variant="ghost" icon={CalendarOff} onClick={() => setBlockOpen(true)}>Bloquear horário</Button>
        </div>
      </div>
      <div className="stats">
        <Stat accent label="Comissão hoje" value={money(d.total)} sub={`${d.svcCount} serviços · ${d.prdCount} produtos`} icon={Wallet} />
        <Stat label="Na semana" value={money(w.total)} sub={`${w.count} atendimentos`} icon={CalendarDays} />
        <Stat label="No mês" value={money(m.total)} sub={`Serviços ${money(m.svcComm)} · Produtos ${money(m.prdComm)}`} icon={Sparkles} />
        <Stat label="A receber" value={money(due)} sub="Desde o último acerto" icon={Wallet} />
      </div>
      <Card title={`Agenda · ${relDay(day)}`} action={
        <Segmented value={day} onChange={setDay} options={[0, 1, 2].map((i) => ({ value: addDays(t, i), label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : fmtDate(addDays(t, i)) }))} />
      } pad={false}>
        {list.length ? <div className="list">{list.map((a) => <ApptRow key={a.id} a={a} onClick={() => setSel(a)} showBarber={false} />)}</div>
          : <Empty icon={CalendarDays} title="Nenhum horário" text="Quando um cliente agendar com você, aparece aqui na hora." />}
      </Card>
      <div className="grid-2">
        <Card title="Minha meta do mês"><Arena highlightId={me.id} only={me.id} /></Card>
        <div className="stack">
          <Card title="Minhas folgas e bloqueios" action={<button className="link" onClick={() => setBlockOpen(true)}>+ Bloquear</button>}><BlocksList barberId={me.id} /></Card>
          <Card title="Avaliações dos clientes"><MyReviews barberId={me.id} /></Card>
          <Card title="Notificações no celular"><PushPanel /></Card>
        </div>
      </div>
      {sel && <AppointmentModal appt={sel} onClose={() => setSel(null)} />}
      <BlockModal open={blockOpen} onClose={() => setBlockOpen(false)} barberId={me.id} />
      {gallery && <PortfolioModal barber={me} photos={data.photos} onClose={() => setGallery(false)} />}
    </div>
  )
}

/** Agenda completa da profissional (dia, semana, mês ou período) — só a dela */
export function MyAgenda() {
  const { session } = useStore()
  return <Agenda onlyBarberId={session.barberId} />
}

export function MyReviews({ barberId, limit = 5 }) {
  const { data } = useStore()
  const list = data.reviews.filter((r) => !barberId || r.barberId === barberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!list.length) return <Empty icon={Star} title="Sem avaliações ainda" text="Peça a avaliação pelo WhatsApp ao finalizar a venda." />
  const avg = list.reduce((a, r) => a + r.stars, 0) / list.length
  return (
    <div>
      <div className="rating-big"><b>{avg.toFixed(1)}</b><div><Stars value={avg} size={16} /><small>{list.length} avaliações</small></div></div>
      <div className="list compact">
        {list.filter((r) => r.comment).slice(0, limit).map((r) => (
          <div key={r.id} className="review-row">
            <Stars value={r.stars} size={12} />
            <p>“{r.comment}”</p>
            <small>{r.clientName.split(' ')[0]} · {fmtDate(r.createdAt)}{!barberId ? ` · ${data.barbers.find((b) => b.id === r.barberId)?.name.split(' ')[0]}` : ''}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BarberStatement() {
  const { data, session, actions } = useStore()
  const [period, setPeriod] = useState('semana')
  const [custom, setCustom] = useState({ from: startOfMonth(today()), to: today() })
  const me = data.barbers.find((b) => b.id === session.barberId)
  const p = periodOf(period, custom)
  const s = commissionSummary({ sales: data.sales, payouts: data.payouts, barbers: [me], from: p.from, to: p.to })[0]
  const sales = data.sales.filter((x) => x.barberId === me.id && x.date >= p.from && x.date <= p.to).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  const pays = data.payouts.filter((x) => x.barberId === me.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 6)

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Transparência total</p><h1 className="page-title">Meu extrato</h1></div>
        <div className="head-actions">
          <Segmented value={period} onChange={setPeriod} options={PERIOD_OPTS} />
          <Button variant="ghost" icon={FileText} onClick={() => staffStatementPDF({ data, from: p.from, to: p.to, barberIds: [me.id] }).catch((e) => actions.notify(e.message, 'bad'))}>PDF</Button>
        </div>
      </div>
      {period === 'custom' && (
        <div className="agenda-bar"><div className="range">
          <input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} aria-label="De" />
          <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} aria-label="Até" />
        </div></div>
      )}
      <div className="stats">
        <Stat accent label="Comissão total" value={money(s.total)} sub={p.label} icon={Wallet} />
        <Stat label="Serviços" value={money(s.svcComm)} sub={`${s.svcCount} realizados · ${money(s.svcValue)}`} />
        <Stat label="Produtos" value={money(s.prdComm)} sub={`${s.prdCount} vendidos · ${money(s.prdValue)}`} />
      </div>
      <div className="grid-2">
        <Card title="Lançamentos" pad={false}>
          {sales.length ? (
            <div className="list">
              {sales.map((x) => (
                <div key={x.id} className="sale-row">
                  <span className="appt-time">{fmtDate(x.date)}</span>
                  <span className="appt-info"><b>{x.clientName}</b><small>{x.items.map((i) => i.name).join(', ')} · {money(x.total)}</small></span>
                  <b className="plus">+{money(x.commissionTotal)}</b>
                </div>
              ))}
            </div>
          ) : <Empty title="Sem lançamentos no período" text="Troque o período acima. Cada atendimento fechado no Caixa entra aqui com a sua comissão." />}
        </Card>
        <Card title="Acertos recebidos" pad={false}>
          {pays.length ? (
            <div className="list">
              {pays.map((x) => (
                <div key={x.id} className="sale-row">
                  <span className="appt-time">{fmtDate(x.paidAt)}</span>
                  <span className="appt-info"><b>{x.note || 'Acerto'}</b><small>{fmtDate(x.from)} a {fmtDate(x.to)}</small></span>
                  <b>{money(x.amount)}</b>
                </div>
              ))}
            </div>
          ) : <Empty title="Nenhum acerto registrado" text="Quando a gestão registrar um pagamento ou adiantamento, ele aparece aqui." />}
        </Card>
      </div>
    </div>
  )
}
