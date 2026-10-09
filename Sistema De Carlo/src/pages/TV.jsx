import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Maximize, X } from 'lucide-react'
import QRCode from 'qrcode'
import { useStore } from '../state/Store'
import { BRAND } from '../config/brand'
import { Avatar, Logo, RuneRule } from '../components/ui'
import { serviceNames } from '../components/Appointments'
import { deskCan, fmtDateLong, money, nowMin, today, toHHMM, toMin, weekday } from '../lib/utils'

/** Modo TV da recepção: quem está na cadeira, próximos e QR para agendar */
export default function TV() {
  const { session, data, pub, actions } = useStore()
  const [, setTick] = useState(0) // relógio: hora do servidor (today/nowMin), não a do PC
  const [qr, setQr] = useState('')
  const link = `${location.origin}${location.pathname}#/`

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { const t = setInterval(() => actions.reload(), 30000); return () => clearInterval(t) }, [actions])
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0B0A0A', light: '#F3EEE6' } }).then(setQr).catch(() => {})
  }, [link])

  const t = today()
  const m = nowMin()
  const board = useMemo(() => {
    if (!data) return []
    const appts = data.appointments.filter((a) => a.date === t && !['cancelado', 'faltou'].includes(a.status)).sort((a, b) => a.time.localeCompare(b.time))
    return data.barbers.filter((b) => b.active).map((b) => {
      const mine = appts.filter((a) => a.barberId === b.id)
      const current = mine.find((a) => a.status !== 'concluido' && toMin(a.time) <= m && toMin(a.time) + Number(a.duration) > m)
      const next = mine.filter((a) => a.status !== 'concluido' && toMin(a.time) > m).slice(0, 3)
      const off = b.daysOff?.includes(weekday(t))
      return { b, current, next, off }
    })
  }, [data, t, m])

  if (!session) return <Navigate to="/painel" replace />
  if (session.role === 'reception' && data && !deskCan(data.settings, session, 'tv')) return <Navigate to="/painel/agenda" replace />
  if (!data || !pub) return <div className="tv"><Logo size={120} /></div>

  const s = pub.settings
  const first = (n) => (n || '').split(' ')[0]
  const plans = pub.plans || []
  const ticker = [
    s.loyalty?.enabled !== false && `Cartão Fidelidade: a cada ${s.loyalty?.goal || 10} visitas, 1 procedimento de presente`,
    ...plans.map((p) => `Clube ${p.name}: ${p.description} por ${money(p.price)}/mês`),
    s.birthdayDiscount > 0 && `Aniversariante do mês ganha ${s.birthdayDiscount}% off`,
    'Agende pelo celular em 3 cliques, 24 horas por dia',
  ].filter(Boolean)

  const full = () => document.documentElement.requestFullscreen?.().catch(() => {})

  return (
    <div className="tv">
      <div className="tv-bg" style={{ backgroundImage: `url(${BRAND.banner})` }} />
      <header className="tv-head">
        <div className="tv-brand"><Logo size={72} /><div><h1 className="wordmark">{s.shopName}</h1><p className="tagline">Força • Domínio • Precisão</p></div></div>
        <div className="tv-clock"><b>{toHHMM(m)}</b><span>{fmtDateLong(t)}</span></div>
        <div className="tv-tools">
          <button className="icon-btn" onClick={full} aria-label="Tela cheia"><Maximize size={20} /></button>
          <Link className="icon-btn" to="/painel" aria-label="Sair do modo TV"><X size={20} /></Link>
        </div>
      </header>

      <main className="tv-main">
        <section className="tv-board" style={{ gridTemplateColumns: `repeat(${Math.min(board.length, 4)}, 1fr)` }}>
          {board.map(({ b, current, next, off }) => (
            <article key={b.id} className="tv-col">
              <div className="tv-barber"><Avatar name={b.name} color={b.color} photo={b?.photo} size={58} /><b>{first(b.name)}</b></div>
              <div className={`tv-now ${current ? 'busy' : ''}`}>
                <small>{off ? 'Folga hoje' : current ? 'Na cadeira' : 'Livre agora'}</small>
                {current ? <><b>{first(current.clientName)}</b><span>{serviceNames(current, data.services)}</span></> : <b className="dim">{off ? '—' : 'Disponível'}</b>}
              </div>
              <ul className="tv-next">
                {next.map((a) => <li key={a.id}><span>{a.time}</span><b>{first(a.clientName)}</b></li>)}
                {!next.length && !off && <li className="dim">Sem próximos hoje</li>}
              </ul>
            </article>
          ))}
        </section>
        <aside className="tv-qr">
          {qr && <img src={qr} alt="QR code para agendar" />}
          <RuneRule />
          <b>Agende pelo celular</b>
          <span>Aponte a câmera e marque seu próximo horário</span>
        </aside>
      </main>

      <footer className="tv-ticker"><div className="tv-ticker-track">{[...ticker, ...ticker].map((x, i) => <span key={i}>{x}</span>)}</div></footer>
    </div>
  )
}
