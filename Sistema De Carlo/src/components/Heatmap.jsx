import { useMemo, useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Modal } from './ui'
import { addDays, cls, pad, today, toMin, WD_SHORT, weekday } from '../lib/utils'

/**
 * Mapa de ocupação: dia da semana × hora (últimas 6 semanas).
 * Ocupação = minutos agendados ÷ minutos disponíveis dos barbeiros.
 */
export function useOccupancy(weeks = 6) {
  const { data } = useStore()
  return useMemo(() => {
    const from = addDays(today(), -weeks * 7)
    const hoursByWd = data.settings.hours
    const openWds = [1, 2, 3, 4, 5, 6, 0].filter((d) => hoursByWd[d])
    const minH = Math.min(...openWds.map((d) => Math.floor(toMin(hoursByWd[d][0]) / 60)))
    const maxH = Math.max(...openWds.map((d) => Math.ceil(toMin(hoursByWd[d][1]) / 60)))
    const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i)
    const days = {}
    for (let d = from; d < today(); d = addDays(d, 1)) { const w = weekday(d); days[w] = (days[w] || 0) + 1 }
    const booked = {}
    for (const a of data.appointments) {
      if (a.date < from || a.date >= today() || a.status === 'cancelado') continue
      const w = weekday(a.date)
      let st = toMin(a.time); const en = st + Number(a.duration)
      while (st < en) { const h = Math.floor(st / 60); const next = Math.min(en, (h + 1) * 60); const k = `${w}-${h}`; booked[k] = (booked[k] || 0) + (next - st); st = next }
    }
    const grid = openWds.map((w) => {
      const [o, c] = hoursByWd[w].map(toMin)
      const barbersOn = data.barbers.filter((b) => b.active && !b.daysOff?.includes(w)).length
      return {
        w, cells: hours.map((h) => {
          const openMin = Math.max(0, Math.min(c, (h + 1) * 60) - Math.max(o, h * 60))
          const cap = openMin * barbersOn * (days[w] || 0)
          return { h, open: openMin > 0, pct: cap ? Math.min(1, (booked[`${w}-${h}`] || 0) / cap) : 0 }
        }),
      }
    })
    return { grid, hours, weeks }
  }, [data, weeks])
}

export function OccupancyMap() {
  const { data, actions } = useStore()
  const { grid, hours, weeks } = useOccupancy()
  const [promo, setPromo] = useState(null)
  const [tip, setTip] = useState(null)

  const create = async () => {
    await actions.upsert('promos', { weekdays: promo.weekdays, from: promo.from, to: promo.to, pct: Number(promo.pct), label: promo.label || 'Horário especial', active: true }, 'Promoção criada: aparece no app de agendamento')
    setPromo(null)
  }
  const open = (w, h) => setPromo({ weekdays: [w], from: `${pad(h)}:00`, to: `${pad(Math.min(h + 2, 23))}:00`, pct: 15, label: `${WD_SHORT[w]} ${pad(h)}h` })

  return (
    <div>
      <div className="heat-wrap">
        <table className="heat" aria-label="Ocupação por dia e hora">
          <thead><tr><th />{hours.map((h) => <th key={h}>{pad(h)}h</th>)}</tr></thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.w}>
                <th>{WD_SHORT[row.w]}</th>
                {row.cells.map((c) => (
                  <td key={c.h}>
                    {c.open ? (
                      <button
                        className={cls('heat-cell', c.pct < 0.35 && 'empty')}
                        style={{ '--o': (0.08 + c.pct * 0.92).toFixed(2) }}
                        onMouseEnter={() => setTip({ w: row.w, h: c.h, pct: c.pct })} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ w: row.w, h: c.h, pct: c.pct })}
                        onClick={() => open(row.w, c.h)}
                        aria-label={`${WD_SHORT[row.w]} ${c.h}h: ${Math.round(c.pct * 100)}% ocupado`}
                      >{Math.round(c.pct * 100)}</button>
                    ) : <span className="heat-closed" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heat-legend">
        <span>Vazio</span><i className="heat-scale" /><span>Lotado</span>
        <span className="muted small heat-tip">{tip ? `${WD_SHORT[tip.w]} ${pad(tip.h)}h · ${Math.round(tip.pct * 100)}% ocupado · clique para criar promoção` : `Ocupação média das últimas ${weeks} semanas. Células tracejadas = abaixo de 35%.`}</span>
      </div>

      <h4 className="sub-title">Promoções ativas no app</h4>
      {data.promos.length ? (
        <div className="list compact">
          {data.promos.map((p) => (
            <div key={p.id} className="sale-row">
              <span className="appt-time">-{p.pct}%</span>
              <span className="appt-info"><b>{p.label}</b><small>{p.weekdays.map((w) => WD_SHORT[w]).join(', ')} · {p.from} às {p.to}</small></span>
              <label className="switch" title={p.active ? 'Ativa' : 'Pausada'}><input type="checkbox" checked={p.active} onChange={() => actions.upsert('promos', { ...p, active: !p.active }, p.active ? 'Promoção pausada' : 'Promoção ativada')} /><span /></label>
              <button className="icon-btn sm" onClick={() => actions.remove('promos', p.id, 'Promoção removida')} aria-label="Remover"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ) : <p className="muted small">Clique numa célula vazia do mapa para criar uma promoção.</p>}

      <Modal open={!!promo} onClose={() => setPromo(null)} title="Promoção de horário" footer={<Button block icon={Sparkles} onClick={create}>Criar promoção</Button>}>
        {promo && (
          <div className="form-grid">
            <Field label="Nome" className="span-2"><input value={promo.label} onChange={(e) => setPromo({ ...promo, label: e.target.value })} /></Field>
            <Field label="Dias" className="span-2">
              <div className="days">{[1, 2, 3, 4, 5, 6, 0].map((w) => <button key={w} type="button" className={cls('pill', promo.weekdays.includes(w) && 'on')} onClick={() => setPromo({ ...promo, weekdays: promo.weekdays.includes(w) ? promo.weekdays.filter((x) => x !== w) : [...promo.weekdays, w] })}>{WD_SHORT[w]}</button>)}</div>
            </Field>
            <Field label="Das"><input type="time" value={promo.from} onChange={(e) => setPromo({ ...promo, from: e.target.value })} /></Field>
            <Field label="Até"><input type="time" value={promo.to} onChange={(e) => setPromo({ ...promo, to: e.target.value })} /></Field>
            <Field label="Desconto (%)"><input inputMode="numeric" value={promo.pct} onChange={(e) => setPromo({ ...promo, pct: e.target.value })} /></Field>
            <p className="muted small span-2">Os horários dentro da promoção aparecem com a etiqueta de desconto no app. O desconto é aplicado no caixa.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
