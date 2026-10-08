/**
 * Relatórios em PDF (gerados no navegador, sem servidor).
 * - relatório gerencial da clínica (para a dona analisar)
 * - extrato de comissões por profissional (para enviar à funcionária)
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BRAND } from '../config/brand'
import { commissionSummary } from './commission'
import { fmtDate, money, PAYMENTS, saleRevenue, sum } from './utils'

const NAVY = [31, 62, 102]
const ROSE = [217, 154, 145]
const INK = [30, 42, 58]
const MUTED = [100, 107, 120]
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%')
const brDate = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }

async function toDataUrl(url) {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob) })
  } catch { return null }
}

async function newDoc(title, subtitle, settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await toDataUrl(BRAND.mark)
  doc.__logo = logo
  doc.__head = { title, subtitle, shop: settings?.shopName || BRAND.shopName }
  header(doc)
  return doc
}

function header(doc) {
  doc.__headed ??= new Set()
  doc.__headed.add(doc.internal.getCurrentPageInfo().pageNumber)
  const { title, subtitle, shop } = doc.__head
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(250, 246, 244); doc.rect(0, 0, W, 34, 'F')
  doc.setDrawColor(...ROSE); doc.setLineWidth(0.6); doc.line(14, 34, W - 14, 34)
  if (doc.__logo) { try { doc.addImage(doc.__logo, 'PNG', 14, 6, 42, 20) } catch { /* imagem inválida */ } }
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY); doc.text(shop, 14, 18) }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY)
  doc.text(title, W - 14, 15, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTED)
  doc.text(subtitle, W - 14, 21, { align: 'right' })
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, W - 14, 26.5, { align: 'right' })
}

function footer(doc) {
  const n = doc.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`${doc.__head.shop} · documento interno`, 14, H - 8)
    doc.text(`Página ${i} de ${n}`, W - 14, H - 8, { align: 'right' })
  }
}

function section(doc, y, text) {
  if (y > 262) { doc.addPage(); header(doc); y = 44 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY)
  doc.text(text.toUpperCase(), 14, y)
  doc.setDrawColor(...ROSE); doc.setLineWidth(0.3); doc.line(14, y + 1.8, 60, y + 1.8)
  return y + 5
}

function table(doc, y, head, body, opts = {}) {
  autoTable(doc, {
    startY: y, head: [head], body, margin: { left: 14, right: 14, top: 42 },
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: 2.2, lineColor: [239, 228, 224], lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [251, 247, 246] },
    didDrawPage: () => { if (!doc.__headed?.has(doc.internal.getCurrentPageInfo().pageNumber)) header(doc) },
    ...opts,
  })
  return doc.lastAutoTable.finalY + 9
}

function kpis(doc, y, items) {
  const W = doc.internal.pageSize.getWidth()
  const cols = 4; const gap = 4; const w = (W - 28 - gap * (cols - 1)) / cols; const h = items.some((it) => it[2]) ? 20 : 17
  items.forEach((it, i) => {
    const r = Math.floor(i / cols); const c = i % cols
    const x = 14 + c * (w + gap); const yy = y + r * (h + gap)
    doc.setFillColor(251, 247, 246); doc.setDrawColor(239, 228, 224); doc.roundedRect(x, yy, w, h, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(it[0].toUpperCase(), x + 3, yy + 5.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text(String(it[1]), x + 3, yy + 12.5)
    if (it[2]) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(String(it[2]), x + 3, yy + 17) }
  })
  return y + Math.ceil(items.length / cols) * (h + gap) + 6
}

const monthsIn = (from, to) => { const out = []; let m = from.slice(0, 7); while (m <= to.slice(0, 7)) { out.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}` } return out }

/** Relatório gerencial: faturamento, equipe, serviços, pagamentos, faltas e lucro */
export async function clinicReportPDF({ data, from, to, barberId = 'all', detailed = true }) {
  const barbers = data.barbers.filter((b) => barberId === 'all' || b.id === barberId)
  const ids = new Set(barbers.map((b) => b.id))
  const sales = data.sales.filter((s) => s.date >= from && s.date <= to && ids.has(s.barberId))
  const appts = data.appointments.filter((a) => a.date >= from && a.date <= to && ids.has(a.barberId))
  const who = barberId === 'all' ? 'Todas as profissionais' : barbers[0]?.name
  const doc = await newDoc('Relatório gerencial', `${brDate(from)} a ${brDate(to)} · ${who}`, data.settings)
  const revenue = sum(sales, saleRevenue)
  const items = sales.flatMap((s) => s.items)
  const svcRev = sum(items.filter((i) => i.type === 'service' || i.type === 'extra'), (i) => i.price * i.qty)
  const prdRev = sum(items.filter((i) => i.type === 'product'), (i) => i.price * i.qty)
  const comm = sum(sales, (s) => s.commissionTotal)
  const disc = sum(sales, (s) => s.discount)
  const done = appts.filter((a) => a.status === 'concluido').length
  const miss = appts.filter((a) => a.status === 'faltou').length
  const canc = appts.filter((a) => a.status === 'cancelado').length
  const online = appts.filter((a) => a.source === 'online').length
  const newClients = data.clients.filter((c) => c.createdAt >= from && c.createdAt <= to).length

  let y = 44
  y = section(doc, y, 'Resumo do período')
  y = kpis(doc, y + 1, [
    ['Faturamento', money(revenue), `${sales.length} vendas`], ['Ticket médio', money(sales.length ? revenue / sales.length : 0)],
    ['Serviços', money(svcRev), pct(svcRev, revenue)], ['Produtos', money(prdRev), pct(prdRev, revenue)],
    ['Comissões', money(comm), pct(comm, revenue)], ['Margem da casa', money(revenue - comm)],
    ['Descontos', money(disc)], ['Novas clientes', newClients],
    ['Agendamentos', appts.length, `${online} pelo site`], ['Concluídos', done],
    ['Faltas', miss, pct(miss, done + miss)], ['Cancelados', canc],
  ])

  const team = commissionSummary({ sales: data.sales, payouts: data.payouts, barbers, from, to }).sort((a, b) => b.revenue - a.revenue)
  y = section(doc, y, 'Desempenho da equipe')
  y = table(doc, y, ['Profissional', 'Atend.', 'Faturamento', 'Serviços', 'Produtos', 'Comissão', 'Pago', 'A pagar'],
    team.map((r) => [r.barber.name, appts.filter((a) => a.barberId === r.barber.id && a.status === 'concluido').length, money(r.revenue), money(r.svcValue), money(r.prdValue), money(r.total), money(r.paid), money(r.due)]),
    { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } } })

  const group = (type) => {
    const m = {}
    for (const i of items.filter((x) => x.type === type)) { m[i.name] ??= { name: i.name, qty: 0, value: 0 }; m[i.name].qty += i.qty; m[i.name].value += i.price * i.qty }
    return Object.values(m).sort((a, b) => b.value - a.value)
  }
  const svc = group('service'); const prd = group('product')
  y = section(doc, y, 'Serviços realizados')
  y = table(doc, y, ['Serviço', 'Qtd.', 'Valor', '% do faturamento'], svc.length ? svc.map((x) => [x.name, x.qty, money(x.value), pct(x.value, revenue)]) : [['Sem serviços no período', '', '', '']],
    { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } })
  if (prd.length) {
    y = section(doc, y, 'Produtos vendidos')
    y = table(doc, y, ['Produto', 'Qtd.', 'Valor'], prd.map((x) => [x.name, x.qty, money(x.value)]), { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } } })
  }
  y = section(doc, y, 'Formas de pagamento')
  y = table(doc, y, ['Forma', 'Vendas', 'Valor', '%'], Object.keys(PAYMENTS).map((k) => { const l = sales.filter((s) => s.payment === k); return [PAYMENTS[k], l.length, money(sum(l, (s) => s.total)), pct(sum(l, (s) => s.total), revenue)] }),
    { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } })

  if (barberId === 'all') {
    const months = monthsIn(from, to)
    const exp = (data.expenses || []).filter((e) => months.includes(e.month))
    const expTotal = sum(exp, (e) => e.amount)
    y = section(doc, y, `Despesas e lucro (${months.map((m) => m.split('-').reverse().join('/')).join(', ')})`)
    y = table(doc, y, ['Categoria', 'Descrição', 'Mês', 'Valor'], exp.length ? exp.map((e) => [e.category, e.description || '', e.month.split('-').reverse().join('/'), money(e.amount)]) : [['Nenhuma despesa lançada', '', '', '']],
      { columnStyles: { 3: { halign: 'right' } } })
    y = kpis(doc, y - 3, [['Faturamento', money(revenue)], ['Comissões', money(comm)], ['Despesas', money(expTotal)], ['Lucro estimado', money(revenue - comm - expTotal)]])
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text('Despesas somadas pelos meses do período. Em períodos parciais, compare com cuidado.', 14, y - 3)
    y += 4
  }

  if (detailed && sales.length) {
    y = section(doc, y, 'Vendas do período')
    table(doc, y, ['Data', 'Cliente', 'Profissional', 'Itens', 'Pagto.', 'Total'],
      sales.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((s) => [fmtDate(s.date), s.clientName || '-', data.barbers.find((b) => b.id === s.barberId)?.name.split(' ')[0] || '-', s.items.map((i) => `${i.qty > 1 ? `${i.qty}x ` : ''}${i.name}`).join(', '), PAYMENTS[s.payment] || s.payment, money(s.total)]),
      { styles: { fontSize: 8, cellPadding: 1.8, textColor: INK }, columnStyles: { 0: { cellWidth: 14 }, 3: { cellWidth: 70 }, 5: { halign: 'right' } } })
  }
  footer(doc)
  doc.save(`relatorio_${from}_${to}${barberId === 'all' ? '' : '_' + (barbers[0]?.name.split(' ')[0] || '').toLowerCase()}.pdf`)
}

/** Extrato de comissões: uma página (ou mais) por profissional */
export async function staffStatementPDF({ data, from, to, barberIds }) {
  const list = data.barbers.filter((b) => barberIds.includes(b.id))
  if (!list.length) return
  const doc = await newDoc('Extrato de comissões', `${brDate(from)} a ${brDate(to)}`, data.settings)
  list.forEach((b, idx) => {
    if (idx > 0) { doc.addPage(); header(doc) }
    const r = commissionSummary({ sales: data.sales, payouts: data.payouts, barbers: [b], from, to })[0]
    const sales = data.sales.filter((s) => s.barberId === b.id && s.date >= from && s.date <= to).sort((a, c) => (a.date + a.time).localeCompare(c.date + c.time))
    const pays = data.payouts.filter((p) => p.barberId === b.id && p.paidAt >= from && p.paidAt <= to)
    const discOf = (s) => Number(s.discount || 0)
    const discLabel = (s) => (s.benefit?.label && Number(s.benefit.amount) >= discOf(s) ? s.benefit.label : 'Desconto')
    const discTotal = sum(sales, discOf)
    let y = 46
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK); doc.text(b.name, 14, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTED); doc.text(b.bio || 'Profissional', 14, y + 5.5)
    y = kpis(doc, y + 11, [
      ['Atendimentos', sales.length], ['Faturamento gerado', money(r.revenue)], ['Comissão serviços', money(r.svcComm), `${r.svcCount} serv.`], ['Comissão produtos', money(r.prdComm), `${r.prdCount} prod.`],
      ['Comissão total', money(r.total)], ['Já pago no período', money(r.paid)], ['A receber', money(r.due)], ['Ticket médio', money(sales.length ? r.revenue / sales.length : 0)],
      ['Descontos concedidos', money(discTotal), `${sales.filter((s) => discOf(s) > 0).length} vendas com desconto`],
    ])
    y = section(doc, y, 'Lançamentos')
    // desconto da venda aparece logo abaixo dos itens (a comissão de cada item já sai com o desconto aplicado)
    const rows = sales.flatMap((s) => [
      ...s.items.map((i, k) => [k === 0 ? fmtDate(s.date) : '', k === 0 ? (s.clientName || '-') : '', `${i.qty > 1 ? `${i.qty}x ` : ''}${i.name}`, money(i.price * i.qty), `${i.commissionRate ?? '-'}%`, money(i.commission)]),
      ...(discOf(s) > 0 ? [['', '', discLabel(s), `-${money(discOf(s))}`, '', '']] : []),
    ])
    y = table(doc, y, ['Data', 'Cliente', 'Item', 'Valor', '%', 'Comissão'], rows.length ? rows : [['', 'Sem lançamentos no período', '', '', '', '']],
      { styles: { fontSize: 8.5, cellPadding: 1.9, textColor: INK }, columnStyles: { 0: { cellWidth: 15 }, 3: { halign: 'right' }, 4: { halign: 'center', cellWidth: 14 }, 5: { halign: 'right' } },
        foot: [
          ...(discTotal > 0 ? [['', '', 'Subtotal', money(r.svcValue + r.prdValue), '', ''], ['', '', 'Descontos', `-${money(discTotal)}`, '', '']] : []),
          ['', '', 'Total', money(r.svcValue + r.prdValue - discTotal), '', money(r.total)],
        ], footStyles: { fillColor: [243, 234, 231], textColor: NAVY, fontStyle: 'bold' } })
    if (pays.length) {
      y = section(doc, y, 'Pagamentos recebidos')
      y = table(doc, y, ['Data', 'Referente a', 'Observação', 'Valor'], pays.map((p) => [fmtDate(p.paidAt), `${fmtDate(p.from)} a ${fmtDate(p.to)}`, p.note || '', money(p.amount)]), { columnStyles: { 3: { halign: 'right' } } })
    }
    if (y > 250) { doc.addPage(); header(doc); y = 60 }
    doc.setDrawColor(...MUTED); doc.setLineWidth(0.2)
    doc.line(14, y + 18, 90, y + 18); doc.line(120, y + 18, 196, y + 18)
    doc.setFontSize(8.5); doc.setTextColor(...MUTED)
    doc.text(data.settings?.shopName || BRAND.shopName, 14, y + 23); doc.text(b.name, 120, y + 23)
  })
  footer(doc)
  const name = list.length === 1 ? list[0].name.split(' ')[0].toLowerCase() : 'equipe'
  doc.save(`extrato_${name}_${from}_${to}.pdf`)
}
