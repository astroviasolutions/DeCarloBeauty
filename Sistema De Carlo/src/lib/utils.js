// ---------- dinheiro ----------
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const money = (v) => BRL.format(Number(v || 0))
export const round2 = (v) => Math.round(Number(v || 0) * 100) / 100

// ---------- ids ----------
export const uid = () =>
  (crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

// ---------- datas (sempre em horário local, formato YYYY-MM-DD / HH:mm) ----------
export const pad = (n) => String(n).padStart(2, '0')
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/*
 * Relógio da clínica: hora do SERVIDOR no fuso de Brasília, não a do computador.
 * Um PC com data/hora/fuso errados travava a agenda inteira (todos os horários viravam "passados").
 * O desvio é medido ao abrir o sistema (função server_now no banco); sem ela, usa o relógio do aparelho.
 */
export const TIMEZONE = 'America/Sao_Paulo'
let skew = 0 // servidor − aparelho, em ms
export const setServerTime = (iso) => { const s = Date.parse(iso); if (!Number.isNaN(s)) skew = s - Date.now() }
export const clockSkewMin = () => Math.round(skew / 60000)
export const serverNowMs = () => Date.now() + skew
let fmtTZ = null
const clinicNow = () => {
  const d = new Date(Date.now() + skew)
  try {
    fmtTZ ??= new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const p = Object.fromEntries(fmtTZ.formatToParts(d).map((x) => [x.type, x.value]))
    return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) }
  } catch { return { date: toISODate(d), min: d.getHours() * 60 + d.getMinutes() } }
}
export const today = () => clinicNow().date
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toISODate(d) }
export const weekday = (s) => parseDate(s).getDay()
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
export const nowMin = () => clinicNow().min

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WD_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const fmtDate = (s) => { const d = parseDate(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` }
export const fmtDateLong = (s) => {
  const d = parseDate(s)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`
}
export const relDay = (s) => {
  const t = today()
  if (s === t) return 'Hoje'
  if (s === addDays(t, 1)) return 'Amanhã'
  if (s === addDays(t, -1)) return 'Ontem'
  return fmtDateLong(s)
}

/** início da semana (segunda) e do mês */
export const startOfWeek = (s) => { const wd = weekday(s); return addDays(s, wd === 0 ? -6 : 1 - wd) }
export const startOfMonth = (s) => s.slice(0, 8) + '01'
export const endOfMonth = (s) => { const d = parseDate(startOfMonth(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISODate(d) }
export const inRange = (s, from, to) => s >= from && s <= to

export const PERIODS = {
  hoje: () => ({ from: today(), to: today(), label: 'Hoje' }),
  semana: () => ({ from: startOfWeek(today()), to: addDays(startOfWeek(today()), 6), label: 'Esta semana' }),
  mes: () => ({ from: startOfMonth(today()), to: endOfMonth(today()), label: 'Este mês' }),
  '30d': () => ({ from: addDays(today(), -29), to: today(), label: 'Últimos 30 dias' }),
  semanaPassada: () => ({ from: addDays(startOfWeek(today()), -7), to: addDays(startOfWeek(today()), -1), label: 'Semana passada' }),
  mesPassado: () => { const f = startOfMonth(addDays(startOfMonth(today()), -1)); return { from: f, to: endOfMonth(f), label: 'Mês passado' } },
}

// ---------- telefone / whatsapp ----------
export const onlyDigits = (s) => String(s || '').replace(/\D/g, '')
export const fmtPhone = (s) => {
  const d = onlyDigits(s).replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return s || ''
}
export const maskPhone = (v) => {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export const waLink = (phone, text) => {
  let d = onlyDigits(phone)
  if (d && !d.startsWith('55')) d = '55' + d
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`
}

// ---------- agenda ----------
/**
 * Gera os horários livres de um barbeiro num dia.
 * hours: ['09:00','19:00'] | null ; busy: [{time, duration}] ; lunch opcional
 */
export function freeSlots({ date, hours, busy, duration, step = 30, breakTime }) {
  if (!hours) return []
  const open = toMin(hours[0])
  const close = toMin(hours[1])
  const isToday = date === today()
  const minStart = isToday ? nowMin() + 15 : -1
  const blocks = busy.map((b) => [toMin(b.time), toMin(b.time) + Number(b.duration)])
  if (breakTime) blocks.push([toMin(breakTime[0]), toMin(breakTime[1])])
  const out = []
  for (let t = open; t + duration <= close; t += step) {
    if (t < minStart) continue
    const end = t + duration
    if (blocks.some(([s, e]) => t < e && end > s)) continue
    out.push(toHHMM(t))
  }
  return out
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')

export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + Number(fn(x) || 0), 0)

export const cls = (...a) => a.filter(Boolean).join(' ')

export const safeLS = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb } catch { return fb } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem storage */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* */ } },
}

export const STATUS = {
  agendado: { label: 'Agendado', tone: 'neutral' },
  confirmado: { label: 'Confirmado', tone: 'info' },
  concluido: { label: 'Concluído', tone: 'good' },
  faltou: { label: 'Faltou', tone: 'warn' },
  cancelado: { label: 'Cancelado', tone: 'bad' },
}

export const PAYMENTS = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
  saldo: 'Saldo da cliente',
  pacote: 'Pacote',
  permuta: 'Permuta',
}
/** Faturamento da venda: paga com "Saldo da cliente" já entrou no caixa quando o crédito foi recebido */
export const saleRevenue = (s) => (s.payment === 'saldo' ? 0 : Number(s.total || 0))

/** Cobrança: a gestão sempre pode; profissional só se liberada em Ajustes → Privacidade */
/** gestão ou recepção (trabalho do dia a dia: agenda de todas, clientes, caixa) */
export const isDesk = (session) => session?.role === 'admin' || session?.role === 'reception'
/**
 * O que a RECEPÇÃO pode fazer além do básico (agenda de todas, clientes, cobrar).
 * A gestão liga/desliga em Ajustes → Recepção (settings.privacy.reception). As marcadas com `db` também são
 * conferidas no banco (RECEPCAO-PERMISSOES.sql), então desligar aqui bloqueia de verdade.
 */
export const RECEPTION_PERMS = [
  { key: 'blocks', label: 'Bloquear horários das profissionais', hint: 'Folga, almoço, compromisso.', def: true, db: true },
  { key: 'cash', label: 'Abrir e fechar o caixa', hint: 'Valor inicial e conferência da gaveta no fim do dia.', def: true, db: true },
  { key: 'cashTotals', label: 'Ver totais do caixa', hint: 'Total vendido no dia e dinheiro esperado na gaveta.', def: true },
  { key: 'agendaTotals', label: 'Ver valores somados na agenda', hint: 'Total em R$ do dia, da semana e do período.', def: false },
  { key: 'clientSpent', label: 'Ver quanto cada cliente já gastou', hint: 'Na ficha e na lista de clientes.', def: false },
  { key: 'refund', label: 'Estornar e ajustar valor de venda', hint: 'Desfaz a venda (devolve estoque, pacote e saldo).', def: false, db: true },
  { key: 'fixSale', label: 'Corrigir atendimento já cobrado', hint: 'Trocar serviços, profissional e valores sem estornar.', def: false, db: true },
  { key: 'tv', label: 'Modo TV', hint: 'Tela da recepção com quem está atendendo e os próximos.', def: true },
]
/** gestão pode tudo; recepção conforme Ajustes; profissional não */
export const deskCan = (settings, session, key) => {
  if (session?.role === 'admin') return true
  if (session?.role !== 'reception') return false
  const v = settings?.privacy?.reception?.[key]
  return typeof v === 'boolean' ? v : !!RECEPTION_PERMS.find((p) => p.key === key)?.def
}
export const canCharge = (settings, session) => isDesk(session) || (settings?.privacy?.billingAllowed || []).includes(session?.barberId)
/** Agendar pelo painel: liberado para todas; a gestão pode bloquear alguém em Ajustes → Privacidade */
export const canBook = (settings, session) => isDesk(session) || !(settings?.privacy?.bookingBlocked || []).includes(session?.barberId)

/** Lê valor digitado: "R$ 30", "30,50", "1.250,00", "30.5". Com "%" devolve o percentual sobre `base`. */
export function parseMoney(v, base = 0) {
  let t = String(v ?? '').trim()
  if (!t) return 0
  const pct = t.includes('%')
  t = t.replace(/[^\d.,-]/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
  const n = Math.max(0, Number(t) || 0)
  return pct ? Math.round(base * n) / 100 : n
}

/** forma de pagamento da venda para exibir (ex.: "Crédito 3x") */
export const payLabel = (s) => `${PAYMENTS[s?.payment] || s?.payment || '—'}${Number(s?.installments) > 1 ? ` ${s.installments}x` : ''}`

/** WhatsApp para exibir: completo para gestão/recepção; para a profissional só os 4 últimos ((**) *****-1234) */
export const phoneLabel = (c) => { const d = onlyDigits(c?.phone || c?.clientPhone || ''); if (d.length >= 10) return fmtPhone(d); const l4 = c?.phoneLast4 || c?.clientPhoneLast4; return l4 ? `(**) *****-${l4}` : '' }
