import { Star } from 'lucide-react'
import { useStore } from '../state/Store'
import { msg as fillMsg } from '../lib/messages'
import { onlyDigits, waLink } from '../lib/utils'

/** Link da avaliação de uma venda (mesma página /avaliar usada depois do caixa) */
export const reviewLink = (saleId) => `${location.origin}${location.pathname}#/avaliar/${saleId}`

/**
 * Pedir avaliação no WhatsApp para uma ou mais vendas (uma por profissional).
 * Venda já avaliada mostra as estrelas no lugar do botão.
 */
export default function ReviewButtons({ sales, phone }) {
  const { data } = useStore()
  const list = (sales || []).filter((s) => (s.items || []).some((i) => i.type === 'service'))
  const tel = onlyDigits(phone || data.clients.find((c) => c.id === list[0]?.clientId)?.phone)
  if (!list.length || tel.length < 10) return null
  return (
    <div className="receipt-btns">
      {list.map((s) => {
        const b = data.barbers.find((x) => x.id === s.barberId)
        const done = data.reviews?.find((r) => r.saleId === s.id)
        const who = b?.name.split(' ')[0] || ''
        if (done) return <span key={s.id} className="badge"><Star size={12} /> {who ? `${who}: ` : ''}avaliou {done.stars}★</span>
        const text = fillMsg(data.settings, 'review', { nome: (s.clientName || '').split(' ')[0], profissional: who, link: reviewLink(s.id) })
        return <a key={s.id} className="btn btn-wa btn-sm" href={waLink(tel, text)} target="_blank" rel="noreferrer"><Star size={15} /> Pedir avaliação{list.length > 1 && who ? ` · ${who}` : ''}</a>
      })}
    </div>
  )
}
