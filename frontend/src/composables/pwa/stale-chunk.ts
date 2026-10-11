import { markLeaving } from '@/utils/app-lifecycle'
import { errorService } from '@/composables/useErrorService'
import { i18n } from '@/i18n'
import { applyUpdate, checkVersion, handOverToNewerWorker, reloadServesLatest } from './pwa.update'

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

/** Resolves on the next task, once every pending microtask has run. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** One straight navigation onto `target`, never a loop. */
function reloadOnce(target: string): void {
  if (reloadedRecently(target)) {
    recovering = false
    return
  }
  rememberReload(target)
  markLeaving()
  if (target === window.location.href) window.location.reload()
  else window.location.href = target
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
  // `vite:preloadError` fires before the router hears of the failed navigation: let
  // the router's call, the one that knows the destination, go first.
  if (!targetUrl) await nextTask()
  if (recovering || !navigator.onLine) return
  recovering = true
  const target = new URL(targetUrl ?? window.location.href, window.location.origin).href

  const updateServed = await checkVersion()
  if (updateServed && (await applyUpdate(target))) return

  // An update that could not be applied while the old worker still holds the page:
  // a reload would get its stale index.html back and fail on the same chunk. Say why
  // the screen did not open instead; a later navigation applies the update once the
  // new bundle is downloaded.
  if (updateServed && !reloadServesLatest()) {
    recovering = false
    errorService.showError(i18n.global.t('errorService.updateRequired'))
    return
  }

  // Same version served, yet the chunk is gone: either a transient failure (or the dev
  // server re-optimising), or another build of this same version, whose worker is
  // waiting behind the one serving our stale shell. Hand over to it first if there is
  // one, or the reload lands on that shell again; then one straight reload.
  if (!updateServed) await handOverToNewerWorker()
  reloadOnce(target)
}
