import { useState } from 'react'
import { Check, Wallet } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Avatar, Button, Card, Segmented, Stat } from '../../components/ui'
import { commissionSummary } from '../../lib/commission'
import { fmtDate, money, PERIODS, sum, today, waLink } from '../../lib/utils'
import { msg as fillMsg } from '../../lib/messages'

export default function Comissoes() {
  const { data, actions } = useStore()
  const [period, setPeriod] = useState('semana')
  const [custom, setCustom] = useState({ from: PERIODS.semana().from, to: today() })
  const p = period === 'custom' ? { ...custom, label: `${fmtDate(custom.from)} a ${fmtDate(custom.to)}` } : PERIODS[period]()
  const rows = commissionSummary({ sales: data.sales, payouts: data.payouts, barbers: data.barbers.filter((b) => b.active), from: p.from, to: p.to })

  const pay = (r) => actions.upsert('payouts', { barberId: r.barber.id, from: p.from, to: p.to, amount: r.due, paidAt: today(), note: `Acerto ${p.label.toLowerCase()}` }, `Pagamento de ${money(r.due)} registrado`)
  const msg = (r) => fillMsg(data.settings, 'payout', { nome: r.barber.name.split(' ')[0], periodo: `${p.label.toLowerCase()} (${fmtDate(p.from)} a ${fmtDate(p.to)})`, detalhes: `✨ Serviços: ${r.svcCount} → ${money(r.svcComm)}\n🧴 Produtos: ${r.prdCount} → ${money(r.prdComm)}\n✅ Já pago: ${money(r.paid)}\n➡️ A receber: ${money(r.due)}`, valor: money(r.total) })

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Calculado automaticamente a cada venda</p><h1 className="page-title">Comissões</h1></div>
        <div className="head-actions">
          <Segmented value={period} onChange={setPeriod} options={[{ value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'custom', label: 'Período' }]} />
          {period === 'custom' && (
            <div className="range">
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </div>
          )}
        </div>
      </div>

      <div className="stats">
        <Stat accent label="Total de comissões" value={money(sum(rows, (r) => r.total))} sub={p.label} icon={Wallet} />
        <Stat label="Já pago" value={money(sum(rows, (r) => r.paid))} />
        <Stat label="A pagar" value={money(sum(rows, (r) => r.due))} />
        <Stat label="Faturamento gerado" value={money(sum(rows, (r) => r.revenue))} />
      </div>

      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Profissional</th><th className="r">Serviços</th><th className="r">Com. serviços</th><th className="r">Produtos</th><th className="r">Com. produtos</th><th className="r">Total</th><th className="r">Pago</th><th className="r">A pagar</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.barber.id}>
                  <td><div className="who"><Avatar name={r.barber.name} color={r.barber.color} photo={r.barber?.photo} size={30} /><div><b>{r.barber.name}</b><small>{r.barber.serviceRate != null ? `${r.barber.serviceRate}% serv.` : 'padrão'} · {r.barber.productRate != null ? `${r.barber.productRate}% prod.` : 'padrão'}</small></div></div></td>
                  <td className="r">{r.svcCount}<small>{money(r.svcValue)}</small></td>
                  <td className="r">{money(r.svcComm)}</td>
                  <td className="r">{r.prdCount}<small>{money(r.prdValue)}</small></td>
                  <td className="r">{money(r.prdComm)}</td>
                  <td className="r"><b>{money(r.total)}</b></td>
                  <td className="r muted">{money(r.paid)}</td>
                  <td className="r"><b className={r.due > 0 ? 'due' : ''}>{money(r.due)}</b></td>
                  <td className="r nowrap">
                    <a className="btn btn-ghost btn-sm" href={waLink(r.barber.phone, msg(r))} target="_blank" rel="noreferrer">Enviar</a>
                    <Button size="sm" icon={Check} disabled={r.due <= 0} onClick={() => pay(r)}>Pagar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="muted small mt">Regra: percentual próprio da profissional (se definido em Equipe) ou o percentual de cada serviço/produto (Catálogo). Descontos reduzem a comissão proporcionalmente.</p>
    </div>
  )
}
