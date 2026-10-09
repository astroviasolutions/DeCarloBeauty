import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Bell, CalendarDays, ChevronDown, Crown, Receipt, TrendingUp, Users, Wallet } from 'lucide-react'
import { ClientModal } from './Cadastros'
import { useStore } from '../../state/Store'
import { BarChart, Card, Empty, Stat } from '../../components/ui'
import { Donut } from '../../components/fx'
import { AppointmentModal, ApptRow } from '../../components/Appointments'
import { Arena, Birthdays, WaitlistPanel } from '../../components/Team'
import { MyReviews } from './Barber'
import { commissionSummary } from '../../lib/commission'
import { addDays, cls, fmtDate, fmtDateLong, money, PERIODS, saleRevenue, sum, today, WD_SHORT, weekday } from '../../lib/utils'

export default function Dashboard() {
  const { data, session } = useStore()
  const [sel, setSel] = useState(null)
  const [showAtt, setShowAtt] = useState(false) // avisos recolhidos: abrem no botão "Avisos"
  const att = useAttention(data)
  const t = today()
  const { sales, appointments, barbers, payouts } = data

  const todaySales = sales.filter((s) => s.date === t)
  const month = PERIODS.mes()
  const monthSales = sales.filter((s) => s.date >= month.from && s.date <= month.to)
  const todayAppts = appointments.filter((a) => a.date === t && a.status !== 'cancelado').sort((a, b) => a.time.localeCompare(b.time))
  const upcoming = todayAppts.filter((a) => ['agendado', 'confirmado'].includes(a.status))
  const revenueToday = sum(todaySales, saleRevenue)
  const revenueMonth = sum(monthSales, saleRevenue)
  // ticket por comanda (cliente + dia): uma comanda com 2 profissionais conta 1 vez
  const comandas = new Set(monthSales.filter((s) => Number(s.total) > 0).map((s) => `${s.clientId || s.clientName}|${s.date}`)).size
  const ticket = comandas ? revenueMonth / comandas : 0

  const prevMonthSameDays = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${from.slice(0, 8)}${t.slice(8)}`
    return sum(sales.filter((s) => s.date >= from && s.date <= to), saleRevenue)
  }, [sales, t])
  const growth = prevMonthSameDays ? ((revenueMonth - prevMonthSameDays) / prevMonthSameDays) * 100 : 0

  const comm = commissionSummary({ sales, payouts, barbers, from: addDays(t, -60), to: t })
  const due = sum(comm, (c) => c.due)

  const activeSubs = data.subscriptions.filter((x) => x.status === 'ativo')
  const clubMRR = activeSubs.reduce((a, x) => a + Number(data.plans.find((p) => p.id === x.planId)?.price || 0), 0)

  const chart = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(t, i - 13)
    return { label: WD_SHORT[weekday(d)][0] + fmtDate(d).slice(0, 2), value: sum(sales.filter((s) => s.date === d), saleRevenue), hint: fmtDateLong(d) }
  })

  const online = appointments.filter((a) => a.date >= month.from && a.date <= t)
  const onlinePct = online.length ? Math.round((online.filter((a) => a.source === 'online').length / online.length) * 100) : 0

  return (
    <div className="dash">
      {(() => { const lim = addDays(t, 3); const b = (data.expenses || []).filter((e) => e.paid === false && e.dueDate && e.dueDate <= lim); return b.length ? <Link to="/painel/financeiro" className="alert" style={{ display: 'block', background: '#fef3f2', color: '#b42318', padding: '10px 14px', borderRadius: 12, marginBottom: 12, fontWeight: 600 }}>⚠ {b.length} boleto(s) vencendo em até 3 dias ou vencidos · {money(sum(b, (e) => e.amount))} — veja em Lucro real</Link> : null })()}
      <div className="page-head">
        <div>
          <p className="eyebrow">{fmtDateLong(t)}</p>
          <h1 className="page-title v-hello">Olá, <span className="v-it">{(() => { const n = session?.name || ''; return /^Gestão\s+/i.test(n) ? n.replace(/^Gestão\s+/i, '') : (n.split(' ')[0] || 'equipe') })()}</span></h1>
        </div>
        <div className="head-actions">
          <button type="button" className={cls('btn btn-ghost att-bell', att.some((r) => r.tone === 'bad') && 'urgent')} aria-expanded={showAtt} onClick={() => setShowAtt(!showAtt)}>
            <Bell size={18} /> Avisos{att.length > 0 && <span className="att-count">{att.length}</span>}
          </button>
          <Link className="btn btn-primary" to="/painel/caixa"><Receipt size={18} /> Abrir caixa</Link>
        </div>
      </div>

      <div className="stats">
        <Stat label="Faturamento hoje" help="Soma das vendas fechadas hoje no Caixa. Pagamento com crédito em haver não conta de novo (o dinheiro entrou quando o crédito foi pago)." value={money(revenueToday)} sub={`${todaySales.length} vendas`} icon={Receipt} />
        <Stat label="Faturamento do mês" help="Vendas do dia 1º até hoje. A % compara com o mesmo período do mês passado (ex.: 1 a 8 contra 1 a 8)." value={money(revenueMonth)} sub={`${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(0)}% vs. mês anterior`} icon={TrendingUp} />
        <Stat label="Atendimentos hoje" help="Agendamentos de hoje que não foram cancelados. “A caminho” = ainda não atendidos." value={todayAppts.length} sub={`${upcoming.length} a caminho`} icon={CalendarDays} />
        <Stat label="Comissões a pagar" help="Quanto falta pagar às profissionais pelos atendimentos dos últimos 60 dias. Ticket médio = faturamento do mês ÷ número de comandas (cliente + dia)." value={money(due)} sub={`Ticket médio ${money(ticket)}`} icon={Wallet} />
        <Stat accent label="Clube (recorrente)" help="Quanto as assinaturas ativas do Clube rendem por mês." value={money(clubMRR)} sub={`${activeSubs.length} assinantes ativos`} icon={Crown} />
      </div>

      {showAtt && <Attention rows={att} onClose={() => setShowAtt(false)} />}

      <div className="grid-2">
        <Card title="Faturamento · últimos 14 dias">
          <BarChart data={chart} />
        </Card>
        <Card title="Próximos de hoje" action={<Link to="/painel/agenda" className="link">Agenda</Link>} pad={false}>
          {upcoming.length ? (
            <div className="list">{upcoming.slice(0, 6).map((a) => <ApptRow key={a.id} a={a} onClick={() => setSel(a)} />)}</div>
          ) : <Empty icon={CalendarDays} title="Agenda livre" text="Nenhum atendimento pendente hoje. Que tal encaixar alguém?" action={<Link to="/painel/agenda" className="btn btn-primary btn-sm">Abrir agenda</Link>} />}
        </Card>
      </div>

      {(() => {
        const m = {}
        monthSales.forEach((s) => s.items.filter((i) => i.type === 'service').forEach((i) => { m[i.name] = (m[i.name] || 0) + Number(i.price) * Number(i.qty || 1) }))
        const rows = Object.entries(m).sort((x, y) => y[1] - x[1]); const top = rows.slice(0, 5).map(([label, value]) => ({ label, value }))
        const rest = rows.slice(5).reduce((x, r) => x + r[1], 0); if (rest > 0) top.push({ label: 'Outros', value: rest })
        return <Card title="Faturamento por procedimento · mês" className="mb"><Donut data={top} fmt={money} /></Card>
      })()}
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

/** Avisos do dia (boletos, dívidas, estoque, pacotes parados), cada um com atalho para resolver */
function useAttention(data) {
  const t = today()
  const cli = (id) => data.clients.find((c) => c.id === id)
  const lim3 = addDays(t, 3), d30 = addDays(t, -30)
  const boletos = (data.expenses || []).filter((e) => e.paid === false && e.dueDate && e.dueDate <= lim3).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const devendo = data.clients.filter((c) => Number(c.credit || 0) < 0).sort((a, b) => a.credit - b.credit)
  const baixo = data.products.filter((p) => p.active && Number(p.stock) <= 3).sort((a, b) => a.stock - b.stock)
  const parados = (data.packages || []).filter((p) => p.active && p.date && p.date < d30 && (p.items || []).some((i) => Number(i.used || 0) < Number(i.qty || 0))
    && !data.appointments.some((a) => a.clientId === p.clientId && a.date >= d30 && a.status !== 'cancelado'))
  const left = (p) => (p.items || []).reduce((s, i) => s + Math.max(0, Number(i.qty || 0) - Number(i.used || 0)), 0)

  return [
    boletos.length && { k: 'bol', tone: 'bad', text: `${boletos.length} boleto(s) vencidos ou vencendo em até 3 dias · ${money(sum(boletos, (e) => e.amount))}`, to: '/painel/financeiro', go: 'Ver boletos',
      list: boletos.map((e) => ({ k: e.id, label: e.description, sub: `${fmtDate(e.dueDate)} · ${money(e.amount)}${e.dueDate < t ? ' · vencido' : ''}` })) },
    devendo.length && { k: 'dev', tone: 'warn', text: `${devendo.length} cliente(s) devendo · ${money(Math.abs(sum(devendo, (c) => c.credit)))}`, to: '/painel/relatorios', go: 'Receber',
      list: devendo.map((c) => ({ k: c.id, label: c.name, sub: `deve ${money(Math.abs(c.credit))}`, c })) },
    baixo.length && { k: 'est', tone: 'warn', text: `${baixo.length} produto(s) com estoque baixo (3 ou menos)`, to: '/painel/catalogo?tab=products&f=__low', go: 'Dar entrada',
      list: baixo.map((p) => ({ k: p.id, label: p.name, sub: `estoque ${p.stock}` })) },
    parados.length && { k: 'pac', tone: 'info', text: `${parados.length} pacote(s) com sessões sobrando e cliente sem vir há mais de 30 dias`, to: '/painel/clientes', go: 'Clientes',
      list: parados.map((p) => ({ k: p.id, label: cli(p.clientId)?.name || 'Cliente', sub: `${p.name} · ${left(p)} sessão(ões) restante(s)`, c: cli(p.clientId) })) },
  ].filter(Boolean)
}

function Attention({ rows, onClose }) {
  const [openK, setOpenK] = useState(null)
  const [client, setClient] = useState(null)
  return (
    <Card title="Avisos" className="mb attention" action={<button type="button" className="link" onClick={onClose}>Fechar</button>}>
      {!rows.length && <p className="muted small">Tudo em dia: nenhum boleto vencendo, dívida, estoque baixo ou pacote parado.</p>}
      {rows.map((r) => (
        <div key={r.k} className={`att-row att-${r.tone}`}>
          <div className="att-head">
            <button type="button" className="att-toggle" aria-expanded={openK === r.k} onClick={() => setOpenK(openK === r.k ? null : r.k)}>
              <AlertCircle size={16} /> <span>{r.text}</span> <ChevronDown size={15} className="att-chev" />
            </button>
            {r.to && <Link to={r.to} className="btn btn-ghost btn-sm">{r.go}</Link>}
          </div>
          {openK === r.k && (
            <div className="att-list">
              {r.list.slice(0, 12).map((x) => x.c
                ? <button key={x.k} type="button" className="att-item clickable" onClick={() => setClient(x.c)}><b>{x.label}</b><small>{x.sub}</small></button>
                : <div key={x.k} className="att-item"><b>{x.label}</b><small>{x.sub}</small></div>)}
              {r.list.length > 12 && <p className="muted small">+{r.list.length - 12}</p>}
            </div>
          )}
        </div>
      ))}
      {client && <ClientModal c={client} onClose={() => setClient(null)} />}
    </Card>
  )
}
