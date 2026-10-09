import { useState } from 'react'
import { Check, HandCoins, Search, Trash2, Wallet } from 'lucide-react'
import { norm } from '../../components/CatalogFilter'
import { increaseLabel } from '../../components/ItemIncrease'
import { cls } from '../../lib/utils'
import { useStore } from '../../state/Store'
import { Avatar, Button, Card, Field, Modal, Segmented, Stat } from '../../components/ui'
import { commissionSummary } from '../../lib/commission'
import { fmtDate, money, parseMoney, PERIODS, sum, today, waLink } from '../../lib/utils'
import { msg as fillMsg } from '../../lib/messages'

/** Adiantamento: pagamento de comissão antes do acerto (vale). Entra no "Pago" do período que contém a data. */
const isAdvance = (x) => /^adiantamento/i.test(x.note || '')
const advancesOf = (payouts, barberId, from, to) => payouts.filter((x) => x.barberId === barberId && isAdvance(x) && x.from >= from && x.to <= to)

function AdvanceModal({ barberId, onClose }) {
  const { data, actions } = useStore()
  const team = data.barbers.filter((b) => b.active)
  const [f, setF] = useState({ barberId: barberId || team[0]?.id, amount: '', date: today(), note: '' })
  const amount = parseMoney(f.amount)
  const save = async () => {
    if (!(amount > 0) || !f.barberId) return actions.notify('Informe a profissional e o valor', 'bad')
    await actions.upsert('payouts', { barberId: f.barberId, from: f.date, to: f.date, amount, paidAt: f.date, note: `Adiantamento${f.note.trim() ? `: ${f.note.trim()}` : ''}` }, `Adiantamento de ${money(amount)} registrado`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Adiantamento de comissão" footer={<Button block icon={Check} disabled={!(amount > 0)} onClick={save}>Registrar {amount > 0 ? money(amount) : ''}</Button>}>
      <div className="form-grid">
        <Field label="Profissional" required className="span-2"><select value={f.barberId} onChange={(e) => setF({ ...f, barberId: e.target.value })}>{team.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Valor (R$)" required><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Data"><input type="date" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Observação" className="span-2"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex.: vale, Pix adiantado" /></Field>
      </div>
      <p className="muted small mt-sm">O adiantamento é descontado do "A pagar" da profissional no período que inclui esta data.</p>
    </Modal>
  )
}

/** Extrato da profissional no período: cada item vendido, base, % e comissão + pagamentos já feitos */
function CommissionDetail({ r, p, onClose }) {
  const { data, actions } = useStore()
  const [q, setQ] = useState('')
  const mine = data.sales.filter((s) => s.barberId === r.barber.id && s.date >= p.from && s.date <= p.to)
  const discTotal = sum(mine, (s) => Number(s.discount || 0))
  const lines = mine
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .flatMap((s) => [
      ...(s.items || []).filter((i) => ['service', 'product', 'extra'].includes(i.type)).map((i, k) => ({ key: `${s.id}-${k}`, date: s.date, time: s.time, client: s.clientName, name: i.name, qty: i.qty, base: i.packageId ? Number(i.unit || 0) * Number(i.qty) : Number(i.price) * Number(i.qty), rate: i.commissionRate, commission: Number(i.commission || 0), tag: [i.packageId ? 'pacote' : s.payment === 'permuta' ? 'permuta' : i.type === 'product' ? 'produto' : '', increaseLabel(i) && `acréscimo ${increaseLabel(i)}`].filter(Boolean).join(' · ') })),
      // desconto da venda (a comissão dos itens acima já sai com ele aplicado)
      ...(Number(s.discount) > 0 && s.payment !== 'permuta' ? [{ key: `${s.id}-d`, date: s.date, time: s.time, client: s.clientName, name: s.benefit?.label && Number(s.benefit.amount) >= Number(s.discount) ? s.benefit.label : 'Desconto', qty: 1, base: -Number(s.discount), discount: true, tag: 'desconto na venda' }] : []),
    ])
  const [kind, setKind] = useState('') // filtro: serviço, produto, pacote, permuta, desconto
  const [allLines, setAllLines] = useState(false) // extrato longo: 50 primeiras linhas + 'mostrar todas'
  const kindOf = (l) => (l.discount ? 'desconto' : l.tag.includes('pacote') ? 'pacote' : l.tag.includes('permuta') ? 'permuta' : l.tag.includes('produto') ? 'produto' : 'servico')
  const kinds = [['servico', 'Serviços'], ['produto', 'Produtos'], ['pacote', 'Pacotes'], ['permuta', 'Permuta'], ['desconto', 'Descontos']].map(([k, l]) => [k, l, lines.filter((x) => kindOf(x) === k).length]).filter((x) => x[2])
  const shown = lines.filter((l) => (!q.trim() || norm(`${l.client} ${l.name} ${fmtDate(l.date)}`).includes(norm(q))) && (!kind || kindOf(l) === kind))
  const paid = data.payouts.filter((x) => x.barberId === r.barber.id && x.from >= p.from && x.to <= p.to)
  return (
    <Modal open onClose={onClose} wide title={`Comissões · ${r.barber.name}`}>
      <div className="mini-kpis row">
        <div><b>{money(r.total)}</b> comissão</div><div><b>{money(r.paid)}</b> pago</div><div><b>{money(r.due)}</b> a pagar</div><div><b>{money(discTotal)}</b> descontos</div>
      </div>
      <p className="muted small">{p.label} · {fmtDate(p.from)} a {fmtDate(p.to)}</p>
      {lines.length > 0 && <div className="search mb-sm"><Search size={16} /><input placeholder="Buscar cliente, serviço ou data" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {kinds.length > 1 && <div className="cat-filter-chips mb-sm">
        <button type="button" className={cls('pill', !kind && 'on')} onClick={() => setKind('')}>Todos · {lines.length}</button>
        {kinds.map(([k, l, n]) => <button key={k} type="button" className={cls('pill', kind === k && 'on')} onClick={() => setKind(kind === k ? '' : k)}>{l} · {n}</button>)}
      </div>}
      {(q.trim() || kind) && <p className="muted small mb-sm">{shown.length} itens · comissão {money(sum(shown.filter((l) => !l.discount), (l) => l.commission))}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Data</th><th>Cliente</th><th>Item</th><th className="r">Base</th><th className="r">%</th><th className="r">Comissão</th></tr></thead>
          <tbody>
            {(allLines ? shown : shown.slice(0, 50)).map((l) => (
              <tr key={l.key}>
                <td className="nowrap">{fmtDate(l.date)}<small>{l.time}</small></td>
                <td>{l.client}</td>
                <td>{Number(l.qty) > 1 ? `${l.qty}x ` : ''}{l.name}{l.tag && <small>{l.tag}</small>}</td>
                <td className="r">{l.discount ? `-${money(-l.base)}` : money(l.base)}</td>
                <td className="r">{l.discount ? '' : `${Number(l.rate || 0)}%`}</td>
                <td className="r">{l.discount ? <small>já aplicado</small> : <b>{money(l.commission)}</b>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 50 && <button type="button" className="link show-more" onClick={() => setAllLines(!allLines)}>{allLines ? 'Mostrar menos' : `Mostrar todas (${shown.length} linhas)`}</button>}
        {!lines.length && <p className="muted center">Nenhum atendimento no período.</p>}
      </div>
      {paid.length > 0 && <>
        <h4 className="sub-title">Pagamentos registrados</h4>
        {paid.map((x) => <p key={x.id} className="small">{fmtDate(x.paidAt)} · <b>{money(x.amount)}</b> · {x.note}{isAdvance(x) && <> · <button type="button" className="link" onClick={async () => (await actions.confirm(`Excluir o adiantamento de ${money(x.amount)}?`, 'Excluir')) && actions.remove('payouts', x.id, 'Adiantamento excluído')}><Trash2 size={12} /> excluir</button></>}</p>)}
      </>}
    </Modal>
  )
}

export default function Comissoes() {
  const { data, actions } = useStore()
  const [period, setPeriod] = useState('semana')
  const [custom, setCustom] = useState({ from: PERIODS.semana().from, to: today() })
  const p = period === 'custom' ? { ...custom, label: `${fmtDate(custom.from)} a ${fmtDate(custom.to)}` } : PERIODS[period]()
  const [sel, setSel] = useState(null)
  const [adv, setAdv] = useState(null) // adiantamento: null | { barberId }
  const rows = commissionSummary({ sales: data.sales, payouts: data.payouts, barbers: data.barbers.filter((b) => b.active), from: p.from, to: p.to })
  const discOf = (r) => sum(data.sales.filter((s) => s.barberId === r.barber.id && s.date >= p.from && s.date <= p.to && s.payment !== 'permuta'), (s) => Number(s.discount || 0))
  const advOf = (r) => sum(advancesOf(data.payouts, r.barber.id, p.from, p.to), (x) => x.amount)

  const pay = (r) => actions.upsert('payouts', { barberId: r.barber.id, from: p.from, to: p.to, amount: r.due, paidAt: today(), note: `Acerto ${p.label.toLowerCase()}` }, `Pagamento de ${money(r.due)} registrado`)
  const msg = (r) => fillMsg(data.settings, 'payout', { nome: r.barber.name.split(' ')[0], periodo: `${p.label.toLowerCase()} (${fmtDate(p.from)} a ${fmtDate(p.to)})`, detalhes: `✨ Serviços: ${r.svcCount} → ${money(r.svcComm)}\n🧴 Produtos: ${r.prdCount} → ${money(r.prdComm)}${discOf(r) > 0 ? `\n🏷️ Descontos dados: ${money(discOf(r))}` : ''}${advOf(r) > 0 ? `\n💸 Adiantamentos: ${money(advOf(r))}` : ''}\n✅ Já pago: ${money(r.paid)}\n➡️ A receber: ${money(r.due)}`, valor: money(r.total) })

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Calculado automaticamente a cada venda</p><h1 className="page-title">Comissões</h1></div>
        <div className="head-actions">
          <Button variant="ghost" icon={HandCoins} onClick={() => setAdv({})}>Adiantamento</Button>
          <Segmented value={period} onChange={setPeriod} options={[{ value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'semanaPassada', label: 'Semana passada' }, { value: 'mes', label: 'Mês' }, { value: 'mesPassado', label: 'Mês passado' }, { value: 'custom', label: 'Período' }]} />
          {period === 'custom' && (
            <div className="range">
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </div>
          )}
        </div>
      </div>

      <div className="stats">
        <Stat accent label="Total de comissões" help="Comissão de todas as profissionais sobre as vendas do período escolhido." value={money(sum(rows, (r) => r.total))} sub={p.label} icon={Wallet} />
        <Stat label="Já pago" help="Pagamentos e adiantamentos (vales) já registrados neste período." value={money(sum(rows, (r) => r.paid))} />
        <Stat label="A pagar" help="Comissão − já pago. É o valor que o botão Pagar registra." value={money(sum(rows, (r) => r.due))} />
        <Stat label="Faturamento gerado" help="Quanto as vendas das profissionais renderam no período (base do cálculo da comissão)." value={money(sum(rows, (r) => r.revenue))} />
      </div>

      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Profissional</th><th className="r">Serviços</th><th className="r">Produtos</th><th className="r">Comissão</th><th className="r">Pago</th><th className="r">A pagar</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.barber.id} className="clickable" onClick={(e) => !e.target.closest('a,button') && setSel(r)}>
                  <td><div className="who"><Avatar name={r.barber.name} color={r.barber.color} photo={r.barber?.photo} size={30} /><div><b>{r.barber.name}</b><small>{r.barber.serviceRate != null ? `${r.barber.serviceRate}% serv.` : 'padrão'} · {r.barber.productRate != null ? `${r.barber.productRate}% prod.` : 'padrão'}</small></div></div></td>
                  <td className="r">{r.svcCount} · {money(r.svcValue)}<small>comissão {money(r.svcComm)}</small></td>
                  <td className="r">{r.prdCount} · {money(r.prdValue)}<small>comissão {money(r.prdComm)}</small></td>
                  <td className="r"><b>{money(r.total)}</b></td>
                  <td className="r muted">{money(r.paid)}{advOf(r) > 0 && <small>adiant. {money(advOf(r))}</small>}</td>
                  <td className="r"><b className={r.due > 0 ? 'due' : ''}>{money(r.due)}</b>{r.paid > r.total + 0.009 && <small>adiantado {money(r.paid - r.total)} a mais</small>}</td>
                  <td className="r nowrap">
                    <Button size="sm" variant="ghost" icon={HandCoins} onClick={() => setAdv({ barberId: r.barber.id })} aria-label={`Adiantamento para ${r.barber.name}`} />

                    <a className="btn btn-ghost btn-sm" href={waLink(r.barber.phone, msg(r))} target="_blank" rel="noreferrer">Enviar</a>
                    <Button size="sm" icon={Check} disabled={r.due <= 0} onClick={() => pay(r)}>Pagar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adv && <AdvanceModal barberId={adv.barberId} onClose={() => setAdv(null)} />}
      {sel && <CommissionDetail r={rows.find((x) => x.barber.id === sel.barber.id) || sel} p={p} onClose={() => setSel(null)} />}
      <p className="muted small mt">Toque na profissional para ver o extrato item a item. Regra: percentual próprio da profissional (se definido em Equipe) ou o percentual de cada serviço/produto (Catálogo). Descontos reduzem a comissão proporcionalmente.</p>
    </div>
  )
}
