import { BRAND } from '../config/brand'
import { fmtDate, money, PAYMENTS, waLink } from './utils'

/**
 * Comprovante de pagamento (recibo NÃO fiscal) de uma ou mais vendas da mesma cliente:
 * imprimir (impressora comum ou térmica) ou mandar no WhatsApp.
 */
const payLabel = (s) => `${PAYMENTS[s.payment] || s.payment || '—'}${Number(s.installments) > 1 ? ` em ${s.installments}x` : ''}` // ex.: "Crédito em 3x"
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function lines(sales, barbers) {
  return sales.flatMap((s) => (s.items || []).filter((i) => i.type !== 'supply').map((i) => ({ // insumo não aparece para a cliente
    name: `${Number(i.qty) > 1 ? `${i.qty}x ` : ''}${i.name}${i.packageId ? ' (sessão de pacote)' : ''}`,
    who: barbers.find((b) => b.id === s.barberId)?.name || '',
    value: Number(i.price) * Number(i.qty),
  })))
}

export function receiptText(sales, { barbers = [], settings = {} } = {}) {
  const s0 = sales[0] || {}
  const sub = sales.reduce((a, s) => a + Number(s.subtotal ?? s.total), 0)
  const disc = sales.reduce((a, s) => a + Number(s.discount || 0), 0)
  const total = sales.reduce((a, s) => a + Number(s.total), 0)
  return [
    `*${BRAND.shopName}*`,
    'Comprovante de pagamento (não fiscal)',
    `${fmtDate(s0.date)} ${s0.time || ''} · ${s0.clientName || ''}`,
    '',
    ...lines(sales, barbers).map((l) => `• ${l.name}${l.who ? ` (${l.who.split(' ')[0]})` : ''}: ${money(l.value)}`),
    '',
    disc > 0 ? `Subtotal: ${money(sub)}\nDesconto: -${money(disc)}` : null,
    `*Total: ${money(total)}*`,
    `Pagamento: ${[...new Set(sales.map((s) => payLabel(s)))].join(', ')}`,
    settings.address ? `\n${settings.address}` : null,
    'Obrigada pela preferência! 💗',
  ].filter((x) => x !== null).join('\n')
}

export function printReceipt(sales, { barbers = [], settings = {} } = {}) {
  const s0 = sales[0] || {}
  const sub = sales.reduce((a, s) => a + Number(s.subtotal ?? s.total), 0)
  const disc = sales.reduce((a, s) => a + Number(s.discount || 0), 0)
  const total = sales.reduce((a, s) => a + Number(s.total), 0)
  const rows = lines(sales, barbers).map((l) => `<tr><td>${esc(l.name)}<small>${esc(l.who)}</small></td><td class="r">${money(l.value)}</td></tr>`).join('')
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return false
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comprovante</title><style>
    body{font-family:Arial,sans-serif;max-width:300px;margin:12px auto;color:#000;font-size:13px}
    h1{font-size:16px;text-align:center;margin:0}p{margin:2px 0;text-align:center}table{width:100%;border-collapse:collapse;margin:10px 0}
    td{padding:4px 0;border-bottom:1px dashed #999;vertical-align:top}td small{display:block;color:#555;font-size:11px}.r{text-align:right;white-space:nowrap}
    .tot td{border:0;font-weight:bold;font-size:15px}.muted{color:#555;font-size:11px}@media print{button{display:none}}
  </style></head><body>
    <h1>${esc(BRAND.shopName)}</h1>${settings.address ? `<p class="muted">${esc(settings.address)}</p>` : ''}${settings.whatsapp ? `<p class="muted">${esc(settings.whatsapp)}</p>` : ''}
    <p><b>Comprovante de pagamento</b></p><p class="muted">Documento não fiscal</p>
    <p>${fmtDate(s0.date)} ${esc(s0.time || '')} · ${esc(s0.clientName || '')}</p>
    <table>${rows}
      ${disc > 0 ? `<tr><td>Subtotal</td><td class="r">${money(sub)}</td></tr><tr><td>Desconto</td><td class="r">-${money(disc)}</td></tr>` : ''}
      <tr class="tot"><td>Total</td><td class="r">${money(total)}</td></tr>
    </table>
    <p>Pagamento: ${esc([...new Set(sales.map((s) => payLabel(s)))].join(', '))}</p>
    <p class="muted" style="margin-top:10px">Obrigada pela preferência!</p>
    <p><button onclick="print()">Imprimir</button></p>
    <script>setTimeout(()=>print(),300)</script>
  </body></html>`)
  w.document.close()
  return true
}

/** Link do WhatsApp com o comprovante (vazio se a cliente não tem número) */
export const receiptWa = (phone, sales, ctx) => waLink(phone, receiptText(sales, ctx))
