import { CalendarPlus } from 'lucide-react'
import { Button } from './ui'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar'

/** Botões para a cliente salvar o horário na agenda do celular */
export default function AddToCalendar({ ev, compact = false }) {
  const android = /android/i.test(navigator.userAgent)
  return (
    <div className={compact ? 'cal-add compact' : 'cal-add'}>
      <Button variant="ghost" size={compact ? 'sm' : undefined} block={!compact} icon={CalendarPlus} onClick={() => downloadIcs(ev)}>Salvar na agenda</Button>
      {(android || !compact) && <a className={`btn btn-ghost ${compact ? 'btn-sm' : 'btn-block'}`} href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer">Google Agenda</a>}
    </div>
  )
}
