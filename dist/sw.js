/* De Carlo Beauty — service worker
 * Recebe as notificações push (mesmo com o site fechado) e abre o painel ao tocar.
 * Não guarda páginas em cache: o sistema sempre carrega a versão mais nova.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'De Carlo Beauty', body: event.data ? event.data.text() : '' } }
  const title = d.title || 'De Carlo Beauty'
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.important,
    data: { url: d.url || './#/painel' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './#/painel', self.registration.scope).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); if ('navigate' in c) await c.navigate(target).catch(() => {}); return }
    }
    await self.clients.openWindow(target)
  })())
})

// o site pede para mostrar uma notificação (Android não aceita "new Notification" na página)
self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.type === 'notify') {
    self.registration.showNotification(d.title || 'De Carlo Beauty', { body: d.body || '', icon: './icon-192.png', badge: './badge-96.png', tag: d.tag, data: { url: d.url || './#/painel' } })
  }
})
