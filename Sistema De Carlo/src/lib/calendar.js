/** Salvar o horário na agenda do celular (.ics) ou no Google Agenda. Brasília = UTC-3 (sem horário de verão). */
const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (t = '') => String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

function range({ date, time, duration }) {
  const start = new Date(`${date}T${time}:00-03:00`)
  return [start, new Date(start.getTime() + (Number(duration) || 60) * 60000)]
}

export function googleCalendarUrl(ev) {
  const [s, e] = range(ev)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${utc(s)}/${utc(e)}`, details: ev.details || '', location: ev.location || '' })
  return `https://calendar.google.com/calendar/render?${q}`
}

export function downloadIcs(ev) {
  const [s, e] = range(ev)
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Astrovia//De Carlo Beauty//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${ev.id || utc(s)}@decarlo`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(s)}`, `DTEND:${utc(e)}`,
    `SUMMARY:${esc(ev.title)}`, `DESCRIPTION:${esc(ev.details)}`, `LOCATION:${esc(ev.location)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (ios) { window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`; return }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'horario-de-carlo-beauty.ics' })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
