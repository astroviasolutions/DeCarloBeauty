import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useStore } from '../../state/Store'
import { BarChart, Button, Card, Field, Modal, Segmented, Stat } from '../../components/ui'
import CatalogFilter, { norm } from '../../components/CatalogFilter'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cls, endOfMonth, MONTHS, money, round2, saleRevenue, sum, today } from '../../lib/utils'
import { loadedFrom, useSalesRange } from '../../lib/salesRange'
import { financeOf, receivables } from '../../lib/cardFees'
const fmtD = (d) => String(d).slice(0, 10).split('-').reverse().join('/')

const CATS = ['Aluguel', 'Energia', 'Água', 'Internet', 'Produtos', 'Marketing', 'Limpeza', 'Manutenção', 'Impostos', 'Outros']
const monthLabel = (m) => `${MONTHS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`
const addMonths = (d, n) => { const [y, mo, day] = d.split('-').map(Number); const last = new Date(y, mo - 1 + n + 1, 0).getDate(); const x = new Date(y, mo - 1 + n, Math.min(day, last)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const shift = (m, n) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

const monthsIn = (from, to) => { const out = []; for (let x = from.slice(0, 7); x <= to.slice(0, 7); x = shift(x, 1)) out.push(x); return out }

export function monthFinance(data, m) { return periodFinance(data, data.sales, `${m}-01`, endOfMonth(`${m}-01`)) }

/** Lucro de qualquer período. Despesas: mês inteiro = pela competência (mês); período quebrado = pelo vencimento */
export function periodFinance(data, allSales, from, to) {
  const ms = monthsIn(from, to)
  const whole = from.slice(8) === '01' && to === endOfMonth(to)
  const m = ms.length === 1 ? ms[0] : null
  const sales = allSales.filter((s) => s.date >= from && s.date <= to)
  const services = round2(sum(sales.flatMap((s) => s.items).filter((i) => i.type === 'service' || i.type === 'extra'), (i) => i.price * i.qty))
  const products = round2(sum(sales.flatMap((s) => s.items).filter((i) => i.type === 'product'), (i) => i.price * i.qty))
  const discounts = round2(sum(sales, (s) => s.discount))
  const salesTotal = round2(sum(sales, saleRevenue))
  const club = round2(sum(data.subscriptions.flatMap((x) => (x.paidMonths || []).filter((pm) => ms.includes(pm)).map(() => x)), (x) => data.plans.find((p) => p.id === x.planId)?.price))
  const revenue = round2(salesTotal + club)
  const commissions = round2(sum(sales, (s) => s.commissionTotal))
  const expenses = data.expenses.filter((e) => (whole || !e.dueDate ? ms.includes(e.month) : e.dueDate >= from && e.dueDate <= to))
  // imposto automático (Ajustes → Financeiro): % sobre o faturamento; aí as despesas "Impostos" não somam de novo
  const imp = financeOf(data.settings).imposto
  const tax = imp.on ? round2(revenue * imp.rate / 100) : 0
  const taxExpenses = imp.on ? round2(sum(expenses.filter((e) => e.category === 'Impostos'), (e) => e.amount)) : 0
  const expTotal = round2(sum(expenses, (e) => e.amount) - taxExpenses)
  const cardFees = round2(sum(sales, (s) => s.cardFee)) // taxa da maquininha guardada em cada venda no cartão
  const profit = round2(revenue - commissions - expTotal - cardFees - tax)
  return { m, services, products, discounts, salesTotal, club, revenue, commissions, expenses, expTotal, cardFees, tax, taxExpenses, taxRate: imp.on ? imp.rate : 0, profit, margin: revenue ? profit / revenue : 0 }
}

export default function Financeiro() {
  const { data, actions } = useStore()
  const cur = today().slice(0, 7)
  const months = Array.from({ length: 4 }, (_, i) => shift(cur, i - 3))
  const [m, setM] = useState(cur)
  // período: um mês (navega para qualquer mês), últimos 3 meses, ano, ou datas livres
  const [mode, setMode] = useState('mes')
  const [custom, setCustom] = useState({ from: `${cur}-01`, to: today() })
  const per = mode === 'mes' ? { from: `${m}-01`, to: endOfMonth(`${m}-01`), label: monthLabel(m) }
    : mode === '3m' ? { from: `${shift(cur, -2)}-01`, to: endOfMonth(`${cur}-01`), label: `${monthLabel(shift(cur, -2))} a ${monthLabel(cur)}` }
      : mode === 'ano' ? { from: `${cur.slice(0, 4)}-01-01`, to: endOfMonth(`${cur}-01`), label: `ano de ${cur.slice(0, 4)} (até ${monthLabel(cur)})` }
        : { ...custom, label: `${fmtD(custom.from)} a ${fmtD(custom.to)}` }
  const okPer = per.from && per.to && per.from <= per.to
  const rs = useSalesRange(data, okPer ? per.from : today(), okPer ? per.to : today())
  const [f, setF] = useState({ category: 'Aluguel', description: '', amount: '', paidWith: '', dueDate: '', paid: true })
  const fin = useMemo(() => periodFinance(data, rs.sales, okPer ? per.from : today(), okPer ? per.to : today()), [data, rs.sales, per.from, per.to, okPer])
  const [eq, setEq] = useState(''), [ecat, setEcat] = useState(''), [eshow, setEshow] = useState(false) // busca/filtro das despesas
  const [allExp, setAllExp] = useState(false) // lista de despesas: 25 primeiras + 'mostrar todas'
  const shown = fin.expenses.filter((e) => (!eq.trim() || norm(`${e.description} ${e.category} ${e.paidWith || ''} ${e.amount}`).includes(norm(eq)))
    && (!ecat || (ecat === '__pago' ? e.paid !== false : ecat === '__apagar' ? e.paid === false : e.category === ecat)))
  // gráfico usa as vendas já carregadas (~120 dias): mês que começa antes disso ficaria incompleto, então sai
  const trend = months.filter((x) => `${x}-01` >= loadedFrom()).map((x) => { const r = monthFinance(data, x); return { label: monthLabel(x), value: Math.max(0, r.profit), hint: `Lucro ${monthLabel(x)}: ${money(r.profit)}` } })

  const byCat = [...[...new Set([...CATS, ...fin.expenses.map((e) => e.category)])].filter((c) => !(fin.taxRate && c === 'Impostos')).map((c) => ({ c, v: sum(fin.expenses.filter((e) => e.category === c), (e) => e.amount) })), { c: 'Taxas do cartão', v: fin.cardFees }, { c: `Imposto automático (${String(fin.taxRate).replace('.', ',')}%)`, v: fin.tax }].filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
  const catTotal = fin.expTotal + fin.cardFees + fin.tax

  // contas fixas (Ajustes → Financeiro): lança as do mês atual uma vez só (o mês fica marcado, apagar não faz voltar)
  const recRan = useRef(false)
  useEffect(() => {
    if (recRan.current || !data?.settings) return
    const raw = data.settings.privacy?.finance || {}
    const due = (raw.recurring || []).filter((r) => r.active !== false && Number(String(r.amount).replace(',', '.')) > 0 && r.description?.trim() && !(r.months || []).includes(cur))
    if (!due.length) return
    recRan.current = true
    ;(async () => {
      let n = 0
      for (const r of due) {
        const desc = r.description.trim()
        // se ela já lançou à mão neste mês, não duplica
        if (!data.expenses.some((e) => e.month === cur && norm(e.description) === norm(desc))) {
          const last = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5)), 0).getDate()
          const d = `${cur}-${String(Math.min(last, Math.max(1, Number(r.day) || 1))).padStart(2, '0')}`
          await actions.upsert('expenses', { month: cur, category: r.category || 'Outros', description: desc, amount: Number(String(r.amount).replace(',', '.')), paidWith: r.paidWith || '', dueDate: d, paid: false, paidAt: null }, null)
          n++
        }
      }
      const recurring = (raw.recurring || []).map((r) => (due.some((x) => x.id === r.id) ? { ...r, months: [...(r.months || []), cur] } : r))
      await actions.saveSettings({ ...data.settings, privacy: { ...(data.settings.privacy || {}), finance: { ...raw, recurring } } })
      if (n) actions.notify(`${n} conta(s) fixa(s) de ${monthLabel(cur)} lançada(s) como a pagar`)
    })()
  }, [data, cur, actions])
  // parcelado: lança o valor de UMA parcela; cria da parcela "de" até a última, uma por mês
  const pStart = Math.max(1, Number(f.pStart) || 1), pTotal = Math.max(pStart, Number(f.pTotal) || 1)
  const parcelas = !f.paid && pTotal > 1 ? pTotal - pStart + 1 : 1
  // cada parcela pode ter vencimento e valor próprios (padrão: mês a mês, mesmo valor)
  const sched = parcelas > 1 && f.dueDate ? Array.from({ length: parcelas }, (_, i) => ({ n: pStart + i, due: f.sched?.[i]?.due || addMonths(f.dueDate, i), amount: f.sched?.[i]?.amount ?? '' })) : []
  const setSched = (i, k, v) => setF({ ...f, sched: { ...(f.sched || {}), [i]: { ...(f.sched?.[i] || {}), [k]: v } } })
  const num = (v) => { const s = String(v ?? '').trim(); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0 } // aceita 1.200,50 e 350.5
  const [editExp, setEditExp] = useState(null) // despesa/boleto em edição
  const [last, setLast] = useState(null) // resumo do último lançamento (não deixa a parcela "sumir" em outro mês)
  const add = async () => {
    const amount = num(f.amount)
    if (!amount) return actions.notify('Informe o valor', 'bad')
    if (parcelas > 1 && !f.dueDate) return actions.notify('Informe o vencimento da próxima parcela', 'bad')
    const base = { category: f.category, paidWith: f.paidWith, paid: f.paid, paidAt: f.paid ? today() : null }
    const desc = f.description.trim() || f.category
    const rows = parcelas === 1
      ? [{ ...base, amount, month: f.dueDate ? f.dueDate.slice(0, 7) : (mode === 'mes' ? m : cur), description: desc, dueDate: f.dueDate || null }]
      : sched.map((s) => ({ ...base, amount: num(s.amount) || amount, month: s.due.slice(0, 7), description: `${desc} (${s.n}/${pTotal})`, dueDate: s.due }))
    for (const r of rows) await actions.upsert('expenses', r, null)
    actions.notify(rows.length > 1 ? `${rows.length} parcelas lançadas` : 'Despesa lançada')
    setLast(rows)
    setF({ ...f, description: '', amount: '', pStart: '', pTotal: '', sched: {}, dueDate: '' })
  }
  const copyPrev = async () => {
    const prev = data.expenses.filter((e) => e.month === shift(m, -1))
    for (const e of prev) await actions.upsert('expenses', { month: m, category: e.category, description: e.description, amount: e.amount, paidWith: e.paidWith || '' }, null)
    actions.notify(`${prev.length} despesas copiadas do mês anterior`)
  }
  const pct = (v) => (fin.revenue ? `${Math.round((v / fin.revenue) * 100)}%` : '—')

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">O que sobra de verdade</p><h1 className="page-title">Lucro real</h1></div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'mes', label: 'Mês' }, { value: '3m', label: '3 meses' }, { value: 'ano', label: 'Ano' }, { value: 'custom', label: 'Período' }]} />
      </div>
      <div className="agenda-bar fin-period">
        {mode === 'mes' && (
          <div className="date-nav">
            <button className="icon-btn" onClick={() => setM(shift(m, -1))} aria-label="Mês anterior"><ChevronLeft size={20} /></button>
            <input type="month" value={m} max={shift(cur, 12)} onChange={(e) => e.target.value && setM(e.target.value)} aria-label="Mês" />
            <button className="icon-btn" onClick={() => setM(shift(m, 1))} aria-label="Próximo mês"><ChevronRight size={20} /></button>
            {m !== cur && <Button variant="ghost" size="sm" onClick={() => setM(cur)}>Este mês</Button>}
          </div>
        )}
        {mode === 'custom' && (
          <div className="range">
            <input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} aria-label="De" />
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} aria-label="Até" />
          </div>
        )}
        <p className="muted small">Mostrando: <b>{per.label}</b>{rs.loading ? ' · buscando vendas antigas…' : ''}</p>
      </div>
      {!okPer && <p className="notice">A data inicial precisa ser antes da final.</p>}
      {rs.error && <p className="notice">Não foi possível buscar as vendas desse período ({rs.error}). Os valores de vendas podem estar incompletos.</p>}

      <div className="stats">
        <Stat label="Receita total" help="Tudo o que entrou no período: vendas fechadas no Caixa (serviços, produtos e pacotes) + mensalidades do Clube. Uso de crédito em haver não conta de novo." value={money(fin.revenue)} sub={`Vendas ${money(fin.salesTotal)} · Clube ${money(fin.club)}`} />
        <Stat label="Comissões" help="Quanto das vendas do período é das profissionais." value={money(fin.commissions)} sub={`${pct(fin.commissions)} da receita`} />
        <Stat label="Despesas" help={`Contas do período (aluguel, luz, produtos, boletos…), pagas ou não, mais as taxas da maquininha${fin.taxRate ? ' e o imposto automático' : ''}. Em meses inteiros conta o mês da conta; em período com datas quebradas, conta a data de vencimento.${fin.taxRate ? ' Com o imposto automático ligado, as despesas da categoria "Impostos" não somam (para não contar duas vezes).' : ''}`} value={money(fin.expTotal + fin.cardFees + fin.tax)} sub={[`Contas ${money(fin.expTotal)}`, fin.cardFees > 0 && `Taxas cartão ${money(fin.cardFees)}`, fin.tax > 0 && `Imposto ${String(fin.taxRate).replace('.', ',')}% ${money(fin.tax)}`].filter(Boolean).join(' · ')} />
        <Stat accent label="Lucro líquido" help={`O que sobra de verdade: Receita − Comissões − Despesas − Taxas do cartão${fin.taxRate ? ' − Imposto' : ''}. Margem = quanto sobra de cada R$ 100 vendidos.`} value={money(fin.profit)} sub={`Margem ${Math.round(fin.margin * 100)}%`} />
      </div>
      {fin.taxExpenses > 0 && <p className="muted small mt-sm">Imposto automático ligado: {money(fin.taxExpenses)} lançados na categoria "Impostos" ficam na lista, mas não somam no lucro.</p>}
      <CardReceivables />

      <BoletosCard onEdit={setEditExp} />
      <p className="muted small mt-sm">Descontos concedidos no período: {money(fin.discounts)} (Clube, fidelidade, aniversário e promoções).</p>

      <div className="grid-2">
        <Card title={`Despesas · ${per.label}`} action={mode === 'mes' ? <Button variant="ghost" size="sm" icon={Copy} onClick={copyPrev}>Copiar do mês anterior</Button> : null}>
          <div className="exp-form">
            <Field label="Categoria"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Descrição"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: conta de luz" /></Field>
            <Field label="Valor (R$)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0,00" /></Field>
            <Field label="Pago com / conta"><input list="pagocom" value={f.paidWith} onChange={(e) => setF({ ...f, paidWith: e.target.value })} placeholder="Ex.: Cartão Caixa" /><datalist id="pagocom">{[...new Set([...data.expenses.map((x) => x.paidWith).filter(Boolean), 'Pix', 'Dinheiro', 'Boleto', 'Cartão Caixa', 'Conta Caixa'])].map((o) => <option key={o} value={o} />)}</datalist></Field>
            <Field label="Vencimento"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label="Situação"><select value={f.paid ? 'pago' : 'apagar'} onChange={(e) => setF({ ...f, paid: e.target.value === 'pago' })}><option value="pago">Pago</option><option value="apagar">A pagar</option></select></Field>
            {!f.paid && <>
              <Field label="Parcela nº" hint="A próxima a pagar"><input inputMode="numeric" value={f.pStart || ''} onChange={(e) => setF({ ...f, pStart: e.target.value.replace(/\D/g, '') })} placeholder="1" /></Field>
              <Field label="De quantas parcelas" hint="Total do boleto"><input inputMode="numeric" value={f.pTotal || ''} onChange={(e) => setF({ ...f, pTotal: e.target.value.replace(/\D/g, '') })} placeholder="1" /></Field>
              <p className="muted small span-2">Lance o <b>valor de UMA parcela</b> e o vencimento da próxima. {parcelas > 1 ? (f.dueDate ? <>Confira abaixo: cada parcela pode ter <b>vencimento e valor diferentes</b>.</> : <>Agora informe o <b>Vencimento</b> da parcela {pStart}.</>) : 'Ex.: boleto em 5x com 3 já pagas → Parcela nº 4 de 5 (cria só as 2 que faltam).'}</p>
              {sched.length > 0 && (
                <div className="parc-list span-2">
                  {sched.map((s, i) => (
                    <div key={s.n} className="parc-row">
                      <b>Parcela {s.n}/{pTotal}</b>
                      <label><span>Vence</span><input type="date" value={s.due} onChange={(e) => e.target.value && setSched(i, 'due', e.target.value)} /></label>
                      <label><span>Valor (R$)</span><input inputMode="decimal" value={s.amount} onChange={(e) => setSched(i, 'amount', e.target.value)} placeholder={f.amount || '0,00'} /></label>
                    </div>
                  ))}
                  <p className="muted small">Total: <b>{money(sum(sched, (s) => num(s.amount) || num(f.amount)))}</b> em {sched.length} parcelas</p>
                </div>
              )}
            </>}
            <Button icon={Plus} onClick={add}>{parcelas > 1 ? `Lançar ${parcelas} parcelas` : 'Lançar'}</Button>
          </div>
          {last && (
            <div className="exp-last mt-sm" role="status">
              <span><b>Lançado:</b> {last.map((r) => `${r.description} · ${r.dueDate ? fmtD(r.dueDate) : monthLabel(r.month)} · ${money(r.amount)}`).join(' | ')}{last.some((r) => r.month !== m) && <> — fica no mês do vencimento; veja em <b>Boletos e contas</b> acima.</>}</span>
              <button type="button" className="icon-btn sm" aria-label="Fechar" onClick={() => setLast(null)}>×</button>
            </div>
          )}
          {fin.expenses.length > 3 && <div className="mt">
            <CatalogFilter compact q={eq} setQ={setEq} cats={[...[...new Set(fin.expenses.map((e) => e.category))].sort().map((c) => ({ value: c, label: c })), { value: '__pago', label: 'Pagas' }, { value: '__apagar', label: 'A pagar' }]} cat={ecat} setCat={setEcat} show={eshow} setShow={setEshow} placeholder="Buscar despesa" />
            {(eq || ecat) && <p className="muted small">{shown.length} de {fin.expenses.length} · {money(sum(shown, (e) => e.amount))}</p>}
          </div>}
          <div className="list compact mt">
            {(allExp ? shown : shown.slice(0, 25)).map((e) => (
              <div key={e.id} className="sale-row">
                <span className="appt-info"><b>{e.description}</b><small>{e.category}{e.paidWith ? ` · ${e.paidWith}` : ''}{e.dueDate ? ` · vence ${e.dueDate.split('-').reverse().join('/')}` : ''}{e.paid === false ? ' · a pagar' : ''}</small></span>
                <b>{money(e.amount)}</b>
                <button className="icon-btn sm" onClick={() => setEditExp(e)} aria-label="Editar"><Pencil size={15} /></button>
                <button className="icon-btn sm" onClick={() => actions.remove('expenses', e.id, 'Despesa removida')} aria-label="Remover"><Trash2 size={15} /></button>
              </div>
            ))}
            {shown.length > 25 && <button type="button" className="link show-more" onClick={() => setAllExp(!allExp)}>{allExp ? 'Mostrar menos' : `Mostrar todas (${shown.length} despesas)`}</button>}
            {!fin.expenses.length && <p className="muted small">Nenhuma despesa neste período. Preencha o formulário acima e clique em <b>Lançar</b>, ou use <b>Copiar do mês anterior</b>.</p>}
            {fin.expenses.length > 0 && !shown.length && <p className="muted small">Nenhuma despesa com esse filtro.</p>}
          </div>
        </Card>
        <div className="stack">
          <Card title="Lucro dos últimos meses"><BarChart data={trend} height={180} /></Card>
          <Card title="Despesas por categoria" collapsible storageKey="fin-categorias">
            {byCat.map((x) => (
              <div key={x.c} className="rank"><div className="rank-top"><span>{x.c}</span><b>{money(x.v)} · {catTotal ? Math.round((x.v / catTotal) * 100) : 0}%</b></div><div className="rank-track"><div className="rank-fill" style={{ width: `${(x.v / (byCat[0]?.v || 1)) * 100}%` }} /></div></div>
            ))}
            {!byCat.length && <p className="muted small">Sem despesas.</p>}
          </Card>
        </div>
      </div>
      {editExp && <ExpenseEdit e={editExp} onClose={() => setEditExp(null)} />}
    </div>
  )
}

/** Boletos e contas com vencimento: a pagar, pagos ou todos, de qualquer mês, com busca por nome/valor/data */
function BoletosCard({ onEdit }) {
  const { data, actions } = useStore()
  const [q, setQ] = useState('')
  const [st, setSt] = useState('apagar')
  const [more, setMore] = useState(false)
  const hoje = today()
  const dias = (d) => Math.round((new Date(d + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 864e5)
  const all = data.expenses.filter((e) => e.paid === false || e.dueDate)
  const list = all.filter((e) => (st === 'todos' || (st === 'apagar' ? e.paid === false : e.paid !== false))
    && (!q.trim() || norm(`${e.description} ${e.category} ${e.paidWith || ''} ${e.dueDate ? fmtD(e.dueDate) : ''} ${money(e.amount)} ${e.amount}`).includes(norm(q))))
    // a pagar: o que vence primeiro no topo; pagos: o mais recente no topo
    .sort((a, b) => (st === 'apagar' ? String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) : String(b.dueDate || b.paidAt || '').localeCompare(String(a.dueDate || a.paidAt || ''))))
  const LIMIT = 15
  const vis = more || q.trim() ? list : list.slice(0, LIMIT)
  const open = all.filter((e) => e.paid === false)
  const late = open.filter((e) => e.dueDate && e.dueDate < hoje)
  return (
    <Card title="Boletos e contas" className="mt" collapsible storageKey="fin-boletos" action={<Segmented value={st} onChange={(v) => { setSt(v); setMore(false) }} options={[{ value: 'apagar', label: `A pagar (${open.length})` }, { value: 'pagos', label: 'Pagos' }, { value: 'todos', label: 'Todos' }]} />}>
      <p className="muted small">Em aberto: <b>{money(sum(open, (e) => e.amount))}</b>{late.length > 0 && <> · <b style={{ color: '#b42318' }}>{late.length} vencido(s) · {money(sum(late, (e) => e.amount))}</b></>}. Busque pelo nome da empresa, valor ou data (ex.: 25/10). Toque no lápis para mudar vencimento, valor ou nome.</p>
      <div className="search mt-sm mb-sm"><Search size={16} /><input placeholder="Buscar nome, valor ou data" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" className="icon-btn sm" aria-label="Limpar busca" onClick={() => setQ('')}><X size={14} /></button>}</div>
      {q.trim() && <p className="muted small mb-sm">{list.length} encontrado(s) · {money(sum(list, (e) => e.amount))}</p>}
      {!list.length && <p className="muted small">{q.trim() ? 'Nada encontrado. Tente parte do nome ou troque para "Todos".' : st === 'apagar' ? 'Nenhum boleto em aberto. Lance a despesa com Situação "A pagar".' : 'Nenhum boleto pago ainda.'}</p>}
      <div className="bol-list">
        {vis.map((e) => { const d = e.dueDate ? dias(e.dueDate) : null; const late = e.paid === false && d !== null && d < 0; const soon = e.paid === false && d !== null && d >= 0 && d <= 3; return (
          <div key={e.id} className={cls('bol-row', late && 'late', soon && 'soon', e.paid !== false && 'done')}>
            <span className="bol-name"><b>{e.description}</b><small>{e.category}{e.paidWith ? ` · ${e.paidWith}` : ''}{e.paid !== false && e.paidAt ? ` · pago em ${fmtD(e.paidAt)}` : ''}</small></span>
            <span className="bol-due">{e.dueDate ? fmtD(e.dueDate) : 'sem data'}<small>{e.paid !== false ? 'pago' : d === null ? '' : d < 0 ? `vencido há ${-d} dia(s)` : d === 0 ? 'vence hoje' : `em ${d} dia(s)`}</small></span>
            <b className="bol-val">{money(e.amount)}</b>
            <span className="bol-acts">
              {e.paid === false
                ? <Button size="sm" variant="ghost" onClick={() => actions.upsert('expenses', { ...e, paid: true, paidAt: today() }, 'Boleto pago')}>Pago</Button>
                : <Button size="sm" variant="ghost" onClick={() => actions.upsert('expenses', { ...e, paid: false, paidAt: null }, 'Voltou para a pagar')}>Desfazer</Button>}
              <button type="button" className="icon-btn sm" aria-label="Editar" onClick={() => onEdit(e)}><Pencil size={15} /></button>
            </span>
          </div>
        ) })}
      </div>
      {!q.trim() && list.length > LIMIT && <Button variant="ghost" size="sm" className="mt-sm" onClick={() => setMore(!more)}>{more ? 'Mostrar menos' : `Mostrar todos (${list.length})`}</Button>}
    </Card>
  )
}

/** Editar uma despesa/boleto: vencimento, valor, nome, categoria e situação */
function ExpenseEdit({ e, onClose }) {
  const { actions } = useStore()
  const [x, setX] = useState({ ...e, amount: String(e.amount).replace('.', ','), dueDate: e.dueDate || '' })
  const save = async () => {
    const s = String(x.amount).trim(); const amount = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0
    if (!amount) return actions.notify('Informe o valor', 'bad')
    // o mês do lançamento acompanha o vencimento (competência)
    await actions.upsert('expenses', { ...e, description: x.description.trim() || e.description, category: x.category, paidWith: x.paidWith, amount, dueDate: x.dueDate || null, month: x.dueDate ? x.dueDate.slice(0, 7) : e.month, paid: x.paid, paidAt: x.paid ? (e.paidAt || today()) : null }, 'Atualizado')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Editar conta" footer={<div className="foot-row"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></div>}>
      <div className="form-grid">
        <Field label="Descrição" className="span-2"><input value={x.description} onChange={(ev) => setX({ ...x, description: ev.target.value })} /></Field>
        <Field label="Vencimento"><input type="date" value={x.dueDate} onChange={(ev) => setX({ ...x, dueDate: ev.target.value })} /></Field>
        <Field label="Valor (R$)"><input inputMode="decimal" value={x.amount} onChange={(ev) => setX({ ...x, amount: ev.target.value })} /></Field>
        <Field label="Categoria"><select value={x.category} onChange={(ev) => setX({ ...x, category: ev.target.value })}>{[...new Set([...CATS, x.category])].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Situação"><select value={x.paid === false ? 'apagar' : 'pago'} onChange={(ev) => setX({ ...x, paid: ev.target.value === 'pago' })}><option value="apagar">A pagar</option><option value="pago">Pago</option></select></Field>
        <Field label="Pago com / conta" className="span-2"><input value={x.paidWith || ''} onChange={(ev) => setX({ ...x, paidWith: ev.target.value })} /></Field>
      </div>
      {x.dueDate && x.dueDate.slice(0, 7) !== e.month && <p className="muted small mt-sm">Com o novo vencimento, esta conta passa para {monthLabel(x.dueDate.slice(0, 7))} no Lucro real.</p>}
    </Modal>
  )
}

/** A receber do cartão: quando o dinheiro das vendas no cartão cai na conta (líquido da taxa), pelos prazos de Ajustes → Financeiro */
function CardReceivables() {
  const { data } = useStore()
  const [open, setOpen] = useState(false)
  const t = today()
  // crédito parcelado em até 12x: olha as vendas do último ano (busca no banco o que for antigo)
  const from = `${shift(t.slice(0, 7), -13)}-01`
  const rs = useSalesRange(data, open ? from : t, t)
  const list = useMemo(() => (open ? receivables(rs.sales, data.settings).filter((r) => r.date > t) : []), [open, rs.sales, data.settings, t])
  const addD = (n) => { const x = new Date(`${t}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
  const in7 = sum(list.filter((r) => r.date <= addD(7)), (r) => r.v)
  const in30 = sum(list.filter((r) => r.date <= addD(30)), (r) => r.v)
  const byMonth = Object.entries(list.reduce((m, r) => { const k = r.date.slice(0, 7); m[k] = (m[k] || 0) + r.v; return m }, {})).sort()
  return (
    <Card title="A receber do cartão" className="mt" action={<Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>{open ? 'Esconder' : 'Ver previsão'}</Button>}>
      {!open ? <p className="muted small">Quanto das vendas no cartão ainda vai cair na conta e quando (débito, crédito à vista e cada parcela), já sem a taxa. Os prazos ficam em Ajustes → Financeiro.</p>
        : rs.loading ? <p className="muted small">Calculando…</p> : !list.length ? <p className="muted small">Nada a receber: todas as vendas no cartão já caíram na conta (pelos prazos de Ajustes).</p> : <>
          <div className="mini-kpis row"><div><b>{money(in7)}</b> em 7 dias</div><div><b>{money(in30)}</b> em 30 dias</div><div><b>{money(sum(list, (r) => r.v))}</b> no total</div></div>
          <div className="pay-sum mt-sm">{byMonth.map(([k, v]) => <div key={k}><span>{monthLabel(k)}</span><b>{money(v)}</b></div>)}</div>
          <h4 className="sub-title mt">Próximos recebimentos</h4>
          <div className="list compact">
            {list.slice(0, 12).map((r, i) => <div key={i} className="sale-row"><span className="appt-time">{fmtD(r.date).slice(0, 5)}</span><span className="appt-info"><b>{r.sale.clientName}</b><small>{r.label} · venda de {fmtD(r.sale.date)}</small></span><b>{money(r.v)}</b></div>)}
            {list.length > 12 && <p className="muted small">+{list.length - 12} recebimentos</p>}
          </div>
          {rs.error && <p className="notice">Não foi possível buscar vendas antigas ({rs.error}); parcelas de vendas com mais de 4 meses podem faltar.</p>}
        </>}
    </Card>
  )
}
