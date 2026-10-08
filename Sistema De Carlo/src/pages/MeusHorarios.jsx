import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, CalendarDays, ChevronLeft, Crown, Gift, Star, User } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Logo, RuneRule, ThemeToggle } from '../components/ui'
import { RuneMeter } from '../components/Loyalty'
import { serviceNames } from '../components/Appointments'
import ClientPush from '../components/ClientPush'
import AddToCalendar from '../components/AddToCalendar'
import { fmtDateLong, maskPhone, money, onlyDigits, relDay, safeLS } from '../lib/utils'

const ME_KEY = 'dcb:me'

/** Portal do cliente: próximos horários, cancelar, runas, clube e avaliação pendente */
export default function MeusHorarios() {
  const { pub, actions } = useStore()
  const nav = useNavigate()
  const saved = safeLS.get(ME_KEY, { name: '', phone: '' })
  const [phone, setPhone] = useState(saved.phone || '')
  const [data, setData] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [asking, setAsking] = useState(null)

  const load = async (p = phone) => {
    if (onlyDigits(p).length < 10) return
    setLoading(true)
    try {
      const r = await actions.portal(p)
      setData(r)
      if (r) safeLS.set(ME_KEY, { name: r.client.name, phone: onlyDigits(p) })
    } finally { setLoading(false) }
  }
  useEffect(() => { if (onlyDigits(saved.phone).length >= 10 && pub) load(saved.phone) }, [pub]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async (a) => { await actions.clientCancel(a.id, phone); setAsking(null); load() }
  const services = pub?.services || []
  const barbers = pub?.barbers || []
  const settings = pub?.settings

  return (
    <div className="portal">
      <div className="portal-top">
        <Link to="/" className="back"><ChevronLeft size={18} /> Agendar</Link>
        <ThemeToggle />
      </div>
      <header className="portal-brand">
        <Logo size={64} />
        <h1 className="page-title">Meus horários</h1>
        <RuneRule />
      </header>

      <form className="portal-find" onSubmit={(e) => { e.preventDefault(); load() }}>
        <Field label="Seu WhatsApp" hint="O mesmo número usado para agendar.">
          <input inputMode="tel" value={maskPhone(phone)} onChange={(e) => setPhone(onlyDigits(e.target.value))} placeholder="(41) 99999-9999" />
        </Field>
        <Button type="submit" disabled={loading || onlyDigits(phone).length < 10}>{loading ? 'Buscando…' : 'Buscar'}</Button>
      </form>
      {pub && !data && <p className="muted small center">Demonstração: teste com <code>(41) 99999-0001</code></p>}

      {data === null && (
        <div className="empty"><CalendarDays size={34} /><strong>Nenhum agendamento com esse número</strong><p>Confira o número ou faça seu primeiro agendamento.</p><Link className="btn btn-primary" to="/">Agendar agora</Link></div>
      )}

      {data && (
        <div className="portal-body fade-in">
          <ClientPush phone={phone} />
          <section className="card">
            <div className="card-body">
              <div className="welcome-top">
                <div><p className="eyebrow">Olá</p><b className="welcome-name">{data.client.name}</b></div>
                {data.club && <span className="badge badge-club"><Crown size={13} /> Clube {data.club.plan.name}</span>}
              </div>
              {data.birthdayMonth && settings?.birthdayDiscount > 0 && <p className="bday"><Gift size={16} /> Feliz mês do aniversário! <b>{settings.birthdayDiscount}% off</b> em qualquer serviço.</p>}
              <RuneMeter loyalty={data.loyalty} />
              {data.club && (
                <p className="muted small mt-sm">
                  Plano {data.club.plan.name}: {data.club.plan.limit == null ? 'uso ilimitado' : `${data.club.left} de ${data.club.plan.limit} atendimentos restantes este mês`}
                  {!data.club.paid && ' · mensalidade deste mês pendente'}
                </p>
              )}
            </div>
          </section>

          {data.toReview && (
            <Link to={`/avaliar/${data.toReview.id}`} className="review-cta"><Star size={20} /><span><b>Como foi seu último atendimento?</b><small>Avalie em 10 segundos</small></span></Link>
          )}

          <h2 className="bk-title mt">Próximos horários</h2>
          {data.upcoming.length ? (
            <div className="portal-list">
              {data.upcoming.map((a) => {
                const b = barbers.find((x) => x.id === a.barberId)
                return (
                  <article key={a.id} className="portal-appt">
                    <div className="portal-date"><b>{relDay(a.date)}</b><span>{a.time}</span></div>
                    <div className="portal-info">
                      <b>{serviceNames(a, services)}</b>
                      <small><User size={13} /> {b?.name || 'Profissional'} · {money(a.total)}</small>
                      <small className="muted">{fmtDateLong(a.date)}</small>
                    </div>
                    {asking === a.id ? (
                      <div className="portal-ask">
                        <Button variant="danger" size="sm" onClick={() => cancel(a)}>Confirmar cancelamento</Button>
                        <Button variant="ghost" size="sm" onClick={() => setAsking(null)}>Manter</Button>
                      </div>
                    ) : (
                      <div className="portal-ask">
                        <AddToCalendar compact ev={{ id: a.id, title: `${serviceNames(a, services)} · ${settings?.shopName || 'De Carlo Beauty'}`, date: a.date, time: a.time, duration: a.duration, location: settings?.address || '', details: `Com ${b?.name || 'a profissional'}.` }} />
                        <Button variant="ghost" size="sm" onClick={() => nav('/', { state: { rebook: { id: a.id, serviceIds: a.serviceIds, barberId: a.barberId, date: a.date, time: a.time, phone } } })}>Remarcar</Button>
                        <Button variant="danger" size="sm" icon={Ban} onClick={() => setAsking(a.id)}>Cancelar</Button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty"><CalendarDays size={30} /><strong>Nenhum horário marcado</strong><Link className="btn btn-primary" to="/">Agendar agora</Link></div>
          )}
          <p className="muted small mt">Ao remarcar, o horário antigo só é liberado depois que você confirmar o novo.</p>
        </div>
      )}
    </div>
  )
}
