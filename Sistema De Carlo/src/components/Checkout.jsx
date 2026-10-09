import { useEffect, useMemo, useState } from 'react'
import { Banknote, Camera, Repeat, Check, CreditCard, Crown, Gift, Minus, Package, Plus, QrCode, Sparkles, Star, Trash2, UserRound, X } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Segmented } from './ui'
import { applyCardFee, applyDiscount, priceItems } from '../lib/commission'
import { clubOf, isBirthdayMonth, loyaltyOf } from '../lib/loyalty'
import { compressImage } from '../lib/image'
import { cls, isDesk, maskPhone, phoneLabel, money, onlyDigits, round2, today, nowMin, toHHMM, waLink, parseMoney, addDays, PAYMENTS } from '../lib/utils'
import { msg as fillMsg } from '../lib/messages'
import { packageChargeItem, packageFor, pendingPackages } from './Packages'
import ReceiptButtons from './Receipt'
import SuppliesEditor, { defaultSupplies, qtyUnit, supplyItems } from './Supplies'
import { feeAmount, feeRate, financeOf, isCard, MAX_PARCELAS, surchargeFor } from '../lib/cardFees'
import CatalogFilter, { CatalogGroups, catalogCats, catalogMatch, norm } from './CatalogFilter'
import { IncreaseButton, IncreaseEditor } from './ItemIncrease'

/** Sessão abatida do pacote: R$ 0 no caixa; `unit` é a base da comissão */
const withPkg = (it, pk) => ({ ...it, packageId: pk.pkg.id, unit: pk.unit, fullPrice: it.fullPrice ?? it.price, price: 0 })
const withoutPkg = ({ packageId: _p, unit: _u, fullPrice, ...it }) => ({ ...it, price: Number(fullPrice ?? it.price) })

const PAY = [
  { value: 'pix', label: 'Pix', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'debito', label: 'Débito', icon: CreditCard },
  { value: 'credito', label: 'Crédito', icon: CreditCard },
  { value: 'saldo', label: 'Saldo da cliente', icon: CreditCard },
  { value: 'permuta', label: 'Permuta', icon: Repeat }, // troca de serviços: R$ 0 no caixa e sem comissão
]

/**
 * PDV — usado na tela Caixa e ao "Cobrar" um atendimento da agenda.
 * Com `sale`: corrige um atendimento já cobrado (sem estornar).
 */
export default function Checkout({ appointment, sale: editing, presetBarberId, lockBarber, onDone }) {
  const { data, actions, session } = useStore()
  const { services, products, barbers, clients } = data
  const showComm = session?.role !== 'reception' // recepção não vê comissão
  const activeBarbers = barbers.filter((b) => b.active)

  const [tab, setTab] = useState('service')
  const [q, setQ] = useState('')
  const [barberId, setBarberId] = useState(presetBarberId || appointment?.barberId || activeBarbers[0]?.id)
  const [items, setItems] = useState([])
  const [discount, setDiscount] = useState('')
  const [extra, setExtra] = useState('') // adicional (valor a mais)
  const [extraNote, setExtraNote] = useState('')
  const [payment, setPayment] = useState('pix')
  const [paid1, setPaid1] = useState('')
  const [rest, setRest] = useState('fiado')
  const [parc, setParc] = useState(1) // crédito: em quantas vezes (define a taxa da maquininha)
  const [mach, setMach] = useState(null) // maquininha usada (null = a primeira de Ajustes)
  const [sup, setSup] = useState(null) // insumos editados (null = os padrão dos serviços do carrinho)
  const [clientQ, setClientQ] = useState('')
  const [client, setClient] = useState(null)
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [benefitKind, setBenefitKind] = useState(appointment?.promo ? 'promo' : null)
  const [photo, setPhoto] = useState(null)
  const [done, setDone] = useState(null)
  const [incOpen, setIncOpen] = useState(null) // item com o editor de acréscimo aberto

  useEffect(() => {
    if (!appointment) return
    setBarberId(appointment.barberId)
    const base = appointment.serviceIds.map((id) => services.find((x) => x.id === id))
    const cat = base.reduce((a, s) => a + Number(s?.price || 0), 0)
    const pend = pendingPackages(data.packages, appointment.clientId) // pacote reservado e ainda não pago
    // valor combinado no agendamento (não vale para agendamento de pacote: o total dele é o valor do pacote)
    const pkgAppt = pend.length || /Sessão de pacote/i.test(appointment.notes || '')
    const k = !pkgAppt && cat > 0 && Number(appointment.total) > 0 ? Number(appointment.total) / cat : 1
    setItems([...appointment.serviceIds.map((id, i) => {
      const s = base[i]
      const it = { type: 'service', refId: id, name: s?.name || 'Serviço', price: Math.round(Number(s?.price || 0) * k * 100) / 100, qty: 1 }
      const pk = packageFor(data.packages, appointment.clientId, id) // tem pacote: já entra abatendo
      return pk ? withPkg(it, pk) : it
    }), ...pend.map(packageChargeItem)]) // cobra o pacote agora, junto com a sessão
    setClient(clients.find((c) => c.id === appointment.clientId) || { id: appointment.clientId, name: appointment.clientName, phone: appointment.clientPhone })
  }, [appointment, services, clients, data.packages])

  // correção: carrega a venda como estava
  useEffect(() => {
    if (!editing) return
    setBarberId(editing.barberId)
    setItems(editing.items.filter((x) => x.type !== 'extra' && x.type !== 'surcharge' && x.type !== 'supply').map(({ commission: _c, commissionRate: _r, ...x }) => x))
    setSup(editing.items.filter((x) => x.type === 'supply').map((x) => ({ productId: x.refId, qty: x.qty })))
    const ex = editing.items.find((x) => x.type === 'extra')
    setExtra(ex ? String(ex.price).replace('.', ',') : ''); setExtraNote(ex ? ex.name.replace(/^Adicional:?\s*/, '') : '')
    const man = round2(Number(editing.discount || 0) - Number(editing.benefit?.amount || 0))
    setDiscount(man > 0 ? String(man).replace('.', ',') : ''); setBenefitKind(editing.benefit?.kind || null)
    setPayment(PAY.some((p) => p.value === editing.payment) ? editing.payment : 'pix')
    setClient(clients.find((c) => c.id === editing.clientId) || (editing.clientId ? { id: editing.clientId, name: editing.clientName } : null))
  }, [editing, clients])
  const [payTouched, setPayTouched] = useState(false)

  const barber = barbers.find((b) => b.id === barberId)
  const [catF, setCatF] = useState('') // filtro por categoria (recolhido por padrão)
  const [showF, setShowF] = useState(false)
  const base = (tab === 'service' ? services : products).filter((x) => x.active && !x.internal) // produto de uso interno (insumo) não é vendido
  const catalog = base.filter((x) => norm(x.name).includes(norm(q)) && (!catF || catalogMatch(x, catF)))

  // estoque disponível (corrigindo uma venda, o que ela já tinha tirado volta a contar)
  const avail = (id) => Number(data.products.find((p) => p.id === id)?.stock || 0) + (editing?.items || []).filter((it) => it.type === 'product' && it.refId === id).reduce((a, it) => a + Number(it.qty || 0), 0)
  const overStock = (it, qty) => it.type === 'product' && qty > avail(it.refId)
  const stockMsg = (name, id) => actions.notify(`${name}: só ${avail(id)} em estoque. Se chegou mais, dê entrada no Catálogo antes de vender.`, 'bad')
  const add = (x) => {
    const cur = items.find((it) => it.type === tab && it.refId === x.id)
    if (overStock({ type: tab, refId: x.id }, (cur?.qty || 0) + 1)) return stockMsg(x.name, x.id)
    setItems((list) => {
      const i = list.findIndex((it) => it.type === tab && it.refId === x.id)
      if (i >= 0) return list.map((it, j) => (j === i ? { ...it, qty: it.qty + 1 } : it))
      return [...list, { type: tab, refId: x.id, name: x.name, price: Number(x.price), qty: 1 }]
    })
  }
  const setQty = (i, d) => { const it = items[i]; if (d > 0 && it && overStock(it, it.qty + d)) return stockMsg(it.name, it.refId); setItems((list) => list.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty + d) } : x))) }
  const del = (i) => setItems((list) => list.filter((_, j) => j !== i))
  const pkgOf = (it) => packageFor(data.packages, client?.id, it.refId)
  const togglePkg = (i) => setItems((list) => list.map((it, j) => (j !== i ? it : it.packageId ? withoutPkg(it) : pkgOf(it) ? withPkg(it, pkgOf(it)) : it)))

  const extraAmt = parseMoney(extra)
  const subtotal = round2(items.reduce((a, x) => a + x.price * x.qty, 0) + extraAmt)
  const svcTotal = round2(items.filter((x) => x.type === 'service').reduce((a, x) => a + x.price * x.qty, 0))

  // ---- Benefícios do cliente: Clube, Runas, Aniversário, Promoção ----
  const benefits = useMemo(() => {
    if (editing) return editing.benefit && editing.benefit.kind !== 'permuta' ? [{ ...editing.benefit, reduces: !['club', 'runas'].includes(editing.benefit.kind), icon: Gift }] : [] // correção: mantém o benefício já dado
    const out = []
    if (appointment?.promo) out.push({ kind: 'promo', label: `Promoção ${appointment.promo.label} (-${appointment.promo.pct}%)`, amount: round2(svcTotal * appointment.promo.pct / 100), reduces: true, icon: Sparkles })
    if (!client?.id) return out
    const club = clubOf(client.id, data)
    if (club && club.left > 0) {
      const covered = items.filter((x) => x.type === 'service' && club.plan.serviceIds.includes(x.refId)).reduce((a, x) => a + x.price * x.qty, 0)
      const prd = items.filter((x) => x.type === 'product').reduce((a, x) => a + x.price * x.qty, 0) * (club.plan.productDiscount || 0) / 100
      if (covered + prd > 0) out.push({ kind: 'club', label: `Clube ${club.plan.name}${club.paid ? '' : ' (mensalidade pendente)'}`, amount: round2(covered + prd), reduces: false, icon: Crown })
    }
    const loy = loyaltyOf(client.id, data.sales, data.settings)
    if (loy.enabled && loy.available > 0 && svcTotal > 0) {
      const reward = services.find((x) => x.id === data.settings.loyalty?.rewardServiceId)
      const maxSvc = Math.max(...items.filter((x) => x.type === 'service').map((x) => x.price))
      out.push({ kind: 'runas', label: `Fidelidade: ${reward?.name || 'procedimento'} de presente`, amount: round2(Math.min(reward?.price ?? maxSvc, maxSvc)), reduces: false, icon: Gift })
    }
    const c = clients.find((x) => x.id === client.id)
    if (isBirthdayMonth(c?.birthday) && data.settings.birthdayDiscount > 0 && svcTotal > 0)
      out.push({ kind: 'birthday', label: `Aniversariante (-${data.settings.birthdayDiscount}%)`, amount: round2(svcTotal * data.settings.birthdayDiscount / 100), reduces: true, icon: Gift })
    return out
  }, [appointment, editing, client, data, items, svcTotal, services, clients])
  const benefit = benefits.find((b) => b.kind === benefitKind) || null

  const manual = parseMoney(discount, subtotal)
  const benefitAmt = benefit ? Math.min(benefit.amount, subtotal) : 0
  const permuta = payment === 'permuta'
  const disc = permuta ? subtotal : Math.min(subtotal, manual + benefitAmt)
  const baseTotal = round2(subtotal - disc)
  // maquininha e repasse do juros do parcelado (Ajustes → Financeiro)
  const machines = financeOf(data.settings).machines
  const machineId = machines.some((m) => m.id === mach) ? mach : (editing?.cardMachine && machines.some((m) => m.id === editing.cardMachine) ? editing.cardMachine : machines[0].id)
  const surcharge = editing ? Number(editing.items.find((x) => x.type === 'surcharge')?.price || 0) // correção mantém o juros já cobrado
    : payment === 'credito' && paid1 === '' ? surchargeFor(data.settings, baseTotal, parc, machineId) : 0
  const total = round2(baseTotal + surcharge)
  // Clube e Runas: a casa banca, o barbeiro recebe a comissão cheia
  const commissionBase = Math.min(subtotal, manual + (benefit?.reduces ? benefitAmt : 0))
  const rules = data.settings.privacy?.commission || {} // Ajustes → Regras de comissão
  const discBase = rules.discountReduces === false ? 0 : commissionBase
  const priced = useMemo(() => applyDiscount(priceItems(items, { services, products, barber, materialReduces: !!rules.materialReduces }), discBase), [items, services, products, barber, discBase, rules.materialReduces])
  // adicional entra como um item, com a mesma comissão dos serviços da venda
  const extraRate = rules.extraMode === 'none' ? 0 : rules.extraMode === 'fixed' ? Number(rules.extraRate || 0) : (() => { const sv = priced.filter((x) => x.type === 'service'); return sv.length ? sv.reduce((a, x) => a + Number(x.commissionRate || 0), 0) / sv.length : Number(barber?.serviceRate ?? 50) })()
  const pricedRaw = extraAmt > 0 ? [...priced, { type: 'extra', refId: null, name: extraNote.trim() ? `Adicional: ${extraNote.trim()}` : 'Adicional', price: extraAmt, qty: 1, commissionRate: round2(extraRate), commission: round2(extraAmt * extraRate / 100) }] : priced
  const pricedBase = [...(permuta ? pricedRaw.map((x) => ({ ...x, commission: 0 })) : pricedRaw),
    ...(surcharge > 0 ? [{ type: 'surcharge', refId: null, name: `Juros do parcelamento${editing ? '' : ` ${parc}x`}`, price: surcharge, qty: 1, commissionRate: 0, commission: 0 }] : [])]
  // crédito em haver: se o saldo da cliente cobre a conta, já vem selecionado "Saldo da cliente"
  const clientCredit = isDesk(session) ? Number(data.clients.find((x) => x.id === client?.id)?.credit || 0) : 0 // saldo só a gestão (e a recepção) movimenta
  useEffect(() => { if (!editing && !payTouched && total > 0 && clientCredit >= total && payment !== 'saldo') setPayment('saldo') }, [editing, payTouched, total, clientCredit, payment])

  const clientMatches = clientQ.length >= 2
    ? clients.filter((c) => c.name.toLowerCase().includes(clientQ.toLowerCase()) || onlyDigits(c.phone).includes(onlyDigits(clientQ) || '###')
      || (onlyDigits(clientQ).length >= 3 && onlyDigits(clientQ).length <= 4 && String(c.phoneLast4 || '').endsWith(onlyDigits(clientQ)))).slice(0, 5) // telefone oculto: 4 últimos
    : []

  // taxa da maquininha sobre a parte paga no cartão (débito ou crédito, à vista ou parcelado)
  const p1Now = paid1 === '' ? total : Math.min(parseMoney(paid1), total)
  const restNow = Math.round((total - p1Now) * 100) / 100
  const usesCredit = payment === 'credito' || (restNow > 0 && rest === 'credito')
  const usesCard = isCard(payment) || (restNow > 0 && isCard(rest))
  const cardFee = editing && !payTouched ? Number(editing.cardFee || 0) : Math.round((feeAmount(data.settings, payment, editing ? total : p1Now, parc, machineId) + (!editing && restNow > 0 && isCard(rest) ? feeAmount(data.settings, rest, restNow, parc, machineId) : 0)) * 100) / 100
  const cardInfo = { installments: usesCredit ? parc : null, cardFee, cardMachine: usesCard ? machineId : null }
  // Ajustes: "taxa do cartão reduz a comissão" → a profissional recebe sobre o líquido
  // só a parte da taxa que a clínica absorve (com juros repassado, a cliente já pagou a taxa → não reduz)
  const pricedAll = rules.feeReduces && !permuta ? applyCardFee(pricedBase, total - surcharge, Math.max(0, cardFee - surcharge)) : pricedBase
  const commission = round2(pricedAll.reduce((a, x) => a + x.commission, 0))
  const supplies = sup ?? defaultSupplies(items, services) // insumos que saem do estoque nesta venda
  const saleSubtotal = round2(subtotal + surcharge) // subtotal − desconto = total (com o juros repassado)

  const finish = async () => {
    if (!items.length || !barber) return
    if (editing) {
      setSaving(true)
      try {
        await actions.editSale(editing.id, { barberId: barber.id, items: [...pricedAll, ...supplyItems(supplies, data.products)], subtotal: saleSubtotal, discount: disc, total, payment: payTouched ? payment : editing.payment, commissionTotal: commission, benefit: benefit ? { kind: benefit.kind, label: benefit.label, amount: benefitAmt } : null })
        // parcelas/taxa do cartão (colunas novas: se o SQL ainda não rodou, a correção da venda continua valendo)
        if (payTouched) await actions.patch('sales', editing.id, cardInfo).catch(() => {})
        onDone?.()
      } finally { setSaving(false) }
      return
    }
    const fullC = client && data.clients.find((x) => x.id === client.id)
    const p1 = paid1 === '' ? total : Math.min(parseMoney(paid1), total)
    const restAmt = Math.round((total - p1) * 100) / 100
    const fromSaldo = (payment === 'saldo' ? p1 : 0) + (restAmt > 0 && rest === 'saldo' ? restAmt : 0)
    const toDebt = restAmt > 0 && rest === 'fiado' ? restAmt : 0
    if ((fromSaldo > 0 || toDebt > 0) && !fullC) return actions.notify('Escolha a cliente para usar saldo ou deixar a pagar', 'bad')
    if (fromSaldo > 0 && Number(fullC.credit || 0) < fromSaldo) return actions.notify(`Saldo insuficiente: ${money(Number(fullC?.credit || 0))}`, 'bad')
    const payStr = restAmt > 0 ? `${payment} ${money(p1)} + ${rest === 'fiado' ? 'a pagar' : rest} ${money(restAmt)}` : total === 0 && items.some((x) => x.packageId) ? 'pacote' : payment
    setSaving(true)
    try {
      let c = client
      if (!c && clientQ.trim() && onlyDigits(newPhone).length >= 10) c = await actions.upsertClient({ name: clientQ.trim(), phone: newPhone })
      const sale = await actions.createSale({
        date: today(), time: toHHMM(nowMin()), barberId: barber.id, clientId: c?.id || null, clientName: c?.name || clientQ.trim() || 'Cliente avulso',
        appointmentId: appointment?.id || null, items: [...pricedAll, ...supplyItems(supplies, data.products)], subtotal: saleSubtotal, discount: disc, total, payment: payStr, commissionTotal: commission, ...cardInfo,
        benefit: permuta ? { kind: 'permuta', label: 'Permuta', amount: subtotal } : benefit ? { kind: benefit.kind, label: benefit.label, amount: benefitAmt } : null, loyaltyRedeemed: !permuta && benefit?.kind === 'runas',
      })
      // pacote cobrado nesta venda: deixa de estar "pendente" (fica com a forma de pagamento usada)
      for (const it of items.filter((x) => x.type === 'package')) await actions.patch('packages', it.refId, { payment: payStr })
      if (photo) await actions.savePhoto({ barberId: barber.id, clientId: c?.id || null, appointmentId: appointment?.id || null, dataUrl: photo, caption: items.filter((x) => x.type === 'service').map((x) => x.name).join(' + ') })
      if ((fromSaldo > 0 || toDebt > 0) && fullC) { const { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt } = fullC; await actions.upsert('clients', { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt, credit: Math.round((Number(fullC.credit || 0) - fromSaldo - toDebt) * 100) / 100,
        // fiado: vencimento = hoje + prazo de Ajustes (se já devia, mantém o vencimento mais antigo)
        ...(toDebt > 0 ? { debtDue: Number(fullC.credit || 0) < 0 && fullC.debtDue ? fullC.debtDue : addDays(today(), financeOf(data.settings).fiado.dias) } : {}) }, toDebt > 0 ? `Ficou a pagar ${money(toDebt)}` : null) }
      setPaid1(''); setRest('fiado'); setParc(1); setMach(null); setSup(null)
      setDone({ sale, client: c, phone: c?.phone || newPhone })
      setItems([]); setDiscount(''); setExtra(''); setExtraNote(''); setClient(null); setClientQ(''); setNewPhone(''); setBenefitKind(null); setPhoto(null)
    } finally { setSaving(false) }
  }

  const pickPhoto = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try { const { dataUrl } = await compressImage(f); setPhoto(dataUrl) } catch (er) { actions.notify(er.message, 'bad') }
    e.target.value = ''
  }

  if (done) {
    const link = `${location.origin}${location.pathname}#/avaliar/${done.sale.id}`
    const first = (done.sale.clientName || '').split(' ')[0]
    const msg = fillMsg(data.settings, 'review', { nome: first, profissional: barber?.name.split(' ')[0], link })
    return (
      <div className="sale-done fade-in">
        <div className="success-ico"><Check size={36} strokeWidth={3} /></div>
        <h3>Venda finalizada · {money(done.sale.total)}</h3>
        {showComm ? <p className="muted">Comissão de {barber?.name.split(' ')[0]}: <b>{money(done.sale.commissionTotal)}</b>{done.sale.benefit ? ` · ${done.sale.benefit.label}` : ''}</p> : done.sale.benefit ? <p className="muted">{done.sale.benefit.label}</p> : null}
        <ReceiptButtons sales={[done.sale]} phone={done.phone} />
        {onlyDigits(done.phone).length >= 10 && (
          <a className="btn btn-wa btn-lg" href={waLink(done.phone, msg)} target="_blank" rel="noreferrer"><Star size={18} /> Pedir avaliação no WhatsApp</a>
        )}
        <Button variant="ghost" onClick={() => { setDone(null); onDone?.() }}>{appointment ? 'Fechar' : 'Nova venda'}</Button>
      </div>
    )
  }

  return (
    <div className="pdv">
      <div className="pdv-catalog">
        <div className="pdv-tools">
          <Segmented value={tab} onChange={(t) => { setTab(t); setCatF('') }} options={[{ value: 'service', label: 'Serviços' }, { value: 'product', label: 'Produtos' }]} />
        </div>
        <CatalogFilter compact q={q} setQ={setQ} cats={catalogCats(base, tab === 'service').filter((c) => c.value !== '__off')} cat={catF} setCat={setCatF} show={showF} setShow={setShowF} placeholder={tab === 'service' ? 'Buscar serviço' : 'Buscar produto'} />
        <CatalogGroups items={catalog} storageKey={`dcb:caixa-grupos:${tab}`} forceOpen={!!q.trim() || !!catF} noun={tab === 'service' ? 'serviços' : 'produtos'} wrapClass="tiles">
          {(x) => (
            <button key={x.id} className="tile" onClick={() => add(x)}>
              <span className="tile-ico">{tab === 'service' ? <Sparkles size={18} /> : <Package size={18} />}</span>
              <b>{x.name}</b>
              <span className="tile-price">{money(x.price)}</span>
              {tab === 'product' && <small className={cls(Number(x.stock) <= 3 && 'low')}>{qtyUnit(x.stock, x)} em estoque</small>}
            </button>
          )}
        </CatalogGroups>
        {!catalog.length && <p className="muted small">Nada encontrado. Tente outra busca ou limpe o filtro.</p>}
      </div>

      <div className="pdv-cart">
        <Field label="Profissional">
          {lockBarber ? (
            <div className="locked"><Avatar name={barber?.name} color={barber?.color} photo={barber?.photo} size={28} /> {barber?.name}</div>
          ) : (
            <div className="barber-pills">
              {activeBarbers.map((b) => (
                <button key={b.id} className={cls('pill', b.id === barberId && 'on')} onClick={() => setBarberId(b.id)}>
                  <Avatar name={b.name} color={b.color} photo={b?.photo} size={22} /> {b.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Cliente">
          {client ? (
            <div className="locked">
              <UserRound size={18} /> <span>{client.name} <small>{phoneLabel(clients.find((x) => x.id === client.id) || client)}</small></span>
              {!appointment && !editing && <button className="link" onClick={() => setClient(null)}>trocar</button>}
            </div>
          ) : (
            <div className="client-pick">
              <input placeholder="Nome ou telefone (opcional)" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
              {clientMatches.length > 0 && (
                <div className="suggest">
                  {clientMatches.map((c) => <button key={c.id} onClick={() => { setClient(c); setClientQ('') }}>{c.name} <small>{phoneLabel(c)}</small></button>)}
                </div>
              )}
              {clientQ.length >= 2 && clientMatches.length === 0 && (
                <input className="mt" placeholder="WhatsApp do novo cliente" inputMode="tel" value={maskPhone(newPhone)} onChange={(e) => setNewPhone(onlyDigits(e.target.value))} />
              )}
            </div>
          )}
        </Field>

        <div className="cart-lines">
          {items.length === 0 && <p className="muted center">Toque nos serviços e produtos para adicionar.</p>}
          {!editing && pendingPackages(data.packages, client?.id).filter((p) => !items.some((x) => x.type === 'package' && x.refId === p.id)).map((p) => (
            <button key={p.id} type="button" className="pill pkg-use" onClick={() => setItems((l) => [...l, packageChargeItem(p)])}>+ Cobrar pacote reservado: {p.name} · {money(p.price)}</button>
          ))}
          {items.map((it, i) => {
            const canInc = (it.type === 'service' || it.type === 'product') && !it.packageId // sessão de pacote sai R$ 0: sem acréscimo
            const key = `${it.type}-${it.refId}`
            return (
              <div key={key} className="line">
                <div className="line-name"><b>{it.name}</b><small>{it.packageId ? `pacote · comissão sobre ${money(it.unit)}` : Number(it.increase) > 0 ? `${money(it.basePrice)} + ${money(it.increase)} acréscimo` : money(it.price)}{showComm ? ` · comissão ${priced[i]?.commissionRate ?? 0}%` : ''}</small>
                  {Number(it.increase) > 0 && it.increaseNote && <small className="inc-note">Acréscimo: {it.increaseNote}</small>}
                  {it.type === 'service' && (it.packageId || pkgOf(it)) && <button className={cls('pill pkg-use', it.packageId && 'on')} onClick={() => togglePkg(i)}>{it.packageId ? '✓ Abatendo do pacote' : `Usar pacote (restam ${pkgOf(it).left})`}</button>}
                </div>
                <div className="qty">
                  <button onClick={() => setQty(i, -1)} aria-label="Menos"><Minus size={14} /></button>
                  <span>{it.qty}</span>
                  <button onClick={() => setQty(i, 1)} aria-label="Mais"><Plus size={14} /></button>
                </div>
                {canInc && <IncreaseButton item={it} open={incOpen === key} onToggle={() => setIncOpen(incOpen === key ? null : key)} />}
                <b className="line-total">{money(it.price * it.qty)}</b>
                <button className="icon-btn sm" onClick={() => del(i)} aria-label="Remover"><Trash2 size={16} /></button>
                {canInc && incOpen === key && <IncreaseEditor item={it} onApply={(nx) => setItems((list) => list.map((x, j) => (j === i ? nx : x)))} onClose={() => setIncOpen(null)} />}
              </div>
            )
          })}
        </div>
        {/* insumos dos procedimentos: dão baixa no estoque sem cobrar (vem do "Estoque automático" do serviço, editável) */}
        {(supplies.length > 0 || items.some((x) => x.type === 'service')) && (
          <SuppliesEditor value={supplies} onChange={setSup} products={data.products} hint="Produtos usados no atendimento: saem do estoque, não são cobrados da cliente. Ajuste se usou mais ou menos." />
        )}

        {benefits.length > 0 && (
          <div className="benefits">
            <span className="field-label">Benefícios do cliente</span>
            {benefits.map((b) => (
              <button key={b.kind} className={cls('benefit', benefitKind === b.kind && 'on')} onClick={() => setBenefitKind(benefitKind === b.kind ? null : b.kind)}>
                <b.icon size={16} /> <span>{b.label}</span> <b>-{money(b.amount)}</b>
              </button>
            ))}
          </div>
        )}

        <div className="photo-pick">
          {photo ? (
            <div className="photo-prev"><img src={photo} alt="Foto do resultado" /><button className="icon-btn sm" onClick={() => setPhoto(null)} aria-label="Remover foto"><X size={16} /></button><span>Vai para o portfólio de {barber?.name.split(' ')[0]}</span></div>
          ) : (
            <label className="btn btn-ghost btn-sm btn-block"><Camera size={15} /> Foto antes/depois (portfólio)<input type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} /></label>
          )}
        </div>

        <div className="pay">
          {PAY.filter((p) => p.value !== 'saldo' || clientCredit > 0 || payment === 'saldo').map((p) => (
            <button key={p.value} className={cls('pay-btn', payment === p.value && 'on')} onClick={() => { setPayment(p.value); setPayTouched(true) }}>
              <p.icon size={18} /> {p.label}{p.value === 'saldo' ? ` (${money(clientCredit)})` : ''}
            </button>
          ))}
        </div>
        {usesCard && (!editing || payTouched) && (
          <div className="card-fee-box">
            {machines.length > 1 && (
              <Field label="Maquininha">
                <select value={machineId} onChange={(e) => setMach(e.target.value)}>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              </Field>
            )}
            {usesCredit && (
              <Field label="Parcelas no crédito">
                <select value={parc} onChange={(e) => setParc(Number(e.target.value))}>
                  {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => {
                    // valor de cada parcela já com o juros repassado (quando ligado em Ajustes)
                    const base = payment === 'credito' ? (editing ? total : paid1 === '' ? baseTotal + surchargeFor(data.settings, baseTotal, n, machineId) : p1Now) : restNow
                    return <option key={n} value={n}>{n === 1 ? `À vista (1x) ${money(base)}` : `${n}x de ${money(base / n)}`} · taxa {String(feeRate(data.settings, 'credito', n, machineId)).replace('.', ',')}%</option>
                  })}
                </select>
              </Field>
            )}
            {surcharge > 0 && !editing && <small>Juros repassado para a cliente: <b>+{money(surcharge)}</b> (total {money(total)})</small>}
            <small className="muted">{cardFee > 0 ? <>Taxa da maquininha: <b>{money(cardFee)}</b> · entra líquido <b>{money(total - cardFee)}</b> (a taxa sai no Lucro real)</> : <>Sem taxa cadastrada para {usesCredit ? `crédito ${parc}x` : 'débito'}{machines.length > 1 ? ' nesta maquininha' : ''}. Cadastre em <b>Ajustes → Financeiro</b>.</>}</small>
          </div>
        )}
        {editing ? <p className="muted small mt-sm">Pagamento registrado: <b>{PAYMENTS[editing.payment] || editing.payment}</b>{editing.installments > 1 ? ` · ${editing.installments}x` : ''}{Number(editing.cardFee) > 0 ? ` · taxa ${money(editing.cardFee)}` : ''}. Toque numa forma acima só se quiser trocar.</p> : <div className="form-grid mt-sm">
          <Field label="Valor nesta forma" hint="Vazio = valor total"><input inputMode="decimal" value={paid1} onChange={(e) => setPaid1(e.target.value)} placeholder={money(total)} /></Field>
          {paid1 !== '' && parseMoney(paid1) < total && (
            <Field label={`Restante ${money(Math.round((total - parseMoney(paid1)) * 100) / 100)}`}>
              <select value={rest} onChange={(e) => setRest(e.target.value)}>
                <option value="fiado">Pagar depois (fiado)</option>
                {PAY.filter((p) => p.value !== payment).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
          )}
        </div>}

        <div className="totals">
          <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {benefit && <div className="ben-line"><span>{benefit.label}</span><span>-{money(benefitAmt)}</span></div>}
          <div className="disc"><span>Adicional (R$)</span><input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0,00" /></div>
          {extraAmt > 0 && <div className="disc"><span>Motivo do adicional</span><input value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Ex.: cabelo longo, material extra" /></div>}
          <div className="disc"><span>Desconto (R$ ou %)</span><input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00 ou 10%" /></div>
          {(manual > 0 || extraAmt > 0) && <div className="ben-line"><span>{[extraAmt > 0 && `Adicional +${money(extraAmt)}`, manual > 0 && `Desconto -${money(Math.min(manual, subtotal))}`].filter(Boolean).join(' · ')}</span><span /></div>}
          {surcharge > 0 && <div className="ben-line"><span>Juros do parcelamento (repasse)</span><span>+{money(surcharge)}</span></div>}
          <div className="grand"><span>Total</span><b>{money(total)}</b></div>
          {showComm && <div className="comm"><span>Comissão de {barber?.name.split(' ')[0]}</span><b>{money(commission)}</b></div>}
        </div>

        <Button size="lg" block icon={Check} disabled={!items.length || saving} onClick={finish}>
          {saving ? 'Salvando…' : editing ? `Salvar correção · ${money(total)}` : `Finalizar · ${money(total)}`}
        </Button>
      </div>
    </div>
  )
}
