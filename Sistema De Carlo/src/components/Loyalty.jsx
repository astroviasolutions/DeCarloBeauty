import { useState } from 'react'
import { Camera, Check, Crown, Gift, ImagePlus, Star, Trash2 } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Modal, Price } from './ui'
import { cls, fmtDate, maskPhone, money, onlyDigits, waLink } from '../lib/utils'
import { compressImage } from '../lib/image'
import { msg as fillMsg } from '../lib/messages'

/** Cartão fidelidade: um brilho aceso por visita, até a meta */
const RUNES = '✦'
export function RuneMeter({ loyalty, compact }) {
  if (!loyalty?.enabled) return null
  const { goal, progress, available, level, next, visits } = loyalty
  return (
    <div className={cls('runes', compact && 'compact')}>
      <div className="runes-head">
        <span className="runes-level"><b>{level.rune}</b> {level.name}</span>
        <span className="runes-count">{progress}/{goal} visitas</span>
      </div>
      <div className="runes-track" aria-label={`${progress} de ${goal} visitas`}>
        {Array.from({ length: goal }, (_, i) => <span key={i} className={cls(i < progress && 'lit')}>{RUNES[i % RUNES.length]}</span>)}
      </div>
      {!compact && (
        <p className="runes-foot">
          {available > 0 ? <><Gift size={14} /> Você tem <b>{available} {available > 1 ? 'procedimentos de presente' : 'procedimento de presente'}</b> para usar.</>
            : <>Faltam <b>{goal - progress}</b> visitas para o próximo procedimento de presente.</>}
          {next && <span className="muted"> · {next.min - visits} para virar {next.name}</span>}
        </p>
      )}
    </div>
  )
}

/** Planos do Clube (assinatura) — página pública */
export function ClubPlans({ plans, services, whatsapp, shopName, current, settings }) {
  if (!plans?.length) return null
  return (
    <section className="club">
      <div className="club-head">
        <p className="eyebrow">Planos {shopName}</p>
        <h2 className="bk-title">Assine e cuide-se todo mês</h2>
        <p className="bk-sub">Um valor fixo por mês para manter a rotina de cuidados, com prioridade na agenda.</p>
      </div>
      <div className="club-grid">
        {plans.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => {
          const names = p.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean)
          const mine = current?.plan?.id === p.id
          const msg = fillMsg(settings, 'clubInterest', { plano: p.name, valor: money(p.price) })
          return (
            <article key={p.id} className={cls('plan', p.featured && 'featured', mine && 'mine')}>
              {p.featured && <span className="plan-tag">Mais escolhido</span>}
              <Crown size={22} className="plan-ico" />
              <h3>{p.name}</h3>
              <div className="plan-price"><Price v={p.price} /><small>/mês</small></div>
              <p className="plan-desc">{p.description}</p>
              <ul>
                {names.slice(0, 5).map((n) => <li key={n}><Check size={14} /> {n}</li>)}
                {p.limit != null && <li className="muted">Até {p.limit} atendimentos por mês</li>}
                {p.productDiscount > 0 && <li><Check size={14} /> {p.productDiscount}% off nos produtos</li>}
              </ul>
              {mine ? <span className="btn btn-ghost btn-block">Seu plano atual</span>
                : <a className={cls('btn btn-block', p.featured ? 'btn-primary' : 'btn-ghost')} href={waLink(whatsapp, msg)} target="_blank" rel="noreferrer">Quero assinar</a>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** Galeria de cortes (portfólio) */
export function PortfolioModal({ barber, client, photos, onClose }) {
  const list = photos.filter((p) => (!barber || p.barberId === barber.id) && (!client || p.clientId === client.id)).slice().reverse()
  return (
    <Modal open onClose={onClose} title={client ? `Portfólio de ${client.name.split(' ')[0]}` : barber ? `Resultados de ${barber.name.split(' ')[0]}` : 'Nossos trabalhos'} wide>
      {list.length ? (
        <div className="gallery">
          {list.map((p) => (
            <figure key={p.id}><img src={p.url} alt={p.caption || 'Resultado'} loading="lazy" /><figcaption>{p.caption}<small>{fmtDate(p.createdAt)}</small></figcaption></figure>
          ))}
        </div>
      ) : (
        <div className="empty"><Camera size={34} /><strong>Portfólio em construção</strong><p>As fotos aparecem aqui quando a profissional concluir um atendimento com foto.</p></div>
      )}
    </Modal>
  )
}

export function Stars({ value = 0, size = 14 }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={cls(i <= Math.round(value) && 'on')} />)}
    </span>
  )
}

/** Entrar na lista de espera */
export function WaitlistModal({ open, onClose, date, barberId, serviceIds, me, barbers }) {
  const { actions } = useStore()
  const [f, setF] = useState({ name: me?.name || '', phone: me?.phone || '', period: 'qualquer' })
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const send = async (e) => {
    e.preventDefault(); setErr('')
    if (f.name.trim().length < 2 || onlyDigits(f.phone).length < 10) return setErr('Informe nome e WhatsApp com DDD.')
    await actions.joinWaitlist({ date, barberId: barberId === 'any' ? null : barberId, period: f.period, clientName: f.name.trim(), phone: f.phone, serviceIds })
    setDone(true)
  }
  const b = barbers.find((x) => x.id === barberId)
  return (
    <Modal open={open} onClose={() => { setDone(false); onClose() }} title="Lista de espera">
      {done ? (
        <div className="empty"><Check size={34} /><strong>Você está na lista</strong><p>Se abrir um horário em {fmtDate(date)}{b ? ` com ${b.name.split(' ')[0]}` : ''}, a clínica te chama no WhatsApp.</p></div>
      ) : (
        <form className="me-form" onSubmit={send}>
          <p className="muted small">Dia {fmtDate(date)}{b ? ` · com ${b.name}` : ' · qualquer profissional'}. Avisamos se alguém desmarcar.</p>
          <Field label="Seu nome"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="WhatsApp"><input inputMode="tel" value={maskPhone(f.phone)} onChange={(e) => setF({ ...f, phone: onlyDigits(e.target.value) })} placeholder="(41) 99999-9999" /></Field>
          <Field label="Período preferido">
            <div className="days">
              {[['qualquer', 'Qualquer'], ['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']].map(([v, l]) => (
                <button key={v} type="button" className={cls('pill', f.period === v && 'on')} onClick={() => setF({ ...f, period: v })}>{l}</button>
              ))}
            </div>
          </Field>
          {err && <p className="form-err">{err}</p>}
          <Button type="submit" block>Entrar na lista</Button>
        </form>
      )}
    </Modal>
  )
}

/** Portfólio de antes e depois dentro da ficha da cliente (com envio de foto) */
export function ClientPortfolio({ client, barberId }) {
  const { data, actions, session } = useStore()
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [who, setWho] = useState(barberId || data.barbers.find((b) => b.active)?.id || '')
  const [caption, setCaption] = useState('')
  const [pub, setPub] = useState(false)
  const list = data.photos.filter((p) => p.clientId === client.id)
  const add = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !who) return
    setBusy(true)
    try {
      const { dataUrl } = await compressImage(f)
      await actions.savePhoto({ barberId: who, clientId: client.id, appointmentId: null, dataUrl, caption: caption.trim(), isPrivate: !pub })
      setCaption('')
    } catch (er) { actions.notify(er.message, 'bad') } finally { setBusy(false) }
  }
  return (
    <div className="client-port">
      {list.length ? (
        <div className="gallery mini">
          {list.slice(0, 9).map((p) => (
            <button key={p.id} type="button" className="gal-btn" onClick={() => setOpen(p)}>
              <figure><img src={p.url} alt={p.caption || 'Foto do portfólio'} loading="lazy" /><figcaption>{p.caption || 'Foto'}<small>{fmtDate(p.createdAt)} · {data.barbers.find((b) => b.id === p.barberId)?.name.split(' ')[0] || ''}{p.private ? ' · só na ficha' : ''}</small></figcaption></figure>
            </button>
          ))}
        </div>
      ) : <p className="muted small">Nenhuma foto ainda. Adicione o antes e depois dos atendimentos desta cliente.</p>}
      <div className="port-add">
        {!barberId && (
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Profissional da foto">
            {data.barbers.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (ex.: antes · 1ª sessão)" aria-label="Legenda da foto" />
        <label className={cls('btn btn-ghost btn-sm', busy && 'disabled')}><ImagePlus size={15} /> {busy ? 'Enviando…' : 'Adicionar foto'}<input type="file" accept="image/*" hidden onChange={add} disabled={busy} /></label>
      </div>
      <label className="check-line"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> Mostrar esta foto no site (portfólio público). Sem marcar, fica só na ficha.</label>
      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.caption || 'Foto'} wide>
          <img src={open.url} alt={open.caption || 'Foto do portfólio'} className="photo-full" />
          <p className="muted small mt-sm">{fmtDate(open.createdAt)} · {data.barbers.find((b) => b.id === open.barberId)?.name}</p>
          {(session?.role === 'admin' || open.barberId === session?.barberId) && (
            <Button variant="ghost" size="sm" className="mt-sm" icon={Trash2} onClick={async () => { if (await actions.confirm('Excluir esta foto do portfólio? Ela some da ficha e do site.', 'Excluir')) { await actions.deletePhoto(open.id); setOpen(null) } }}>Excluir foto</Button>
          )}
        </Modal>
      )}
    </div>
  )
}
