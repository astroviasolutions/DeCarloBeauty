import { useState } from 'react'
import { Download, FileText, Users } from 'lucide-react'
import { useStore } from '../../state/Store'
import { BarChart, Button, Card, RankRow, Segmented, Stat } from '../../components/ui'
import { commissionSummary } from '../../lib/commission'
import { OccupancyMap } from '../../components/Heatmap'
import { increaseLabel } from '../../components/ItemIncrease'
import { addDays, endOfMonth, fmtDate, fmtDateLong, money, parseDate, PAYMENTS, PERIODS, saleRevenue, startOfMonth, sum, today, payLabel, waLink, onlyDigits, parseMoney } from '../../lib/utils'
import { clinicReportPDF, staffStatementPDF } from '../../lib/pdf'
import { useSalesRange } from '../../lib/salesRange'
import { financeOf, payParts } from '../../lib/cardFees'
import { msg as fillMsg } from '../../lib/messages'

export const PERIOD_OPTS = [
  { value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'semanaPassada', label: 'Semana passada' }, { value: 'mes', label: 'Mês' }, { value: 'mespassado', label: 'Mês passado' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Período' },
]
export function periodOf(key, custom) {
  if (key === 'custom') return { ...custom, label: `${fmtDate(custom.from)} a ${fmtDate(custom.to)}` }
  if (key === 'mespassado') { const f = startOfMonth(addDays(startOfMonth(today()), -1)); return { from: f, to: endOfMonth(f), label: 'Mês passado' } }
  return PERIODS[key]()
}

export default function Relatorios() {
  const { data, actions } = useStore()
  const [devSel, setDevSel] = useState(null)
  const [recv, setRecv] = useState('')
  const [recvPay, setRecvPay] = useState('pix')
  const [devAll, setDevAll] = useState(false) // lista de devedoras: 15 primeiras + 'mostrar todas'
  // recebimento de fiado: abate a dívida e registra a forma (entra na gaveta/conferência do Caixa, não no faturamento — já contou na venda)
  const receive = async (c, v) => {
    if (!(v > 0)) return
    const fresh = data.clients.find((x) => x.id === c.id) || c
    const { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt } = fresh
    await actions.upsert('clients', { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt, credit: Math.round((Number(fresh.credit) + v) * 100) / 100 }, `Recebido ${money(v)} (${PAYMENTS[recvPay]})`)
    await actions.upsert('recebimentos', { date: today(), clientId: id, clientName: name, amount: v, payment: recvPay }, null).catch(() => {})
    setRecv('')
  }
  const [period, setPeriod] = useState('mes')
  const [custom, setCustom] = useState({ from: startOfMonth(today()), to: today() })
  const [who, setWho] = useState('all')
  const [busy, setBusy] = useState('')
  const p = periodOf(period, custom)
  const okB = (id) => who === 'all' || id === who
  const rs = useSalesRange(data, p.from, p.to) // período antigo (antes de ~120 dias) busca no banco
  const sales = rs.sales.filter((s) => okB(s.barberId))
  const appts = data.appointments.filter((a) => a.date >= p.from && a.date <= p.to && okB(a.barberId))
  const pdf = async (kind) => {
    setBusy(kind)
    try {
      if (kind === 'clinic') await clinicReportPDF({ data: { ...data, sales: rs.sales }, from: p.from, to: p.to, barberId: who })
      else await staffStatementPDF({ data: { ...data, sales: rs.sales }, from: p.from, to: p.to, barberIds: who === 'all' ? data.barbers.filter((b) => b.active).map((b) => b.id) : [who] })
      actions.notify('PDF gerado')
    } catch (e) { actions.notify(`Não foi possível gerar o PDF: ${e.message}`, 'bad') } finally { setBusy('') }
  }
  const revenue = sum(sales, saleRevenue)
  const items = sales.flatMap((s) => s.items)
  const svcRev = sum(items.filter((i) => i.type === 'service' || i.type === 'extra'), (i) => i.price * i.qty)
  const prdRev = sum(items.filter((i) => i.type === 'product'), (i) => i.price * i.qty)
  const comm = sum(sales, (s) => s.commissionTotal)
  const fees = sum(sales, (s) => s.cardFee) // taxas da maquininha
  const past = appts.filter((a) => ['concluido', 'faltou'].includes(a.status))
  const noShow = past.length ? (appts.filter((a) => a.status === 'faltou').length / past.length) * 100 : 0

  const group = (type) => {
    const m = {}
    for (const i of items.filter((x) => x.type === type)) { m[i.name] ??= { name: i.name, qty: 0, value: 0 }; m[i.name].qty += i.qty; m[i.name].value += i.price * i.qty }
    return Object.values(m).sort((a, b) => b.value - a.value)
  }
  const topSvc = group('service'); const topPrd = group('product')
  // pagamento dividido entra em cada forma pelo seu valor (antes "pix + dinheiro" ficava de fora)
  const parts = sales.flatMap((s) => payParts(s, PAYMENTS))
  const byPay = Object.keys(PAYMENTS).map((k) => ({ k, v: sum(parts.filter((x) => x.p === k), (x) => x.v) })).sort((a, b) => b.v - a.v)
  // lucro por produto (preço − custo guardado na venda) e por procedimento (preço − material − comissão)
  const prodProfit = Object.values(items.filter((i) => i.type === 'product').reduce((m, i) => { const k = i.name; m[k] ??= { name: k, qty: 0, rev: 0, cost: 0, hasCost: true }; m[k].qty += Number(i.qty); m[k].rev += i.price * i.qty; m[k].cost += Number(i.cost || 0) * i.qty; if (!i.cost) m[k].hasCost = false; return m }, {})).sort((a, b) => (b.rev - b.cost) - (a.rev - a.cost))
  const svcProfit = Object.values(items.filter((i) => i.type === 'service').reduce((m, i) => { const k = i.name; m[k] ??= { name: k, qty: 0, rev: 0, mat: 0, comm: 0 }; m[k].qty += Number(i.qty); m[k].rev += i.price * i.qty; m[k].mat += Number(i.material || 0) * i.qty; m[k].comm += Number(i.commission || 0); return m }, {})).sort((a, b) => (b.rev - b.mat - b.comm) - (a.rev - a.mat - a.comm))
  const team = commissionSummary({ sales: rs.sales, payouts: [], barbers: data.barbers.filter((b) => okB(b.id)), from: p.from, to: p.to }).sort((a, b) => b.revenue - a.revenue)

  // série diária (até 31 barras)
  const days = []
  for (let d = p.from; d <= p.to && days.length < 31; d = addDays(d, 1)) days.push(d)
  const chart = days.map((d) => ({ label: String(parseDate(d).getDate()), value: sum(sales.filter((s) => s.date === d), saleRevenue), hint: fmtDateLong(d) }))

  // faturamento por dia da semana
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((l, i) => ({ label: l, value: sum(sales.filter((s) => parseDate(s.date).getDay() === i), saleRevenue), hint: `Total às ${l.toLowerCase()}s` }))

  const exportCsv = () => {
    const head = 'data;hora;cliente;profissional;itens;pagamento;subtotal;desconto;total;comissao;taxa_cartao\n'
    const lines = sales.map((s) => [s.date, s.time, s.clientName, data.barbers.find((b) => b.id === s.barberId)?.name, s.items.filter((i) => i.type !== 'supply').map((i) => `${i.qty}x ${i.name}${increaseLabel(i) ? ` (acréscimo ${increaseLabel(i)})` : ''}`).join(' | '), payLabel(s), s.subtotal, s.discount, s.total, s.commissionTotal, s.cardFee || 0].join(';')).join('\n')
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
      {rs.loading && <p className="notice">Buscando as vendas desse período…</p>}
      {rs.error && <p className="notice">Não foi possível buscar as vendas desse período ({rs.error}).</p>}
      <p className="muted small mb">O <b>PDF gerencial</b> é para a análise da gestão (faturamento, equipe, serviços, pagamentos, faltas e lucro). O <b>extrato</b> traz os atendimentos e comissões de cada profissional, pronto para enviar a ela.</p>
      <div className="stats">
        <Stat accent label="Faturamento" help="Soma das vendas do período (e da profissional escolhida). Ticket = faturamento ÷ número de vendas." value={money(revenue)} sub={`${sales.length} vendas · ticket ${money(sales.length ? revenue / sales.length : 0)}`} />
        <Stat label="Serviços x Produtos" help="Quanto veio de serviços (procedimentos) e quanto de venda de produtos, antes dos descontos." value={money(svcRev)} sub={`Produtos: ${money(prdRev)} (${revenue ? Math.round((prdRev / revenue) * 100) : 0}%)`} />
        <Stat label="Comissões geradas" help="Comissão das profissionais sobre as vendas do período. Margem da casa = faturamento − comissões − taxas do cartão (ainda sem as contas; o lucro final está em Lucro real)." value={money(comm)} sub={`Margem da casa: ${money(revenue - comm - fees)}${fees > 0 ? ` · taxas cartão ${money(fees)}` : ""}`} />
        <Stat label="Taxa de faltas" help="De cada 100 clientes com horário já passado, quantas não vieram (status Faltou)." value={`${noShow.toFixed(1)}%`} sub={`${appts.filter((a) => a.status === 'faltou').length} faltas no período`} />
      </div>
      <Card title="Faturamento diário"><BarChart data={chart} height={200} /></Card>
      {(() => {
        const dev = data.clients.filter((c) => Number(c.credit || 0) < 0).sort((a, b) => a.credit - b.credit)
        const csv = () => { const b = new Blob(['\ufeffcliente;telefone;deve\n' + dev.map((c) => [c.name, String(c.phone).startsWith('sem') ? '' : c.phone, String(Math.abs(c.credit)).replace('.', ',')].join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'clientes-devendo.csv'; a.click() }
        return (
          <Card title={`Clientes devendo · ${dev.length} · ${money(Math.abs(sum(dev, (c) => c.credit)))}`} className="mt" collapsible storageKey="rel-devedores" action={dev.length ? <Button size="sm" variant="ghost" icon={Download} onClick={csv}>Exportar</Button> : null}>
            {!dev.length && <p className="muted small">Nenhuma cliente devendo. Quando alguém paga só uma parte no Caixa (opção "Pagar depois (fiado)"), aparece aqui para receber depois.</p>}
            {(devAll ? dev : dev.slice(0, 15)).map((c) => {
              // vencimento do fiado: o gravado na venda; se não tiver (fiado antigo), a 1ª venda "a pagar" + prazo de Ajustes
              const firstDebt = data.sales.filter((s) => s.clientId === c.id && String(s.payment).includes('a pagar')).map((s) => s.date).sort()[0]
              const due = c.debtDue || (firstDebt ? addDays(firstDebt, financeOf(data.settings).fiado.dias) : null)
              const late = due && due < today()
              const cobrar = fillMsg(data.settings, 'debt', { nome: c.name.split(' ')[0], valor: money(Math.abs(c.credit)), vencimento: due ? fmtDate(due) : 'combinado', pix: financeOf(data.settings).fiado.pix || 'é só me chamar' })
              return <div key={c.id}>
              <button type="button" onClick={() => { setDevSel(devSel === c.id ? null : c.id); setRecv('') }} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}><RankRow label={`${c.name}${due ? ` · ${late ? 'venceu' : 'vence'} ${fmtDate(due)}` : ''}`} value={Math.abs(c.credit)} max={Math.abs(dev[0].credit)} right={money(Math.abs(c.credit))} color={late ? '#d92d20' : undefined} /></button>
              {devSel === c.id && <div style={{ padding: '8px 12px 14px', background: 'var(--v-surface2, #f6f6f6)', borderRadius: 10, margin: '4px 0 10px' }}>
                {onlyDigits(c.phone).length >= 10 && <a className="btn btn-wa btn-sm mb-sm" href={waLink(c.phone, cobrar)} target="_blank" rel="noreferrer">Cobrar no WhatsApp</a>}
                {data.sales.filter((s) => s.clientId === c.id && String(s.payment).includes('a pagar')).map((s) => <p key={s.id} className="small" style={{ margin: '4px 0' }}>{s.date.split('-').reverse().join('/')} · {s.items.map((i) => i.name).join(', ')} · total {money(s.total)} · <b>{s.payment}</b></p>)}
                <p className="small muted">Saldo devedor atual: <b>{money(Math.abs(c.credit))}</b></p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input inputMode="decimal" value={recv} onChange={(e) => setRecv(e.target.value)} placeholder="Valor recebido" style={{ maxWidth: 160 }} />
                  <select value={recvPay} onChange={(e) => setRecvPay(e.target.value)} aria-label="Forma do recebimento" style={{ maxWidth: 140 }}>{['pix', 'dinheiro', 'debito', 'credito'].map((k) => <option key={k} value={k}>{PAYMENTS[k]}</option>)}</select>
                  <Button size="sm" onClick={() => receive(c, Math.min(parseMoney(recv), Math.abs(c.credit)))}>Abater</Button>
                  <Button size="sm" variant="ghost" onClick={() => receive(c, Math.abs(c.credit))}>Recebeu tudo</Button>
                  {/* excluir a dívida: zera sem entrar dinheiro no caixa (dívida lançada errado, perdoada etc.) */}
                  <Button size="sm" variant="danger" onClick={async () => { if (!(await actions.confirm(`Excluir a dívida de ${money(Math.abs(c.credit))} de ${c.name}? O saldo fica zerado e NÃO entra dinheiro no caixa.`, 'Excluir dívida'))) return; const { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt } = c; await actions.upsert('clients', { id, name, phone, notes: `${notes ? `${notes}\n\n` : ''}Dívida de ${money(Math.abs(c.credit))} excluída em ${new Date().toLocaleDateString('pt-BR')}.`, anamnese, createdAt, birthday, lastCampaignAt, credit: 0 }, 'Dívida excluída'); setDevSel(null) }}>Excluir dívida</Button>
                  {/* excluir a cliente: só cadastro sem nenhum histórico (cadastro errado/duplicado) */}
                  <Button size="sm" variant="danger" onClick={async () => {
                    const uses = data.sales.filter((s) => s.clientId === c.id).length + data.appointments.filter((a) => a.clientId === c.id).length
                    if (uses) return actions.notify(`${c.name} tem ${uses} venda(s)/agendamento(s) no histórico: não dá para excluir a ficha. Use "Excluir dívida".`, 'bad')
                    if (!(await actions.confirm(`Excluir a ficha de ${c.name}? Não tem nenhuma venda nem agendamento. Não dá para desfazer.`, 'Excluir cliente'))) return
                    await actions.remove('clients', c.id, 'Cliente excluída'); setDevSel(null)
                  }}>Excluir cliente</Button>
                </div>
              </div>}
            </div>
            })}
            {dev.length > 15 && <button type="button" className="link show-more" onClick={() => setDevAll(!devAll)}>{devAll ? 'Mostrar menos' : `Mostrar todas (${dev.length})`}</button>}
          </Card>
        )
      })()}
      <Card title="Mapa de horários vazios" className="mt" collapsible storageKey="rel-mapa"><OccupancyMap /></Card>
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
          {sum(parts.filter((x) => x.p === 'fiado'), (x) => x.v) > 0 && <p className="muted small mt-sm">Ficou a pagar (fiado): {money(sum(parts.filter((x) => x.p === 'fiado'), (x) => x.v))}</p>}
        </Card>
      </div>
      <div className="grid-2 mt">
        <Card title="Lucro por procedimento" collapsible storageKey="rel-lucro-proc">
          <p className="muted small mb-sm">Preço cobrado − custo de material − comissão. O custo de material de cada procedimento fica no Catálogo (vale para as vendas a partir de quando foi preenchido).</p>
          {svcProfit.length ? svcProfit.slice(0, 8).map((x) => { const lucro = x.rev - x.mat - x.comm; return <RankRow key={x.name} label={`${x.name} · ${x.qty}x`} value={Math.max(0, lucro)} max={Math.max(1, svcProfit[0].rev - svcProfit[0].mat - svcProfit[0].comm)} right={`${money(lucro)}${x.mat ? ` · material ${money(x.mat)}` : ''}`} /> }) : <p className="muted small">Sem procedimentos no período.</p>}
        </Card>
        <Card title="Lucro por produto" collapsible storageKey="rel-lucro-prod">
          <p className="muted small mb-sm">Preço de venda − custo (média das compras, guardada na venda). Produto sem custo cadastrado aparece com "sem custo".</p>
          {prodProfit.length ? prodProfit.slice(0, 8).map((x) => <RankRow key={x.name} label={`${x.name} · ${x.qty}x`} value={Math.max(0, x.rev - x.cost)} max={Math.max(1, prodProfit[0].rev - prodProfit[0].cost)} right={x.hasCost ? `${money(x.rev - x.cost)} · margem ${x.rev ? Math.round(((x.rev - x.cost) / x.rev) * 100) : 0}%` : `${money(x.rev)} · sem custo`} />) : <p className="muted small">Sem vendas de produtos no período.</p>}
        </Card>
      </div>
    </div>
  )
}
