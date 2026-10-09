import { round2 } from './utils'

const filled = (v) => v !== null && v !== undefined && v !== ''

/**
 * Regra de comissão (da mais específica para a geral):
 * 1) % definido para ESTE procedimento com ESTA profissional (Equipe → Procedimentos).
 * 2) % geral da profissional para serviços/produtos.
 * 3) % cadastrado no serviço/produto (Catálogo).
 */
export function commissionRate(type, item, barber) {
  if (type === 'service') {
    const ov = barber?.serviceOverrides?.[item?.id]?.commission
    if (filled(ov)) return Number(ov)
  }
  const own = type === 'service' ? barber?.serviceRate : barber?.productRate
  if (filled(own)) return Number(own)
  return Number(item?.commission ?? 0)
}

/** Monta os itens de venda com comissão calculada */
export function priceItems(items, { services, products, barber, materialReduces = false }) {
  return items.map((it) => {
    if (it.type === 'package' || it.type === 'credit' || it.type === 'surcharge') return { ...it, commissionRate: 0, commission: 0 } // pago adiantado / juros repassado: sem comissão
    const src = it.type === 'service' ? services.find((s) => s.id === it.refId) : products.find((p) => p.id === it.refId)
    const rate = commissionRate(it.type, src, barber)
    // custo guardado na venda (relatórios de lucro): material do procedimento e custo do produto, por unidade
    const material = it.type === 'service' ? Number(src?.materialCost || 0) : 0
    const cost = it.type === 'product' ? Number(src?.cost || 0) : 0
    const unitBase = Math.max(0, baseOf(it) - (materialReduces ? material : 0))
    return { ...it, ...(material ? { material } : {}), ...(cost ? { cost } : {}), commissionBase: unitBase, commissionRate: rate, commission: round2(unitBase * it.qty * rate / 100) }
  })
}
/** Sessão de pacote: cobra R$ 0, mas a comissão sai sobre o valor da sessão (pacote ÷ sessões) */
const baseOf = (it) => (it.packageId ? Number(it.unit || 0) : Number(it.price))

/**
 * Desconto: aplicado proporcionalmente sobre a base de comissão
 * (o barbeiro recebe sobre o valor efetivamente cobrado).
 */
export function applyDiscount(items, discount) {
  const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0)
  if (!discount || !subtotal) return items
  const f = Math.max(0, (subtotal - discount) / subtotal)
  return items.map((x) => (x.packageId ? x : { ...x, commission: round2(x.commission * f) }))
}

/** Taxa do cartão reduz a comissão (Ajustes): a profissional recebe sobre o líquido */
export function applyCardFee(items, total, cardFee) {
  if (!(cardFee > 0) || !(total > 0)) return items
  const f = Math.max(0, (total - cardFee) / total)
  return items.map((x) => ({ ...x, commission: round2(Number(x.commission || 0) * f) }))
}

/** Resumo de comissões por barbeiro num período */
export function commissionSummary({ sales, payouts, barbers, from, to }) {
  return barbers.map((b) => {
    const mine = sales.filter((s) => s.barberId === b.id && s.date >= from && s.date <= to)
    const items = mine.flatMap((s) => s.items)
    const svc = items.filter((i) => i.type === 'service')
    const ext = items.filter((i) => i.type === 'extra') // adicional cobrado no caixa
    const prd = items.filter((i) => i.type === 'product')
    const svcValue = [...svc, ...ext].reduce((a, i) => a + i.price * i.qty, 0)
    const prdValue = prd.reduce((a, i) => a + i.price * i.qty, 0)
    const svcComm = mine.reduce((a, s) => a + s.items.filter((i) => i.type === 'service' || i.type === 'extra').reduce((x, i) => x + Number(i.commission || 0), 0), 0)
    const prdComm = mine.reduce((a, s) => a + s.items.filter((i) => i.type === 'product').reduce((x, i) => x + i.commission, 0), 0)
    const total = round2(svcComm + prdComm)
    const paid = round2(payouts.filter((p) => p.barberId === b.id && p.from >= from && p.to <= to).reduce((a, p) => a + p.amount, 0))
    return {
      barber: b, count: mine.length, svcCount: svc.reduce((a, i) => a + i.qty, 0), prdCount: prd.reduce((a, i) => a + i.qty, 0),
      svcValue, prdValue, svcComm: round2(svcComm), prdComm: round2(prdComm), total, paid, due: round2(Math.max(0, total - paid)),
      revenue: mine.reduce((a, s) => a + s.total, 0),
    }
  })
}

/** Duração de um procedimento com uma profissional (tempo próprio ou o padrão do catálogo) */
export function durationOf(service, barber) {
  const ov = barber?.serviceOverrides?.[service?.id]?.duration ?? barber?.durations?.[service?.id]
  return filled(ov) && Number(ov) > 0 ? Number(ov) : Number(service?.duration || 0)
}
export const totalDuration = (list, barber) => list.reduce((a, s) => a + durationOf(s, barber), 0)

/** A profissional faz este serviço? (lista vazia = faz todos) */
export const doesService = (b, sid) => !b?.serviceIds?.length || b.serviceIds.includes(sid)
export const doesAll = (b, ids = []) => ids.every((id) => doesService(b, id))

/** Recalcula uma venda já fechada com um novo desconto (mantém o benefício que já tinha) */
export function adjustSale(sale, newDiscount, rules = {}) {
  const items = sale.items || []
  const subtotal = round2(items.reduce((a, x) => a + Number(x.price) * Number(x.qty), 0))
  const disc = Math.min(subtotal, Math.max(0, round2(newDiscount)))
  const ben = sale.benefit && ['club', 'runas'].includes(sale.benefit.kind) ? Math.min(Number(sale.benefit.amount || 0), disc) : 0
  const base = rules.discountReduces === false ? 0 : disc - ben
  const goods = items.filter((x) => x.type !== 'extra')
  const gsub = goods.reduce((a, x) => a + Number(x.price) * Number(x.qty), 0)
  const f = gsub ? Math.max(0, (gsub - Math.min(base, gsub)) / gsub) : 1
  const next = items.map((x) => {
    const full = round2(Number(x.commissionBase ?? baseOf(x)) * Number(x.qty) * Number(x.commissionRate || 0) / 100) // mesma base da venda (já sem material, se for a regra)
    return { ...x, commission: x.type === 'extra' || x.packageId ? full : round2(full * f) }
  })
  return { items: next, subtotal, discount: disc, total: round2(subtotal - disc), commissionTotal: round2(next.reduce((a, x) => a + x.commission, 0)) }
}
