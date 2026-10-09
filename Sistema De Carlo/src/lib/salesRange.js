import { useEffect, useState } from 'react'
import { db } from '../data'
import { addDays, today } from './utils'

/** o app carrega ~120 dias de vendas; antes disso, busca no banco só o período pedido */
export const loadedFrom = () => addDays(today(), -118)

export function useSalesRange(data, from, to) {
  const inMem = from >= loadedFrom()
  const key = `${from}|${to}`
  const [st, setSt] = useState({ key: '', rows: null, error: null })
  useEffect(() => {
    if (inMem || !from || !to) return
    let on = true
    setSt({ key, rows: null, error: null })
    db.salesRange(from, to).then((rows) => on && setSt({ key, rows, error: null })).catch((e) => on && setSt({ key, rows: [], error: e.message || 'erro' }))
    return () => { on = false }
  }, [key, inMem, data.sales]) // eslint-disable-line react-hooks/exhaustive-deps
  if (inMem) return { sales: data.sales.filter((s) => s.date >= from && s.date <= to), loading: false, error: null }
  const ready = st.key === key && st.rows
  return { sales: ready ? st.rows : [], loading: !ready, error: st.key === key ? st.error : null }
}
