import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, CalendarDays, Camera, Check, ChevronLeft, Clock, Crown, Gift, Hourglass, Lock, MapPin, Megaphone, MessageCircle, RotateCcw, Sparkles, Star, Search, User } from 'lucide-react'
import { useStore } from '../state/Store'
import { Avatar, Button, Field, Logo, Price, RuneRule, ThemeToggle } from '../components/ui'
import { BRAND } from '../config/brand'
import { ClubPlans, PortfolioModal, RuneMeter, WaitlistModal } from '../components/Loyalty'
import { promoFor } from '../lib/loyalty'
import { msg as fillMsg } from '../lib/messages'
import { doesAll, totalDuration } from '../lib/commission'
import ClientPush from '../components/ClientPush'
import AddToCalendar from '../components/AddToCalendar'
import {
  addDays, cls, fmtDateLong, freeSlots, maskPhone, money, onlyDigits, parseDate, relDay, safeLS, today, toMin, waLink, WD_SHORT, weekday,
} from '../lib/utils'

const ME_KEY = 'dcb:me'

export default function Booking() {
  const { pub, actions, error } = useStore()
  const [step, setStep] = useState(1)
  const [picked, setPicked] = useState([])
  const [barberId, setBarberId] = useState('any')
  const [sq, setSq] = useState('')
  const [cat, setCat] = useState('')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState(null)
  const [busy, setBusy] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [me, setMe] = useState(() => safeLS.get(ME_KEY, { name: '', phone: '' }))
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')
  const [autoDay, setAutoDay] = useState(true)
  const [portal, setPortal] = useState(null)
  const [bday, setBday] = useState('')
  const [gallery, setGallery] = useState(null) // barbeiro | 'all'
  const [waitOpen, setWaitOpen] = useState(false)
  const loc = useLocation()
  const [rebook, setRebook] = useState(() => loc.state?.rebook || null)
  useEffect(() => {
    if (!rebook) return
    setPicked(rebook.serviceIds); setBarberId(rebook.barberId || 'any'); setDate(rebook.date); setAutoDay(false); setStep(2)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const settings = pub?.settings
  const barbers = useMemo(() => pub?.barbers || [], [pub])
  const services = useMemo(() => (pub?.services || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [pub])

  // Um ou mais serviços combinados num único atendimento (duração e preço somados)
  const service = useMemo(() => {
    const list = picked.map((id) => services.find((x) => x.id === id)).filter(Boolean)
    if (!list.length) return null
    return {
      ids: list.map((x) => x.id), list, count: list.length,
      name: list.map((x) => x.name).join(' + '),
      duration: list.reduce((a, x) => a + Number(x.duration), 0),
      price: list.reduce((a, x) => a + Number(x.price), 0),
    }
  }, [picked, services])
  // só as profissionais que fazem todos os serviços escolhidos
  const able = useMemo(() => (service ? barbers.filter((b) => doesAll(b, service.ids)) : barbers), [barbers, service])
  useEffect(() => { if (barberId !== 'any' && !able.some((b) => b.id === barberId)) setBarberId('any') }, [able, barberId])
  const togglePick = (id) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  const days = useMemo(() => {
    if (!settings) return []
    return Array.from({ length: settings.bookingDaysAhead || 21 }, (_, i) => addDays(today(), i))
  }, [settings])

  const dayOpen = (d) => !!settings?.hours?.[weekday(d)]

  // Cliente que já agendou antes: carrega runas, clube, aniversário e "o de sempre"
  const myPhone = onlyDigits(me.phone)
  useEffect(() => {
    if (myPhone.length < 10 || !pub) return
    let alive = true
    actions.portal(myPhone).then((p) => alive && setPortal(p)).catch(() => {})
    return () => { alive = false }
  }, [myPhone, pub, actions, done])

  const usual = useMemo(() => {
    if (!portal?.last) return null
    const ids = portal.last.serviceIds.filter((id) => services.some((s) => s.id === id))
    if (!ids.length) return null
    return { ids, barber: barbers.find((b) => b.id === portal.last.barberId), names: ids.map((id) => services.find((s) => s.id === id).name).join(' + ') }
  }, [portal, services, barbers])
  const repeatUsual = () => {
    setPicked(usual.ids); setBarberId(usual.barber ? usual.barber.id : 'any')
    setTime(null); setAutoDay(true); setDate(today()); setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const photos = pub?.photos || []

  useEffect(() => {
    if (step !== 2) return
    let alive = true
    setLoadingSlots(true)
    actions.busy(date).then((b) => { if (alive) { setBusy(b); setLoadingSlots(false) } })
    return () => { alive = false }
  }, [date, step, actions])

  // horários livres por barbeiro
  const slotsByBarber = useMemo(() => {
    if (!settings || !service) return {}
    const hours = settings.hours?.[weekday(date)]
    const out = {}
    for (const b of able) {
      if (b.daysOff?.includes(weekday(date))) { out[b.id] = []; continue }
      out[b.id] = freeSlots({
        date, hours, duration: totalDuration(service.list, b), step: Number(settings.slotStep || 30), breakTime: b.lunch || settings.breakTime,
        busy: busy.filter((x) => x.barberId === b.id),
      })
    }
    return out
  }, [settings, service, able, busy, date])

  const slots = useMemo(() => {
    if (barberId !== 'any') return slotsByBarber[barberId] || []
    const set = new Set(Object.values(slotsByBarber).flat())
    return [...set].sort()
  }, [slotsByBarber, barberId])

  const groups = useMemo(() => ([
    ['Manhã', slots.filter((t) => toMin(t) < 12 * 60)],
    ['Tarde', slots.filter((t) => toMin(t) >= 12 * 60 && toMin(t) < 18 * 60)],
    ['Noite', slots.filter((t) => toMin(t) >= 18 * 60)],
  ].filter(([, l]) => l.length)), [slots])

  // Se o dia escolhido não tem horário (ex.: já é noite), pula sozinho para o próximo dia com vaga
  useEffect(() => {
    if (step !== 2 || !autoDay || loadingSlots || slots.length) return
    const next = days.find((d) => d > date && dayOpen(d))
    if (next) setDate(next); else setAutoDay(false)
  }, [step, autoDay, loadingSlots, slots, days, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedBarber = useMemo(() => {
    if (!time) return null
    if (barberId !== 'any') return barbers.find((b) => b.id === barberId)
    // "sem preferência": escolhe quem está livre e com menos atendimentos no dia
    const free = able.filter((b) => slotsByBarber[b.id]?.includes(time))
    free.sort((a, b) => busy.filter((x) => x.barberId === a.id).length - busy.filter((x) => x.barberId === b.id).length)
    return free[0] || null
  }, [time, barberId, able, barbers, slotsByBarber, busy])

  const goToTime = () => { if (!service) return; setTime(null); setAutoDay(true); setDate(today()); setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const pickTime = (t) => { setTime(t); setStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const promo = useMemo(() => promoFor(pub?.promos, date, time, weekday), [pub, date, time])
  const bdayISO = (() => { const d = onlyDigits(bday); if (d.length !== 4) return ''; const dd = +d.slice(0, 2), mm = +d.slice(2); return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 ? `${d.slice(2)}-${d.slice(0, 2)}` : '' })()

  const confirm = async (e) => {
    e.preventDefault()
    setErr('')
    if (me.name.trim().length < 2) return setErr('Informe seu nome.')
    if (onlyDigits(me.phone).length < 10) return setErr('Informe um WhatsApp válido com DDD.')
    if (!resolvedBarber) return setErr('Horário indisponível. Escolha outro.')
    setSending(true)
    try {
      const appt = await actions.book({
        clientName: me.name.trim(), clientPhone: me.phone, barberId: resolvedBarber.id, serviceIds: service.ids,
        date, time, duration: totalDuration(service.list, resolvedBarber), total: Number(service.price),
        birthday: bdayISO || undefined, promo: promo ? { label: promo.label, pct: promo.pct } : null,
      })
      safeLS.set(ME_KEY, me)
      if (rebook) { await actions.clientCancel(rebook.id, rebook.phone).catch(() => {}); setRebook(null) }
      setDone({ ...appt, barber: resolvedBarber, service, promo, rebooked: !!rebook })
    } catch (e2) {
      setErr(e2.message)
      setStep(2)
      setTime(null)
      actions.busy(date).then(setBusy)
    } finally { setSending(false) }
  }

  const reset = () => { setDone(null); setStep(1); setPicked([]); setTime(null); setBarberId('any') }

  if (error && !pub) return <div className="center-screen"><p>Não foi possível carregar: {error}</p></div>
  if (!pub) return <div className="center-screen"><Logo size={72} /></div>

  const todayHours = settings.hours?.[weekday(today())]

  const insta = (settings.instagram || '').replace('@', '')

  return (
    <div className="booking">
      <header className="hero">
        <div className="hero-art">
          <div className="hero-img" style={{ backgroundImage: `url(${BRAND.banner})` }} aria-hidden="true" />
          <div className="hero-top">
            <Logo size={38} />
            <div className="hero-top-actions">
              <ThemeToggle className="on-art" />
              <Link to="/meus" className="btn btn-glass"><CalendarDays size={16} /> <span>Meus horários</span></Link>
              <Link to="/painel" className="btn btn-glass hide-sm"><Lock size={16} /> <span>Área da equipe</span></Link>
            </div>
          </div>
          <div className="hero-title">
            <img className="hero-mark only-light" src={BRAND.mark} alt={settings.shopName} />
            <img className="hero-mark only-dark" src={BRAND.markLight} alt="" />
            <h1 className="wordmark">{settings.shopName}</h1>
            <RuneRule />
            <p className="hero-lead">{settings.page?.heroText || BRAND.heroText}</p>
          </div>
        </div>
      </header>

      <div className="bk-wrap">
      <aside className="bk-aside">
        <section className="info-card">
          <div className="info-head">
            <Logo size={52} />
            <div>
              <b className="info-name">{settings.shopName}</b>
              <p className={cls('hero-open', todayHours ? 'on' : 'off')}>
                <span className="dot" /> {todayHours ? `Aberto hoje · ${todayHours[0]} às ${todayHours[1]}` : 'Fechado hoje'}
              </p>
            </div>
          </div>
          <p className="hero-meta"><MapPin size={15} /> {settings.address}</p>
          <ul className="week-hours" aria-label="Horário de funcionamento">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const h = settings.hours?.[d]
              return <li key={d} className={cls(d === weekday(today()) && 'today')}><span>{WD_SHORT[d]}</span><span>{h ? `${h[0]} – ${h[1]}` : 'Fechado'}</span></li>
            })}
          </ul>
          <div className="info-links">
            {settings.whatsapp && <a className="btn btn-ghost btn-sm" href={waLink(settings.whatsapp, fillMsg(settings, 'greeting'))} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
            {insta && <a className="btn btn-ghost btn-sm" href={`https://instagram.com/${insta}`} target="_blank" rel="noreferrer">@{insta}</a>}
          </div>
        </section>

        {!done && service && (
          <section className="sel-card">
            <p className="eyebrow">Seu agendamento</p>
            <ul className="sel-list">
              {service.list.map((x) => <li key={x.id}><span>{x.name}</span><b>{money(x.price)}</b></li>)}
            </ul>
            {step >= 2 && <p className="sel-line"><User size={15} /> {barberId === 'any' ? (resolvedBarber ? resolvedBarber.name : 'Qualquer profissional') : barbers.find((b) => b.id === barberId)?.name}</p>}
            {step >= 2 && <p className="sel-line"><CalendarDays size={15} /> {relDay(date)}{time ? ` · ${time}` : ''}</p>}
            <div className="sel-total"><span><Clock size={14} /> {service.duration} min</span><Price v={service.price} /></div>
            {step === 1 && <Button block size="lg" onClick={goToTime}>Escolher horário <ArrowRight size={18} /></Button>}
          </section>
        )}
      </aside>

      <main className="booking-main">
        {done ? (
          <Success done={done} settings={settings} onAgain={reset} />
        ) : (
          <>
            {settings.page?.notice && <p className="client-notice"><Megaphone size={18} /> <span>{settings.page.notice}</span></p>}
            {rebook && <p className="notice">Remarcando o horário de {relDay(rebook.date)} às {rebook.time}. Ele só é liberado quando você confirmar o novo. <button className="link" onClick={() => { setRebook(null); reset() }}>Desistir</button></p>}
            <ol className="stepper" aria-label="Etapas">
              {['Serviço', 'Horário', 'Confirmar'].map((l, i) => (
                <li key={l} className={cls(step === i + 1 && 'on', step > i + 1 && 'done')}>
                  <span>{step > i + 1 ? <Check size={13} strokeWidth={3} /> : ['I', 'II', 'III'][i]}</span>{l}
                </li>
              ))}
            </ol>

            {step === 1 && (
              <section className="fade-in">
                {portal && (
                  <div className="welcome">
                    <div className="welcome-top">
                      <div>
                        <p className="eyebrow">Bem-vindo de volta</p>
                        <b className="welcome-name">{portal.client.name.split(' ')[0]}</b>
                      </div>
                      {portal.club && <span className="badge badge-club"><Crown size={13} /> Clube {portal.club.plan.name}</span>}
                    </div>
                    {portal.birthdayMonth && settings.birthdayDiscount > 0 && (
                      <p className="bday"><Gift size={16} /> Mês do seu aniversário: <b>{settings.birthdayDiscount}% off</b> em qualquer serviço este mês.</p>
                    )}
                    <RuneMeter loyalty={portal.loyalty} />
                    {usual && (
                      <button className="usual" onClick={repeatUsual}>
                        <RotateCcw size={18} />
                        <span><b>O de sempre</b><small>{usual.names}{usual.barber ? ` com ${usual.barber.name.split(' ')[0]}` : ''}</small></span>
                        <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                )}
                <h2 className="bk-title">Escolha os serviços</h2>
                <p className="bk-sub">Toque em um ou mais. Ex.: limpeza de pele + design de sobrancelhas.</p>
                {(() => { const cats = [...new Set(services.map((s) => (s.description || '').split(' · ')[0]).filter((c) => c && c.length <= 24))]; return cats.length > 1 && (
                  <div className="svc-cats">
                    <button className={cls('pill', !cat && 'on')} onClick={() => setCat('')}>Todos</button>
                    {cats.map((c) => <button key={c} className={cls('pill', cat === c && 'on')} onClick={() => setCat(cat === c ? '' : c)}>{c}</button>)}
                  </div>
                ) })()}
                <div className="search svc-search"><Search size={16} /><input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Buscar procedimento" aria-label="Buscar procedimento" /></div>
                <div className="svc-list" role="group" aria-label="Serviços">
                  {services.filter((s) => (!cat || (s.description || '').startsWith(cat)) && (!sq.trim() || `${s.name} ${s.description || ''}`.toLowerCase().includes(sq.trim().toLowerCase())) || picked.includes(s.id)).map((s) => {
                    const on = picked.includes(s.id)
                    return (
                      <button key={s.id} className={cls('svc', on && 'on')} aria-pressed={on} onClick={() => togglePick(s.id)}>
                        <span className={cls('svc-check', on && 'on')} aria-hidden="true">{on && <Check size={14} strokeWidth={3.5} />}</span>
                        <span className="svc-info">
                          <span className="svc-row"><b>{s.name}</b><i className="leader" aria-hidden="true" /><Price v={s.price} className="svc-price" /></span>
                          {s.description && <small>{s.description}</small>}
                          <em><Clock size={12} /> {s.duration} min</em>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {service && (
                  <div className="pick-bar fade-in">
                    <div>
                      <b>{service.count} {service.count > 1 ? 'serviços' : 'serviço'} · {money(service.price)}</b>
                      <small><Clock size={12} /> {service.duration} min</small>
                    </div>
                    <Button size="lg" onClick={goToTime}>Escolher horário <ArrowRight size={18} /></Button>
                  </div>
                )}

                {photos.length > 0 && (
                  <section className="works">
                    <div className="works-head"><h2 className="bk-title">Nossos trabalhos</h2><button className="link" onClick={() => setGallery('all')}>Ver todos</button></div>
                    <div className="works-strip">
                      {photos.slice(-8).reverse().map((p) => <button key={p.id} onClick={() => setGallery('all')}><img src={p.url} alt={p.caption || 'Resultado'} loading="lazy" /></button>)}
                    </div>
                  </section>
                )}

                {settings.clubEnabled !== false && <ClubPlans plans={pub.plans} services={services} whatsapp={settings.whatsapp} shopName={settings.shopName} current={portal?.club} settings={settings} />}

                {settings.loyalty?.enabled !== false && !portal && (
                  <section className="runes-promo">
                    <div className="runes-glyphs" aria-hidden="true">✦ ✦ ✦</div>
                    <div>
                      <h3>Cartão Fidelidade {settings.shopName}</h3>
                      <p>Cada visita marca um ponto no cartão. Com {settings.loyalty?.goal || 10} visitas você ganha {services.find((x) => x.id === settings.loyalty?.rewardServiceId)?.name?.toLowerCase() || 'um procedimento'} de presente e sobe de nível: Pérola, Ouro, Platina e Diamante.</p>
                    </div>
                  </section>
                )}
              </section>
            )}

            {step === 2 && service && (
              <section className="fade-in">
                <button className="back" onClick={() => setStep(1)}><ChevronLeft size={18} /> Voltar <span className="back-sub">{service.name} · {money(service.price)}</span></button>
                <h2 className="bk-title">Com quem e quando?</h2>

                <div className="barber-row" role="radiogroup" aria-label="Profissional">
                  <button role="radio" aria-checked={barberId === 'any'} className={cls('barber-chip', barberId === 'any' && 'on')} onClick={() => setBarberId('any')}>
                    <span className="avatar any"><Sparkles size={18} /></span>
                    <b>Qualquer um</b><small>1º disponível</small>
                  </button>
                  {able.map((b) => (
                    <button key={b.id} role="radio" aria-checked={barberId === b.id} className={cls('barber-chip', barberId === b.id && 'on')} onClick={() => setBarberId(b.id)}>
                      <Avatar name={b.name} color={b.color} size={44} />
                      <b>{b.name.split(' ')[0]}</b><small>{b.bio || 'Profissional'}</small>
                      {b.rating?.count > 0 && <span className="chip-rate"><Star size={11} /> {b.rating.avg.toFixed(1)}</span>}
                    </button>
                  ))}
                </div>

                {barberId !== 'any' && (
                  <button className="link mb-sm" onClick={() => setGallery(barbers.find((b) => b.id === barberId))}>
                    <Camera size={14} /> Ver resultados de {barbers.find((b) => b.id === barberId)?.name.split(' ')[0]} ({photos.filter((p) => p.barberId === barberId).length})
                  </button>
                )}

                <div className="day-strip" role="radiogroup" aria-label="Dia">
                  {days.map((d) => {
                    const dt = parseDate(d)
                    const open = dayOpen(d)
                    return (
                      <button key={d} disabled={!open} role="radio" aria-checked={date === d} className={cls('day', date === d && 'on')} onClick={() => { setAutoDay(false); setDate(d); setTime(null) }}>
                        <small>{d === today() ? 'Hoje' : WD_SHORT[dt.getDay()]}</small>
                        <b>{dt.getDate()}</b>
                      </button>
                    )
                  })}
                </div>

                <div className="slots">
                  <p className="slots-day"><CalendarDays size={15} /> {fmtDateLong(date)}</p>
                  {loadingSlots ? (
                    <div className="slot-grid">{Array.from({ length: 8 }, (_, i) => <span key={i} className="slot skeleton" />)}</div>
                  ) : groups.length === 0 ? (
                    <div className="no-slots">
                      <b>Sem horários neste dia</b>
                      <span>Tente outro dia{barberId !== 'any' ? ' ou escolha “Qualquer um”' : ''}.</span>
                      {settings.waitlistEnabled !== false && <Button variant="ghost" size="sm" icon={Hourglass} onClick={() => setWaitOpen(true)}>Entrar na lista de espera</Button>}
                    </div>
                  ) : groups.map(([g, list]) => (
                    <div key={g} className="slot-group">
                      <h4>{g}</h4>
                      <div className="slot-grid">
                        {list.map((t) => {
                          const pr = promoFor(pub.promos, date, t, weekday)
                          return <button key={t} className={cls('slot', pr && 'promo')} onClick={() => pickTime(t)}>{t}{pr && <em>-{pr.pct}%</em>}</button>
                        })}
                      </div>
                    </div>
                  ))}
                  {!loadingSlots && groups.length > 0 && settings.waitlistEnabled !== false && (
                    <button className="link waitlink" onClick={() => setWaitOpen(true)}><Hourglass size={14} /> Não achou o horário ideal? Entre na lista de espera</button>
                  )}
                </div>
              </section>
            )}

            {step === 3 && service && time && (
              <section className="fade-in">
                <button className="back" onClick={() => setStep(2)}><ChevronLeft size={18} /> Voltar <span className="back-sub">trocar horário</span></button>
                <h2 className="bk-title">Confirme seu horário</h2>
                <div className="summary">
                  <div><Sparkles size={18} /><span>{service.name}</span><b>{money(service.price)}</b></div>
                  <div><CalendarDays size={18} /><span>{relDay(date)} · {time}</span><b>{resolvedBarber ? totalDuration(service.list, resolvedBarber) : service.duration} min</b></div>
                  <div><User size={18} /><span>{resolvedBarber ? resolvedBarber.name : '—'}</span><b className="muted small">{barberId === 'any' ? 'escolhido p/ você' : ''}</b></div>
                  {promo && <div className="perk"><Sparkles size={18} /><span>Promoção {promo.label}</span><b>-{promo.pct}%</b></div>}
                  {portal?.birthdayMonth && settings.birthdayDiscount > 0 && <div className="perk"><Gift size={18} /><span>Aniversariante do mês</span><b>-{settings.birthdayDiscount}%</b></div>}
                  {portal?.club && <div className="perk"><Crown size={18} /><span>Clube {portal.club.plan.name}: serviços do plano inclusos</span><b /></div>}
                  {portal?.loyalty?.available > 0 && <div className="perk"><Gift size={18} /><span>Você tem {portal.loyalty.available} procedimento de presente (Fidelidade)</span><b /></div>}
                </div>
                {(promo || portal?.birthdayMonth || portal?.club) && <p className="muted small mt-sm">Descontos e benefícios são aplicados no pagamento, na clínica.</p>}
                <form className="me-form" onSubmit={confirm}>
                  <Field label="Seu nome" required>
                    <input autoComplete="name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} placeholder="Como podemos te chamar?" />
                  </Field>
                  <Field label="WhatsApp" required hint="Enviamos a confirmação por aqui.">
                    <input inputMode="tel" autoComplete="tel" value={maskPhone(me.phone)} onChange={(e) => setMe({ ...me, phone: onlyDigits(e.target.value) })} placeholder="(41) 99999-9999" />
                  </Field>
                  {!portal?.client?.birthday && (
                    <Field label="Aniversário (opcional)" hint={`Ganhe ${settings.birthdayDiscount || 15}% off no mês do seu aniversário.`}>
                      <input inputMode="numeric" value={bday.length > 2 ? `${onlyDigits(bday).slice(0, 2)}/${onlyDigits(bday).slice(2, 4)}` : bday} onChange={(e) => setBday(onlyDigits(e.target.value).slice(0, 4))} placeholder="dd/mm" />
                    </Field>
                  )}
                  {err && <p className="form-err" role="alert">{err}</p>}
                  <Button type="submit" size="lg" block disabled={sending} icon={Check}>
                    {sending ? 'Reservando…' : 'Confirmar agendamento'}
                  </Button>
                </form>
              </section>
            )}
          </>
        )}
      </main>
      </div>

      {gallery && <PortfolioModal barber={gallery === 'all' ? null : gallery} photos={photos} onClose={() => setGallery(null)} />}
      {service && <WaitlistModal open={waitOpen} onClose={() => setWaitOpen(false)} date={date} barberId={barberId} serviceIds={service.ids} me={me} barbers={barbers} />}

      <footer className="bk-foot">
        <span>{settings.instagram}</span>
        <div className="foot-links">
          <Link to="/meus" className="btn btn-ghost btn-sm"><CalendarDays size={15} /> Meus horários</Link>
          <Link to="/painel" className="btn btn-ghost btn-sm"><Lock size={15} /> Área da equipe</Link>
        </div>
      </footer>
    </div>
  )
}

function Success({ done, settings, onAgain }) {
  const msg = fillMsg(settings, 'confirmClient', { nome: done.clientName, servico: done.service.name, data: fmtDateLong(done.date), hora: done.time, profissional: done.barber.name })
  return (
    <section className="success fade-in">
      <div className="success-ico"><Check size={40} strokeWidth={3} /></div>
      <h2>{done.rebooked ? 'Horário remarcado!' : 'Horário reservado!'}</h2>
      <p>Te esperamos, {done.clientName.split(' ')[0]}.</p>
      <div className="summary">
        <div><Sparkles size={18} /><span>{done.service.name}</span><b>{money(done.service.price)}</b></div>
        <div><CalendarDays size={18} /><span>{fmtDateLong(done.date)}</span><b>{done.time}</b></div>
        <div><User size={18} /><span>{done.barber.name}</span><b /></div>
        {done.promo && <div className="perk"><Sparkles size={18} /><span>Promoção {done.promo.label}</span><b>-{done.promo.pct}%</b></div>}
      </div>
      <ClientPush phone={done.clientPhone} />
      <AddToCalendar ev={{ id: done.id, title: `${done.service.name} · ${settings.shopName || 'De Carlo Beauty'}`, date: done.date, time: done.time, duration: done.duration || done.service.duration, location: settings.address || '', details: `Com ${done.barber.name}. Para remarcar ou cancelar: ${location.origin}${location.pathname}#/meus` }} />
      <a className="btn btn-wa btn-lg btn-block" href={waLink(settings.whatsapp, msg)} target="_blank" rel="noreferrer">
        <MessageCircle size={18} /> Confirmar pelo WhatsApp
      </a>
      <Link to="/meus" className="btn btn-ghost btn-block"><CalendarDays size={16} /> Ver meus horários</Link>
      <Button variant="ghost" block onClick={onAgain}>Agendar outro horário</Button>
    </section>
  )
}
