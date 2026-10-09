import { onlyDigits, today } from './utils'

/** Níveis da cliente, por total de visitas */
export const LEVELS = [
  { name: 'Pérola', min: 0, rune: '◦' },
  { name: 'Ouro', min: 5, rune: '✦' },
  { name: 'Platina', min: 15, rune: '❖' },
  { name: 'Diamante', min: 30, rune: '◆' },
]

/**
 * Cartão Fidelidade: cada visita com serviço = 1 ponto.
 * A cada `goal` pontos o cliente ganha 1 serviço de recompensa.
 */
export function loyaltyOf(clientId, sales, settings) {
  const goal = Number(settings?.loyalty?.goal || 10)
  const mine = sales.filter((s) => s.clientId === clientId)
  const visits = mine.filter((s) => s.items?.some((i) => i.type === 'service') && !s.loyaltyRedeemed).length
  const redeemed = mine.filter((s) => s.loyaltyRedeemed).length
  const earned = Math.floor(visits / goal)
  const available = Math.max(0, earned - redeemed)
  const progress = visits % goal
  const totalVisits = visits + redeemed
  const level = [...LEVELS].reverse().find((l) => totalVisits >= l.min) || LEVELS[0]
  const next = LEVELS.find((l) => l.min > totalVisits)
  return { goal, visits: totalVisits, progress, available, level, next, enabled: settings?.loyalty?.enabled !== false }
}

/** Mês de aniversário? (birthday no formato MM-DD) */
export const isBirthdayMonth = (birthday) => !!birthday && birthday.slice(0, 2) === today().slice(5, 7)

/** Assinatura ativa do cliente e quanto ele já usou no mês */
export function clubOf(clientId, { subscriptions = [], plans = [], sales = [] }) {
  const sub = subscriptions.find((s) => s.clientId === clientId && s.status === 'ativo')
  if (!sub) return null
  const plan = plans.find((p) => p.id === sub.planId)
  if (!plan) return null
  const month = today().slice(0, 7)
  const used = sales.filter((s) => s.clientId === clientId && s.date.startsWith(month) && s.benefit?.kind === 'club').length
  const paid = (sub.paidMonths || []).includes(month)
  const left = plan.limit == null ? Infinity : Math.max(0, plan.limit - used)
  return { sub, plan, used, left, paid }
}

export const findClientByPhone = (clients, phone) => clients.find((c) => onlyDigits(c.phone) === onlyDigits(phone))

/** Promoção válida para um dia/horário */
export function promoFor(promos = [], date, time, weekdayFn) {
  if (!time) return null
  const wd = weekdayFn(date)
  return promos.find((p) => p.active && p.weekdays?.includes(wd) && time >= p.from && time < p.to) || null
}
