import { useEffect, useState } from 'react'
import { BellRing, Check } from 'lucide-react'
import { Button } from './ui'
import { enableClientPush, isIOS, isStandalone, pushSupported } from '../lib/push'
import { onlyDigits, safeLS } from '../lib/utils'

/** Card para a cliente receber os lembretes no celular (1 dia, 1 hora e 15 min antes) */
export default function ClientPush({ phone, token }) {
  const key = `dcb:client-push:${onlyDigits(phone)}`
  const [st, setSt] = useState('off')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!pushSupported()) { setSt(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'); return }
    if (Notification.permission === 'denied') setSt('denied')
    else if (Notification.permission === 'granted' && safeLS.get(key)) {
      setSt('on'); enableClientPush(phone, token).catch(() => {}) // renova a ligação com o número
    }
  }, [key, phone])
  if (onlyDigits(phone).length < 10 || st === 'unsupported') return null
  const run = async () => {
    setBusy(true)
    try { const r = await enableClientPush(phone, token); setSt(r); if (r === 'on') safeLS.set(key, 1) } catch { setSt('error') } finally { setBusy(false) }
  }
  return (
    <div className="client-push">
      <span className="cp-ico">{st === 'on' ? <Check size={18} /> : <BellRing size={18} />}</span>
      <div>
        {st === 'on' && <><b>Lembretes ativados</b><small>Você recebe um aviso 1 dia, 1 hora e 15 minutos antes do horário.</small></>}
        {st === 'off' && <><b>Quer um lembrete no celular?</b><small>Avisamos 1 dia, 1 hora e 15 minutos antes do seu horário.</small><Button size="sm" disabled={busy} onClick={run}>{busy ? 'Ativando…' : 'Ativar lembretes'}</Button></>}
        {st === 'ios-install' && <><b>Lembretes no iPhone</b><small>Toque em Compartilhar e em “Adicionar à Tela de Início”. Abra pelo ícone da De Carlo e ative os lembretes em “Meus horários”.</small></>}
        {st === 'denied' && <><b>Notificações bloqueadas</b><small>Libere as notificações deste site nas configurações do navegador para receber os lembretes.</small></>}
        {st === 'error' && <><b>Não foi possível ativar agora</b><small>Tente de novo em “Meus horários”.</small><Button size="sm" variant="ghost" onClick={run}>Tentar de novo</Button></>}
      </div>
    </div>
  )
}
