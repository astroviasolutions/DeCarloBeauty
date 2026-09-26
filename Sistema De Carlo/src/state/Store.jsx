import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db, isDemo } from '../data'
import { safeLS } from '../lib/utils'
import { disablePush } from '../lib/push'

const Ctx = createContext(null)
const SESSION_KEY = 'dcb:session'

export function StoreProvider({ children }) {
  const [pub, setPub] = useState(null)
  const [data, setData] = useState(null)
  const [session, setSession] = useState(() => (isDemo ? safeLS.get(SESSION_KEY) : null))
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [ask, setAsk] = useState(null)

  const notify = useCallback((msg, tone = 'good') => {
    setToast({ msg, tone, k: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.k > 2500 ? null : t)), 2800)
  }, [])

  const loadPublic = useCallback(async () => {
    try { setPub(await db.loadPublic()) } catch (e) { setError(e.message) }
  }, [])

  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const refresh = useCallback(async () => {
    try { const all = await db.loadAll(sessionRef.current); setData(all); setPub(await db.loadPublic()) }
    catch (e) { setError(e.message) }
  }, [])

  useEffect(() => { loadPublic() }, [loadPublic])
  useEffect(() => {
    if (!isDemo) db.session().then((s) => s && setSession(s)).catch(() => {})
  }, [])
  useEffect(() => { if (session) refresh() }, [session, refresh])

  const run = useCallback(async (fn, okMsg) => {
    try { const r = await fn(); await refresh(); if (okMsg) notify(okMsg); return r }
    catch (e) { notify(e.message || 'Algo deu errado', 'bad'); throw e }
  }, [refresh, notify])

  const actions = useMemo(() => ({
    login: async (cred) => { const s = await db.login(cred); setSession(s); if (isDemo) safeLS.set(SESSION_KEY, s); return s },
    logout: async () => { await disablePush().catch(() => {}); await db.logout(); setSession(null); setData(null); safeLS.del(SESSION_KEY) },
    busy: (date) => db.busy(date),
    book: async (p) => { const r = await db.book(p); if (session) await refresh(); return r },
    staffBook: (p) => run(() => db.book({ ...p, source: 'balcao' }), 'Agendamento criado'),
    updateAppointment: (id, patch, msg) => run(() => db.updateAppointment(id, patch), msg),
    upsert: (table, row, msg = 'Salvo') => run(() => db.upsert(table, row), msg),
    remove: (table, id, msg = 'Removido') => run(() => db.remove(table, id), msg),
    saveSettings: (s) => run(() => db.saveSettings(s), 'Configurações salvas'),
    upsertClient: (c) => run(() => db.upsertClient(c)),
    createSale: (s) => run(() => db.createSale(s), 'Venda finalizada'),
    deleteSale: (id) => run(() => db.deleteSale(id), 'Venda estornada'),
    resetDemo: async () => { db.reset(); await refresh(); await loadPublic(); notify('Dados de demonstração restaurados') },
    reload: () => refresh(),
    markRead: async (id) => { await db.markRead(id, session?.barberId); await refresh() },
    linkStaff: (email, barberId) => run(() => db.linkStaff(email, barberId), 'Acesso vinculado'),
    portal: (phone) => db.portal(phone),
    clientCancel: async (id, phone) => { await db.clientCancel(id, phone); if (session) await refresh(); else await loadPublic() },
    joinWaitlist: async (w) => { const r = await db.joinWaitlist(w); if (session) await refresh(); return r },
    reviewTarget: (id) => db.reviewTarget(id),
    submitReview: async (r) => { await db.submitReview(r); if (session) await refresh(); else await loadPublic() },
    savePhoto: (p) => run(() => db.savePhoto(p), 'Foto salva no portfólio'),
    bulkImport: (x) => run(() => db.bulkImport(x)),
    notify,
    /** confirmação dentro da página (sem window.confirm) */
    confirm: (message, okLabel = 'Confirmar') => new Promise((resolve) => setAsk({ message, okLabel, resolve })),
  }), [run, refresh, loadPublic, notify, session])

  return (
    <Ctx.Provider value={{ pub, data, session, actions, toast, error, isDemo, ask, setAsk }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
