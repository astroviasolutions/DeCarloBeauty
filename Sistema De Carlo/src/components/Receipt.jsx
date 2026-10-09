import { Printer, Send } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button } from './ui'
import { printReceipt, receiptWa } from '../lib/receipt'
import { onlyDigits } from '../lib/utils'

/** Imprimir / enviar comprovante de pagamento (não fiscal) de uma ou mais vendas */
export default function ReceiptButtons({ sales, phone }) {
  const { data, actions } = useStore()
  if (!sales?.length) return null
  const ctx = { barbers: data.barbers, settings: data.settings }
  const tel = onlyDigits(phone || data.clients.find((c) => c.id === sales[0].clientId)?.phone)
  return (
    <div className="receipt-btns">
      <Button variant="ghost" size="sm" icon={Printer} onClick={() => printReceipt(sales, ctx) || actions.notify('Libere pop-ups do navegador para imprimir', 'bad')}>Imprimir comprovante</Button>
      {tel.length >= 10 && <a className="btn btn-wa btn-sm" href={receiptWa(tel, sales, ctx)} target="_blank" rel="noreferrer"><Send size={15} /> Comprovante no WhatsApp</a>}
    </div>
  )
}
