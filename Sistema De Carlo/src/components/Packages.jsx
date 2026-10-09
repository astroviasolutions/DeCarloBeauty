import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Modal } from './ui'
import { cls, fmtDate, money, nowMin, parseMoney, round2, today, toHHMM } from '../lib/utils'

/**
 * Pacotes de sessões: a cliente paga o valor integral na compra (entra no caixa uma vez, sem comissão)
 * e cada sessão é abatida no atendimento com R$ 0 no caixa; a comissão sai na sessão (pacote ÷ sessões).
 */
export const pkgLeft = (p) => (p.items || []).reduce((a, x) => a + Math.max(0, Number(x.qty) - Number(x.used || 0)), 0)

/** Pacote ativo da cliente que ainda tem sessão deste serviço */
export function packageFor(packages = [], clientId, serviceId) {
  if (!clientId) return null
  for (const p of packages) {
    if (!p.active || p.clientId !== clientId) continue
    const it = (p.items || []).find((x) => x.serviceId === serviceId)
    const left = it ? Number(it.qty) - Number(it.used || 0) : 0
    if (left > 0) return { pkg: p, left, unit: round2(Number(p.price) / Math.max(1, Number(p.sessions))) }
  }
  return null
}

/** Pacotes da cliente reservados e ainda não pagos (entram no carrinho na hora de cobrar) */
export const pendingPackages = (packages = [], clientId) => (clientId ? packages.filter((p) => p.clientId === clientId && p.active && p.payment === 'pendente') : [])
/** Item de cobrança do pacote (valor integral, sem comissão) */
export const packageChargeItem = (p) => ({ type: 'package', refId: p.id, name: `Pacote: ${p.name}`, price: Number(p.price), qty: 1 })

/**
 * Grava o pacote. charge=true lança a venda no caixa agora (valor integral, sem comissão);
 * charge=false deixa "pendente": a cobrança entra no carrinho do próximo atendimento, como qualquer venda.
 */
export async function sellPackage(actions, { client, name, items, price, payment, barberId, notes = '', old = false, charge = true, appointmentId = null }) {
  const sessions = items.reduce((a, x) => a + Number(x.qty), 0)
  const pkg = await actions.upsert('packages', { clientId: client.id, name, items, sessions, price, payment: old ? 'anterior' : charge ? payment : 'pendente', barberId, date: today(), active: true, notes, ...(appointmentId ? { appointmentId } : {}) }, old ? 'Pacote cadastrado' : charge ? null : 'Pacote reservado · cobrado no atendimento')
  if (!old && charge) await actions.createSale({ date: today(), time: toHHMM(nowMin()), barberId, clientId: client.id, clientName: client.name, appointmentId: null, items: [{ type: 'package', refId: pkg.id, name: `Pacote: ${name}`, price, qty: 1, commissionRate: 0, commission: 0 }], subtotal: price, discount: 0, total: price, payment, commissionTotal: 0, benefit: null, loyaltyRedeemed: false })
  return pkg
}

/** Lista de pacotes na ficha da cliente + vender pacote */
export function ClientPackages({ client, canSell, barberId }) {
  const { data, actions } = useStore()
  const [selling, setSelling] = useState(false)
  const list = (data.packages || []).filter((p) => p.clientId === client.id)
    .sort((a, b) => Number(b.active && pkgLeft(b) > 0) - Number(a.active && pkgLeft(a) > 0) || (b.date || '').localeCompare(a.date || ''))
  const close = async (p) => (await actions.confirm(`Encerrar o pacote "${p.name}"? As sessões restantes deixam de aparecer no caixa.`, 'Encerrar')) && actions.upsert('packages', { ...p, active: false }, 'Pacote encerrado')
  const unused = (p) => (p.items || []).every((x) => !Number(x.used || 0))
  const remove = async (p) => (await actions.confirm(`Excluir o pacote "${p.name}"? Nenhuma sessão foi usada. ${p.payment === 'pendente' ? 'Ele ainda não foi pago.' : 'Se ele foi pago, estorne a venda no Caixa (o estorno já exclui o pacote).'}`, 'Excluir')) && actions.remove('packages', p.id, 'Pacote excluído')
  return (
    <div className="pkg-box">
      {!list.length && <p className="muted small">Nenhum pacote. Venda um pacote aqui ou ao agendar (opção "Vender pacote"); o valor é cobrado no fechamento da comanda.</p>}
      {list.map((p) => (
        <div key={p.id} className={cls('pkg-row', !(p.active && pkgLeft(p) > 0) && 'off')}>
          <div className="pkg-head">
            <b>{p.name}</b>
            <small>{fmtDate(p.date)} · {money(p.price)} · {p.sessions} sessões{p.active ? (pkgLeft(p) ? ` · restam ${pkgLeft(p)}` : ' · concluído') : ' · encerrado'}{p.payment === 'pendente' ? ' · pagamento pendente (cobra no atendimento)' : ''}</small>
            {canSell && p.active && pkgLeft(p) > 0 && !unused(p) && <button className="link" onClick={() => close(p)}>encerrar</button>}
            {canSell && unused(p) && <button className="link" onClick={() => remove(p)}>excluir</button>}
          </div>
          <div className="pkg-items">{(p.items || []).map((x) => <span key={x.serviceId} className="badge">{x.name} · {Number(x.used || 0)}/{x.qty}</span>)}</div>
          {p.notes && <small className="muted">{p.notes}</small>}
        </div>
      ))}
      {canSell && <Button variant="ghost" size="sm" icon={Plus} onClick={() => setSelling(true)}>Vender pacote</Button>}
      {selling && createPortal(<SellPackage client={client} barberId={barberId} onClose={() => setSelling(false)} />, document.body)}
    </div>
  )
}

function SellPackage({ client, barberId, onClose }) {
  const { data, actions } = useStore()
  const svcs = data.services.filter((s) => s.active)
  const sellers = data.barbers.filter((b) => b.active)
  const [rows, setRows] = useState([{ serviceId: '', qty: 5, used: 0 }])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [payment, setPayment] = useState('pix')
  const [seller, setSeller] = useState(barberId || sellers[0]?.id)
  const [old, setOld] = useState(false) // pacote antigo: já pago, não entra no caixa
  const [chargeNow, setChargeNow] = useState(true) // desligado = cobra no próximo atendimento
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const setRow = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const svcName = (id) => svcs.find((s) => s.id === id)?.name || 'Serviço'
  const ok = rows.filter((r) => r.serviceId && Number(r.qty) > 0)
  const sessions = ok.reduce((a, r) => a + Number(r.qty), 0)
  const total = parseMoney(price)
  const title = name.trim() || ok.map((r) => `${r.qty}x ${svcName(r.serviceId)}`).join(' + ')

  const save = async () => {
    if (!ok.length) return actions.notify('Escolha ao menos um serviço', 'bad')
    if (!old && !(total > 0)) return actions.notify('Informe o valor pago', 'bad')
    if (!seller) return actions.notify('Escolha a profissional', 'bad')
    setSaving(true)
    try {
      const items = ok.map((r) => ({ serviceId: r.serviceId, name: svcName(r.serviceId), qty: Number(r.qty), used: old ? Math.min(Number(r.qty), Number(r.used || 0)) : 0 }))
      await sellPackage(actions, { client, name: title, items, price: total, payment, barberId: seller, notes, old, charge: chargeNow })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Pacote · ${client.name}`} footer={<Button block disabled={saving} onClick={save}>{saving ? 'Salvando…' : old ? 'Cadastrar pacote' : chargeNow ? `Vender e cobrar · ${money(total)}` : 'Reservar pacote (cobrar no atendimento)'}</Button>}>
      <span className="field-label">Serviços do pacote</span>
      {rows.map((r, i) => (
        <div key={i} className="pkg-line">
          <select value={r.serviceId} onChange={(e) => setRow(i, 'serviceId', e.target.value)}><option value="">Escolha o serviço…</option>{svcs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <input inputMode="numeric" value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value.replace(/\D/g, ''))} title="Sessões" aria-label="Sessões" />
          {old && <input inputMode="numeric" value={r.used} onChange={(e) => setRow(i, 'used', e.target.value.replace(/\D/g, ''))} title="Já usadas" aria-label="Já usadas" />}
          {rows.length > 1 && <button className="icon-btn sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={15} /></button>}
        </div>
      ))}
      <p className="muted small">{old ? 'Colunas: serviço · sessões · já usadas' : 'Colunas: serviço · sessões'}</p>
      <Button variant="ghost" size="sm" icon={Plus} onClick={() => setRows((x) => [...x, { serviceId: '', qty: 1, used: 0 }])}>Serviço / brinde</Button>
      <div className="form-grid mt">
        <Field label="Nome do pacote" hint="Vazio = nome automático" className="span-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={title || 'Ex.: Enzima capilar 5 sessões'} /></Field>
        <Field label="Valor do pacote (R$)"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></Field>
        {!old && chargeNow && <Field label="Forma de pagamento"><select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></Field>}
        <Field label="Vendido por"><select value={seller} onChange={(e) => setSeller(e.target.value)}>{sellers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Observações" className="span-2"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: buço de brinde, parcelado em 3x…" /></Field>
      </div>
      {!old && <label className="toggle-row mt-sm"><span><b>Cobrar agora</b><small className="muted"> desligado = o pacote entra no carrinho do próximo atendimento</small></span><span className="switch"><input type="checkbox" checked={chargeNow} onChange={(e) => setChargeNow(e.target.checked)} /><span /></span></label>}
      <label className="toggle-row mt-sm"><span><b>Pacote antigo (já pago antes)</b><small className="muted"> não lança no caixa</small></span><span className="switch"><input type="checkbox" checked={old} onChange={(e) => setOld(e.target.checked)} /><span /></span></label>
      {sessions > 0 && total > 0 && <p className="muted small mt-sm">{sessions} sessões · comissão de cada sessão calculada sobre <b>{money(round2(total / sessions))}</b></p>}
    </Modal>
  )
}
