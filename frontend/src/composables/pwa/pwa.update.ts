import { ref, readonly, computed } from 'vue'
import { markLeaving } from '@/utils/app-lifecycle'
import { isVersionBelowMin } from '@/utils/semver'

/** Minimum time the UpdateOverlay stays up, so it can actually be read. */
export const UPDATE_OVERLAY_MIN_MS = 1500
/** Budget for the handover itself, once a worker is waiting: skipWaiting is instant. */
const HANDOVER_TIMEOUT_MS = 5000
/**
 * Ceiling on how long we wait for a new worker to finish precaching, when the user
 * has no choice but to wait it out.
 */
const FORCED_DOWNLOAD_MAX_MS = 120 * 1000
/**
 * Same ceiling for a routine release. Much lower on purpose: nobody should stare at
 * a splash for two minutes over a bug fix. Giving up here is not final — the install
 * keeps running and a later navigation applies it for the cost of a reload.
 */
const BACKGROUND_DOWNLOAD_MAX_MS = 8 * 1000
/** Throttle window for navigation-triggered checks. */
const CHECK_THROTTLE_MS = 60 * 1000
/** Past this many reloads for the same version, stop: something is not converging. */
const MAX_RELOAD_ATTEMPTS = 2
const RELOAD_ATTEMPTS_KEY = 'skol.updateReloads'
/** How long the "update done" screen stays up. Long enough to read a version number. */
export const UPDATE_CONFIRM_MS = 3500
/** Last version this browser actually ran, to spot the change on the next boot. */
const LAST_VERSION_KEY = 'skol.lastVersion'

/** What the overlay is currently waiting on. */
export type UpdatePhase = 'idle' | 'downloading' | 'applying' | 'done'

/** A new version is deployed but not applied yet. */
const updatePending = ref(false)
/** Update is being applied: drives the UpdateOverlay. */
const isApplying = ref(false)
/** Downloading the new bundle, or handing over to the worker that already has it. */
const updatePhase = ref<UpdatePhase>('idle')
/**
 * The user asked to keep using the app rather than wait for the download, or the
 * download failed. Either way: stop blocking, apply at the next navigation once
 * the worker is ready.
 */
const deferred = ref(false)
/** The new worker has taken control of the page: the handover is already done. */
const controllerTakenOver = ref(false)
/**
 * A new worker is waiting or already in control: applying now costs a reload and
 * nothing else. Distinct from `controllerTakenOver`, because a worker that reached
 * `waiting` after the user deferred stays there until we ask it to skip — nothing
 * fires on its own to tell us the bundle is ready.
 */
const updateReady = ref(false)
/** Precache progress reported by the installing worker, 0..1, null while unknown. */
const downloadProgress = ref<number | null>(null)
/** Same progress as a file count, so the wait is legible rather than a bare bar. */
const downloadDone = ref<number | null>(null)
const downloadTotal = ref<number | null>(null)
/**
 * The served build requires a version this one is below: the update is not optional
 * and the user gets no way out of it. Resolved at detection.
 */
const updateForced = ref(false)
/** Version to announce as freshly installed, null when there is nothing to announce. */
const confirmedVersion = ref<string | null>(null)

/**
 * The overlay is the apply routine made visible — unless the user waved it away —
 * plus the confirmation shown once on the other side of the reload.
 */
const overlayVisible = computed(
  () => (isApplying.value && !deferred.value) || confirmedVersion.value !== null,
)

/** True once a deployment is detected. Only a reload clears it. */
export function isUpdatePending(): boolean {
  return updatePending.value
}

let lastCheckAt = 0
let blockers = 0
let prefetchStarted = false
let pendingVersion: string | null = null
/** Floor advertised by the served build, needed to tell a routine update from a forced one. */
let servedMinVersion: string | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Races a promise against a delay without rejecting: timing out is a normal outcome. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, delay(ms).then(() => fallback)])
}

function hasServiceWorker(): boolean {
  return 'serviceWorker' in navigator
}

if (hasServiceWorker()) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; done?: number; total?: number } | undefined
    if (data?.type !== 'PRECACHE_PROGRESS' || !data.total) return
    const done = Math.min(data.total, data.done ?? 0)
    // Monotonic: a worker restarting its install must not rewind the bar under
    // the user's eyes.
    downloadProgress.value = Math.max(downloadProgress.value ?? 0, done / data.total)
    downloadDone.value = Math.max(downloadDone.value ?? 0, done)
    downloadTotal.value = data.total
  })

  // Catches the handover that completes after the user deferred the update.
  // Gated on a pending update: the very first install also changes the controller,
  // and treating that as "the new bundle is in place" would let a later update
  // reload straight into the stale one.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updatePending.value) return
    controllerTakenOver.value = true
    updateReady.value = true
  })
}

/* -------------------------------------------------------------------------- */
/* Reload loop breaker                                                         */
/* -------------------------------------------------------------------------- */

type ReloadAttempts = { version: string; count: number }

function readReloadAttempts(): ReloadAttempts | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_ATTEMPTS_KEY)
    return raw ? (JSON.parse(raw) as ReloadAttempts) : null
  } catch {
    return null
  }
}

function recordReloadAttempt(version: string): void {
  try {
    const previous = readReloadAttempts()
    const count = previous?.version === version ? previous.count + 1 : 1
    sessionStorage.setItem(RELOAD_ATTEMPTS_KEY, JSON.stringify({ version, count }))
  } catch {
    // Private mode: the loop breaker is a safety net, never a requirement.
  }
}

function clearReloadAttempts(): void {
  try {
    sessionStorage.removeItem(RELOAD_ATTEMPTS_KEY)
  } catch {
    // See above.
  }
}

/**
 * True when we already reloaded for this exact version and came back on the old
 * one anyway. Reloading again would only replay the same failure, in front of the
 * user, forever.
 */
function reloadLoopDetected(version: string): boolean {
  const attempts = readReloadAttempts()
  return attempts?.version === version && attempts.count >= MAX_RELOAD_ATTEMPTS
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Starts the new worker's download as soon as a deployment is detected instead of
 * waiting for applyUpdate: the precache then runs while the user keeps reading the
 * current screen, and the handover is instant when they finally navigate.
 */
async function prefetchUpdate(): Promise<void> {
  if (prefetchStarted || !hasServiceWorker()) return
  prefetchStarted = true
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return
    // Nothing else announces that a background precache is done: a worker that
    // reaches `waiting` on its own sits there silently. Without this watcher a
    // routine update would only ever land on a cold start, never on a navigation.
    // Attached before update() so the `updatefound` it triggers is not missed.
    void waitForInstalled(registration).then((worker) => {
      if (worker) updateReady.value = true
    })
    await registration.update()
  } catch {
    // Offline: let the next detection try again.
    prefetchStarted = false
  }
}

/* -------------------------------------------------------------------------- */
/* Post-update confirmation                                                    */
/* -------------------------------------------------------------------------- */

function readLastVersion(): string | null {
  try {
    return localStorage.getItem(LAST_VERSION_KEY)
  } catch {
    // Private mode: worst case the confirmation never shows.
    return null
  }
}

function rememberVersion(version: string): void {
  try {
    localStorage.setItem(LAST_VERSION_KEY, version)
  } catch {
    // See above.
  }
}

/**
 * Returns the version to announce as freshly installed, and records the current one
 * for next time. Null when there is nothing to say.
 *
 * Reading it from storage rather than from the update flow is what makes the
 * announcement reliable: navigations bypass the precache, so a plain reload lands on
 * the new bundle without `applyUpdate` ever running — the very case where the user
 * would otherwise be moved to a new version with no explanation at all.
 *
 * Mandatory updates get announced too. The blocking screen they show on the way in
 * says a version is *required*, not that one was installed, and it can be gone in the
 * 1.5s floor when the bundle was already precached — leaving the user with a page
 * that reloaded under them for no stated reason.
 */
export function consumeUpdateConfirmation(): string | null {
  const previous = readLastVersion()
  rememberVersion(__APP_VERSION__)

  // First run on this browser: nothing changed, there was no "before".
  if (!previous || previous === __APP_VERSION__) return null
  return __APP_VERSION__
}

/** Holds the confirmation screen up long enough to read, then hands over to the app. */
export async function announceUpdate(): Promise<void> {
  const version = consumeUpdateConfirmation()
  if (!version) return

  updatePhase.value = 'done'
  confirmedVersion.value = version
  await delay(UPDATE_CONFIRM_MS)
  confirmedVersion.value = null
  updatePhase.value = 'idle'
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Compares the served version against the one baked into the bundle. Much
 * faster than `registration.update()`, which has to re-download the worker.
 * Any failure means "no update": the file is absent in dev, and going offline
 * must obviously not trigger anything.
 */
export async function checkVersion(): Promise<boolean> {
  lastCheckAt = Date.now()
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return false
    const data = (await response.json()) as { version?: string; minVersion?: string | null }
    if (!data.version) return false

    servedMinVersion = data.minVersion ?? null

    if (data.version === __APP_VERSION__) {
      // Running exactly what is served: whatever happened before worked out.
      clearReloadAttempts()
      return updatePending.value
    }

    pendingVersion = data.version
    if (reloadLoopDetected(data.version)) {
      console.warn(
        `[pwa] update to ${data.version} did not stick after ${MAX_RELOAD_ATTEMPTS} reloads, staying on ${__APP_VERSION__}`,
      )
      return false
    }

    // Resolved after the loop breaker on purpose: an update that already failed to
    // stick must not be the one the user is locked behind.
    updateForced.value = isVersionBelowMin(__APP_VERSION__, servedMinVersion)
    updatePending.value = true
    void prefetchUpdate()
    return true
  } catch {
    return false
  }
}

/** Throttled variant, for the check fired on every navigation. */
export function checkVersionThrottled(): Promise<boolean> {
  if (Date.now() - lastCheckAt < CHECK_THROTTLE_MS) return Promise.resolve(updatePending.value)
  return checkVersion()
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                    */
/* -------------------------------------------------------------------------- */

function waitForControllerChange(): Promise<void> {
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
  })
}

/**
 * Waits for a freshly downloaded worker to reach the `installed` state.
 * Resolves with `null` when the install failed: a redundant worker never reaches
 * `installed`, and waiting for it would hang until the download ceiling.
 */
function waitForInstalled(registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (worker: ServiceWorker | null) => {
      if (settled) return
      settled = true
      resolve(worker)
    }

    const track = (worker: ServiceWorker | null | undefined): boolean => {
      if (!worker) return false
      const onStateChange = () => {
        if (worker.state === 'installed' || worker.state === 'activated') {
          // Fall back to the worker itself: `registration.waiting` is not always
          // populated yet when `statechange` fires, and reporting no worker there
          // would read as a failed download.
          settle(registration.waiting ?? worker)
        } else if (worker.state === 'redundant') {
          settle(null)
        }
      }
      worker.addEventListener('statechange', onStateChange)
      onStateChange()
      return true
    }

    if (registration.waiting) {
      settle(registration.waiting)
      return
    }
    if (track(registration.installing)) return

    // `update()` can resolve before the browser has created the new worker.
    registration.addEventListener?.('updatefound', () => track(registration.installing))
  })
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!hasServiceWorker()) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

/**
 * Gets a new worker into control of the page. Returns false when none could take
 * over, which is the one case where reloading must not happen: the page would be
 * served by the very same stale worker and land right back here.
 */
async function prepareWorker(): Promise<boolean> {
  const registration = await getRegistration()
  // Nothing controls the page: the reload goes to the network, no cache can lie.
  if (!registration || !navigator.serviceWorker.controller) return true
  if (controllerTakenOver.value) return true

  updatePhase.value = registration.waiting ? 'applying' : 'downloading'

  // Always revalidate, even when a worker is already waiting: it may be left
  // over from an earlier deployment. Letting that one take over would strand us
  // on an intermediate version, permanently out of sync with version.json — and
  // therefore reloading on every navigation.
  try {
    await registration.update()
  } catch {
    // Unreachable worker script: a worker may still be waiting from before.
  }

  const installed = waitForInstalled(registration)
  // Keep watching past our own ceiling. A worker that lands after we gave up sits
  // in `waiting` forever unless asked to skip, so nothing else would ever tell us
  // the new bundle is downloaded and the next navigation can apply it for free.
  void installed.then((worker) => {
    if (worker) updateReady.value = true
  })

  const budget = updateForced.value ? FORCED_DOWNLOAD_MAX_MS : BACKGROUND_DOWNLOAD_MAX_MS
  const waiting = registration.waiting ?? (await withTimeout(installed, budget, null))
  if (!waiting) return false

  updateReady.value = true
  updatePhase.value = 'applying'
  const controllerChanged = waitForControllerChange()
  waiting.postMessage({ type: 'SKIP_WAITING' })
  // Reload even if the worker never acknowledged: the assets did change and a
  // round-trip is the best shot left. The loop breaker caps how often that repeats.
  await withTimeout(controllerChanged, HANDOVER_TIMEOUT_MS, undefined)
  return true
}

/**
 * Whether the update detected during the splash should be applied before the app
 * shows. A mandatory one always is. A routine one only when applying it costs a
 * single reload: its bundle is already downloaded, or no worker controls the page
 * and the reload goes straight to the network. Otherwise the user would sit in front
 * of a progress bar for a release they did not have to take — it downloads in the
 * background instead and lands at a navigation, like any routine update.
 */
export async function shouldApplyAtBoot(): Promise<boolean> {
  if (!updatePending.value) return false
  if (updateForced.value) return true
  if (updateReady.value || controllerTakenOver.value) return true
  if (!hasServiceWorker() || !navigator.serviceWorker.controller) return true
  // Read directly: the watcher that sets `updateReady` for a worker already waiting
  // is attached by the prefetch checkVersion just started, and has not run yet.
  const registration = await getRegistration()
  return Boolean(registration?.waiting)
}

function stopApplying(): void {
  isApplying.value = false
  updatePhase.value = 'idle'
}

/**
 * Applies the update then reloads, onto `targetUrl` when provided.
 * Returns true when a reload was triggered — the caller must then stop, the page
 * is on its way out. Returns false when the app has to stay on the current
 * version: no worker took over, or the user chose to keep browsing.
 */
export async function applyUpdate(targetUrl?: string): Promise<boolean> {
  if (isApplying.value) return false
  // Deferred and still not downloaded: blocking the user again on a download they
  // explicitly skipped would undo their choice.
  if (deferred.value && !updateReady.value) return false

  const deferredAtEntry = deferred.value
  isApplying.value = true
  updatePhase.value = 'applying'

  const target = new URL(targetUrl ?? window.location.href, window.location.origin).href
  const startedAt = Date.now()

  const ready = await prepareWorker()
  if (!ready) {
    // The download never landed. Let the app live on the current version rather
    // than reload into the same stale bundle over and over.
    // This doubles as the escape hatch of a forced update: `dismissUpdate` is inert
    // there, so `deferred` can only be set here, by a download that genuinely failed.
    // Being offline must leave a usable app, not a bricked one — and the guard at the
    // top of this function then stops us retrying on every navigation.
    deferred.value = true
    stopApplying()
    return false
  }

  controllerTakenOver.value = true
  updateReady.value = true

  if (deferred.value && !deferredAtEntry) {
    // The user hit "continue" while we were downloading: the new worker is in
    // place, but yanking the page from under them now would be worse than waiting
    // for their next navigation.
    stopApplying()
    return false
  }

  // The floor keeps the overlay from just flashing by on the fast path.
  await delay(Math.max(0, UPDATE_OVERLAY_MIN_MS - (Date.now() - startedAt)))

  recordReloadAttempt(pendingVersion ?? 'unknown')
  // Everything still in flight is about to be cut off. Say so, or each aborted
  // request reports itself as a failure the user can neither act on nor read.
  markLeaving()
  if (target === window.location.href) window.location.reload()
  else window.location.href = target
  return true
}

/**
 * Drops the blocking overlay: the app stays usable on the current version and the
 * update lands at the next navigation, once the new worker is ready.
 */
export function dismissUpdate(): void {
  // No opt-out of a mandatory update. The only way out stays a download that truly
  // failed, which `applyUpdate` handles below.
  if (updateForced.value) return
  deferred.value = true
}

/**
 * Holds off applying an update until the lock is released. Meant for forms split
 * across several routes, where navigating does not mean the input is abandoned.
 * Returns the release function.
 */
export function blockUpdates(): () => void {
  blockers += 1
  let released = false
  return () => {
    if (released) return
    released = true
    blockers -= 1
  }
}

export function updatesBlocked(): boolean {
  return blockers > 0
}

/** True when the user (or a failed download) told us to stop blocking the UI. */
export function isUpdateDeferred(): boolean {
  return deferred.value
}

/** True when the new bundle is downloaded: applying costs a reload, nothing more. */
export function isUpdateReady(): boolean {
  return updateReady.value
}

/** True when the pending update is mandatory: no dismissal, no waiting for later. */
export function isUpdateForcedPending(): boolean {
  return updateForced.value
}

export function usePWAUpdate() {
  return {
    updatePending: readonly(updatePending),
    updateForced: readonly(updateForced),
    confirmedVersion: readonly(confirmedVersion),
    isApplying: readonly(isApplying),
    updatePhase: readonly(updatePhase),
    downloadProgress: readonly(downloadProgress),
    downloadDone: readonly(downloadDone),
    downloadTotal: readonly(downloadTotal),
    overlayVisible,
    checkVersion,
    checkVersionThrottled,
    announceUpdate,
    applyUpdate,
    shouldApplyAtBoot,
    dismissUpdate,
    blockUpdates,
    updatesBlocked,
  }
}
