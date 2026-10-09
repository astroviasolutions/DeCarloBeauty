import { useMemo, useState } from 'react'
import { Banknote, Check, CreditCard, QrCode, Repeat, Wallet } from 'lucide-react'
import ReceiptButtons from './Receipt'
import { useStore } from '../state/Store'
import ReviewButtons from './Review'
import { Avatar, Button, Empty, Field, Modal } from './ui'
import { applyCardFee, applyDiscount, priceItems } from '../lib/commission'
import { packageChargeItem, packageFor, pendingPackages } from './Packages'
import { serviceNames } from './Appointments'
import { addDays, cls, money, nowMin, parseMoney, round2, today, toHHMM } from '../lib/utils'
import SuppliesEditor, { defaultSupplies, supplyItems } from './Supplies'
import { IncreaseButton, IncreaseEditor } from './ItemIncrease'
import { feeAmount, feeRate, financeOf, isCard, MAX_PARCELAS, surchargeFor } from '../lib/cardFees'

/**
 * Comanda: tudo que a cliente fez no dia, com uma ou várias profissionais,
 * fechado de uma vez com um pagamento só. No banco vira uma venda por atendimento
 * (cada profissional recebe a própria comissão).
 */
const PAY = [
  { value: 'pix', label: 'Pix', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'debito', label: 'Débito', icon: CreditCard },
  { value: 'credito', label: 'Crédito', icon: CreditCard },
  { value: 'saldo', label: 'Saldo da cliente', icon: Wallet },
  { value: 'fiado', label: 'Pagar depois', icon: Wallet },
  { value: 'permuta', label: 'Permuta', icon: Repeat },
]
const OPEN = ['agendado', 'confirmado']

/** Atendimentos em aberto da cliente no dia (mesma comanda) */
export const comandaOf = (appointments, appt) => appointments
  .filter((a) => a.date === appt.date && OPEN.includes(a.status) && (appt.clientId ? a.clientId === appt.clientId : a.clientName === appt.clientName))
  .sort((a, b) => a.time.localeCompare(b.time))

function itemsOf(a, services, packages) {
  const base = a.serviceIds.map((id) => services.find((s) => s.id === id))
  const cat = base.reduce((s, x) => s + Number(x?.price || 0), 0)
  const k = !/Sessão de pacote/i.test(a.notes || '') && cat > 0 && Number(a.total) > 0 ? Number(a.total) / cat : 1 // valor combinado (agendamento de pacote: total = valor do pacote)
  return a.serviceIds.map((id, i) => {
    const it = { type: 'service', refId: id, name: base[i]?.name || 'Serviço', price: round2(Number(base[i]?.price || 0) * k), qty: 1 }
    const pk = packageFor(packages, a.clientId, id)
    return pk ? { ...it, packageId: pk.pkg.id, unit: pk.unit, fullPrice: it.price, price: 0 } : it
  })
}

export function ComandaCheckout({ appts, onDone }) {
  const { data, actions, session } = useStore()
  const showComm = session?.role !== 'reception' // recepção não vê comissão
  // pacote reservado e ainda não pago entra na 1ª linha (cobra junto com a comanda)
  const [lines, setLines] = useState(() => appts.map((a, i) => ({ a, on: true, items: [...itemsOf(a, data.services, data.packages), ...(i === 0 ? pendingPackages(data.packages, a.clientId).map(packageChargeItem) : [])] })))
  const [payment, setPayment] = useState('pix')
  const [parc, setParc] = useState(1) // crédito: em quantas vezes (taxa da maquininha)
  const [mach, setMach] = useState(null) // maquininha (null = a primeira de Ajustes)
  const machines = financeOf(data.settings).machines
  const machineId = machines.some((m) => m.id === mach) ? mach : machines[0].id
  const [discount, setDiscount] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [incOpen, setIncOpen] = useState(null) // item com o editor de acréscimo aberto
  const client =data.clients.find((c) => c.id === appts[0]?.clientId)
  const credit = Number(client?.credit || 0)
  const rules = data.settings.privacy?.commission || {}
  const permuta = payment === 'permuta'

  const togglePkg = (li, ii) => setLines((ls) => ls.map((l, i) => (i !== li ? l : {
    ...l, items: l.items.map((it, j) => {
      if (j !== ii) return it
      if (it.packageId) { const { packageId: _p, unit: _u, fullPrice, ...r } = it; return { ...r, price: Number(fullPrice ?? r.price) } }
      const pk = packageFor(data.packages, l.a.clientId, it.refId)
      return pk ? { ...it, packageId: pk.pkg.id, unit: pk.unit, fullPrice: it.price, price: 0 } : it
    }),
  })))

  const calc = useMemo(() => {
    const act = lines.filter((l) => l.on)
    const subs = act.map((l) => round2(l.items.reduce((s, x) => s + x.price * x.qty, 0)))
    const subtotal = round2(subs.reduce((s, x) => s + x, 0))
    const disc = permuta ? subtotal : Math.min(subtotal, parseMoney(discount, subtotal))
    const f = subtotal ? disc / subtotal : 0
    const out = act.map((l, i) => {
      const barber = data.barbers.find((b) => b.id === l.a.barberId)
      const d = round2(subs[i] * f) // desconto dividido proporcionalmente entre as profissionais
      const priced = applyDiscount(priceItems(l.items, { services: data.services, products: data.products, barber, materialReduces: !!rules.materialReduces }), rules.discountReduces === false || permuta ? 0 : d)
      const items = permuta ? priced.map((x) => ({ ...x, commission: 0 })) : priced
      return { ...l, barber, subtotal: subs[i], discount: d, total: round2(subs[i] - d), items, commission: round2(items.reduce((s, x) => s + x.commission, 0)) }
    })
    // juros do parcelado repassado (Ajustes) entra na 1ª profissional, sem comissão
    const base = round2(subtotal - disc)
    const sur = payment === 'credito' ? surchargeFor(data.settings, base, parc, machineId) : 0
    if (sur > 0 && out[0]) out[0] = { ...out[0], items: [...out[0].items, { type: 'surcharge', refId: null, name: `Juros do parcelamento ${parc}x`, price: sur, qty: 1, commissionRate: 0, commission: 0 }], subtotal: round2(out[0].subtotal + sur), total: round2(out[0].total + sur) }
    // taxa da maquininha por venda (e, se for a regra, reduz a comissão)
    // só a parte da taxa que a clínica absorve reduz a comissão (o juros repassado já cobre a taxa)
    const withFee = out.map((l) => { const fee = feeAmount(data.settings, payment, l.total, parc, machineId); const ls = l.items.filter((x) => x.type === 'surcharge').reduce((s, x) => s + x.price, 0); const items = rules.feeReduces && !permuta ? applyCardFee(l.items, l.total - ls, Math.max(0, fee - ls)) : l.items; return { ...l, fee, items, commission: round2(items.reduce((s, x) => s + Number(x.commission || 0), 0)) } })
    return { out: withFee, subtotal, disc, sur, fee: round2(withFee.reduce((s, l) => s + l.fee, 0)), total: round2(base + sur) }
  }, [lines, discount, permuta, data, rules.discountReduces, rules.materialReduces, rules.feeReduces, payment, parc, machineId])

  const finish = async () => {
    if (!calc.out.length) return
    if (payment === 'saldo' && credit < calc.total) return actions.notify(`Saldo insuficiente: ${money(credit)}`, 'bad')
    if ((payment === 'saldo' || payment === 'fiado') && !client) return actions.notify('Cliente sem cadastro: use outra forma de pagamento', 'bad')
    setSaving(true)
    try {
      const made = []
      for (const l of calc.out) {
        const pay = payment === 'fiado' ? 'a pagar' : l.total === 0 && l.items.some((x) => x.packageId) && !permuta ? 'pacote' : payment
        made.push(await actions.createSale({
          date: today(), time: toHHMM(nowMin()), barberId: l.a.barberId, clientId: l.a.clientId || null, clientName: l.a.clientName, appointmentId: l.a.id,
          items: [...l.items, ...supplyItems(l.sup ?? defaultSupplies(l.items, data.services), data.products)], subtotal: l.subtotal, discount: l.discount, total: l.total, payment: pay, commissionTotal: l.commission,
          // taxa do cartão de cada venda da comanda (proporcional ao valor de cada profissional)
          installments: payment === 'credito' ? parc : null, cardFee: l.fee, cardMachine: isCard(payment) ? machineId : null,
          benefit: permuta ? { kind: 'permuta', label: 'Permuta', amount: l.subtotal } : null, loyaltyRedeemed: false,
        }))
      }
      if ((payment === 'saldo' || payment === 'fiado') && calc.total > 0) {
        const { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt } = client
        await actions.upsert('clients', { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt, credit: round2(credit - calc.total), ...(payment === 'fiado' ? { debtDue: credit < 0 && client.debtDue ? client.debtDue : addDays(today(), financeOf(data.settings).fiado.dias) } : {}) }, payment === 'fiado' ? `Ficou a pagar ${money(calc.total)}` : null)
      }
      for (const it of calc.out.flatMap((l) => l.items).filter((x) => x.type === 'package')) await actions.patch('packages', it.refId, { payment: payment === 'fiado' ? 'a pagar' : payment })
      setDone(made.filter(Boolean))
    } finally { setSaving(false) }
  }

  if (done) return (
    <div className="sale-done fade-in">
      <div className="success-ico"><Check size={36} strokeWidth={3} /></div>
      <h3>Comanda fechada · {money(done.reduce((s, x) => s + Number(x.total), 0))}</h3>
      <ReceiptButtons sales={done} phone={appts[0]?.clientPhone} />
      <ReviewButtons sales={done} phone={appts[0]?.clientPhone} />
      <Button variant="ghost" onClick={() => onDone?.()}>Fechar</Button>
    </div>
  )

  return (
    <div className="comanda">
      {lines.map((l, li) => {
        const c = calc.out.find((x) => x.a.id === l.a.id)
        const b = data.barbers.find((x) => x.id === l.a.barberId)
        return (
          <div key={l.a.id} className={cls('comanda-appt', !l.on && 'off')} style={!l.on ? { opacity: 0.5 } : undefined}>
            <div className="comanda-appt-head">
              <Avatar name={b?.name} color={b?.color} photo={b?.photo} size={26} />
              <b>{b?.name} · {l.a.time}</b>
              <label className="small"><input type="checkbox" checked={l.on} onChange={(e) => setLines((ls) => ls.map((x, i) => (i === li ? { ...x, on: e.target.checked } : x)))} /> fechar agora</label>
            </div>
            {l.items.map((it, ii) => {
              const canInc = it.type === 'service' && !it.packageId && l.on
              const key = `${li}-${ii}`
              return (
                <div key={ii} className="comanda-item">
                  <span>{it.name}{Number(it.increase) > 0 && <small className="inc-note">{money(it.basePrice)} + {money(it.increase)} acréscimo{it.increaseNote ? ` · ${it.increaseNote}` : ''}</small>}</span>
                  <span className="small">
                    {(it.packageId || packageFor(data.packages, l.a.clientId, it.refId)) && <button className={cls('pill pkg-use', it.packageId && 'on')} onClick={() => togglePkg(li, ii)}>{it.packageId ? '✓ Pacote' : 'Usar pacote'}</button>}
                    {canInc && <IncreaseButton item={it} open={incOpen === key} onToggle={() => setIncOpen(incOpen === key ? null : key)} />}
                    {' '}<b>{money(it.price * it.qty)}</b>
                  </span>
                  {canInc && incOpen === key && <IncreaseEditor item={it} onApply={(nx) => setLines((ls) => ls.map((x, i) => (i !== li ? x : { ...x, items: x.items.map((y, j) => (j === ii ? nx : y)) })))} onClose={() => setIncOpen(null)} />}
                </div>
              )
            })}
            {c && showComm && <small className="muted">Comissão de {b?.name.split(' ')[0]}: {money(c.commission)}{c.discount > 0 ? ` · desconto ${money(c.discount)}` : ''}</small>}
            {l.on && <SuppliesEditor value={l.sup ?? defaultSupplies(l.items, data.services)} onChange={(v) => setLines((ls) => ls.map((x, i) => (i === li ? { ...x, sup: v } : x)))} products={data.products} />}
          </div>
        )
      })}
      <div className="pay">
        {PAY.filter((p) => p.value !== 'saldo' || credit > 0).map((p) => (
          <button key={p.value} className={cls('pay-btn', payment === p.value && 'on')} onClick={() => setPayment(p.value)}><p.icon size={18} /> {p.label}{p.value === 'saldo' ? ` (${money(credit)})` : ''}</button>
        ))}
      </div>
      {isCard(payment) && calc.total > 0 && (
        <div className="card-fee-box">
          {machines.length > 1 && <Field label="Maquininha"><select value={machineId} onChange={(e) => setMach(e.target.value)}>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
          {payment === 'credito' && <Field label="Parcelas no crédito"><select value={parc} onChange={(e) => setParc(Number(e.target.value))}>{Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => { const t = round2(calc.subtotal - calc.disc); const tot = t + surchargeFor(data.settings, t, n, machineId); return <option key={n} value={n}>{n === 1 ? `À vista (1x) ${money(tot)}` : `${n}x de ${money(tot / n)}`} · taxa {String(feeRate(data.settings, 'credito', n, machineId)).replace('.', ',')}%</option> })}</select></Field>}
          {calc.sur > 0 && <small>Juros repassado para a cliente: <b>+{money(calc.sur)}</b></small>}
          {(() => { const fee = calc.fee; return <small className="muted">{fee > 0 ? <>Taxa da maquininha: <b>{money(fee)}</b> · entra líquido <b>{money(calc.total - fee)}</b></> : <>Sem taxa cadastrada. Cadastre em <b>Ajustes → Taxas da maquininha</b>.</>}</small> })()}
        </div>
      )}
      <div className="totals">
        <div><span>Subtotal</span><span>{money(calc.subtotal)}</span></div>
        {!permuta && <div className="disc"><span>Desconto (R$ ou %)</span><input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00 ou 10%" /></div>}
        {calc.disc > 0 && <div className="ben-line"><span>{permuta ? 'Permuta' : 'Desconto'}</span><span>-{money(calc.disc)}</span></div>}
        <div className="grand"><span>Total</span><b>{money(calc.total)}</b></div>
      </div>
      <Button size="lg" block icon={Check} disabled={saving || !calc.out.length} onClick={finish}>{saving ? 'Fechando…' : `Fechar comanda · ${money(calc.total)}`}</Button>
    </div>
  )
}

/** Comandas em aberto do dia (botão na Agenda) */
export function OpenComandas({ date, onClose }) {
  const { data } = useStore()
  const [sel, setSel] = useState(null)
  const groups = Object.values(data.appointments.filter((a) => a.date === date && OPEN.includes(a.status))
    .reduce((m, a) => { const k = a.clientId || a.clientName; (m[k] ||= []).push(a); return m }, {}))
    .map((l) => l.sort((a, b) => a.time.localeCompare(b.time))).sort((a, b) => a[0].time.localeCompare(b[0].time))
  if (sel) return <Modal open wide onClose={() => setSel(null)} title={`Comanda · ${sel[0].clientName}`}><ComandaCheckout appts={sel} onDone={() => setSel(null)} /></Modal>
  return (
    <Modal open onClose={onClose} title={`Comandas abertas (${groups.length})`}>
      {!groups.length && <Empty title="Nenhuma comanda aberta" text="Os atendimentos do dia ainda não fechados aparecem aqui." />}
      <div className="list compact">
        {groups.map((g) => (
          <button key={g[0].id} className="comanda-card" style={{ textAlign: 'left', cursor: 'pointer', background: 'none', font: 'inherit', color: 'inherit' }} onClick={() => setSel(g)}>
            <div className="comanda-head"><b>{g[0].clientName}</b><b>{money(g.reduce((s, a) => s + Number(a.total || 0), 0))}</b></div>
            {g.map((a) => <div key={a.id} className="comanda-line"><span>{a.time} · {serviceNames(a, data.services)}</span><small>{data.barbers.find((b) => b.id === a.barberId)?.name}</small></div>)}
          </button>
        ))}
      </div>
    </Modal>
  )
}
