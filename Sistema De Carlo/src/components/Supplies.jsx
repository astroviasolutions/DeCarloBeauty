import { useState } from 'react'
import { ChevronDown, PackageMinus, Plus, Trash2 } from 'lucide-react'
import { norm } from './CatalogFilter'
import { useStore } from '../state/Store'
import { cls } from '../lib/utils'

/**
 * Insumos ("Estoque automático"): produtos de uso interno que cada procedimento consome
 * (agulha, cânula, luva, gaze...). Ficam em service.supplies = [{ productId, qty }].
 * Na cobrança viram itens type 'supply' (preço 0, sem comissão): só dão baixa no estoque.
 */

/**
 * Unidade de medida do produto (products.unit). Ex.: toxina botulínica é controlada em UI,
 * preenchedor em ml, ácido em g, agulha em un. O estoque e as baixas ficam nessa unidade
 * e aceitam quantidade quebrada (0,5 ml · 2,5 g), até 3 casas decimais.
 */
export const UNITS = [
  { value: 'un', label: 'un. (unidade)' },
  { value: 'UI', label: 'UI (unidades internacionais · toxina)' },
  { value: 'ml', label: 'ml (mililitro)' },
  { value: 'mg', label: 'mg (miligrama)' },
  { value: 'g', label: 'g (grama)' },
  { value: 'frasco', label: 'frasco' },
  { value: 'ampola', label: 'ampola' },
  { value: 'seringa', label: 'seringa' },
  { value: 'par', label: 'par' },
  { value: 'cx', label: 'cx. (caixa)' },
]
export const unitOf = (p) => p?.unit || 'un'
export const unitShort = (u) => (u === 'un' ? 'un.' : u === 'cx' ? 'cx.' : u)
/** quantidade digitada → número ("0,5" → 0.5; vazio → 0) */
export const parseQty = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0 }
/** limpa o que é digitado: só números e uma vírgula, até 3 casas ("1.5" vira "1,5") */
export const cleanQty = (v, max = 7) => { const [i, ...d] = String(v ?? '').replace('.', ',').replace(/[^\d,]/g, '').split(','); return d.length ? `${i.slice(0, max)},${d.join('').slice(0, 3)}` : i.slice(0, max) }
/** número → texto com vírgula ("0,5", "12") */
export const fmtQty = (n) => (Math.round(Number(n || 0) * 1000) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false })
/** "100 UI", "3 un.", "0,5 ml" */
export const qtyUnit = (n, p) => `${fmtQty(n)} ${unitShort(unitOf(p))}`

/** Insumos padrão dos serviços do carrinho (soma por produto × quantidade do serviço) */
export function defaultSupplies(items = [], services = []) {
  const m = {}
  for (const it of items) {
    if (it.type !== 'service') continue
    const s = services.find((x) => x.id === it.refId)
    for (const sp of s?.supplies || []) if (sp.productId && parseQty(sp.qty) > 0) m[sp.productId] = (m[sp.productId] || 0) + parseQty(sp.qty) * Number(it.qty || 1)
  }
  return Object.entries(m).map(([productId, qty]) => ({ productId, qty: Math.round(qty * 1000) / 1000 }))
}

/** Lista de insumos → itens da venda */
export const supplyItems = (list = [], products = []) => list.filter((x) => x.productId && parseQty(x.qty) > 0)
  .map((x) => { const p = products.find((y) => y.id === x.productId); return { type: 'supply', refId: x.productId, name: p?.name || 'Insumo', unit: unitOf(p), price: 0, qty: parseQty(x.qty), commissionRate: 0, commission: 0 } })

/** Itens da venda que a cliente vê (sem os insumos) */
export const visibleItems = (items = []) => items.filter((i) => i.type !== 'supply')

/** Editor de insumos: quantidade, tirar e acrescentar produto */
export default function SuppliesEditor({ value = [], onChange, products = [], title = 'Saídas no estoque (insumos)', hint, collapsible = true, defaultOpen = false }) {
  const { actions } = useStore()
  const [open, setOpen] = useState(defaultOpen || !collapsible)
  const [q, setQ] = useState('')
  // trocar a unidade aqui muda o cadastro do produto (vale para estoque, Catálogo e próximas vendas)
  const changeUnit = async (id, u) => { if (u !== unitOf(prod(id))) await actions.setProductUnit(id, u).catch(() => {}) }
  const prod = (id) => products.find((p) => p.id === id)
  const name = (id) => prod(id)?.name || 'Produto removido'
  const stock = (id) => Number(prod(id)?.stock ?? 0)
  const set = (i, qty) => onChange(value.map((x, j) => (j === i ? { ...x, qty } : x)))
  const hits = q.trim() ? products.filter((p) => p.active !== false && norm(p.name).includes(norm(q)) && !value.some((x) => x.productId === p.id)).slice(0, 6) : []
  // resumo: soma por unidade (não mistura UI com un.): "100 UI · 3 un."
  const byUnit = value.reduce((m, x) => { const u = unitOf(prod(x.productId)); m[u] = (m[u] || 0) + parseQty(x.qty); return m }, {})
  const total = Object.entries(byUnit).map(([u, n]) => `${fmtQty(n)} ${unitShort(u)}`).join(' · ')
  return (
    <div className="supplies">
      {collapsible
        ? <button type="button" className="supplies-head" aria-expanded={open} onClick={() => setOpen(!open)}><PackageMinus size={16} /> <b>{title}</b> <small>{value.length ? `${value.length} produto(s) · ${total}` : 'nenhum'}</small><ChevronDown size={15} className={cls('supplies-chev', open && 'on')} /></button>
        : <p className="supplies-head static"><PackageMinus size={16} /> <b>{title}</b></p>}
      {open && (
        <div className="supplies-body">
          {hint && <p className="muted small">{hint}</p>}
          {value.map((x, i) => {
            const low = parseQty(x.qty) > stock(x.productId)
            const p = prod(x.productId)
            return (
              <div key={x.productId} className="supplies-row">
                <span className="supplies-name">{name(x.productId)}<small className={cls(low && 'low')}>estoque {qtyUnit(stock(x.productId), p)}{low ? ' · vai faltar' : ''}</small></span>
                <input inputMode="decimal" aria-label={`Quantidade de ${name(x.productId)} em ${unitShort(unitOf(p))}`} value={typeof x.qty === 'number' ? fmtQty(x.qty) : x.qty} onChange={(e) => set(i, cleanQty(e.target.value, 5))} placeholder="0" />
                {p ? <select className="supplies-unit" value={unitOf(p)} onChange={(e) => changeUnit(p.id, e.target.value)} aria-label={`Unidade de ${p.name}`} title="Trocar a unidade deste produto (vale para o cadastro)">
                  {UNITS.map((u) => <option key={u.value} value={u.value}>{unitShort(u.value)}</option>)}
                </select> : <span className="muted small">un.</span>}
                <button type="button" className="icon-btn sm" aria-label={`Tirar ${name(x.productId)}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            )
          })}
          <div className="supplies-add">
            <Plus size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adicionar produto (buscar)" />
          </div>
          {hits.length > 0 && <div className="client-hits">{hits.map((p) => <button key={p.id} type="button" onClick={() => { onChange([...value, { productId: p.id, qty: 1 }]); setQ('') }}><b>{p.name}</b><small>{qtyUnit(p.stock, p)} em estoque</small></button>)}</div>}
        </div>
      )}
    </div>
  )
}
