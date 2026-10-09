import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db, isDemo } from '../data'
import { safeLS, serverNowMs, setServerTime } from '../lib/utils'
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
    try { navigator.vibrate?.(tone === 'bad' ? [30, 60, 30] : 18) } catch { /* sem vibração */ }
    setToast({ msg, tone, k: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.k > 2500 ? null : t)), 2800)
  }, [])

  const loadPublic = useCallback(async () => {
    // acerta o relógio pela hora do servidor antes de montar a tela (sem a função no banco, segue o do aparelho)
    if (db.serverTime) await db.serverTime().then(setServerTime).catch(() => {})
    try { setPub(await db.loadPublic()) } catch (e) { setError(e.message) }
  }, [])

  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  // Sincronização econômica: carga completa só ao entrar (ou após 30 min fora);
  // depois de cada ação e na atualização automática busca apenas o que mudou.
  const syncRef = useRef(null)
  const fullRef = useRef(0)
  const refresh = useCallback(async (mode = 'delta', touched = []) => {
    try {
      const stamp = new Date(serverNowMs() - 120000).toISOString() // hora do servidor (PC com relógio errado não perde mudanças) + margem
      if (mode === 'full' || !syncRef.current || !db.loadChanges) {
        const all = await db.loadAll(sessionRef.current); setData(all); setPub(await db.loadPublic()); fullRef.current = Date.now()
      } else {
        // depois de uma ação: tabelas pequenas + as grandes que a ação mexeu (touched); na atualização automática, só o que mudou
        const [small, ch] = await Promise.all([mode === 'poll' ? null : db.loadSmall(sessionRef.current, touched), db.loadChanges(syncRef.current, sessionRef.current)])
        const up = (list = [], rows = []) => { if (!rows.length) return list; const m = new Map(list.map((x) => [x.id, x])); rows.forEach((r) => m.set(r.id, { ...m.get(r.id), ...r })); return [...m.values()] }
        setData((d) => d && ({ ...d, ...(small || {}), appointments: up(d.appointments, ch.appointments), clients: up(d.clients, ch.clients), sales: up(d.sales, ch.sales), announcements: small?.announcements || up(d.announcements, ch.announcements) }))
      }
      syncRef.current = stamp
    } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => { loadPublic() }, [loadPublic])
  useEffect(() => {
    if (!isDemo) db.session().then((s) => s && setSession(s)).catch(() => {})
  }, [])
  useEffect(() => { if (session) { syncRef.current = null; refresh('full') } }, [session, refresh])

  const run = useCallback(async (fn, okMsg, mode = 'delta', touched = []) => {
    try { const r = await fn(); await refresh(mode, touched); if (okMsg) notify(okMsg); return r }
    catch (e) { notify(e.message || 'Algo deu errado', 'bad'); throw e }
  }, [refresh, notify])

  const actions = useMemo(() => ({
    login: async (cred) => { const s = await db.login(cred); setSession(s); if (isDemo) safeLS.set(SESSION_KEY, s); return s },
    logout: async () => { await disablePush().catch(() => {}); await db.logout(); setSession(null); setData(null); safeLS.del(SESSION_KEY) },
    busy: (date) => db.busy(date),
    book: async (p) => { const r = await db.book(p); if (session) await refresh(); return r },
    staffBook: (p) => run(() => db.book({ ...p, source: 'balcao' }), 'Agendamento criado'),
    updateAppointment: (id, patch, msg) => run(() => db.updateAppointment(id, patch), msg),
    upsert: (table, row, msg = 'Salvo') => run(() => db.upsert(table, row), msg, 'delta', [table]),
    patch: (table, id, fields, msg = null) => run(() => db.patch(table, id, fields), msg, 'delta', [table]),
    remove: async (table, id, msg = 'Removido') => { await run(() => db.remove(table, id), msg, 'delta', [table]); setData((d) => d && Array.isArray(d[table]) ? { ...d, [table]: d[table].filter((x) => x.id !== id) } : d) },
    saveSettings: (s) => run(() => db.saveSettings(s), 'Configurações salvas'),
    upsertClient: (c) => run(() => db.upsertClient(c)),
    createSale: (s) => run(() => db.createSale(s), 'Venda finalizada'),
    adjustSale: async (id, a, payment) => {
      await run(() => db.adjustSale(id, a, payment), 'Venda ajustada')
      setData((d) => d && { ...d, sales: d.sales.map((x) => (x.id === id ? { ...x, ...a, payment: payment || x.payment } : x)), appointments: d.appointments.map((x) => (x.saleId === id || x.id === d.sales.find((y) => y.id === id)?.appointmentId ? { ...x, total: a.total } : x)) })
    },
    /** corrige atendimento já cobrado (serviços, profissional, valores) sem estornar */
    editSale: async (id, sale) => {
      await run(() => db.editSale(id, sale), 'Atendimento corrigido')
      const svcIds = sale.items.filter((i) => i.type === 'service').map((i) => i.refId)
      setData((d) => { const old = d?.sales.find((x) => x.id === id); return d && { ...d, sales: d.sales.map((x) => (x.id === id ? { ...x, ...sale } : x)), appointments: d.appointments.map((x) => (x.saleId === id || (old?.appointmentId && x.id === old.appointmentId) ? { ...x, barberId: sale.barberId, total: sale.total, serviceIds: svcIds.length ? svcIds : x.serviceIds } : x)) } })
    },
    deleteSale: async (id) => { await run(() => db.deleteSale(id), 'Venda estornada'); setData((d) => d && { ...d, sales: d.sales.filter((x) => x.id !== id) }) },
    resetDemo: async () => { db.reset(); await refresh('full'); await loadPublic(); notify('Dados de demonstração restaurados') },
    reload: () => refresh('poll'),
    /** volta ao painel: completo se ficou mais de 30 min fora */
    resume: () => refresh(Date.now() - fullRef.current > 30 * 60000 ? 'full' : 'poll'),
    markRead: async (id) => { await db.markRead(id, session?.barberId); await refresh() },
    linkStaff: (email, barberId) => run(() => db.linkStaff(email, barberId), 'Acesso vinculado', 'delta', ['staff']),
    // recepção e WhatsApp da cliente
    createReceptionLogin: (email, password, name) => run(() => db.createStaffLogin(email, password, null, { role: 'reception', name }), 'Acesso da recepção criado. Envie os dados para ela.', 'delta', ['staff']),
    linkReception: (email, name) => run(() => db.linkReception(email, name), 'Recepção vinculada', 'delta', ['staff']),
    unlinkReception: (email) => run(() => db.unlinkReception(email), 'Acesso da recepção removido', 'delta', ['staff']),
    setProductUnit: (id, unit) => run(() => db.setProductUnit(id, unit), 'Unidade do produto atualizada', 'delta', ['products']),
    setClientPhone: (id, phone) => run(() => db.setClientPhone(id, phone), 'WhatsApp atualizado', 'delta', ['clients']),
    createStaffLogin: (email, password, barberId) => run(() => db.createStaffLogin(email, password, barberId), 'Acesso criado. Envie os dados para ela.', 'full'),
    clientAccess: (p) => db.clientAccess(p), // Meus horários (link pessoal ou celular + aniversário)
    bookingProfile: (phone) => db.bookingProfile(phone), // agendar: saudação e benefícios
    clientCancel: async (id, token) => { await db.clientCancel(id, token); if (session) await refresh(); else await loadPublic() },
    joinWaitlist: async (w) => { const r = await db.joinWaitlist(w); if (session) await refresh(); return r },
    reviewTarget: (id) => db.reviewTarget(id),
    submitReview: async (r) => { await db.submitReview(r); if (session) await refresh(); else await loadPublic() },
    uploadAvatar: (id, d) => db.uploadAvatar(id, d),
    savePhoto: (p) => run(() => db.savePhoto(p), 'Foto salva no portfólio', 'full'),
    backup: () => db.backup(),
    deletePhoto: (id) => run(() => db.deletePhoto(id), 'Foto excluída', 'full'),
    bulkImport: (x) => run(() => db.bulkImport(x), undefined, 'full'),
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
