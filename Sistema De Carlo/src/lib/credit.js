import { nowMin, round2, today, toHHMM } from './utils'

/**
 * Crédito em haver (pagamento adiantado). Primeiro quita o fiado; o que sobra vira crédito
 * e entra no caixa uma vez (venda "Crédito em haver", sem comissão). Usado na ficha e no agendamento.
 * Retorna o novo saldo da cliente (positivo = crédito, negativo = deve).
 */
export async function addCredit(actions, client, amount, payment, barberId) {
  const add = round2(amount)
  let credit = Number(client.credit || 0)
  if (!(add > 0)) return credit
  const payDebt = Math.min(add, Math.max(0, -credit))
  const prepay = round2(add - payDebt)
  credit = round2(credit + payDebt)
  if (prepay > 0) {
    await actions.createSale({ date: today(), time: toHHMM(nowMin()), barberId, clientId: client.id, clientName: client.name, appointmentId: null, items: [{ type: 'credit', refId: null, name: 'Crédito em haver', price: prepay, qty: 1, commissionRate: 0, commission: 0 }], subtotal: prepay, discount: 0, total: prepay, payment, commissionTotal: 0, benefit: null, loyaltyRedeemed: false })
    credit = round2(credit + prepay)
  }
  return credit
}

/** Grava só o saldo da cliente (mantém os outros campos) */
export const saveCredit = (actions, c, credit, msg) => {
  const { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt } = c
  return actions.upsert('clients', { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt, credit: round2(credit) }, msg)
}
