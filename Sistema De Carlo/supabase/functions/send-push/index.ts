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

async function send(subs: Sub[], msgFor: (s: Sub) => Msg | null, table = 'push_subscriptions') {
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
      if (code === 404 || code === 410) await db.from(table).delete().eq('endpoint', s.endpoint) // aparelho desinstalou/revogou
      else console.error('push falhou', code, (e as Error).message)
    }
  }))
  return { sent, failed }
}

const brl = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
const hm = (t: unknown) => String(t || '').slice(0, 5)
const PAY: Record<string, string> = { pix: 'Pix', dinheiro: 'dinheiro', credito: 'crédito', debito: 'débito', cartao: 'cartão' }

/** aparelhos da gestão e/ou das profissionais indicadas, sem quem fez a ação */
async function audience(opts: { admin?: boolean; barbers?: (string | null | undefined)[]; actor?: unknown; selfToo?: boolean }) {
  const ids = [...new Set((opts.barbers || []).filter(Boolean))] as string[]
  const ors = [opts.admin ? 'role.eq.admin' : '', ...ids.map((b) => `barber_id.eq.${b}`)].filter(Boolean)
  if (!ors.length) return [] as Sub[]
  const { data } = await db.from('push_subscriptions').select('*').or(ors.join(','))
  const actor = opts.actor ? String(opts.actor) : ''
  return ((data || []) as Sub[]).filter((s) => opts.selfToo || !actor || s.user_id !== actor)
}
async function staffName(actor: unknown) {
  if (!actor) return ''
  const { data } = await db.from('staff').select('name, role').eq('user_id', String(actor)).maybeSingle()
  return data ? (data.role === 'admin' ? 'pela gestão' : `por ${first(data.name)}`) : ''
}
async function clientSubs(phone: string) {
  const { data } = await db.from('client_push').select('endpoint, keys').eq('phone', String(phone || '').replace(/\D/g, ''))
  return ((data || []) as Sub[]).map((s) => ({ ...s, role: 'client', barber_id: null, user_id: '' }))
}
const sendClient = (phone: string, m: Msg) => clientSubs(phone).then((subs) => send(subs, () => m, 'client_push'))
const agendaUrl = (s: Sub) => (s.role === 'admin' ? './#/painel/agenda' : './#/painel/minha-agenda')

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

    // ---------- Lembrete manual pelo painel (botão no agendamento) ----------
    if (type === 'manual') {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: { user } } = await db.auth.getUser(jwt)
      if (!user) return json({ error: 'faça login no painel' }, 401)
      const [{ data: st }, { data: a }] = await Promise.all([
        db.from('staff').select('role, barber_id').eq('user_id', user.id).maybeSingle(),
        db.from('appointments').select('*').eq('id', body.id).maybeSingle(),
      ])
      if (!st || !a || (st.role !== 'admin' && st.barber_id !== a.barber_id)) return json({ error: 'agendamento não encontrado' }, 404)
      const [svc, { data: b }, { data: settings }] = await Promise.all([
        serviceNames(a.service_ids),
        db.from('barbers').select('name').eq('id', a.barber_id).maybeSingle(),
        db.from('settings').select('shop_name').eq('id', 'main').maybeSingle(),
      ])
      const when = `${dayLabel(a.date)} às ${hm(a.time)}`
      const shop = settings?.shop_name || 'De Carlo Beauty'
      const [c, p] = await Promise.all([
        sendClient(a.client_phone, { title: `Lembrete: ${when}`, body: `${first(a.client_name)}, seu horário de ${svc}${b?.name ? ` com ${first(b.name)}` : ''} está confirmado na ${shop}. Te esperamos!`, tag: `cli-${a.id}`, url: './#/meus' }),
        audience({ barbers: [a.barber_id] }).then((subs) => send(subs, () => ({ title: `Lembrete: ${first(a.client_name)} ${when}`, body: svc, tag: `soon-${a.id}`, url: './#/painel/minha-agenda' }))),
      ])
      return json({ client: c.sent, pro: p.sent })
    }

    if (!fromDb) return json({ error: 'não autorizado' }, 401)
    const { data: settings } = await db.from('settings').select('shop_name, notify').eq('id', 'main').maybeSingle()
    const notify = { newBooking: true, cancel: true, reschedule: true, noShow: true, confirm: true, sales: true, reviews: true, waitlist: true, selfToo: false, ...(settings?.notify || {}) }
    const selfToo = !!notify.selfToo

    // ---------- Novo agendamento: gestão + profissional ----------
    if (type === 'appointment') {
      if (notify.newBooking === false) return json({ skipped: 'desligado em Ajustes' })
      const { data: a } = await db.from('appointments').select('*').eq('id', body.id).maybeSingle()
      if (!a) return json({ error: 'agendamento não encontrado' }, 404)
      const [{ data: b }, svc, { data: subs }] = await Promise.all([
        db.from('barbers').select('name').eq('id', a.barber_id).maybeSingle(),
        serviceNames(a.service_ids),
        audience({ admin: true, barbers: [a.barber_id], actor: body.actor, selfToo }).then((data) => ({ data })),
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

    // ---------- Lembrete automático da cliente (1 dia, 1 hora, 15 min) ----------
    if (type === 'client_reminder') {
      const { data: a } = await db.from('appointments').select('*').eq('id', body.id).maybeSingle()
      if (!a || !['agendado', 'confirmado'].includes(a.status)) return json({ skipped: 'inativo' })
      const [svc, { data: b }] = await Promise.all([serviceNames(a.service_ids), db.from('barbers').select('name').eq('id', a.barber_id).maybeSingle()])
      const stage = Number(body.stage)
      const title = stage >= 1440 ? `Lembrete: ${dayLabel(a.date)} às ${hm(a.time)}` : stage >= 60 ? `Seu horário é daqui a 1 hora (${hm(a.time)})` : `Faltam 15 minutos para o seu horário`
      return json(await sendClient(a.client_phone, {
        title, body: `${svc}${b?.name ? ` com ${first(b.name)}` : ''} · ${settings?.shop_name || 'De Carlo Beauty'}`,
        tag: `cli-${a.id}`, url: './#/meus', important: stage <= 15,
      }))
    }

    // ---------- Cancelamento, remarcação, falta, confirmação ----------
    if (type === 'change') {
      const kind = String(body.kind || '')
      const flag: Record<string, string> = { cancel: 'cancel', restore: 'cancel', reschedule: 'reschedule', noshow: 'noShow', confirm: 'confirm' }
      if (!flag[kind] || notify[flag[kind]] === false) return json({ skipped: kind })
      const { data: a } = await db.from('appointments').select('*').eq('id', body.id).maybeSingle()
      if (!a) return json({ error: 'agendamento não encontrado' }, 404)
      const oldBarber = body.old_barber ? String(body.old_barber) : a.barber_id
      const [{ data: bs }, svc, by] = await Promise.all([
        db.from('barbers').select('id,name').in('id', [a.barber_id, oldBarber]),
        serviceNames(a.service_ids),
        staffName(body.actor),
      ])
      const bn = (id: string) => first(bs?.find((x) => x.id === id)?.name || '')
      const who = first(a.client_name)
      const when = `${dayLabel(a.date)} às ${hm(a.time)}`
      const whom = (s: Sub) => (s.role === 'admin' && bn(a.barber_id) ? ` com ${bn(a.barber_id)}` : '')
      let subs: Sub[] = []
      let msg: (s: Sub) => Msg
      if (kind === 'cancel') {
        const origin = body.actor ? by : 'pela cliente, no site'
        const { count } = await db.from('waitlist').select('id', { count: 'exact', head: true }).eq('date', a.date).eq('status', 'aguardando')
        subs = await audience({ admin: true, barbers: [a.barber_id], actor: body.actor, selfToo })
        msg = (s) => ({
          title: 'Agendamento cancelado',
          body: `${who} · ${svc} · ${when}${whom(s)}${origin ? ` · cancelado ${origin}` : ''}${s.role === 'admin' && count ? ` · ${count} na lista de espera deste dia` : ''}`,
          tag: `cancel-${a.id}`, url: agendaUrl(s), important: true,
        })
      } else if (kind === 'restore') {
        subs = await audience({ admin: true, barbers: [a.barber_id], actor: body.actor, selfToo })
        msg = (s) => ({ title: 'Agendamento reativado', body: `${who} · ${svc} · ${when}${whom(s)}`, tag: `new-${a.id}`, url: agendaUrl(s) })
      } else if (kind === 'reschedule') {
        subs = await audience({ admin: true, barbers: [a.barber_id, oldBarber], actor: body.actor, selfToo })
        const from = `${dayLabel(String(body.old_date))} às ${hm(body.old_time)}`
        msg = (s) => {
          const left = s.role === 'barber' && oldBarber !== a.barber_id && s.barber_id === oldBarber
          return {
            title: left ? 'Atendimento passou para outra profissional' : 'Agendamento remarcado',
            body: left
              ? `${who} · ${svc} · ${from} agora é com ${bn(a.barber_id)}`
              : `${who} · ${svc} · de ${from} para ${when}${whom(s)}${s.role === 'admin' && oldBarber !== a.barber_id ? ` (antes com ${bn(oldBarber)})` : ''}`,
            tag: `move-${a.id}`, url: agendaUrl(s),
          }
        }
      } else if (kind === 'noshow') {
        subs = await audience({ admin: true, actor: body.actor, selfToo })
        msg = () => ({ title: 'Cliente faltou', body: `${who} · ${svc} · ${when} com ${bn(a.barber_id)}`, tag: `noshow-${a.id}`, url: './#/painel/agenda' })
      } else {
        subs = await audience({ admin: true, barbers: [a.barber_id], actor: body.actor, selfToo })
        msg = (s) => ({ title: 'Horário confirmado', body: `${who} · ${svc} · ${when}${whom(s)}`, tag: `confirm-${a.id}`, url: agendaUrl(s) })
      }
      // a cliente também fica sabendo quando a equipe mexe no horário dela
      if (body.actor && ['cancel', 'reschedule', 'confirm'].includes(kind)) {
        await sendClient(a.client_phone, kind === 'cancel'
          ? { title: 'Seu horário foi cancelado', body: `${svc} · ${when}. Chame a gente no WhatsApp para remarcar.`, tag: `cli-${a.id}`, url: './#/meus' }
          : kind === 'reschedule'
            ? { title: 'Seu horário mudou', body: `${svc} · agora ${when}${bn(a.barber_id) ? ` com ${bn(a.barber_id)}` : ''}`, tag: `cli-${a.id}`, url: './#/meus' }
            : { title: 'Horário confirmado ✓', body: `${svc} · ${when}${bn(a.barber_id) ? ` com ${bn(a.barber_id)}` : ''}`, tag: `cli-${a.id}`, url: './#/meus' })
      }
      return json(await send(subs, msg))
    }

    // ---------- Atendimento concluído / venda: gestão ----------
    if (type === 'sale') {
      if (notify.sales === false) return json({ skipped: 'sales' })
      const { data: v } = await db.from('sales').select('*').eq('id', body.id).maybeSingle()
      if (!v) return json({ error: 'venda não encontrada' }, 404)
      const { data: b } = await db.from('barbers').select('name').eq('id', v.barber_id).maybeSingle()
      const items = ((v.items || []) as { name: string }[]).map((i) => i.name).join(' + ') || 'Venda'
      const subs = await audience({ admin: true, actor: body.actor, selfToo })
      return json(await send(subs, () => ({
        title: v.appointment_id ? 'Atendimento concluído' : 'Venda registrada',
        body: `${first(v.client_name || 'Cliente')} · ${items} · ${brl(v.total)} no ${PAY[v.payment] || v.payment}${b?.name ? ` · ${first(b.name)}` : ''}`,
        tag: `sale-${v.id}`, url: './#/painel/caixa',
      })))
    }

    // ---------- Nova avaliação: gestão + profissional ----------
    if (type === 'review') {
      if (notify.reviews === false) return json({ skipped: 'reviews' })
      const { data: r } = await db.from('reviews').select('*').eq('id', body.id).maybeSingle()
      if (!r) return json({ error: 'avaliação não encontrada' }, 404)
      const subs = await audience({ admin: true, barbers: [r.barber_id] })
      const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)
      return json(await send(subs, (s) => ({
        title: `Nova avaliação ${stars}`,
        body: `${first(r.client_name || 'Cliente')}${r.comment ? `: “${String(r.comment).slice(0, 140)}”` : ' avaliou o atendimento'}`,
        tag: `review-${r.id}`, url: s.role === 'admin' ? './#/painel/inicio' : './#/painel/profissional',
        important: s.role === 'admin' && r.stars <= 3,
      })))
    }

    // ---------- Lista de espera: gestão ----------
    if (type === 'waitlist') {
      if (notify.waitlist === false) return json({ skipped: 'waitlist' })
      const { data: w } = await db.from('waitlist').select('*').eq('id', body.id).maybeSingle()
      if (!w) return json({ error: 'não encontrado' }, 404)
      const [svc, { data: b }] = await Promise.all([serviceNames(w.service_ids), w.barber_id ? db.from('barbers').select('name').eq('id', w.barber_id).maybeSingle() : Promise.resolve({ data: null })])
      const subs = await audience({ admin: true, actor: body.actor, selfToo })
      return json(await send(subs, () => ({
        title: 'Nova cliente na lista de espera',
        body: `${first(w.client_name)} · ${svc} · ${dayLabel(w.date)}${w.period && w.period !== 'qualquer' ? ` (${w.period})` : ''}${b?.name ? ` com ${first(b.name)}` : ''}`,
        tag: `wait-${w.id}`, url: './#/painel/agenda',
      })))
    }

    // ---------- Estoque baixo: gestão ----------
    if (type === 'stock') {
      const { data: p } = await db.from('products').select('*').eq('id', body.id).maybeSingle()
      if (!p) return json({ error: 'produto não encontrado' }, 404)
      const subs = await audience({ admin: true })
      return json(await send(subs, () => ({
        title: 'Estoque baixo',
        body: `${p.name}: ${p.stock <= 0 ? 'acabou' : `restam ${p.stock}`}. Hora de repor.`,
        tag: `stock-${p.id}`, url: './#/painel/catalogo',
      })))
    }

    // ---------- Resumo da agenda de manhã: cada profissional + gestão ----------
    if (type === 'summary') {
      const date = String(body.date || localToday())
      const [{ data: list }, { data: subs }, { data: bs }] = await Promise.all([
        db.from('appointments').select('id,time,barber_id,client_name,service_ids').eq('date', date).in('status', ['agendado', 'confirmado']).order('time'),
        db.from('push_subscriptions').select('*'),
        db.from('barbers').select('id,name,days_off').eq('active', true),
      ])
      const appts = list || []
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay()
      return json(await send((subs || []) as Sub[], (s) => {
        if (s.role === 'admin') {
          const perB = (bs || []).map((b) => ({ n: first(b.name), c: appts.filter((a) => a.barber_id === b.id).length })).filter((x) => x.c)
          return {
            title: `Bom dia! Agenda de hoje: ${appts.length} ${appts.length === 1 ? 'atendimento' : 'atendimentos'}`,
            body: appts.length ? `${perB.map((x) => `${x.n} ${x.c}`).join(' · ')}. Primeiro às ${hm(appts[0].time)}.` : 'Nenhum horário marcado por enquanto. Que tal divulgar o link de agendamento?',
            tag: `day-${date}`, url: './#/painel/agenda',
          }
        }
        const b = (bs || []).find((x) => x.id === s.barber_id)
        if (!b || (b.days_off || []).includes(wd)) return null
        const mine = appts.filter((a) => a.barber_id === s.barber_id)
        return {
          title: `Bom dia, ${first(b.name)}! Sua agenda de hoje`,
          body: mine.length ? `${mine.length} ${mine.length === 1 ? 'atendimento' : 'atendimentos'}: ${mine.slice(0, 4).map((a) => `${hm(a.time)} ${first(a.client_name)}`).join(', ')}${mine.length > 4 ? '…' : ''}` : 'Nenhum atendimento marcado por enquanto.',
          tag: `day-${date}`, url: './#/painel/minha-agenda',
        }
      }))
    }

    return json({ error: 'tipo desconhecido' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
