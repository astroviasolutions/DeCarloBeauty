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

/**
 * Estorno: desfaz o efeito da venda no saldo das clientes.
 * fiado da venda → a dívida some · pago com saldo → o crédito volta · crédito/vale-presente vendido → sai do saldo de quem recebeu
 * Devolve [{ client, delta }] (só quem muda).
 */
export function saleCreditEffects(sale, clients, PAYMENTS, payParts) {
  const delta = {}
  const add = (id, v) => { if (id && v) delta[id] = round2((delta[id] || 0) + v) }
  for (const p of payParts(sale, PAYMENTS)) if (p.p === 'fiado' || p.p === 'a pagar' || p.p === 'saldo') add(sale.clientId, Number(p.v || 0))
  for (const it of sale.items || []) if (it.type === 'credit') add(it.refId || sale.clientId, -Number(it.price || 0) * Number(it.qty || 1))
  return Object.entries(delta).filter(([, v]) => Math.abs(v) > 0.009).map(([id, v]) => ({ client: clients.find((c) => c.id === id), delta: v })).filter((x) => x.client)
}

/** Grava só o saldo da cliente (mantém os outros campos) */
export const saveCredit = (actions, c, credit, msg) => {
  const { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt } = c
  return actions.upsert('clients', { id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt, credit: round2(credit) }, msg)
}
