import { markLeaving } from '@/utils/app-lifecycle'
import { applyUpdate, checkVersion } from './pwa.update'

/**
 * A lazy chunk that fails to load almost always means a deployment replaced the
 * hashed files this bundle points at. The admin screens make this routine: they are
 * left out of the precache (see `vite.config.ts`), so they are fetched from a server
 * that may already serve the next version.
 */
const STALE_CHUNK_MESSAGES = [
  'Failed to fetch dynamically imported module', // Chromium
  'error loading dynamically imported module', // Firefox
  'Importing a module script failed', // Safari
]

/** A reload for the same destination within this window is a loop, not a recovery. */
const RELOAD_GUARD_MS = 10 * 1000
const RELOAD_GUARD_KEY = 'skol.staleChunkReload'

let recovering = false

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return STALE_CHUNK_MESSAGES.some((needle) => message.includes(needle))
}

function reloadedRecently(target: string): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_GUARD_KEY)
    const last = raw ? (JSON.parse(raw) as { target: string; at: number }) : null
    return last?.target === target && Date.now() - last.at < RELOAD_GUARD_MS
  } catch {
    return false
  }
}

function rememberReload(target: string): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ target, at: Date.now() }))
  } catch {
    // Private mode: the guard is a safety net, never a requirement.
  }
}

/**
 * Reloads onto `targetUrl` so the page picks up the bundle the server now serves.
 *
 * A plain reload is not enough when a service worker controls the page: it would
 * serve the same stale index.html from its precache and fail on the same chunk. When
 * a new version is out, the handover goes through `applyUpdate`, which activates
 * the new worker first and caps the retries. Offline, nothing is attempted: the
 * chunk is simply unreachable and reloading would only blank the screen.
 */
export async function recoverFromStaleChunk(targetUrl?: string): Promise<void> {
  if (recovering || !navigator.onLine) return
  recovering = true
  const target = new URL(targetUrl ?? window.location.href, window.location.origin).href

  if ((await checkVersion()) && (await applyUpdate(target))) return

  // Same version served (dev server re-optimisation, a transient failure) or an
  // update that could not be applied: one straight reload, never a loop.
  if (reloadedRecently(target)) {
    recovering = false
    return
  }
  rememberReload(target)
  markLeaving()
  if (target === window.location.href) window.location.reload()
  else window.location.href = target
}
