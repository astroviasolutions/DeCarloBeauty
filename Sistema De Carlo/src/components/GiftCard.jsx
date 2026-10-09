import { useState } from 'react'
import { Gift, Search } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Modal } from './ui'
import { norm } from './CatalogFilter'
import { saveCredit } from '../lib/credit'
import { feeAmount, financeOf, isCard } from '../lib/cardFees'
import { bookingLink, msg as fillMsg } from '../lib/messages'
import { fmtPhone, maskPhone, money, nowMin, onlyDigits, parseMoney, round2, today, toHHMM, waLink } from '../lib/utils'

/**
 * Vale-presente: alguém paga hoje (entra no faturamento) e a presenteada ganha o valor como crédito em haver,
 * usado no Caixa em "Saldo da cliente" (aí não conta de novo no faturamento).
 */
export default function GiftCard({ onClose }) {
  const { data, actions, session } = useStore()
  const [buyer, setBuyer] = useState('')
  const [q, setQ] = useState('')
  const [to, setTo] = useState(null) // cliente já cadastrada
  const [phone, setPhone] = useState('')
  const [value, setValue] = useState('')
  const [payment, setPayment] = useState('pix')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const v = parseMoney(value)
  const hits = !to && q.trim().length >= 2 ? data.clients.filter((c) => norm(c.name).includes(norm(q)) || (onlyDigits(q).length >= 3 && onlyDigits(c.phone).includes(onlyDigits(q)))).slice(0, 6) : []
  const machine = financeOf(data.settings).machines[0]
  const fee = isCard(payment) ? feeAmount(data.settings, payment, v, 1, machine.id) : 0
  const ok = v > 0 && (to || (q.trim() && onlyDigits(phone).length >= 10))
  const save = async () => {
    if (!ok) return
    setSaving(true)
    try {
      const rec = to || await actions.upsertClient({ name: q.trim(), phone })
      const fresh = data.clients.find((c) => c.id === rec.id) || rec
      const barberId = session?.barberId || data.barbers.find((b) => b.active)?.id
      await actions.createSale({ date: today(), time: toHHMM(nowMin()), barberId, clientId: null, clientName: buyer.trim() || `Vale-presente p/ ${rec.name}`, appointmentId: null,
        items: [{ type: 'credit', refId: rec.id, name: `Vale-presente para ${rec.name}`, price: v, qty: 1, commissionRate: 0, commission: 0 }],
        subtotal: v, discount: 0, total: v, payment, commissionTotal: 0, benefit: null, loyaltyRedeemed: false, installments: payment === 'credito' ? 1 : null, cardFee: fee, cardMachine: isCard(payment) ? machine.id : null })
      await saveCredit(actions, fresh, round2(Number(fresh.credit || 0) + v), `Vale-presente de ${money(v)} para ${rec.name}`)
      setDone({ rec, v })
    } finally { setSaving(false) }
  }
  if (done) {
    const text = fillMsg(data.settings, 'giftCard', { nome: done.rec.name.split(' ')[0], valor: money(done.v), de: buyer.trim() ? `, presente de ${buyer.trim()}` : '', link: bookingLink() })
    return (
      <Modal open onClose={onClose} title="Vale-presente criado">
        <p><b>{money(done.v)}</b> de crédito para <b>{done.rec.name}</b>. Ela usa no Caixa em "Saldo da cliente".</p>
        {onlyDigits(done.rec.phone).length >= 10 && <a className="btn btn-wa btn-block mt" href={waLink(done.rec.phone, text)} target="_blank" rel="noreferrer"><Gift size={18} /> Avisar {done.rec.name.split(' ')[0]} no WhatsApp</a>}
        <Button variant="ghost" block className="mt-sm" onClick={onClose}>Fechar</Button>
      </Modal>
    )
  }
  return (
    <Modal open onClose={onClose} title="Vender vale-presente" footer={<Button block icon={Gift} disabled={!ok || saving} onClick={save}>{saving ? 'Salvando…' : v > 0 ? `Vender vale de ${money(v)}` : 'Informe o valor'}</Button>}>
      <div className="form-grid">
        <Field label="Quem está comprando" hint="Opcional"><input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Ex.: Marcos (marido)" /></Field>
        <Field label="Valor do vale (R$)"><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></Field>
      </div>
      <Field label="Para quem é (presenteada)">
        {to ? <div className="picked-client"><b>{to.name}</b><small>{fmtPhone(to.phone)}{Number(to.credit || 0) ? ` · saldo atual ${money(to.credit)}` : ''}</small><button type="button" className="link-btn" onClick={() => setTo(null)}>Trocar</button></div> : <>
          <div className="search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou telefone da cliente" /></div>
          {hits.length > 0 && <div className="client-hits">{hits.map((c) => <button key={c.id} type="button" onClick={() => setTo(c)}><b>{c.name}</b><small>{fmtPhone(c.phone)}</small></button>)}</div>}
        </>}
      </Field>
      {!to && q.trim().length >= 2 && !hits.length && <Field label="WhatsApp da presenteada" hint="Ela é nova: o cadastro é criado"><input inputMode="tel" value={maskPhone(phone)} onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))} placeholder="(41) 99999-9999" /></Field>}
      <Field label="Pago com"><select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></Field>
      <p className="muted small mt-sm">O valor entra hoje no faturamento{fee > 0 ? ` (taxa do cartão ${money(fee)})` : ''} e vira crédito em haver da presenteada. Quando ela usar, não conta de novo.</p>
    </Modal>
  )
}
