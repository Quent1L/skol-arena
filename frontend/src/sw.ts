/// <reference lib="webworker" />

import {
  addPlugins,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Read once: workbox-build refuses a source where the injection point appears
// more than a single time.
const manifest = self.__WB_MANIFEST
const PRECACHE_TOTAL = manifest.length

/** Precache writes are fast and numerous: coalesce the messages sent to the app. */
const PROGRESS_THROTTLE_MS = 150

let precachedCount = 0
let lastProgressAt = 0

async function postProgress(): Promise<void> {
  // includeUncontrolled: an installing worker controls nothing yet, and the page
  // sitting on the update overlay is exactly the one it has to report to.
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const client of clients) {
    client.postMessage({
      type: 'PRECACHE_PROGRESS',
      done: precachedCount,
      total: PRECACHE_TOTAL,
    })
  }
}

function countPrecachedEntry(): void {
  precachedCount += 1
  const now = Date.now()
  const isLast = precachedCount >= PRECACHE_TOTAL
  if (!isLast && now - lastProgressAt < PROGRESS_THROTTLE_MS) return
  lastProgressAt = now
  void postProgress()
}

// Real install progress, pushed to the app so the update overlay can show how far
// the download actually is instead of a fake timed bar. Two hooks are needed:
// workbox skips an entry whose revision is already cached, and a skip goes through
// cachedResponseWillBeUsed while an actual download goes through cacheDidUpdate.
// Both are filtered on the install event so runtime cache hits never move the bar.
addPlugins([
  {
    cachedResponseWillBeUsed: async ({ event, cachedResponse }) => {
      if (event?.type === 'install' && cachedResponse) countPrecachedEntry()
      return cachedResponse
    },
    cacheDidUpdate: async ({ event }) => {
      if (event?.type === 'install') countPrecachedEntry()
    },
  },
])

// Drops the precaches left by previous versions on activation. Without it every
// deployment strands a full copy of the bundle — fonts included — in storage forever.
cleanupOutdatedCaches()

// Precache and route assets
precacheAndRoute(manifest)

// Every navigation gets the shell of this worker's own precache, not just `/`. Left to
// the browser, a deep URL is loaded from the network or, on a back/forward navigation,
// from the HTTP cache — which happily serves a stale index.html from a previous
// deployment. That shell then points at hashed files the server no longer has, the
// entry module fails to load and the app never starts. Serving the precached shell
// keeps the HTML and the bundle it references from the same build; a new version
// still arrives through the update flow (composables/pwa/pwa.update.ts).
//
// Left out: the server's own pages (`/api/*`: SSO callbacks, the API reference) and
// any URL naming a file (`/version.json`, an icon opened in a tab).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^[^?]*\/[^/?]*\.[^/?]*(\?.*)?$/],
  }),
)

// Service worker for push notifications

self.addEventListener('install', () => {
  console.log('[SW] Service worker installed')
  // First install (no active SW): take over right away. Otherwise stay in
  // waiting — the app decides when to apply the update (see
  // composables/pwa/pwa.update.ts), so the page never reloads in the middle of
  // whatever the user is doing.
  if (!self.registration.active) self.skipWaiting()
})

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated')
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] Push event received:', event)
  if (!event.data) {
    console.log('[SW] No data in push event')
    return
  }

  let data: unknown
  try {
    data = event.data.json()
    console.log('[SW] Push data:', data)
  } catch (err) {
    console.error('[SW] Failed to parse push data:', err)
    return
  }

  const notification = data as { title?: string; message?: string; actionUrl?: string }
  const title = notification.title || 'Notification'
  const options: NotificationOptions = {
    body: notification.message,
    data: { url: notification.actionUrl },
    // Both must be paths that really exist in public/. An earlier version pointed
    // at /skol-arena-logo.png, which did not: the SPA fallback answered it with
    // index.html, the browser dropped the image, and notifications came out bare.
    // The badge is drawn as a monochrome mask, so it needs the cut-out variant:
    // the opaque one comes out as a solid black square.
    badge: '/icons/icon-192-transparent.png',
    icon: '/icons/icon-192.png',
  }
  console.log('[SW] Showing notification:', title, options)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('[SW] Notification clicked:', event.notification)
  event.notification.close()
  const url = event.notification.data?.url
  if (url) {
    console.log('[SW] Opening URL:', url)
    event.waitUntil(
      (async () => {
        const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        const client = allClients.find((c: WindowClient) => c.url === url)
        if (client) {
          console.log('[SW] Focusing existing client')
          client.focus()
        } else {
          console.log('[SW] Opening new window')
          await self.clients.openWindow(url)
        }
      })()
    )
  }
})

console.log('[SW] Service worker script loaded')
