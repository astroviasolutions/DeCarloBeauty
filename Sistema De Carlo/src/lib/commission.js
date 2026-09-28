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
export function priceItems(items, { services, products, barber }) {
  return items.map((it) => {
    const src = it.type === 'service' ? services.find((s) => s.id === it.refId) : products.find((p) => p.id === it.refId)
    const rate = commissionRate(it.type, src, barber)
    return { ...it, commissionRate: rate, commission: round2(it.price * it.qty * rate / 100) }
  })
}

/**
 * Desconto: aplicado proporcionalmente sobre a base de comissão
 * (o barbeiro recebe sobre o valor efetivamente cobrado).
 */
export function applyDiscount(items, discount) {
  const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0)
  if (!discount || !subtotal) return items
  const f = Math.max(0, (subtotal - discount) / subtotal)
  return items.map((x) => ({ ...x, commission: round2(x.commission * f) }))
}

/** Resumo de comissões por barbeiro num período */
export function commissionSummary({ sales, payouts, barbers, from, to }) {
  return barbers.map((b) => {
    const mine = sales.filter((s) => s.barberId === b.id && s.date >= from && s.date <= to)
    const items = mine.flatMap((s) => s.items)
    const svc = items.filter((i) => i.type === 'service')
    const prd = items.filter((i) => i.type === 'product')
    const svcValue = svc.reduce((a, i) => a + i.price * i.qty, 0)
    const prdValue = prd.reduce((a, i) => a + i.price * i.qty, 0)
    const svcComm = mine.reduce((a, s) => a + s.items.filter((i) => i.type === 'service').reduce((x, i) => x + i.commission, 0), 0)
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
