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
export const today = () => toISODate(new Date())
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toISODate(d) }
export const weekday = (s) => parseDate(s).getDay()
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

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
}

/** Cobrança: a gestão sempre pode; profissional só se liberada em Ajustes → Privacidade */
export const canCharge = (settings, session) => session?.role === 'admin' || (settings?.privacy?.billingAllowed || []).includes(session?.barberId)
