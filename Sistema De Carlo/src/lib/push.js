/**
 * Notificações push (chegam no celular mesmo com o site fechado).
 * - O service worker (public/sw.js) recebe e mostra a notificação.
 * - A assinatura de cada aparelho fica salva no Supabase (tabela push_subscriptions).
 * - Quem envia é a função "send-push" do Supabase, chamada pelo banco quando entra
 *   um agendamento, um aviso da gestão ou chega a hora do lembrete.
 */
import { db, isDemo } from '../data'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
export const swSupported = () => 'serviceWorker' in navigator && location.protocol !== 'file:'
export const pushSupported = () => swSupported() && 'PushManager' in window && typeof Notification !== 'undefined'
export const pushConfigured = () => !isDemo && !!VAPID

let regPromise = null
/** Registra o service worker (uma vez). Em arquivo local (demo offline) não existe. */
export function registerSW() {
  if (!swSupported()) return Promise.resolve(null)
  regPromise ??= navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => null)
  return regPromise
}

/** Mostra uma notificação pelo service worker (funciona também no Android) */
export async function showLocal({ title, body, tag, url }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const reg = await registerSW()
  if (reg?.showNotification) { reg.showNotification(title, { body, tag, icon: './icon-192.png', badge: './badge-96.png', data: { url: url || './#/painel' } }); return }
  try { new Notification(title, { body, tag }) } catch { /* sem suporte */ }
}

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Situação deste aparelho: 'unsupported' | 'ios-install' | 'off' | 'denied' | 'on' */
export async function pushStatus() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (!pushConfigured()) return Notification.permission === 'granted' ? 'local' : 'off'
  const reg = await registerSW()
  const sub = await reg?.pushManager?.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Garante que este aparelho está ligado a quem está logado agora (troca de login no mesmo celular) */
export async function syncPush() {
  if (!pushSupported() || !pushConfigured() || Notification.permission !== 'granted') return false
  const reg = await registerSW()
  const sub = await reg?.pushManager?.getSubscription()
  if (!sub) return false
  await db.savePush(sub.toJSON(), navigator.userAgent)
  return true
}

/** Pede permissão, assina o push e salva no banco. Retorna o novo status. */
export async function enablePush() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  if (!pushConfigured()) return 'local'
  const reg = await registerSW()
  if (!reg) return 'unsupported'
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) })
  await db.savePush(sub.toJSON(), navigator.userAgent)
  return 'on'
}

export async function disablePush() {
  const reg = await registerSW()
  const sub = await reg?.pushManager?.getSubscription()
  if (sub) { await db.removePush(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}) }
  return 'off'
}

export const sendTestPush = () => db.testPush()
