import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Crown, Receipt, TrendingUp, Users, Wallet } from 'lucide-react'
import { useStore } from '../../state/Store'
import { BarChart, Card, Empty, Stat } from '../../components/ui'
import { AppointmentModal, ApptRow } from '../../components/Appointments'
import { Arena, Birthdays, WaitlistPanel } from '../../components/Team'
import { MyReviews } from './Barber'
import { commissionSummary } from '../../lib/commission'
import { addDays, fmtDate, fmtDateLong, money, PERIODS, sum, today, WD_SHORT, weekday } from '../../lib/utils'

export default function Dashboard() {
  const { data } = useStore()
  const [sel, setSel] = useState(null)
  const t = today()
  const { sales, appointments, barbers, payouts } = data

  const todaySales = sales.filter((s) => s.date === t)
  const month = PERIODS.mes()
  const monthSales = sales.filter((s) => s.date >= month.from && s.date <= month.to)
  const todayAppts = appointments.filter((a) => a.date === t && a.status !== 'cancelado').sort((a, b) => a.time.localeCompare(b.time))
  const upcoming = todayAppts.filter((a) => ['agendado', 'confirmado'].includes(a.status))
  const revenueToday = sum(todaySales, (s) => s.total)
  const revenueMonth = sum(monthSales, (s) => s.total)
  const ticket = monthSales.length ? revenueMonth / monthSales.length : 0

  const prevMonthSameDays = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${from.slice(0, 8)}${t.slice(8)}`
    return sum(sales.filter((s) => s.date >= from && s.date <= to), (s) => s.total)
  }, [sales, t])
  const growth = prevMonthSameDays ? ((revenueMonth - prevMonthSameDays) / prevMonthSameDays) * 100 : 0

  const comm = commissionSummary({ sales, payouts, barbers, from: addDays(t, -60), to: t })
  const due = sum(comm, (c) => c.due)

  const activeSubs = data.subscriptions.filter((x) => x.status === 'ativo')
  const clubMRR = activeSubs.reduce((a, x) => a + Number(data.plans.find((p) => p.id === x.planId)?.price || 0), 0)

  const chart = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(t, i - 13)
    return { label: WD_SHORT[weekday(d)][0] + fmtDate(d).slice(0, 2), value: sum(sales.filter((s) => s.date === d), (s) => s.total), hint: fmtDateLong(d) }
  })

  const online = appointments.filter((a) => a.date >= month.from && a.date <= t)
  const onlinePct = online.length ? Math.round((online.filter((a) => a.source === 'online').length / online.length) * 100) : 0

  return (
    <div className="dash">
      <div className="page-head">
        <div>
          <p className="eyebrow">{fmtDateLong(t)}</p>
          <h1 className="page-title">Visão geral</h1>
        </div>
        <Link className="btn btn-primary" to="/painel/caixa"><Receipt size={18} /> Abrir caixa</Link>
      </div>

      <div className="stats">
        <Stat accent label="Faturamento hoje" value={money(revenueToday)} sub={`${todaySales.length} vendas`} icon={Receipt} />
        <Stat label="Faturamento do mês" value={money(revenueMonth)} sub={`${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(0)}% vs. mês anterior`} icon={TrendingUp} />
        <Stat label="Atendimentos hoje" value={todayAppts.length} sub={`${upcoming.length} a caminho`} icon={CalendarDays} />
        <Stat label="Comissões a pagar" value={money(due)} sub={`Ticket médio ${money(ticket)}`} icon={Wallet} />
        <Stat label="Clube (recorrente)" value={money(clubMRR)} sub={`${activeSubs.length} assinantes ativos`} icon={Crown} />
      </div>

      <div className="grid-2">
        <Card title="Faturamento · últimos 14 dias">
          <BarChart data={chart} />
        </Card>
        <Card title="Próximos de hoje" action={<Link to="/painel/agenda" className="link">Agenda</Link>} pad={false}>
          {upcoming.length ? (
            <div className="list">{upcoming.slice(0, 6).map((a) => <ApptRow key={a.id} a={a} onClick={() => setSel(a)} />)}</div>
          ) : <Empty icon={CalendarDays} title="Agenda livre" text="Nenhum atendimento pendente hoje." />}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Destaques do mês" action={<Link to="/painel/equipe" className="link">Metas</Link>}><Arena /></Card>
        <Card title="Agendamento online">
          <div className="big-kpi">
            <b>{onlinePct}%</b>
            <span>dos atendimentos do mês foram marcados pelo app, sem ninguém parar para responder mensagem.</span>
          </div>
          <div className="mini-kpis">
            <div><Users size={16} /> <b>{data.clients.length}</b> clientes na base</div>
            <div><CalendarDays size={16} /> <b>{appointments.filter((a) => a.date > t && a.status !== 'cancelado').length}</b> agendamentos futuros</div>
          </div>
        </Card>
      </div>
      <div className="grid-3 mt">
        <Card title="Lista de espera"><WaitlistPanel /></Card>
        <Card title="Aniversariantes do mês"><Birthdays /></Card>
        <Card title="Avaliações"><MyReviews limit={3} /></Card>
      </div>
      {sel && <AppointmentModal appt={sel} onClose={() => setSel(null)} />}
    </div>
  )
}
