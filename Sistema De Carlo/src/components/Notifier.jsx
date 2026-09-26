import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, CalendarPlus, Clock, Megaphone, Sun, X } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Modal } from './ui'
import { serviceNames } from './Appointments'
import { enablePush, pushStatus, showLocal, syncPush } from '../lib/push'
import { fmtDate, nowMin, relDay, safeLS, today, toMin } from '../lib/utils'

export const NOTIFY_DEFAULTS = { newBooking: true, reminderMinutes: 15, dailySummary: true, browser: true, pollSeconds: 60, cancel: true, reschedule: true, noShow: true, confirm: true, sales: true, reviews: true, waitlist: true, lowStock: 3, summaryTime: '07:30', selfToo: false }
export const notifyCfg = (settings) => ({ ...NOTIFY_DEFAULTS, ...(settings?.notify || {}) })

/** Avisos da gestão que esta pessoa ainda não leu */
export function pendingAnnouncements(data, session) {
  if (!data || session?.role !== 'barber') return []
  const me = session.barberId
  return (data.announcements || [])
    .filter((n) => n.active !== false && (!n.expiresAt || n.expiresAt >= today()) && (!n.audience || n.audience === 'all' || n.audience === me) && !n.reads?.[me])
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

/**
 * Pop-ups da equipe, enquanto o painel está aberto:
 * - novo agendamento (feito pelo site ou pela recepção)
 * - lembrete X minutos antes do próximo atendimento da profissional
 * - resumo da agenda do dia na primeira abertura
 * - avisos da gestão (precisam de "Ciente")
 * Com permissão, também aparecem como notificação do navegador.
 */
export default function Notifier() {
  const { data, session, actions } = useStore()
  const nav = useNavigate()
  const [cards, setCards] = useState([])
  const [askPerm, setAskPerm] = useState(false)
  const [later, setLater] = useState([])
  const cfg = notifyCfg(data?.settings)
  const who = session?.role === 'barber' ? session.barberId : 'admin'

  const push = useCallback((c) => {
    const card = { id: `${Date.now()}-${Math.random()}`, ...c }
    setCards((l) => [card, ...l].slice(0, 4))
    if (cfg.browser && document.hidden) showLocal({ title: c.title, body: c.body, tag: c.tag })
    setTimeout(() => setCards((l) => l.filter((x) => x.id !== card.id)), 45000)
  }, [cfg.browser])
  const close = (id) => setCards((l) => l.filter((x) => x.id !== id))

  // atualiza os dados de tempos em tempos (novos agendamentos aparecem sozinhos)
  useEffect(() => {
    if (!session) return undefined
    const t = setInterval(() => { if (!document.hidden || cfg.browser) actions.reload() }, Math.max(20, Number(cfg.pollSeconds) || 60) * 1000)
    return () => clearInterval(t)
  }, [session, actions, cfg.pollSeconds, cfg.browser])

  // convite para ativar as notificações neste aparelho (uma vez por aparelho)
  const askKey = `dcb:perm-asked:${who}`
  useEffect(() => {
    if (!session) return
    syncPush().catch(() => {})
    if (!cfg.browser || safeLS.get(askKey)) return
    pushStatus().then((st) => { if (st === 'off' || st === 'ios-install') setAskPerm(st) })
  }, [cfg.browser, session, askKey])
  const activate = async () => {
    safeLS.set(askKey, 1)
    try {
      const st = await enablePush()
      setAskPerm(false)
      if (st === 'on') actions.notify('Notificações ativadas neste aparelho')
      else if (st === 'denied') actions.notify('As notificações estão bloqueadas nas configurações do navegador', 'bad')
    } catch (e) { setAskPerm(false); actions.notify(`Não foi possível ativar: ${e.message}`, 'bad') }
  }

  const mine = useCallback((a) => (who === 'admin' ? true : a.barberId === who), [who])

  // novos agendamentos
  useEffect(() => {
    if (!data || !cfg.newBooking) return
    const key = `dcb:seen:${who}`
    const list = data.appointments.filter((a) => mine(a) && a.date >= today() && ['agendado', 'confirmado'].includes(a.status))
    const seen = safeLS.get(key)
    if (!seen) { safeLS.set(key, list.map((a) => a.id)); return }
    const set = new Set(seen)
    const fresh = list.filter((a) => !set.has(a.id))
    if (!fresh.length) return
    safeLS.set(key, [...seen, ...fresh.map((a) => a.id)].slice(-3000))
    if (fresh.length > 3) {
      push({ kind: 'new', icon: CalendarPlus, title: `${fresh.length} novos agendamentos`, body: 'Abra a agenda para ver os detalhes.', to: 'agenda', tag: 'new-many' })
      return
    }
    for (const a of fresh) {
      const b = data.barbers.find((x) => x.id === a.barberId)
      push({
        kind: 'new', icon: CalendarPlus, tag: `new-${a.id}`, to: 'agenda',
        title: a.source === 'online' ? 'Novo agendamento pelo site' : 'Novo agendamento',
        body: `${a.clientName.split(' ')[0]} · ${serviceNames(a, data.services)} · ${relDay(a.date)} às ${a.time}${who === 'admin' && b ? ` com ${b.name.split(' ')[0]}` : ''}`,
      })
    }
  }, [data, who, mine, push, cfg.newBooking])

  // lembrete antes do próximo atendimento + resumo do dia (profissional)
  useEffect(() => {
    if (!data || who === 'admin') return undefined
    const check = () => {
      const t = today()
      const todays = data.appointments.filter((a) => a.barberId === who && a.date === t && ['agendado', 'confirmado'].includes(a.status)).sort((a, b) => a.time.localeCompare(b.time))
      if (cfg.dailySummary && !safeLS.get(`dcb:summary:${who}:${t}`)) {
        safeLS.set(`dcb:summary:${who}:${t}`, 1)
        const h = new Date().getHours()
        push({
          kind: 'day', icon: Sun, tag: `day-${t}`, to: 'agenda',
          title: `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}! Sua agenda de hoje`,
          body: todays.length ? `${todays.length} ${todays.length > 1 ? 'atendimentos' : 'atendimento'}. O próximo é às ${todays.find((a) => toMin(a.time) >= nowMin())?.time || todays[0].time}.` : 'Nenhum atendimento marcado por enquanto.',
        })
      }
      const mins = Number(cfg.reminderMinutes) || 0
      if (!mins) return
      for (const a of todays) {
        const diff = toMin(a.time) - nowMin()
        const k = `dcb:reminded:${a.id}`
        if (diff >= 0 && diff <= mins && !safeLS.get(k)) {
          safeLS.set(k, 1)
          push({ kind: 'soon', icon: Clock, tag: `soon-${a.id}`, to: 'agenda', title: diff <= 1 ? 'Atendimento agora' : `Próximo atendimento em ${diff} min`, body: `${a.time} · ${a.clientName.split(' ')[0]} · ${serviceNames(a, data.services)}` })
        }
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [data, who, push, cfg.dailySummary, cfg.reminderMinutes])

  const pending = pendingAnnouncements(data, session)
  const notice = pending.find((n) => !later.includes(n.id))
  const goAgenda = (c) => { close(c.id); nav(who === 'admin' ? '/painel/agenda' : '/painel/minha-agenda') }

  return (
    <>
      <div className="notif-stack" aria-live="polite">
        {askPerm === 'off' && (
          <div className="notif-card perm">
            <span className="notif-ico"><BellRing size={18} /></span>
            <div className="notif-txt"><b>Receber alertas no celular?</b><small>Avisamos novos agendamentos, avisos da gestão e o próximo atendimento, mesmo com o site fechado.</small>
              <div className="notif-actions">
                <Button size="sm" onClick={activate}>Ativar</Button>
                <Button size="sm" variant="ghost" onClick={() => { safeLS.set(askKey, 1); setAskPerm(false) }}>Agora não</Button>
              </div>
            </div>
          </div>
        )}
        {askPerm === 'ios-install' && (
          <div className="notif-card perm">
            <span className="notif-ico"><BellRing size={18} /></span>
            <div className="notif-txt"><b>Alertas no iPhone</b><small>Toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra pelo ícone da De Carlo e ative as notificações.</small>
              <div className="notif-actions"><Button size="sm" variant="ghost" onClick={() => { safeLS.set(askKey, 1); setAskPerm(false) }}>Entendi</Button></div>
            </div>
          </div>
        )}
        {cards.map((c) => (
          <div key={c.id} className={`notif-card k-${c.kind}`} role="status">
            <span className="notif-ico"><c.icon size={18} /></span>
            <div className="notif-txt"><b>{c.title}</b><small>{c.body}</small>
              {c.to && <div className="notif-actions"><Button size="sm" variant="ghost" onClick={() => goAgenda(c)}>Ver na agenda</Button></div>}
            </div>
            <button className="icon-btn sm" onClick={() => close(c.id)} aria-label="Fechar aviso"><X size={16} /></button>
          </div>
        ))}
      </div>
      {notice && (
        <Modal open onClose={() => setLater((l) => [...l, notice.id])} title={notice.important ? 'Aviso importante' : 'Aviso da gestão'} footer={
          <Button block icon={Bell} onClick={() => actions.markRead(notice.id)}>Ciente{pending.length > 1 ? ` (${pending.length - 1} a mais)` : ''}</Button>
        }>
          <div className="notice-pop">
            <span className="notice-ico"><Megaphone size={22} /></span>
            <h4>{notice.title}</h4>
            <p>{notice.message}</p>
            <small className="muted">Publicado em {fmtDate(String(notice.createdAt).slice(0, 10))}{notice.expiresAt ? ` · válido até ${fmtDate(notice.expiresAt)}` : ''}</small>
          </div>
        </Modal>
      )}
    </>
  )
}
