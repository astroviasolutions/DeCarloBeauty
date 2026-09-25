import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, ChevronLeft, ExternalLink, Star } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Logo, RuneRule, ThemeToggle } from '../components/ui'
import { cls, fmtDateLong } from '../lib/utils'

const LABELS = ['', 'Não gostei', 'Poderia ser melhor', 'Bom', 'Muito bom', 'Brabo demais!']

/** Avaliação pós-corte (link enviado pelo WhatsApp ao finalizar a venda) */
export default function Avaliar() {
  const { id } = useParams()
  const { pub, actions } = useStore()
  const [target, setTarget] = useState(undefined)
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (pub) actions.reviewTarget(id).then(setTarget).catch(() => setTarget(null)) }, [id, pub, actions])

  const send = async () => {
    setErr('')
    try { await actions.submitReview({ saleId: id, stars, comment }); setSent(true) } catch (e) { setErr(e.message) }
  }
  const google = pub?.settings?.googleReviewUrl
  const shown = hover || stars

  return (
    <div className="portal">
      <div className="portal-top"><Link to="/" className="back"><ChevronLeft size={18} /> Início</Link><ThemeToggle /></div>
      <header className="portal-brand"><Logo size={64} /><h1 className="page-title">Avalie seu atendimento</h1><RuneRule /></header>

      {target === null && <div className="empty"><strong>Link de avaliação inválido</strong><p>Peça um novo link na clínica.</p></div>}
      {target && (target.reviewed || sent) && (
        <div className="empty fade-in">
          <div className="success-ico"><Check size={36} strokeWidth={3} /></div>
          <strong>Valeu, {target.clientFirst}!</strong>
          <p>Sua avaliação ajuda {target.barberName?.split(' ')[0]} e a clínica a ficarem cada vez melhores.</p>
          {sent && stars >= 4 && google && (
            <a className="btn btn-primary" href={google} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Deixar avaliação no Google</a>
          )}
          <Link to="/" className="btn btn-ghost">Voltar ao início</Link>
        </div>
      )}
      {target && !target.reviewed && !sent && (
        <section className="card fade-in"><div className="card-body review-box">
          <p className="muted center">{target.services} com <b>{target.barberName}</b><br />{fmtDateLong(target.date)}</p>
          <div className="star-pick" role="radiogroup" aria-label="Nota" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} role="radio" aria-checked={stars === i} aria-label={`${i} estrelas`} className={cls(i <= shown && 'on')} onMouseEnter={() => setHover(i)} onClick={() => setStars(i)}>
                <Star size={38} />
              </button>
            ))}
          </div>
          <p className="star-label">{LABELS[shown] || 'Toque nas estrelas'}</p>
          <Field label="Quer contar algo? (opcional)"><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="O que mais gostou?" /></Field>
          {err && <p className="form-err">{err}</p>}
          <Button block size="lg" disabled={!stars} onClick={send}>Enviar avaliação</Button>
        </div></section>
      )}
    </div>
  )
}
