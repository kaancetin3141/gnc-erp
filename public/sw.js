// GNC CRM Service Worker
// Önbellek stratejileri:
//  - App shell (önceden önbelleğe alınmış): network'e ihtiyaç duymadan açılır
//  - Statik varlıklar (CSS/JS/font): stale-while-revalidate
//  - API çağrıları: network-first (cache fallback offline'da)
//  - Görseller: cache-first
//  - Diğer sayfalar: network-first, cache fallback

const CACHE_VERSION = 'v1.0.0'
const STATIC_CACHE = `gnc-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `gnc-runtime-${CACHE_VERSION}`
const API_CACHE = `gnc-api-${CACHE_VERSION}`

// App shell — önbelleğe alınmış uygulama kabuğu (offline'da açılır)
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/offline.html',
]

// Lifecycle events
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(url)
          } catch (e) {
            console.warn(`Önbelleğe alınamadı: ${url}`, e)
          }
        })
      )
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Sadece GET isteklerini önbelleğe al
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Aynı origin
  if (url.origin !== self.location.origin) return

  // Navigation (HTML sayfaları) — network-first, offline'da app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request)
          const cache = await caches.open(RUNTIME_CACHE)
          cache.put('/', networkResponse.clone())
          return networkResponse
        } catch {
          const cache = await caches.open(STATIC_CACHE)
          const cached = await cache.match('/')
          if (cached) return cached
          return caches.match('/offline.html')
        }
      })()
    )
    return
  }

  // API istekleri — network-first (cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request)
          // Sadece 200 OK olanları önbelleğe al
          if (networkResponse.ok) {
            const cache = await caches.open(API_CACHE)
            cache.put(request, networkResponse.clone())
          }
          return networkResponse
        } catch {
          // Offline — cache'den döndür
          const cache = await caches.open(API_CACHE)
          const cached = await cache.match(request)
          if (cached) return cached
          return new Response(
            JSON.stringify({ error: 'Çevrimdışısınız — veri geçici olarak kullanılamıyor' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
        }
      })()
    )
    return
  }

  // Statik varlıklar (CSS/JS/font/image) — stale-while-revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(css|js|woff2?|ttf|png|jpg|jpeg|gif|svg|webp|avif)$/)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const cachedResponse = await cache.match(request)
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
          .catch(() => cachedResponse)
        return cachedResponse || fetchPromise
      })()
    )
    return
  }

  // Diğer istekler — stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE)
      const cached = await cache.match(request)
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => cached)
      return cached || fetchPromise
    })()
  )
})

// Push notification
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : { title: 'GNC CRM', body: 'Yeni bildirim' }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192-maskable.png',
      tag: payload.tag || 'gnc-default',
      data: payload.data || { url: '/' },
      vibrate: [200, 100, 200],
    })
  )
})

// Notification click → URL'i aç
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window' })
      if (allClients.length > 0) {
        const client = allClients[0]
        await client.focus()
        await client.navigate(url)
      } else {
        await self.clients.openWindow(url)
      }
    })()
  )
})

// Periodic sync (arka plan veri yenileme — yalnızca destekleyen tarayıcılarda)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-feed') {
    event.waitUntil(refreshFeed())
  }
})

async function refreshFeed() {
  // Bildirim/messages'in önbelleğini yenile
  const cache = await caches.open(API_CACHE)
  await cache.add('/api/notifications')
  await cache.add('/api/messages?unread=1&limit=100')
}

// Mesaj dinleyicisi (client'tan mesaj al)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION })
  }
})
