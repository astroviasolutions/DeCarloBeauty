import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Button } from './ui'
import { money, parseMoney, round2 } from '../lib/utils'

/**
 * Acréscimo num item do fechamento (serviço ou produto): aumenta o valor daquele item
 * e guarda onde foi o aumento. No item da venda: basePrice (valor original por unidade),
 * increase (R$ a mais por unidade), increaseNote (motivo) e price = basePrice + increase.
 * A comissão segue a do próprio item.
 */
export function withIncrease(it, amount, note = '') {
  const base = Number(it.basePrice ?? it.price)
  const { basePrice: _b, increase: _i, increaseNote: _n, ...rest } = it
  if (!(amount > 0)) return { ...rest, price: base }
  return { ...rest, basePrice: base, increase: round2(amount), increaseNote: note.trim(), price: round2(base + amount) }
}

/** Texto curto do acréscimo para listas internas (ex.: "+R$ 50,00 · área extra") */
export const increaseLabel = (it) => (Number(it?.increase) > 0 ? `+${money(it.increase)}${Number(it.qty) > 1 ? '/un.' : ''}${it.increaseNote ? ` · ${it.increaseNote}` : ''}` : '')

/** Botão ao lado da quantidade */
export function IncreaseButton({ item, open, onToggle }) {
  const on = Number(item.increase) > 0
  return (
    <button type="button" className={`inc-btn${on ? ' on' : ''}${open ? ' open' : ''}`} onClick={onToggle} aria-expanded={open} title="Aumentar o valor deste item" aria-label={`Aumentar o valor de ${item.name}`}>
      <TrendingUp size={14} />{on && <span>+{money(Number(item.increase) * Number(item.qty || 1))}</span>}
    </button>
  )
}

/** Editor que abre embaixo da linha: valor a mais e motivo */
export function IncreaseEditor({ item, onApply, onClose }) {
  const [v, setV] = useState(Number(item.increase) > 0 ? String(item.increase).replace('.', ',') : '')
  const [note, setNote] = useState(item.increaseNote || '')
  const amt = parseMoney(v)
  const base = Number(item.basePrice ?? item.price)
  const qty = Number(item.qty || 1)
  return (
    <div className="inc-edit">
      <div className="inc-edit-row">
        <label><span>A mais{qty > 1 ? ' (por unidade)' : ''} R$</span><input inputMode="decimal" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" aria-label={`Valor a mais em ${item.name}`} /></label>
        <label className="grow"><span>Motivo</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: área extra, mais unidades, material" maxLength={80} /></label>
      </div>
      <small className="muted">{money(base)}{amt > 0 ? ` + ${money(amt)} = ${money(base + amt)}` : ''}{qty > 1 ? ` × ${qty}` : ''}</small>
      <div className="inc-edit-row">
        <Button size="sm" onClick={() => { onApply(withIncrease(item, amt, note)); onClose() }}>{amt > 0 ? 'Aplicar acréscimo' : 'Sem acréscimo'}</Button>
        {Number(item.increase) > 0 && <button type="button" className="link" onClick={() => { onApply(withIncrease(item, 0)); onClose() }}>tirar acréscimo</button>}
        <button type="button" className="link" onClick={onClose}>cancelar</button>
      </div>
    </div>
  )
}
