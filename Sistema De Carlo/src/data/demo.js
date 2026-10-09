import { buildSeed } from './seed'
import { addDays, safeLS, uid, onlyDigits, toMin, today } from '../lib/utils'
import { clubOf, isBirthdayMonth, loyaltyOf } from '../lib/loyalty'
import { BRAND } from '../config/brand'

const KEY = 'dcb:demo:v1'
const clone = (x) => JSON.parse(JSON.stringify(x))
const durationsOf = (ov = {}) => Object.fromEntries(Object.entries(ov || {}).filter(([, v]) => v?.duration).map(([k, v]) => [k, v.duration]))

/**
 * Adaptador DEMO — todos os dados ficam no navegador (localStorage).
 * Mesma interface do adaptador Supabase, para trocar sem mexer nas telas.
 */
export function createDemoDB() {
  let data = safeLS.get(KEY)
  // Dados de exemplo "andam" com o calendário: se ninguém mexeu, regenera a cada dia
  if (!data || (!data.touched && data.seedDate !== today())) { data = buildSeed(); safeLS.set(KEY, data) }
  data.announcements ??= []
  data.packages ??= []
  const save = () => { data.touched = true; safeLS.set(KEY, data) }
  // abate (+1) ou devolve (-1) sessões de pacote dos itens da venda
  const pkgApply = (items = [], sign) => items.forEach((it) => {
    const e = it.packageId && data.packages.find((p) => p.id === it.packageId)?.items.find((x) => x.serviceId === it.refId)
    if (e) e.used = Math.max(0, Number(e.used || 0) + sign * Number(it.qty || 1))
  })

  const overlaps = (barberId, date, time, duration, ignoreId) =>
    data.appointments.some((a) =>
      a.id !== ignoreId && a.barberId === barberId && a.date === date && !['cancelado', 'faltou'].includes(a.status) &&
      toMin(time) < toMin(a.time) + Number(a.duration) && toMin(time) + Number(duration) > toMin(a.time))

  const upsertClient = ({ name, phone, birthday }) => {
    const p = onlyDigits(phone)
    let c = data.clients.find((x) => onlyDigits(x.phone) === p)
    if (!c) { c = { id: uid(), name, phone: p, notes: '', birthday: birthday || '', createdAt: today() }; data.clients.push(c) }
    else { if (name && c.name !== name) c.name = name; if (birthday) c.birthday = birthday }
    return c
  }
  const ratingOf = (barberId) => {
    const rs = data.reviews.filter((r) => r.barberId === barberId)
    return rs.length ? { avg: rs.reduce((a, r) => a + r.stars, 0) / rs.length, count: rs.length } : { avg: 0, count: 0 }
  }

  return {
    mode: 'demo',

    async loadPublic() {
      return {
        settings: clone(data.settings),
        services: clone(data.services.filter((s) => s.active)),
        barbers: clone(data.barbers.filter((b) => b.active).map(({ pin: _pin, phone: _phone, serviceOverrides, serviceRate: _sr, productRate: _pr, goal: _g, ...b }) => ({ ...b, durations: durationsOf(serviceOverrides), rating: ratingOf(b.id) }))),
        plans: clone(data.plans.filter((x) => x.active)),
        promos: clone(data.promos.filter((x) => x.active)),
        photos: clone(data.photos.filter((x) => !x.private).slice(-60)),
      }
    },

    /** Tudo para o painel. A profissional recebe só a agenda dela e, com a privacidade ligada, sem contatos. */
    async loadAll(session) {
      const out = clone(data)
      if (session?.role === 'barber') {
        const me = session.barberId
        const hide = data.settings.privacy?.hideContacts !== false
        out.appointments = out.appointments.filter((a) => a.barberId === me)
        out.sales = out.sales.filter((x) => x.barberId === me)
        out.payouts = out.payouts.filter((x) => x.barberId === me)
        out.expenses = []
        out.waitlist = hide ? [] : out.waitlist.filter((w) => !w.barberId || w.barberId === me)
        if (hide) {
          // só os 4 últimos números (a profissional identifica a cliente sem ver o contato)
          const l4 = (p) => { const d = onlyDigits(p); return d.length >= 10 ? d.slice(-4) : '' }
          out.appointments.forEach((a) => { a.clientPhoneLast4 = l4(a.clientPhone); a.clientPhone = '' })
          out.clients.forEach((c) => { c.phoneLast4 = l4(c.phone); c.phone = '' })
          out.barbers.forEach((b) => { if (b.id !== me) b.phone = '' })
        }
        out.barbers.forEach((b) => { delete b.pin })
      }
      return out
    },
    async linkStaff() {},
    async linkReception() {},
    async unlinkReception() {},
    async setProductUnit(id, unit) { const p = data.products.find((x) => x.id === id); if (p) { p.unit = unit; save() } },
    /** WhatsApp da cliente pela equipe (gestão, recepção ou profissional) */
    async setClientPhone(id, phone) {
      const ph = onlyDigits(phone)
      if (ph.length < 10 || ph.length > 13) throw new Error('WhatsApp inválido: use DDD + número')
      if (data.clients.some((x) => x.id !== id && onlyDigits(x.phone) === ph)) throw new Error('Esse WhatsApp já é de outra cliente')
      const c = data.clients.find((x) => x.id === id); if (!c) throw new Error('Cliente não encontrada')
      c.phone = ph
      data.appointments.filter((a) => a.clientId === id && a.date >= today() && ['agendado', 'confirmado'].includes(a.status)).forEach((a) => { a.clientPhone = ph })
      save(); return ph.slice(-4)
    },
    async savePush() {},
    async createStaffLogin() { throw new Error('No modo demonstração o acesso é pelo PIN') },
    async confirmInfo(id) { const a = data.appointments.find((x) => x.id === id); return a ? { client: a.clientName, date: a.date, items: [{ time: a.time, services: 'Atendimento', barber: '', status: a.status }] } : null },
    async confirmAppointment(id) { const a = data.appointments.find((x) => x.id === id); if (a) { a.status = 'confirmado'; save() } return this.confirmInfo(id) },
    async saveClientPush() {},
    async notifyAppointment() { return { client: 0, pro: 0, demo: true } },
    async removePush() {},
    async testPush() { return { sent: 0, demo: true } },
    async markRead(id, barberId) {
      const n = data.announcements.find((x) => x.id === id)
      if (n) { n.reads = { ...(n.reads || {}), [barberId || 'admin']: new Date().toISOString() }; save() }
    },

    /** horários ocupados de um dia (para montar a grade pública) */
    async busy(date) {
      return data.appointments
        .filter((a) => a.date === date && !['cancelado', 'faltou'].includes(a.status))
        .map((a) => ({ barberId: a.barberId, time: a.time, duration: a.duration }))
        .concat(data.blocks.filter((b) => b.date === date).map((b) => ({
          barberId: b.barberId, time: b.start || '00:00', duration: b.start ? toMin(b.end) - toMin(b.start) : 1440, block: true,
        })))
    },

    async book(p) {
      if (p.clientId && onlyDigits(p.clientPhone).length < 10) { const c = data.clients.find((x) => x.id === p.clientId); if (c) p = { ...p, clientName: c.name, clientPhone: c.phone } }
      const ov = data.settings.privacy?.overlap || {}
      const capN = p.source === 'balcao' && (ov.barbers || []).includes(p.barberId) ? Math.max(2, Number(ov.max || 2)) : 1
      if (!p.force && data.appointments.filter((a) => a.barberId === p.barberId && a.date === p.date && !['cancelado', 'faltou'].includes(a.status) && toMin(p.time) < toMin(a.time) + Number(a.duration) && toMin(p.time) + Number(p.duration) > toMin(a.time)).length >= capN) throw new Error('Esse horário acabou de ser reservado. Escolha outro, por favor.')
      const blocked = !p.force && data.blocks.some((b) => b.barberId === p.barberId && b.date === p.date && (!b.start || (toMin(p.time) < toMin(b.end) && toMin(p.time) + Number(p.duration) > toMin(b.start))))
      if (blocked) throw new Error('A profissional não atende nesse horário. Escolha outro, por favor.')
      const c = upsertClient({ name: p.clientName, phone: p.clientPhone, birthday: p.birthday })
      const appt = {
        id: uid(), date: p.date, time: p.time, duration: p.duration, barberId: p.barberId, serviceIds: p.serviceIds,
        clientId: c.id, clientName: c.name, clientPhone: c.phone, total: p.total, status: 'agendado',
        source: p.source || 'online', notes: p.notes || '', saleId: null, createdAt: today(), promo: p.promo || null,
      }
      data.appointments.push(appt); save()
      return clone(appt)
    },

    async updateAppointment(id, patch) {
      const a = data.appointments.find((x) => x.id === id)
      if (!a) throw new Error('Agendamento não encontrado')
      const force = patch.force; delete patch.force
      if (!force && (patch.time || patch.date || patch.barberId) && overlaps(patch.barberId ?? a.barberId, patch.date ?? a.date, patch.time ?? a.time, patch.duration ?? a.duration, id))
        throw new Error('Conflito de horário com outro agendamento.')
      Object.assign(a, patch); save()
      return clone(a)
    },

    async upsert(table, row) {
      const list = (data[table] ||= [])
      if (!row.id) row = { ...row, id: uid() }
      const i = list.findIndex((x) => x.id === row.id)
      if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row)
      save(); return clone(row)
    },

    async patch(table, id, fields) { const r = (data[table] || []).find((x) => x.id === id); if (r) Object.assign(r, fields); save(); return clone(r) },
    async remove(table, id) { data[table] = data[table].filter((x) => x.id !== id); save() },
    /** vendas de qualquer período (o app só carrega ~120 dias) */
    async salesRange(from, to) { return clone(data.sales.filter((s) => s.date >= from && s.date <= to)) },

    async saveSettings(s) { data.settings = { ...data.settings, ...s }; save(); return clone(data.settings) },

    async upsertClient(c) { const r = upsertClient(c); save(); return clone(r) },

    async createSale(sale) {
      const s = { ...sale, id: uid(), createdAt: new Date().toISOString() }
      data.sales.push(s)
      if (s.appointmentId) {
        const a = data.appointments.find((x) => x.id === s.appointmentId)
        if (a) { a.status = 'concluido'; a.saleId = s.id; a.total = s.total }
      }
      for (const it of s.items) if (it.type === 'product' || it.type === 'supply') { // insumo também baixa/volta do estoque
        const p = data.products.find((x) => x.id === it.refId)
        if (p) p.stock = Math.max(0, Number(p.stock) - it.qty)
      }
      pkgApply(s.items, 1)
      save(); return clone(s)
    },
    async clientFiles(clientId) { return clone((data.clientFiles || []).filter((x) => x.clientId === clientId)) },
    async uploadClientFile(clientId, file, by) {
      const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file) })
      const row = { id: uid(), clientId, name: file.name, path: url, mime: file.type, size: file.size, createdBy: by, createdAt: new Date().toISOString() }
      ;(data.clientFiles ||= []).unshift(row); save(); return clone(row)
    },
    async clientFileUrl(f) { return f.path },
    async deleteClientFile(f) { data.clientFiles = (data.clientFiles || []).filter((x) => x.id !== f.id); save() },
    async editSale(id, sale) {
      const s = data.sales.find((x) => x.id === id); if (!s) return
      pkgApply(s.items, -1); pkgApply(sale.items, 1)
      // estoque: devolve o da versão antiga (produtos e insumos) e baixa o da nova
      const stock = (items, sign) => items.filter((it) => it.type === 'product' || it.type === 'supply').forEach((it) => { const p = data.products.find((x) => x.id === it.refId); if (p) p.stock = Math.max(0, Number(p.stock) + sign * Number(it.qty)) })
      stock(s.items, 1); stock(sale.items, -1)
      Object.assign(s, sale)
      const ap = s.appointmentId && data.appointments.find((x) => x.id === s.appointmentId)
      if (ap) { const ids = sale.items.filter((i) => i.type === 'service').map((i) => i.refId); Object.assign(ap, { barberId: sale.barberId, total: sale.total, ...(ids.length ? { serviceIds: ids } : {}) }) }
      save()
    },

    async adjustSale(id, a, payment) {
      const s = data.sales.find((x) => x.id === id); if (!s) return
      Object.assign(s, { items: a.items, discount: a.discount, total: a.total, commissionTotal: a.commissionTotal, payment: payment || s.payment })
      if (s.appointmentId) { const ap = data.appointments.find((x) => x.id === s.appointmentId); if (ap) ap.total = a.total }
      save()
    },
    async deleteSale(id) {
      const s = data.sales.find((x) => x.id === id)
      if (!s) return
      for (const it of s.items) if (it.type === 'product' || it.type === 'supply') { // insumo também baixa/volta do estoque
        const p = data.products.find((x) => x.id === it.refId); if (p) p.stock = Number(p.stock) + it.qty
      }
      pkgApply(s.items, -1)
      // pacote estornado: volta a pendente; sem sessão usada, é excluído
      for (const it of s.items) if (it.type === 'package') { const p = (data.packages || []).find((x) => x.id === it.refId); if (p) { p.payment = 'pendente'; if ((p.items || []).every((i) => !Number(i.used || 0))) data.packages = data.packages.filter((x) => x.id !== p.id) } }
      if (s.appointmentId) { const a = data.appointments.find((x) => x.id === s.appointmentId); if (a) { a.status = 'confirmado'; a.saleId = null } }
      data.sales = data.sales.filter((x) => x.id !== id); save()
    },

    // ---- Portal do cliente (Meus horários): entra pelo link pessoal OU celular + aniversário ----
    async clientAccess({ token, phone, birthday }) {
      const tok = (c) => c.portalToken || `demo-${c.id}`
      let c
      if (token) { c = data.clients.find((x) => tok(x) === token); if (!c) return { error: 'link' } }
      else {
        const p = onlyDigits(phone); const d = onlyDigits(birthday)
        const fails = (data._portalFails ||= {})
        if ((fails[p] || []).filter((t) => t > Date.now() - 3600e3).length >= 5) return { error: 'bloqueado' }
        c = data.clients.find((x) => onlyDigits(x.phone) === p)
        if (!c || d.length !== 4 || c.birthday !== `${d.slice(2)}-${d.slice(0, 2)}`) { (fails[p] ||= []).push(Date.now()); save(); return { error: c && !c.birthday ? 'semaniversario' : 'dados' } }
      }
      return { ...(await this._portal(c)), token: tok(c) }
    },
    /** agendar: só saudação e benefícios (sem histórico, sem horários, sem cancelar) */
    async bookingProfile(phone) {
      const c = data.clients.find((x) => onlyDigits(x.phone) === onlyDigits(phone))
      if (!c) return null
      const p = await this._portal(c)
      return clone({ client: { name: c.name.split(' ')[0], hasBirthday: !!c.birthday }, last: p.last, loyalty: p.loyalty, club: p.club, birthdayMonth: p.birthdayMonth })
    },
    async _portal(c) {
      const mine = data.appointments.filter((a) => a.clientId === c.id)
      const upcoming = mine.filter((a) => a.date >= today() && ['agendado', 'confirmado'].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      const last = mine.filter((a) => a.status === 'concluido').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0] || null
      const reviewed = new Set(data.reviews.map((r) => r.saleId))
      const toReview = data.sales.filter((s) => s.clientId === c.id && !reviewed.has(s.id) && s.date >= addDays(today(), -14)).sort((a, b) => b.date.localeCompare(a.date))[0] || null
      return clone({
        client: { id: c.id, name: c.name, birthday: c.birthday },
        upcoming, last: last && { serviceIds: last.serviceIds, barberId: last.barberId, date: last.date },
        loyalty: loyaltyOf(c.id, data.sales, data.settings),
        club: clubOf(c.id, data),
        birthdayMonth: isBirthdayMonth(c.birthday),
        toReview: toReview && { id: toReview.id, date: toReview.date },
      })
    },
    async clientCancel(id, token) {
      const c = data.clients.find((x) => (x.portalToken || `demo-${x.id}`) === token)
      const a = data.appointments.find((x) => x.id === id)
      if (!c || !a || a.clientId !== c.id || a.date < today() || !['agendado', 'confirmado'].includes(a.status)) throw new Error('Agendamento não encontrado')
      a.status = 'cancelado'; save()
    },
    async joinWaitlist(w) {
      const row = { ...w, id: uid(), phone: onlyDigits(w.phone), status: 'aguardando', createdAt: today() }
      data.waitlist.push(row); save(); return clone(row)
    },
    async reviewTarget(saleId) {
      const s = data.sales.find((x) => x.id === saleId)
      if (!s) return null
      return clone({ saleId, clientFirst: (s.clientName || '').split(' ')[0], barberName: data.barbers.find((b) => b.id === s.barberId)?.name, barberId: s.barberId,
        services: s.items.filter((i) => i.type === 'service').map((i) => i.name).join(' + '), date: s.date, reviewed: data.reviews.some((r) => r.saleId === saleId) })
    },
    async submitReview({ saleId, stars, comment }) {
      const s = data.sales.find((x) => x.id === saleId)
      if (!s) throw new Error('Atendimento não encontrado')
      if (data.reviews.some((r) => r.saleId === saleId)) throw new Error('Este atendimento já foi avaliado. Obrigado!')
      data.reviews.push({ id: uid(), saleId, barberId: s.barberId, clientName: s.clientName, stars: Number(stars), comment: comment || '', createdAt: today() }); save()
    },
    async uploadAvatar(_id, dataUrl) { return dataUrl },
    async savePhoto({ barberId, clientId, appointmentId, dataUrl, caption, isPrivate = false }) {
      const row = { id: uid(), barberId, clientId, appointmentId, url: dataUrl, caption: caption || '', createdAt: today(), private: !!isPrivate }
      data.photos.unshift(row)
      if (data.photos.length > 80) data.photos = data.photos.slice(0, 80) // limite do modo demo
      save(); return clone(row)
    },
    async backup() { return clone(data) },
    async deletePhoto(id) { data.photos = data.photos.filter((p) => p.id !== id); save() },
    async bulkImport({ services = [], products = [], clients = [] }) {
      let n = 0
      for (const x of services) { const i = data.services.findIndex((s) => s.name.toLowerCase() === x.name.toLowerCase()); if (i >= 0) data.services[i] = { ...data.services[i], ...x }; else data.services.push({ id: uid(), active: true, order: data.services.length + 1, description: '', ...x }); n++ }
      for (const x of products) { const i = data.products.findIndex((s) => s.name.toLowerCase() === x.name.toLowerCase()); if (i >= 0) data.products[i] = { ...data.products[i], ...x }; else data.products.push({ id: uid(), active: true, ...x }); n++ }
      for (const x of clients) { upsertClient(x); n++ }
      save(); return n
    },

    // ---- autenticação demo por PIN ----
    async login({ pin }) {
      if (pin === BRAND.demoAdminPin) return { role: 'admin', name: 'Gestão De Carlo', barberId: null }
      if (pin === '0000') return { role: 'reception', name: 'Recepção', barberId: null } // demonstração do perfil recepção
      const b = data.barbers.find((x) => x.active && x.pin === pin)
      if (b) return { role: 'barber', name: b.name, barberId: b.id }
      throw new Error('PIN inválido')
    },
    async logout() {},
    async session() { return null },

    reset() { data = buildSeed(); safeLS.set(KEY, data) },
  }
}
