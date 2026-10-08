import { useState } from 'react'
import { Download, FileText, Users } from 'lucide-react'
import { useStore } from '../../state/Store'
import { BarChart, Button, Card, RankRow, Segmented, Stat } from '../../components/ui'
import { commissionSummary } from '../../lib/commission'
import { OccupancyMap } from '../../components/Heatmap'
import { addDays, endOfMonth, fmtDate, fmtDateLong, money, parseDate, PAYMENTS, PERIODS, saleRevenue, startOfMonth, sum, today } from '../../lib/utils'
import { clinicReportPDF, staffStatementPDF } from '../../lib/pdf'

export const PERIOD_OPTS = [
  { value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'mespassado', label: 'Mês passado' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Período' },
]
export function periodOf(key, custom) {
  if (key === 'custom') return { ...custom, label: `${fmtDate(custom.from)} a ${fmtDate(custom.to)}` }
  if (key === 'mespassado') { const f = startOfMonth(addDays(startOfMonth(today()), -1)); return { from: f, to: endOfMonth(f), label: 'Mês passado' } }
  return PERIODS[key]()
}

export default function Relatorios() {
  const { data, actions } = useStore()
  const [period, setPeriod] = useState('mes')
  const [custom, setCustom] = useState({ from: startOfMonth(today()), to: today() })
  const [who, setWho] = useState('all')
  const [busy, setBusy] = useState('')
  const p = periodOf(period, custom)
  const okB = (id) => who === 'all' || id === who
  const sales = data.sales.filter((s) => s.date >= p.from && s.date <= p.to && okB(s.barberId))
  const appts = data.appointments.filter((a) => a.date >= p.from && a.date <= p.to && okB(a.barberId))
  const pdf = async (kind) => {
    setBusy(kind)
    try {
      if (kind === 'clinic') await clinicReportPDF({ data, from: p.from, to: p.to, barberId: who })
      else await staffStatementPDF({ data, from: p.from, to: p.to, barberIds: who === 'all' ? data.barbers.filter((b) => b.active).map((b) => b.id) : [who] })
      actions.notify('PDF gerado')
    } catch (e) { actions.notify(`Não foi possível gerar o PDF: ${e.message}`, 'bad') } finally { setBusy('') }
  }
  const revenue = sum(sales, saleRevenue)
  const items = sales.flatMap((s) => s.items)
  const svcRev = sum(items.filter((i) => i.type === 'service' || i.type === 'extra'), (i) => i.price * i.qty)
  const prdRev = sum(items.filter((i) => i.type === 'product'), (i) => i.price * i.qty)
  const comm = sum(sales, (s) => s.commissionTotal)
  const past = appts.filter((a) => ['concluido', 'faltou'].includes(a.status))
  const noShow = past.length ? (appts.filter((a) => a.status === 'faltou').length / past.length) * 100 : 0

  const group = (type) => {
    const m = {}
    for (const i of items.filter((x) => x.type === type)) { m[i.name] ??= { name: i.name, qty: 0, value: 0 }; m[i.name].qty += i.qty; m[i.name].value += i.price * i.qty }
    return Object.values(m).sort((a, b) => b.value - a.value)
  }
  const topSvc = group('service'); const topPrd = group('product')
  const byPay = Object.keys(PAYMENTS).map((k) => ({ k, v: sum(sales.filter((s) => s.payment === k), (s) => s.total) })).sort((a, b) => b.v - a.v)
  const team = commissionSummary({ sales: data.sales, payouts: [], barbers: data.barbers.filter((b) => okB(b.id)), from: p.from, to: p.to }).sort((a, b) => b.revenue - a.revenue)

  // série diária (até 31 barras)
  const days = []
  for (let d = p.from; d <= p.to && days.length < 31; d = addDays(d, 1)) days.push(d)
  const chart = days.map((d) => ({ label: String(parseDate(d).getDate()), value: sum(sales.filter((s) => s.date === d), saleRevenue), hint: fmtDateLong(d) }))

  // faturamento por dia da semana
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((l, i) => ({ label: l, value: sum(sales.filter((s) => parseDate(s.date).getDay() === i), saleRevenue), hint: `Total às ${l.toLowerCase()}s` }))

  const exportCsv = () => {
    const head = 'data;hora;cliente;profissional;itens;pagamento;subtotal;desconto;total;comissao\n'
    const lines = sales.map((s) => [s.date, s.time, s.clientName, data.barbers.find((b) => b.id === s.barberId)?.name, s.items.map((i) => `${i.qty}x ${i.name}`).join(' | '), PAYMENTS[s.payment], s.subtotal, s.discount, s.total, s.commissionTotal].join(';')).join('\n')
    const blob = new Blob(['﻿' + head + lines], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vendas_${p.from}_${p.to}.csv`; a.click()
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">{fmtDate(p.from)} a {fmtDate(p.to)}</p><h1 className="page-title">Relatórios</h1></div>
        <div className="head-actions">
          <Button icon={FileText} disabled={!!busy} onClick={() => pdf('clinic')}>{busy === 'clinic' ? 'Gerando…' : 'PDF gerencial'}</Button>
          <Button variant="ghost" icon={Users} disabled={!!busy} onClick={() => pdf('staff')}>{busy === 'staff' ? 'Gerando…' : who === 'all' ? 'Extratos da equipe' : 'Extrato da profissional'}</Button>
          <Button variant="ghost" icon={Download} onClick={exportCsv}>CSV</Button>
        </div>
      </div>
      <div className="agenda-bar">
        <Segmented value={period} onChange={setPeriod} options={PERIOD_OPTS} />
        {period === 'custom' && (
          <div className="range">
            <input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} aria-label="De" />
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} aria-label="Até" />
          </div>
        )}
        <select className="agenda-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Profissional">
          <option value="all">Todas as profissionais</option>
          {data.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <p className="muted small mb">O <b>PDF gerencial</b> é para a análise da gestão (faturamento, equipe, serviços, pagamentos, faltas e lucro). O <b>extrato</b> traz os atendimentos e comissões de cada profissional, pronto para enviar a ela.</p>
      <div className="stats">
        <Stat accent label="Faturamento" value={money(revenue)} sub={`${sales.length} vendas · ticket ${money(sales.length ? revenue / sales.length : 0)}`} />
        <Stat label="Serviços x Produtos" value={money(svcRev)} sub={`Produtos: ${money(prdRev)} (${revenue ? Math.round((prdRev / revenue) * 100) : 0}%)`} />
        <Stat label="Comissões geradas" value={money(comm)} sub={`Margem da casa: ${money(revenue - comm)}`} />
        <Stat label="Taxa de faltas" value={`${noShow.toFixed(1)}%`} sub={`${appts.filter((a) => a.status === 'faltou').length} faltas no período`} />
      </div>
      <Card title="Faturamento diário"><BarChart data={chart} height={200} /></Card>
      <Card title="Mapa de horários vazios" className="mt"><OccupancyMap /></Card>
      <div className="grid-2 mt">
        <Card title="Desempenho da equipe">
          {team.map((r) => <RankRow key={r.barber.id} label={r.barber.name} value={r.revenue} max={team[0]?.revenue} right={`${money(r.revenue)} · com. ${money(r.total)}`} color={r.barber.color} />)}
        </Card>
        <Card title="Faturamento por dia da semana"><BarChart data={wd} height={170} /></Card>
      </div>
      <div className="grid-3 mt">
        <Card title="Serviços mais vendidos">
          {topSvc.slice(0, 6).map((x) => <RankRow key={x.name} label={`${x.name} · ${x.qty}x`} value={x.value} max={topSvc[0]?.value} right={money(x.value)} />)}
        </Card>
        <Card title="Produtos mais vendidos">
          {topPrd.length ? topPrd.slice(0, 6).map((x) => <RankRow key={x.name} label={`${x.name} · ${x.qty}x`} value={x.value} max={topPrd[0]?.value} right={money(x.value)} />) : <p className="muted">Sem vendas de produtos.</p>}
        </Card>
        <Card title="Formas de pagamento">
          {byPay.map((x) => <RankRow key={x.k} label={PAYMENTS[x.k]} value={x.v} max={byPay[0]?.v} right={`${money(x.v)} · ${revenue ? Math.round((x.v / revenue) * 100) : 0}%`} />)}
        </Card>
      </div>
    </div>
  )
}
