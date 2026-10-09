/**
 * Regras financeiras configuráveis em Ajustes → Financeiro. Tudo fica em settings.privacy.finance
 * (mesmo lugar das regras de comissão, sem coluna nova em settings):
 *  machines: [{ id, name, debito, credito: {1..12: %}, diasDebito, diasCredito, antecipa, taxaAntecipacao }]
 *  repasse:  { on, from }      → cobra da cliente a taxa do crédito parcelado a partir de N vezes
 *  imposto:  { on, rate }      → % sobre o faturamento (ex.: Simples Nacional), descontado no Lucro real
 *  fiado:    { dias, pix }     → prazo padrão para pagar o fiado e chave Pix da mensagem de cobrança
 *  recurring:[{ id, description, category, amount, day, paidWith, active, months: ['2026-10'] }] contas fixas
 */
export const MAX_PARCELAS = 12
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const fullCred = (c = {}) => Object.fromEntries(Array.from({ length: MAX_PARCELAS }, (_, i) => [i + 1, num(c[i + 1])]))

export function financeOf(settings) {
  const p = settings?.privacy || {}
  const f = p.finance || {}
  let machines = (f.machines || []).map((m) => ({ id: m.id, name: m.name || 'Maquininha', debito: num(m.debito), credito: fullCred(m.credito), diasDebito: Number(m.diasDebito ?? 1), diasCredito: Number(m.diasCredito ?? 30), antecipa: !!m.antecipa, taxaAntecipacao: num(m.taxaAntecipacao) }))
  // compatibilidade: taxas cadastradas antes (uma maquininha só) viram a "Maquininha principal"
  if (!machines.length) machines = [{ id: 'principal', name: 'Maquininha principal', debito: num(p.cardFees?.debito), credito: fullCred(p.cardFees?.credito), diasDebito: 1, diasCredito: 30, antecipa: false, taxaAntecipacao: 0 }]
  return {
    machines,
    repasse: { on: !!f.repasse?.on, from: Math.max(1, Number(f.repasse?.from || 2)) },
    imposto: { on: !!f.imposto?.on, rate: num(f.imposto?.rate) },
    fiado: { dias: Math.max(1, Number(f.fiado?.dias || 30)), pix: f.fiado?.pix || '' },
    recurring: f.recurring || [],
  }
}
export const machineOf = (settings, id) => { const ms = financeOf(settings).machines; return ms.find((m) => m.id === id) || ms[0] }

/** % da taxa para a forma de pagamento (pix/dinheiro/permuta = 0) */
export function feeRate(settings, payment, parcelas = 1, machineId) {
  const m = machineOf(settings, machineId)
  if (payment === 'debito') return m.debito
  if (payment === 'credito') return m.credito[Math.min(MAX_PARCELAS, Math.max(1, Number(parcelas) || 1))] || 0
  return 0
}
/** valor da taxa sobre a parte paga no cartão */
export const feeAmount = (settings, payment, amount, parcelas = 1, machineId) => round2((Number(amount || 0) * feeRate(settings, payment, parcelas, machineId)) / 100)
export const isCard = (p) => p === 'debito' || p === 'credito'

/** Repasse do juros: acréscimo para a clínica receber o mesmo valor líquido (bruto = líquido ÷ (1 − taxa)) */
export function surchargeFor(settings, amount, parcelas, machineId) {
  const f = financeOf(settings)
  if (!f.repasse.on || Number(parcelas) < f.repasse.from) return 0
  const r = feeRate(settings, 'credito', parcelas, machineId) / 100
  return r > 0 && r < 1 ? round2(amount / (1 - r) - amount) : 0
}

/** Partes de cada forma de pagamento de uma venda ("pix R$ 50,00 + dinheiro R$ 50,00" → [{p:'pix',v:50},{p:'dinheiro',v:50}]) */
export function payParts(s, PAYMENTS) {
  if (PAYMENTS[s.payment]) return [{ p: s.payment, v: Number(s.total || 0) }]
  const parts = String(s.payment || '').split(' + ').map((x) => { const m = /^(.+?) R\$\s?([\d.,]+)$/.exec(x.trim()); return m ? { p: m[1] === 'a pagar' ? 'fiado' : m[1], v: Number(m[2].replace(/\./g, '').replace(',', '.')) || 0 } : null })
  return parts.every(Boolean) && parts.length ? parts : [{ p: s.payment, v: Number(s.total || 0) }]
}

const addDaysISO = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
/** Quando o dinheiro de cada venda no cartão cai na conta (líquido da taxa). Antecipação: tudo no prazo do crédito à vista, menos a taxa de antecipação */
export function receivables(sales, settings) {
  const out = []
  for (const s of sales) {
    const fee = Number(s.cardFee || 0)
    for (const part of payParts(s, { pix: 1, dinheiro: 1, debito: 1, credito: 1, saldo: 1, permuta: 1 })) {
      if (!isCard(part.p) || !(part.v > 0)) continue
      const m = machineOf(settings, s.cardMachine)
      const total = Number(s.total || 0)
      const net = round2(part.v - (total ? fee * (part.v / total) : 0))
      if (part.p === 'debito') { out.push({ date: addDaysISO(s.date, m.diasDebito), v: net, sale: s, label: 'Débito' }); continue }
      const n = Math.max(1, Number(s.installments) || 1)
      if (m.antecipa || n === 1) { out.push({ date: addDaysISO(s.date, m.diasCredito), v: round2(net - (n > 1 ? net * m.taxaAntecipacao / 100 : 0)), sale: s, label: n > 1 ? `Crédito ${n}x (antecipado)` : 'Crédito à vista' }); continue }
      const each = round2(net / n)
      for (let i = 1; i <= n; i++) out.push({ date: addDaysISO(s.date, m.diasCredito * i), v: i === n ? round2(net - each * (n - 1)) : each, sale: s, label: `Crédito ${i}/${n}` })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
