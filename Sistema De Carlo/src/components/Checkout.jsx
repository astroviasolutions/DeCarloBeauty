import { useEffect, useMemo, useState } from 'react'
import { Banknote, Camera, Repeat, Check, CreditCard, Crown, Gift, Minus, Package, Plus, QrCode, Search, Sparkles, Star, Trash2, UserRound, X } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Segmented } from './ui'
import { applyDiscount, priceItems } from '../lib/commission'
import { clubOf, isBirthdayMonth, loyaltyOf } from '../lib/loyalty'
import { compressImage } from '../lib/image'
import { cls, fmtPhone, maskPhone, money, onlyDigits, round2, today, nowMin, toHHMM, waLink , parseMoney, PAYMENTS } from '../lib/utils'
import { msg as fillMsg } from '../lib/messages'
import { packageFor } from './Packages'
import ReceiptButtons from './Receipt'
import { saveCredit } from '../lib/credit'

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
  const activeBarbers = barbers.filter((b) => b.active)

  const [tab, setTab] = useState('service')
  const [q, setQ] = useState('')
  const [barberId, setBarberId] = useState(presetBarberId || appointment?.barberId || activeBarbers[0]?.id)
  const [items, setItems] = useState([])
  const [discount, setDiscount] = useState('')
  const [extra, setExtra] = useState('') // adicional (valor a mais)
  const [extraNote, setExtraNote] = useState('')
  const [payment, setPayment] = useState('pix')
  const [clientQ, setClientQ] = useState('')
  const [client, setClient] = useState(null)
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [benefitKind, setBenefitKind] = useState(appointment?.promo ? 'promo' : null)
  const [photo, setPhoto] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (!appointment) return
    setBarberId(appointment.barberId)
    const base = appointment.serviceIds.map((id) => services.find((x) => x.id === id))
    const cat = base.reduce((a, s) => a + Number(s?.price || 0), 0)
    const k = cat > 0 && Number(appointment.total) > 0 ? Number(appointment.total) / cat : 1 // valor combinado no agendamento
    setItems(appointment.serviceIds.map((id, i) => {
      const s = base[i]
      const it = { type: 'service', refId: id, name: s?.name || 'Serviço', price: Math.round(Number(s?.price || 0) * k * 100) / 100, qty: 1 }
      const pk = packageFor(data.packages, appointment.clientId, id) // tem pacote: já entra abatendo
      return pk ? withPkg(it, pk) : it
    }))
    setClient(clients.find((c) => c.id === appointment.clientId) || { id: appointment.clientId, name: appointment.clientName, phone: appointment.clientPhone })
  }, [appointment, services, clients, data.packages])

  // correção: carrega a venda como estava
  useEffect(() => {
    if (!editing) return
    setBarberId(editing.barberId)
    setItems(editing.items.filter((x) => x.type !== 'extra').map(({ commission: _c, commissionRate: _r, ...x }) => x))
    const ex = editing.items.find((x) => x.type === 'extra')
    setExtra(ex ? String(ex.price).replace('.', ',') : ''); setExtraNote(ex ? ex.name.replace(/^Adicional:?\s*/, '') : '')
    const man = round2(Number(editing.discount || 0) - Number(editing.benefit?.amount || 0))
    setDiscount(man > 0 ? String(man).replace('.', ',') : ''); setBenefitKind(editing.benefit?.kind || null)
    setPayment(PAY.some((p) => p.value === editing.payment) ? editing.payment : 'pix')
    setClient(clients.find((c) => c.id === editing.clientId) || (editing.clientId ? { id: editing.clientId, name: editing.clientName } : null))
  }, [editing, clients])
  const [payTouched, setPayTouched] = useState(false)

  const barber = barbers.find((b) => b.id === barberId)
  const catalog = (tab === 'service' ? services : products).filter((x) => x.active && x.name.toLowerCase().includes(q.toLowerCase()))

  const add = (x) => setItems((list) => {
    const i = list.findIndex((it) => it.type === tab && it.refId === x.id)
    if (i >= 0) return list.map((it, j) => (j === i ? { ...it, qty: it.qty + 1 } : it))
    return [...list, { type: tab, refId: x.id, name: x.name, price: Number(x.price), qty: 1 }]
  })
  const setQty = (i, d) => setItems((list) => list.map((it, j) => (j === i ? { ...it, qty: Math.max(1, it.qty + d) } : it)))
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
  const total = round2(subtotal - disc)
  // Clube e Runas: a casa banca, o barbeiro recebe a comissão cheia
  const commissionBase = Math.min(subtotal, manual + (benefit?.reduces ? benefitAmt : 0))
  const rules = data.settings.privacy?.commission || {} // Ajustes → Regras de comissão
  const discBase = rules.discountReduces === false ? 0 : commissionBase
  const priced = useMemo(() => applyDiscount(priceItems(items, { services, products, barber }), discBase), [items, services, products, barber, discBase])
  // adicional entra como um item, com a mesma comissão dos serviços da venda
  const extraRate = rules.extraMode === 'none' ? 0 : rules.extraMode === 'fixed' ? Number(rules.extraRate || 0) : (() => { const sv = priced.filter((x) => x.type === 'service'); return sv.length ? sv.reduce((a, x) => a + Number(x.commissionRate || 0), 0) / sv.length : Number(barber?.serviceRate ?? 50) })()
  const pricedRaw = extraAmt > 0 ? [...priced, { type: 'extra', refId: null, name: extraNote.trim() ? `Adicional: ${extraNote.trim()}` : 'Adicional', price: extraAmt, qty: 1, commissionRate: round2(extraRate), commission: round2(extraAmt * extraRate / 100) }] : priced
  const pricedAll = permuta ? pricedRaw.map((x) => ({ ...x, commission: 0 })) : pricedRaw
  const commission = round2(pricedAll.reduce((a, x) => a + x.commission, 0))
  // crédito em haver: se o saldo da cliente cobre a conta, já vem selecionado "Saldo da cliente"
  const clientCredit = session?.role === 'admin' ? Number(data.clients.find((x) => x.id === client?.id)?.credit || 0) : 0 // saldo só a gestão movimenta
  useEffect(() => { if (!editing && !payTouched && total > 0 && clientCredit >= total && payment !== 'saldo') setPayment('saldo') }, [editing, payTouched, total, clientCredit, payment])

  const clientMatches = clientQ.length >= 2
    ? clients.filter((c) => c.name.toLowerCase().includes(clientQ.toLowerCase()) || onlyDigits(c.phone).includes(onlyDigits(clientQ) || '###')).slice(0, 5)
    : []

  const finish = async () => {
    if (!items.length || !barber) return
    if (editing) {
      setSaving(true)
      try {
        await actions.editSale(editing.id, { barberId: barber.id, items: pricedAll, subtotal, discount: disc, total, payment: payTouched ? payment : editing.payment, commissionTotal: commission, benefit: permuta ? { kind: 'permuta', label: 'Permuta', amount: subtotal } : benefit && benefit.kind !== 'permuta' ? { kind: benefit.kind, label: benefit.label, amount: benefitAmt } : null })
        onDone?.()
      } finally { setSaving(false) }
      return
    }
    const fullC = client && data.clients.find((x) => x.id === client.id)
    const fromSaldo = payment === 'saldo' ? total : 0
    if (fromSaldo > 0 && !fullC) return actions.notify('Escolha a cliente para usar o saldo', 'bad')
    if (fromSaldo > 0 && Number(fullC.credit || 0) < fromSaldo) return actions.notify(`Saldo insuficiente: ${money(Number(fullC?.credit || 0))}`, 'bad')
    const payStr = total === 0 && items.some((x) => x.packageId) ? 'pacote' : payment
    setSaving(true)
    try {
      let c = client
      if (!c && clientQ.trim() && onlyDigits(newPhone).length >= 10) c = await actions.upsertClient({ name: clientQ.trim(), phone: newPhone })
      const sale = await actions.createSale({
        date: today(), time: toHHMM(nowMin()), barberId: barber.id, clientId: c?.id || null, clientName: c?.name || clientQ.trim() || 'Cliente avulso',
        appointmentId: appointment?.id || null, items: pricedAll, subtotal, discount: disc, total, payment: payStr, commissionTotal: commission,
        benefit: permuta ? { kind: 'permuta', label: 'Permuta', amount: subtotal } : benefit ? { kind: benefit.kind, label: benefit.label, amount: benefitAmt } : null, loyaltyRedeemed: !permuta && benefit?.kind === 'runas',
      })
      if (fromSaldo > 0 && fullC) await saveCredit(actions, fullC, Number(fullC.credit || 0) - fromSaldo, null)
      if (photo) await actions.savePhoto({ barberId: barber.id, clientId: c?.id || null, appointmentId: appointment?.id || null, dataUrl: photo, caption: items.filter((x) => x.type === 'service').map((x) => x.name).join(' + ') })
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
        <p className="muted">Comissão de {barber?.name.split(' ')[0]}: <b>{money(done.sale.commissionTotal)}</b>{done.sale.benefit ? ` · ${done.sale.benefit.label}` : ''}</p>
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
          <Segmented value={tab} onChange={setTab} options={[{ value: 'service', label: 'Serviços' }, { value: 'product', label: 'Produtos' }]} />
          <div className="search"><Search size={16} /><input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="tiles">
          {catalog.map((x) => (
            <button key={x.id} className="tile" onClick={() => add(x)}>
              <span className="tile-ico">{tab === 'service' ? <Sparkles size={18} /> : <Package size={18} />}</span>
              <b>{x.name}</b>
              <span className="tile-price">{money(x.price)}</span>
              {tab === 'product' && <small className={cls(Number(x.stock) <= 3 && 'low')}>{x.stock} em estoque</small>}
            </button>
          ))}
        </div>
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
              <UserRound size={18} /> <span>{client.name} <small>{fmtPhone(client.phone)}</small></span>
              {!appointment && !editing && <button className="link" onClick={() => setClient(null)}>trocar</button>}
            </div>
          ) : (
            <div className="client-pick">
              <input placeholder="Nome ou telefone (opcional)" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
              {clientMatches.length > 0 && (
                <div className="suggest">
                  {clientMatches.map((c) => <button key={c.id} onClick={() => { setClient(c); setClientQ('') }}>{c.name} <small>{fmtPhone(c.phone)}</small></button>)}
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
          {items.map((it, i) => (
            <div key={`${it.type}-${it.refId}`} className="line">
              <div className="line-name"><b>{it.name}</b><small>{it.packageId ? `pacote · comissão sobre ${money(it.unit)}` : money(it.price)} · comissão {priced[i]?.commissionRate ?? 0}%</small>
                {it.type === 'service' && (it.packageId || pkgOf(it)) && <button className={cls('pill pkg-use', it.packageId && 'on')} onClick={() => togglePkg(i)}>{it.packageId ? '✓ Abatendo do pacote' : `Usar pacote (restam ${pkgOf(it).left})`}</button>}
              </div>
              <div className="qty">
                <button onClick={() => setQty(i, -1)} aria-label="Menos"><Minus size={14} /></button>
                <span>{it.qty}</span>
                <button onClick={() => setQty(i, 1)} aria-label="Mais"><Plus size={14} /></button>
              </div>
              <b className="line-total">{money(it.price * it.qty)}</b>
              <button className="icon-btn sm" onClick={() => del(i)} aria-label="Remover"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

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
        {editing && <p className="muted small mt-sm">Pagamento registrado: <b>{PAYMENTS[editing.payment] || editing.payment}</b>. Toque numa forma acima só se quiser trocar.</p>}

        <div className="totals">
          <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {benefit && <div className="ben-line"><span>{benefit.label}</span><span>-{money(benefitAmt)}</span></div>}
          <div className="disc"><span>Adicional (R$)</span><input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0,00" /></div>
          {extraAmt > 0 && <div className="disc"><span>Motivo do adicional</span><input value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Ex.: cabelo longo, material extra" /></div>}
          <div className="disc"><span>Desconto (R$ ou %)</span><input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00 ou 10%" /></div>
          {(manual > 0 || extraAmt > 0) && <div className="ben-line"><span>{[extraAmt > 0 && `Adicional +${money(extraAmt)}`, manual > 0 && `Desconto -${money(Math.min(manual, subtotal))}`].filter(Boolean).join(' · ')}</span><span /></div>}
          <div className="grand"><span>Total</span><b>{money(total)}</b></div>
          <div className="comm"><span>Comissão de {barber?.name.split(' ')[0]}</span><b>{money(commission)}</b></div>
        </div>

        <Button size="lg" block icon={Check} disabled={!items.length || saving} onClick={finish}>
          {saving ? 'Salvando…' : editing ? `Salvar correção · ${money(total)}` : `Finalizar · ${money(total)}`}
        </Button>
      </div>
    </div>
  )
}
