import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Ban, CalendarDays, ChevronLeft, Crown, Gift, Star, User } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Logo, RuneRule, ThemeToggle } from '../components/ui'
import { RuneMeter } from '../components/Loyalty'
import { serviceNames } from '../components/Appointments'
import ClientPush from '../components/ClientPush'
import AddToCalendar from '../components/AddToCalendar'
import { fmtDateLong, maskPhone, money, onlyDigits, relDay, safeLS, waLink } from '../lib/utils'

const ME_KEY = 'dcb:me'

const ERR = {
  dados: 'Não encontramos com esse WhatsApp e aniversário. Confira os dois e tente de novo.',
  semaniversario: 'Seu cadastro ainda não tem data de aniversário. Peça o seu link pessoal para a clínica pelo WhatsApp.',
  bloqueado: 'Muitas tentativas com esse número. Tente de novo em 1 hora ou peça o seu link pessoal para a clínica.',
  link: 'Esse link não vale mais. Entre com WhatsApp e aniversário ou peça um link novo para a clínica.',
}

/**
 * Portal do cliente: próximos horários, cancelar, runas, clube e avaliação pendente.
 * Entrada segura: link pessoal enviado pela clínica (?c=chave) OU WhatsApp + aniversário.
 * Depois de entrar, a chave fica guardada neste aparelho (botão "Sair" apaga).
 */
export default function MeusHorarios() {
  const { pub, actions } = useStore()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const saved = safeLS.get(ME_KEY, { name: '', phone: '' })
  const [phone, setPhone] = useState(saved.phone || '')
  const [bday, setBday] = useState('')
  const [data, setData] = useState(undefined)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [asking, setAsking] = useState(null)

  const enter = async (p) => {
    setLoading(true); setErr('')
    try {
      const r = await actions.clientAccess(p)
      if (r?.error) {
        setErr(ERR[r.error] || ERR.dados); setData(undefined)
        if (r.error === 'link') safeLS.set(ME_KEY, { ...saved, token: '' })
        return
      }
      setData(r)
      safeLS.set(ME_KEY, { name: r.client.name, phone: onlyDigits(phone) || saved.phone || '', token: r.token })
      if (sp.get('c')) setSp({}, { replace: true }) // tira a chave do endereço (não fica no histórico/print)
    } catch (e) { setErr(e.message || 'Não foi possível abrir agora. Tente de novo.') } finally { setLoading(false) }
  }
  const token = data?.token || sp.get('c') || saved.token
  useEffect(() => { if (pub && (sp.get('c') || saved.token)) enter({ token: sp.get('c') || saved.token }) }, [pub]) // eslint-disable-line react-hooks/exhaustive-deps
  const reload = () => token && enter({ token })
  const leave = () => { safeLS.set(ME_KEY, { name: '', phone: '', token: '' }); setData(undefined); setPhone(''); setBday('') }

  const cancel = async (a) => { await actions.clientCancel(a.id, token); setAsking(null); reload() }
  const services = pub?.services || []
  const barbers = pub?.barbers || []
  const settings = pub?.settings
  const askLink = settings?.whatsapp ? waLink(settings.whatsapp, 'Olá! Pode me mandar o meu link de "Meus horários"?') : null

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

      {!data && (
        <form className="portal-find" onSubmit={(e) => { e.preventDefault(); enter({ phone, birthday: bday }) }}>
          <Field label="Seu WhatsApp" hint="O mesmo número usado para agendar.">
            <input inputMode="tel" value={maskPhone(phone)} onChange={(e) => setPhone(onlyDigits(e.target.value))} placeholder="(41) 99999-9999" />
          </Field>
          <Field label="Seu aniversário" hint="Dia e mês (para proteger seus dados).">
            <input inputMode="numeric" value={bday.length > 2 ? `${bday.slice(0, 2)}/${bday.slice(2, 4)}` : bday} onChange={(e) => setBday(onlyDigits(e.target.value).slice(0, 4))} placeholder="dd/mm" />
          </Field>
          <Button type="submit" disabled={loading || onlyDigits(phone).length < 10 || bday.length !== 4}>{loading ? 'Abrindo…' : 'Entrar'}</Button>
        </form>
      )}
      {!data && err && <p className="form-err center" role="alert">{err}</p>}
      {!data && askLink && <p className="muted small center">Sem aniversário no cadastro? <a href={askLink} target="_blank" rel="noreferrer">Peça o seu link pessoal no WhatsApp</a>.</p>}
      {!data && <p className="muted small center">Quer só marcar um horário? <Link to="/">Agende aqui</Link>, não precisa entrar.</p>}
      {pub && !data && <p className="muted small center">Demonstração: teste com <code>(41) 99999-0001</code> e o aniversário da ficha.</p>}

      {data && (
        <div className="portal-body fade-in">
          <p className="muted small" style={{ textAlign: 'right' }}><button type="button" className="link" onClick={leave}>Sair deste aparelho</button></p>
          <ClientPush phone={phone || saved.phone} token={token} />
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
                        <Button variant="ghost" size="sm" onClick={() => nav('/', { state: { rebook: { id: a.id, serviceIds: a.serviceIds, barberId: a.barberId, date: a.date, time: a.time, phone, token } } })}>Remarcar</Button>
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
