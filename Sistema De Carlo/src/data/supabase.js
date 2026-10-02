import { createClient } from '@supabase/supabase-js'
import { onlyDigits, today } from '../lib/utils'
import { clubOf, isBirthdayMonth, loyaltyOf } from '../lib/loyalty'

/**
 * Adaptador SUPABASE — produção.
 * Tabelas em snake_case (ver supabase/schema.sql); as telas usam camelCase.
 */
const snake = (s) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const toDb = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]))
const fromDb = (o) => {
  const r = Object.fromEntries(Object.entries(o).map(([k, v]) => [camel(k), v]))
  if (typeof r.time === 'string') r.time = r.time.slice(0, 5)
  for (const k of ['price', 'total', 'subtotal', 'discount', 'commissionTotal', 'amount', 'openingAmount', 'closingAmount', 'commission', 'serviceRate', 'productRate', 'goal', 'pct', 'birthdayDiscount', 'productDiscount'])
    if (r[k] !== null && r[k] !== undefined && typeof r[k] === 'string') r[k] = Number(r[k])
  return r
}

export function createSupabaseDB(url, key) {
  const sb = createClient(url, key)
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data }
  const all = async (t, q = (x) => x) => must(await q(sb.from(t).select('*'))).map(fromDb)
  // tabelas grandes: o Supabase entrega no máximo 1000 linhas por vez, então busca em páginas
  const allPaged = async (t, q = (x) => x) => {
    const out = []
    for (let i = 0; ; i += 1000) {
      const rows = must(await q(sb.from(t).select('*')).order('id').range(i, i + 999))
      out.push(...rows)
      if (rows.length < 1000) break
    }
    return out.map(fromDb)
  }
  let role = null // 'admin' | 'barber' — define o caminho de leitura/escrita

  return {
    mode: 'supabase',
    client: sb,

    async loadPublic() {
      const [settings] = await all('settings')
      const services = await all('services', (q) => q.eq('active', true).order('order'))
      const [barbers, plans, promos, photos] = await Promise.all([
        all('barbers_public'), all('plans', (q) => q.eq('active', true).order('order')), all('promos', (q) => q.eq('active', true)),
        all('photos', (q) => q.eq('private', false).order('created_at', { ascending: false }).limit(60)),
      ])
      return { settings, services, barbers: barbers.map((b) => ({ ...b, rating: { avg: Number(b.ratingAvg || 0), count: Number(b.ratingCount || 0) } })), plans, promos, photos: photos.reverse() }
    },

    async loadAll(session) {
      const since = new Date(); since.setDate(since.getDate() - 120)
      const from = since.toISOString().slice(0, 10)
      const pro = (session?.role || role) === 'barber'
      const [settingsRows, services, products, barbers, sales, payouts, cash, plans, subscriptions, blocks, reviews, promos, photos, announcements] = await Promise.all([
        all('settings'), all('services', (q) => q.order('order')), all('products', (q) => q.order('name')), all('barbers', (q) => q.order('name')),
        allPaged('sales', (q) => q.gte('date', from)), all('payouts'), all('cash', (q) => q.order('opened_at', { ascending: false }).limit(60)),
        all('plans', (q) => q.order('order')), all('subscriptions'), allPaged('blocks', (q) => q.gte('date', from)),
        all('reviews'), all('promos'), all('photos', (q) => q.order('created_at', { ascending: false }).limit(400)), all('announcements', (q) => q.order('created_at', { ascending: false }).limit(100)),
      ])
      let clients; let appointments; let waitlist = []; let expenses = []; let staff = []
      if (pro) {
        // profissional: só a agenda dela e, com a privacidade ligada, sem contato das clientes (regra no banco)
        const r = must(await sb.rpc('pro_data'))
        appointments = (r.appointments || []).map(fromDb); clients = (r.clients || []).map(fromDb)
      } else {
        ;[clients, appointments, waitlist, expenses, staff] = await Promise.all([
          allPaged('clients', (q) => q.order('name')), allPaged('appointments', (q) => q.gte('date', from)), all('waitlist', (q) => q.gte('date', today())), all('expenses'), all('staff'),
        ])
      }
      return { settings: settingsRows[0], services, products, barbers, clients, appointments, sales, payouts, cash, plans, subscriptions, waitlist, blocks, reviews, promos, photos, expenses, announcements, staff }
    },

    // ---- sincronização leve (economiza tráfego do plano gratuito) ----
    /** tabelas pequenas, recarregadas depois de cada ação */
    async loadSmall(session) {
      const since = new Date(); since.setDate(since.getDate() - 120)
      const from = since.toISOString().slice(0, 10)
      const pro = (session?.role || role) === 'barber'
      const [settingsRows, services, products, barbers, payouts, cash, plans, subscriptions, blocks, reviews, promos, announcements] = await Promise.all([
        all('settings'), all('services', (q) => q.order('order')), all('products', (q) => q.order('name')), all('barbers', (q) => q.order('name')),
        all('payouts'), all('cash', (q) => q.order('opened_at', { ascending: false }).limit(60)), all('plans', (q) => q.order('order')), all('subscriptions'),
        allPaged('blocks', (q) => q.gte('date', from)), all('reviews'), all('promos'), all('announcements', (q) => q.order('created_at', { ascending: false }).limit(100)),
      ])
      const out = { settings: settingsRows[0], services, products, barbers, payouts, cash, plans, subscriptions, blocks, reviews, promos, announcements }
      if (!pro) [out.waitlist, out.expenses, out.staff] = await Promise.all([all('waitlist', (q) => q.gte('date', today())), all('expenses'), all('staff')])
      return out
    },
    /** só o que mudou desde a última sincronização (agendamentos, clientes, vendas e avisos) */
    async loadChanges(sinceISO, session) {
      const pro = (session?.role || role) === 'barber'
      const [sales, announcements] = await Promise.all([
        allPaged('sales', (q) => q.gt('created_at', sinceISO)),
        all('announcements', (q) => q.order('created_at', { ascending: false }).limit(100)),
      ])
      if (pro) {
        const r = must(await sb.rpc('pro_data', { p_since: sinceISO }))
        return { appointments: (r.appointments || []).map(fromDb), clients: (r.clients || []).map(fromDb), sales, announcements }
      }
      const [appointments, clients] = await Promise.all([
        allPaged('appointments', (q) => q.gt('updated_at', sinceISO)), allPaged('clients', (q) => q.gt('updated_at', sinceISO)),
      ])
      return { appointments, clients, sales, announcements }
    },

    async busy(date) {
      return must(await sb.rpc('get_busy', { p_date: date })).map(fromDb)
    },

    async book(p) {
      if (p.clientId && onlyDigits(p.clientPhone).length < 10) {
        const id = must(await sb.rpc('staff_book_client', { p_client_id: p.clientId, p_barber_id: p.barberId, p_service_ids: p.serviceIds, p_date: p.date, p_time: p.time, p_duration: p.duration, p_total: p.total, p_notes: p.notes || '' }))
        return { ...p, id, status: 'agendado' }
      }
      const id = must(await sb.rpc('book_appointment', {
        p_client_name: p.clientName, p_client_phone: onlyDigits(p.clientPhone), p_barber_id: p.barberId,
        p_service_ids: p.serviceIds, p_date: p.date, p_time: p.time, p_duration: p.duration, p_total: p.total,
        p_source: p.source || 'online', p_notes: p.notes || '', p_birthday: p.birthday || null, p_promo: p.promo || null,
      }))
      return { ...p, id, status: 'agendado' }
    },

    async updateAppointment(id, patch) {
      if (role === 'barber') { must(await sb.rpc('pro_update_appointment', { p_id: id, p_patch: toDb(patch) })); return { id, ...patch } }
      return fromDb(must(await sb.from('appointments').update(toDb(patch)).eq('id', id).select().single()))
    },

    async upsert(table, row) {
      if (table === 'clients' && role === 'barber') {
        must(await sb.rpc('pro_update_client', { p_id: row.id, p_patch: { notes: row.notes, anamnese: row.anamnese, birthday: row.birthday } }))
        return row
      }
      return fromDb(must(await sb.from(table).upsert(toDb(row)).select().single()))
    },
    async markRead(id) { must(await sb.rpc('mark_announcement_read', { p_id: id })) },
    async linkStaff(email, barberId) { must(await sb.rpc('link_staff', { p_email: email, p_barber_id: barberId })) },

    async remove(table, id) { must(await sb.from(table).delete().eq('id', id)) },

    async saveSettings(s) {
      return fromDb(must(await sb.from('settings').upsert(toDb({ ...s, id: 'main' })).select().single()))
    },

    async upsertClient(c) {
      return fromDb(must(await sb.rpc('staff_upsert_client', { p_name: c.name, p_phone: onlyDigits(c.phone) })))
    },

    async createSale(sale) {
      // transação no banco: grava venda, baixa estoque e conclui o agendamento
      const id = must(await sb.rpc('create_sale', { p_sale: toDb(sale) }))
      return { ...sale, id }
    },

    async deleteSale(id) { must(await sb.rpc('delete_sale', { p_id: id })) },

    // ---- Portal do cliente ----
    async portal(phone) {
      const r = must(await sb.rpc('client_portal', { p_phone: onlyDigits(phone) }))
      if (!r) return null
      const sales = (r.sales || []).map(fromDb)
      const settings = fromDb(r.settings || {})
      const ctx = { subscriptions: (r.subscriptions || []).map(fromDb), plans: (r.plans || []).map(fromDb), sales }
      return {
        client: fromDb(r.client), upcoming: (r.upcoming || []).map(fromDb), last: r.last ? fromDb(r.last) : null,
        loyalty: loyaltyOf(r.client.id, sales, settings), club: clubOf(r.client.id, ctx),
        birthdayMonth: isBirthdayMonth(r.client.birthday), toReview: r.to_review ? fromDb(r.to_review) : null,
      }
    },
    async clientCancel(id, phone) { must(await sb.rpc('client_cancel', { p_id: id, p_phone: onlyDigits(phone) })) },
    async joinWaitlist(w) {
      must(await sb.rpc('join_waitlist', { p_date: w.date, p_barber_id: w.barberId, p_period: w.period, p_name: w.clientName, p_phone: onlyDigits(w.phone), p_service_ids: w.serviceIds || [] }))
    },
    async reviewTarget(saleId) { const r = must(await sb.rpc('review_target', { p_sale_id: saleId })); return r ? fromDb(r) : null },
    async submitReview({ saleId, stars, comment }) { must(await sb.rpc('submit_review', { p_sale_id: saleId, p_stars: stars, p_comment: comment || '' })) },
    async uploadAvatar(barberId, dataUrl) {
      const blob = await (await fetch(dataUrl)).blob()
      const path = `${barberId || 'equipe'}/avatar-${Date.now()}.jpg`
      must(await sb.storage.from('portfolio').upload(path, blob, { contentType: 'image/jpeg' }))
      return sb.storage.from('portfolio').getPublicUrl(path).data.publicUrl
    },
    async savePhoto({ barberId, clientId, appointmentId, dataUrl, caption, isPrivate = false }) {
      const blob = await (await fetch(dataUrl)).blob()
      const path = `${barberId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      must(await sb.storage.from('portfolio').upload(path, blob, { contentType: 'image/jpeg' }))
      const url = sb.storage.from('portfolio').getPublicUrl(path).data.publicUrl
      return fromDb(must(await sb.from('photos').insert(toDb({ barberId, clientId, appointmentId, url, caption, private: isPrivate })).select().single()))
    },
    async backup() {
      const T = ['settings', 'services', 'products', 'barbers', 'clients', 'appointments', 'sales', 'payouts', 'cash', 'plans', 'subscriptions', 'waitlist', 'blocks', 'reviews', 'promos', 'photos', 'expenses', 'announcements']
      const out = {}
      for (const t of T) out[t] = await allPaged(t)
      return out
    },
    async deletePhoto(id) {
      const path = must(await sb.rpc('delete_photo', { p_id: id }))
      if (path) await sb.storage.from('portfolio').remove([decodeURIComponent(path)])
    },
    async bulkImport({ services = [], products = [], clients = [] }) {
      const [sv, pr] = await Promise.all([all('services'), all('products')])
      const byName = (list, n) => list.find((x) => x.name.toLowerCase() === n.toLowerCase())
      for (const x of services) must(await sb.from('services').upsert(toDb({ ...(byName(sv, x.name) || { active: true }), ...x })))
      for (const x of products) must(await sb.from('products').upsert(toDb({ ...(byName(pr, x.name) || { active: true }), ...x })))
      if (clients.length) must(await sb.from('clients').upsert(clients.map((c) => toDb({ ...c, birthday: c.birthday || null })), { onConflict: 'phone' }))
      return services.length + products.length + clients.length
    },

    async login({ email, password }) {
      must(await sb.auth.signInWithPassword({ email, password }))
      return this.session()
    },
    async logout() { role = null; await sb.auth.signOut() },

    // ---- Notificações push ----
    async savePush(sub, ua) { must(await sb.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_keys: sub.keys, p_user_agent: (ua || '').slice(0, 300) })) },
    async saveClientPush(sub, phone, ua) { must(await sb.rpc('save_client_push', { p_endpoint: sub.endpoint, p_keys: sub.keys, p_phone: onlyDigits(phone), p_user_agent: (ua || '').slice(0, 300) })) },
    async notifyAppointment(id) {
      const { data, error } = await sb.functions.invoke('send-push', { body: { type: 'manual', id } })
      if (error) throw new Error('A função de envio não respondeu. Tente de novo em instantes.')
      return data
    },
    async confirmInfo(id, token) { return must(await sb.rpc('confirm_info', { p_id: id, p_token: token })) },
    async confirmAppointment(id, token) { return must(await sb.rpc('client_confirm', { p_id: id, p_token: token })) },
    async createStaffLogin(email, password, barberId) {
      const { data, error } = await sb.functions.invoke('send-push', { body: { type: 'create_staff', email, password, barber_id: barberId } })
      if (error) { let m = ''; try { m = (await error.context.json()).error } catch { /* sem detalhe */ } throw new Error(m || 'Não foi possível criar o acesso. Confira se a função send-push foi atualizada.') }
      return data
    },
    async removePush(endpoint) { must(await sb.rpc('delete_push_subscription', { p_endpoint: endpoint })) },
    async testPush() {
      const { data, error } = await sb.functions.invoke('send-push', { body: { type: 'test' } })
      if (error) throw new Error('A função de envio não respondeu. Confira se "send-push" foi publicada no Supabase.')
      if (!data?.sent) throw new Error('Nenhum aparelho ativado para este login. Toque em "Ativar neste aparelho" primeiro.')
      return data
    },
    async session() {
      const { data } = await sb.auth.getSession()
      if (!data.session) return null
      const prof = must(await sb.from('staff').select('*').eq('user_id', data.session.user.id).maybeSingle())
      if (!prof) throw new Error('Este login ainda não tem acesso ao painel. Peça para a gestão vincular seu e-mail em Equipe.')
      role = prof.role
      return { role: prof.role, name: prof.name, barberId: prof.barber_id }
    },

    reset() {},
  }
}
