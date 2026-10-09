import { useState } from 'react'
import { useStore } from '../state/Store'
import { Button } from './ui'
import { fmtPhone, maskPhone, onlyDigits } from '../lib/utils'

/**
 * WhatsApp da cliente com edição na hora (gestão, recepção e profissional).
 * Profissional com a privacidade ligada vê só os 4 últimos: (**) *****-1234.
 * Cliente sem WhatsApp mostra "Adicionar WhatsApp".
 */
export default function ClientPhone({ clientId, phone, last4, tel = true }) {
  const { actions } = useStore()
  const [ed, setEd] = useState(null)
  const [busy, setBusy] = useState(false)
  const full = onlyDigits(phone).length >= 10
  const save = async () => {
    if (onlyDigits(ed).length < 10) return actions.notify('WhatsApp incompleto: use DDD + número', 'bad')
    setBusy(true)
    try { await actions.setClientPhone(clientId, ed); setEd(null) } finally { setBusy(false) }
  }
  if (ed !== null) {
    return (
      <span className="client-phone-edit">
        <input inputMode="tel" autoFocus value={maskPhone(ed)} onChange={(e) => setEd(onlyDigits(e.target.value).slice(0, 11))} placeholder="(41) 99999-9999" aria-label="Novo WhatsApp da cliente" />
        <Button size="sm" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        <button type="button" className="link" onClick={() => setEd(null)}>cancelar</button>
      </span>
    )
  }
  const label = full ? fmtPhone(phone) : last4 ? `(**) *****-${last4}` : null
  return (
    <span className="client-phone">
      {label ? (full && tel ? <a href={`tel:${onlyDigits(phone)}`}>{label}</a> : <span>{label}</span>) : <small className="muted">Sem WhatsApp</small>}
      {clientId && <> · <button type="button" className="link" onClick={() => setEd('')}>{label ? 'trocar' : 'Adicionar WhatsApp'}</button></>}
    </span>
  )
}
