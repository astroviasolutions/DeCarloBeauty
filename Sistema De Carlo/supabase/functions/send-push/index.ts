// De Carlo Beauty — envio de notificações push
// Publicar no Supabase: Edge Functions → Deploy a new function → Via Editor → nome "send-push".
// Desligue "Verify JWT" (a função confere sozinha quem está chamando).
// Segredos (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PUSH_SECRET = Deno.env.get('PUSH_SECRET') ?? ''
const TZ = 'America/Sao_Paulo'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@astroviasolutions.com.br',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
)
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Sub = { endpoint: string; keys: { p256dh: string; auth: string }; role: string; barber_id: string | null; user_id: string }
type Msg = { title: string; body: string; tag?: string; url?: string; important?: boolean }

const first = (n = '') => n.trim().split(/\s+/)[0] || ''
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()) // YYYY-MM-DD
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
function dayLabel(iso: string) {
  const t = localToday()
  if (iso === t) return 'hoje'
  if (iso === addDays(t, 1)) return 'amanhã'
  const d = new Date(`${iso}T12:00:00Z`)
  return `${WD[d.getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

async function send(subs: Sub[], msgFor: (s: Sub) => Msg | null) {
  let sent = 0, failed = 0
  await Promise.all(subs.map(async (s) => {
    const m = msgFor(s)
    if (!m) return
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(m), { TTL: 60 * 60 * 6, urgency: 'high' })
      sent++
    } catch (e) {
      failed++
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint) // aparelho desinstalou/revogou
      else console.error('push falhou', code, (e as Error).message)
    }
  }))
  return { sent, failed }
}

async function serviceNames(ids: string[]) {
  if (!ids?.length) return 'Atendimento'
  const { data } = await db.from('services').select('id,name').in('id', ids)
  return ids.map((id) => data?.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') || 'Atendimento'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const type = String(body.type || '')
  const fromDb = PUSH_SECRET && req.headers.get('x-push-secret') === PUSH_SECRET

  try {
    // ---------- Teste pelo painel (Ajustes → Enviar teste) ----------
    if (type === 'test') {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: { user } } = await db.auth.getUser(jwt)
      if (!user) return json({ error: 'faça login no painel' }, 401)
      const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', user.id)
      const r = await send((subs || []) as Sub[], () => ({ title: 'Teste de notificação 🦋', body: 'Tudo certo! As notificações da De Carlo Beauty estão chegando neste aparelho.', tag: 'test', url: './#/painel' }))
      return json(r)
    }

    if (!fromDb) return json({ error: 'não autorizado' }, 401)
    const { data: settings } = await db.from('settings').select('shop_name, notify').eq('id', 'main').maybeSingle()
    const notify = { newBooking: true, ...(settings?.notify || {}) }

    // ---------- Novo agendamento: gestão + profissional ----------
    if (type === 'appointment') {
      if (notify.newBooking === false) return json({ skipped: 'desligado em Ajustes' })
      const { data: a } = await db.from('appointments').select('*').eq('id', body.id).maybeSingle()
      if (!a) return json({ error: 'agendamento não encontrado' }, 404)
      const [{ data: b }, svc, { data: subs }] = await Promise.all([
        db.from('barbers').select('name').eq('id', a.barber_id).maybeSingle(),
        serviceNames(a.service_ids),
        db.from('push_subscriptions').select('*').or(`role.eq.admin,barber_id.eq.${a.barber_id}`),
      ])
      const when = `${dayLabel(a.date)} às ${String(a.time).slice(0, 5)}`
      const r = await send((subs || []) as Sub[], (s) => ({
        title: a.source === 'online' ? 'Novo agendamento pelo site' : 'Novo agendamento',
        body: `${first(a.client_name)} · ${svc} · ${when}${s.role === 'admin' && b?.name ? ` com ${first(b.name)}` : ''}`,
        tag: `new-${a.id}`,
        url: s.role === 'admin' ? './#/painel/agenda' : './#/painel/minha-agenda',
      }))
      return json(r)
    }

    // ---------- Aviso da gestão: profissionais ----------
    if (type === 'announcement') {
      const { data: n } = await db.from('announcements').select('*').eq('id', body.id).maybeSingle()
      if (!n) return json({ error: 'aviso não encontrado' }, 404)
      let q = db.from('push_subscriptions').select('*').eq('role', 'barber')
      if (n.audience && n.audience !== 'all') q = q.eq('barber_id', n.audience)
      const { data: subs } = await q
      const text = `${n.title}: ${n.message}`
      const r = await send((subs || []) as Sub[], () => ({
        title: n.important ? 'Aviso importante da gestão' : 'Aviso da gestão',
        body: text.length > 180 ? `${text.slice(0, 177)}…` : text,
        tag: `ann-${n.id}`, url: './#/painel/meus-avisos', important: !!n.important,
      }))
      return json(r)
    }

    // ---------- Lembrete antes do atendimento: profissional ----------
    if (type === 'reminder') {
      const ids = (body.ids as string[]) || []
      if (!ids.length) return json({ sent: 0 })
      const { data: list } = await db.from('appointments').select('*').in('id', ids)
      let sent = 0, failed = 0
      for (const a of list || []) {
        const [svc, { data: subs }] = await Promise.all([
          serviceNames(a.service_ids),
          db.from('push_subscriptions').select('*').eq('role', 'barber').eq('barber_id', a.barber_id),
        ])
        const r = await send((subs || []) as Sub[], () => ({
          title: `Próximo atendimento às ${String(a.time).slice(0, 5)}`,
          body: `${first(a.client_name)} · ${svc}`,
          tag: `soon-${a.id}`, url: './#/painel/minha-agenda',
        }))
        sent += r.sent; failed += r.failed
      }
      return json({ sent, failed })
    }

    return json({ error: 'tipo desconhecido' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
