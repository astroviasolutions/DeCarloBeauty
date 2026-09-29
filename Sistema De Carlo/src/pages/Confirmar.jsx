import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { db } from '../data'
import { Button, Logo } from '../components/ui'
import { fmtDateLong } from '../lib/utils'

/** Página que a cliente abre pelo link do WhatsApp para confirmar o horário */
export default function Confirmar() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const t = sp.get('t') || ''
  const [info, setInfo] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { db.confirmInfo(id, t).then(setInfo).catch(() => setInfo(null)) }, [id, t])
  const go = async () => { setBusy(true); setErr(''); try { setInfo(await db.confirmAppointment(id, t)) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const done = info?.items?.length && info.items.every((x) => x.status === 'confirmado')
  return (
    <div className="portal confirm-page">
      <header className="portal-brand"><Logo size={64} /></header>
      {info === undefined && <p className="center muted">Carregando…</p>}
      {info === null && <div className="empty"><strong>Link inválido ou expirado</strong><p>Fale com a gente pelo WhatsApp.</p></div>}
      {info && (
        <section className="card"><div className="card-body">
          <p className="eyebrow">Olá, {String(info.client || '').split(' ')[0]}</p>
          <h2 className="page-title">{done ? '✅ Horário confirmado!' : 'Confirme seu horário'}</h2>
          <p className="muted">{fmtDateLong(info.date)}</p>
          <ul className="confirm-list">
            {info.items.map((x, i) => <li key={i}><b>{x.time}</b> {x.services}{x.barber ? ` · com ${x.barber}` : ''} {x.status === 'confirmado' ? '✅' : ''}</li>)}
          </ul>
          {!done && <Button block size="lg" icon={Check} disabled={busy} onClick={go}>{busy ? 'Confirmando…' : 'Confirmar presença'}</Button>}
          {done && <p className="muted small">Obrigada! Te esperamos. Precisa remarcar? Chame a gente no WhatsApp.</p>}
          {err && <p className="form-err">{err}</p>}
        </div></section>
      )}
    </div>
  )
}
