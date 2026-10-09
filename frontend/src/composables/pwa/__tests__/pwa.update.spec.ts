import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type UpdateModule = typeof import('../pwa.update')

const ORIGIN = 'http://localhost:3000'

function stubLocation() {
  const location = { href: `${ORIGIN}/`, origin: ORIGIN, reload: vi.fn() }
  Object.defineProperty(window, 'location', {
    value: location,
    writable: true,
    configurable: true,
  })
  return location
}

function stubFetch(
  response: { ok?: boolean; version?: string; minVersion?: string | null } | Error,
) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    return {
      ok: response.ok ?? true,
      json: async () => ({ version: response.version, minVersion: response.minVersion ?? null }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** A floor no released version will ever reach: whatever runs is below it. */
const FORCING_MIN_VERSION = '99.0.0'

/** Service worker still downloading its precache: it never reaches `installed` on its own. */
function createInstallingWorker() {
  const target = new EventTarget()
  return {
    state: 'installing' as ServiceWorkerState,
    postMessage: vi.fn(),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    transitionTo(state: ServiceWorkerState) {
      this.state = state
      target.dispatchEvent(new Event('statechange'))
    },
  }
}

type InstallingWorker = ReturnType<typeof createInstallingWorker>

/** Waiting service worker whose postMessage triggers `controllerchange`. */
function stubServiceWorker(
  options: {
    waiting?: boolean
    cooperative?: boolean
    controlled?: boolean
    installing?: InstallingWorker
  } = {},
) {
  const container = new EventTarget()
  const registrationEvents = new EventTarget()
  const postMessage = vi.fn(() => {
    if (options.cooperative !== false) container.dispatchEvent(new Event('controllerchange'))
  })
  const registration = {
    waiting: options.waiting === false ? null : { postMessage },
    installing: options.installing ?? null,
    update: vi.fn(async () => {}),
    addEventListener: registrationEvents.addEventListener.bind(registrationEvents),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      // Truthy unless stated otherwise: a page under an active worker is the case
      // that can be served a stale bundle, and the one all of this guards against.
      controller: options.controlled === false ? null : {},
      addEventListener: container.addEventListener.bind(container),
      removeEventListener: container.removeEventListener.bind(container),
      getRegistration: async () => registration,
    },
    writable: true,
    configurable: true,
  })
  return { registration, postMessage, container }
}

/** Brings an installing worker to `installed`, which is when it becomes the waiting one. */
function finishInstall(
  stub: ReturnType<typeof stubServiceWorker>,
  worker: InstallingWorker,
): ReturnType<typeof vi.fn> {
  const postMessage = vi.fn(() => stub.container.dispatchEvent(new Event('controllerchange')))
  stub.registration.waiting = { postMessage }
  worker.transitionTo('installed')
  return postMessage
}

/** State is module-level: reloading the module isolates each test. */
async function loadModule(): Promise<UpdateModule> {
  vi.resetModules()
  return import('../pwa.update')
}

describe('pwa.update', () => {
  beforeEach(() => {
    stubLocation()
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    sessionStorage.clear()
    localStorage.clear()
  })

  describe('post-update confirmation', () => {
    it("says nothing on the very first launch", async () => {
      const { consumeUpdateConfirmation } = await loadModule()

      expect(consumeUpdateConfirmation()).toBeNull()
      expect(localStorage.getItem('skol.lastVersion')).toBe(__APP_VERSION__)
    })

    it('says nothing when the version hasn’t changed', async () => {
      localStorage.setItem('skol.lastVersion', __APP_VERSION__)
      const { consumeUpdateConfirmation } = await loadModule()

      expect(consumeUpdateConfirmation()).toBeNull()
    })

    it('announces the new version after a change', async () => {
      localStorage.setItem('skol.lastVersion', '0.0.1')
      const { consumeUpdateConfirmation } = await loadModule()

      expect(consumeUpdateConfirmation()).toBe(__APP_VERSION__)
      expect(localStorage.getItem('skol.lastVersion')).toBe(__APP_VERSION__)
    })

    it('does not repeat on the next launch', async () => {
      localStorage.setItem('skol.lastVersion', '0.0.1')
      const { consumeUpdateConfirmation } = await loadModule()

      expect(consumeUpdateConfirmation()).toBe(__APP_VERSION__)
      expect(consumeUpdateConfirmation()).toBeNull()
    })

    it('also announces a mandatory update', async () => {
      // The blocking screen on the way in says a version is *required*, not that it is
      // installed, and it may last only the 1.5s floor: without this, the page would have
      // reloaded out from under the user without explanation.
      localStorage.setItem('skol.lastVersion', '0.0.1')
      stubFetch({ version: __APP_VERSION__, minVersion: __APP_VERSION__ })
      const { checkVersion, consumeUpdateConfirmation } = await loadModule()
      await checkVersion()

      expect(consumeUpdateConfirmation()).toBe(__APP_VERSION__)
    })

    it("holds the screen long enough to read it, then hands back control", async () => {
      localStorage.setItem('skol.lastVersion', '0.0.1')
      vi.useFakeTimers()
      const { announceUpdate, usePWAUpdate } = await loadModule()
      const { confirmedVersion, updatePhase, overlayVisible } = usePWAUpdate()

      const announced = announceUpdate()
      await vi.advanceTimersByTimeAsync(0)
      expect(confirmedVersion.value).toBe(__APP_VERSION__)
      expect(updatePhase.value).toBe('done')
      expect(overlayVisible.value).toBe(true)

      await vi.advanceTimersByTimeAsync(3500)
      await announced

      expect(confirmedVersion.value).toBeNull()
      expect(overlayVisible.value).toBe(false)
    })
  })

  describe('checkVersion', () => {
    it('reports nothing when the served version is identical', async () => {
      stubFetch({ version: __APP_VERSION__ })
      const { checkVersion, isUpdatePending } = await loadModule()

      expect(await checkVersion()).toBe(false)
      expect(isUpdatePending()).toBe(false)
    })

    it('reports an update when the version differs', async () => {
      stubFetch({ version: '99.0.0' })
      const { checkVersion, isUpdatePending } = await loadModule()

      expect(await checkVersion()).toBe(true)
      expect(isUpdatePending()).toBe(true)
    })

    it('stays silent when the fetch fails (offline)', async () => {
      stubFetch(new Error('network down'))
      const { checkVersion, isUpdatePending } = await loadModule()

      expect(await checkVersion()).toBe(false)
      expect(isUpdatePending()).toBe(false)
    })

    it('stays silent when version.json is missing (dev)', async () => {
      stubFetch({ ok: false })
      const { checkVersion, isUpdatePending } = await loadModule()

      expect(await checkVersion()).toBe(false)
      expect(isUpdatePending()).toBe(false)
    })

    it('bypasses the HTTP cache', async () => {
      const fetchMock = stubFetch({ version: __APP_VERSION__ })
      const { checkVersion } = await loadModule()
      await checkVersion()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/version.json?t='),
        expect.objectContaining({ cache: 'no-store' }),
      )
    })

    it('starts downloading the new worker as soon as it’s detected, only once', async () => {
      // Without this preload, the download would only start when applying, and
      // the user waits in front of the overlay for something they could have waited out in the background.
      const { registration } = stubServiceWorker()
      stubFetch({ version: '99.0.0' })
      const { checkVersion } = await loadModule()

      await checkVersion()
      await checkVersion()
      await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(1))
    })

    it('gives up after two unsuccessful reloads on the same version', async () => {
      sessionStorage.setItem(
        'skol.updateReloads',
        JSON.stringify({ version: '99.0.0', count: 2 }),
      )
      stubFetch({ version: '99.0.0' })
      const { checkVersion, isUpdatePending } = await loadModule()

      expect(await checkVersion()).toBe(false)
      expect(isUpdatePending()).toBe(false)
    })

    it('clears the reload counter as soon as the served version is reached', async () => {
      sessionStorage.setItem(
        'skol.updateReloads',
        JSON.stringify({ version: __APP_VERSION__, count: 2 }),
      )
      stubFetch({ version: __APP_VERSION__ })
      const { checkVersion } = await loadModule()

      await checkVersion()
      expect(sessionStorage.getItem('skol.updateReloads')).toBeNull()
    })
  })

  describe('checkVersionThrottled', () => {
    it('does not refetch within the throttle window', async () => {
      const fetchMock = stubFetch({ version: __APP_VERSION__ })
      const { checkVersionThrottled } = await loadModule()

      await checkVersionThrottled()
      await checkVersionThrottled()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('blockUpdates', () => {
    it('counts locks and ignores a double release', async () => {
      const { blockUpdates, updatesBlocked } = await loadModule()

      const releaseFirst = blockUpdates()
      const releaseSecond = blockUpdates()
      expect(updatesBlocked()).toBe(true)

      releaseFirst()
      releaseFirst()
      expect(updatesBlocked()).toBe(true)

      releaseSecond()
      expect(updatesBlocked()).toBe(false)
    })
  })

  describe('precache progress', () => {
    it('follows the worker’s messages and never goes backward', async () => {
      const { container } = stubServiceWorker()
      const { usePWAUpdate } = await loadModule()
      const { downloadProgress, downloadDone, downloadTotal } = usePWAUpdate()

      expect(downloadProgress.value).toBeNull()

      container.dispatchEvent(
        new MessageEvent('message', { data: { type: 'PRECACHE_PROGRESS', done: 30, total: 120 } }),
      )
      expect(downloadProgress.value).toBe(0.25)
      expect(downloadDone.value).toBe(30)
      expect(downloadTotal.value).toBe(120)

      // A worker that restarts its install starts over from zero: the bar itself never goes backward.
      container.dispatchEvent(
        new MessageEvent('message', { data: { type: 'PRECACHE_PROGRESS', done: 2, total: 120 } }),
      )
      expect(downloadProgress.value).toBe(0.25)
      expect(downloadDone.value).toBe(30)
    })
  })

  describe('mandatory update', () => {
    it('forces when the running version is under the served floor', async () => {
      stubFetch({ version: '99.9.9', minVersion: FORCING_MIN_VERSION })
      stubServiceWorker()
      const { checkVersion, isUpdateForcedPending } = await loadModule()

      expect(await checkVersion()).toBe(true)
      expect(isUpdateForcedPending()).toBe(true)
    })

    it('stays in the background with no floor', async () => {
      stubFetch({ version: '99.9.9' })
      stubServiceWorker()
      const { checkVersion, isUpdateForcedPending } = await loadModule()

      expect(await checkVersion()).toBe(true)
      expect(isUpdateForcedPending()).toBe(false)
    })

    it('stays in the background when the floor is already reached', async () => {
      stubFetch({ version: '99.9.9', minVersion: '0.0.1' })
      stubServiceWorker()
      const { checkVersion, isUpdateForcedPending } = await loadModule()

      await checkVersion()
      expect(isUpdateForcedPending()).toBe(false)
    })

    it('does not force a version that already failed to install', async () => {
      // The circuit breaker kicks in first: otherwise the user stays locked behind an
      // update that will never land.
      sessionStorage.setItem(
        'skol.updateReloads',
        JSON.stringify({ version: '99.9.9', count: 2 }),
      )
      stubFetch({ version: '99.9.9', minVersion: FORCING_MIN_VERSION })
      stubServiceWorker()
      const { checkVersion, isUpdateForcedPending } = await loadModule()

      expect(await checkVersion()).toBe(false)
      expect(isUpdateForcedPending()).toBe(false)
    })

    it('ignores the request to defer', async () => {
      stubFetch({ version: '99.9.9', minVersion: FORCING_MIN_VERSION })
      stubServiceWorker()
      const { checkVersion, dismissUpdate, isUpdateDeferred } = await loadModule()
      await checkVersion()

      dismissUpdate()

      expect(isUpdateDeferred()).toBe(false)
    })

    it('waits for the download well past the routine budget', async () => {
      const installing = createInstallingWorker()
      stubFetch({ version: '99.9.9', minVersion: FORCING_MIN_VERSION })
      const stub = stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      const { checkVersion, applyUpdate } = await loadModule()
      await checkVersion()
      vi.useFakeTimers()

      const applied = applyUpdate('/tournaments/42')
      let settled = false
      void applied.then(() => (settled = true))

      // Where a routine release would already have handed back control.
      await vi.advanceTimersByTimeAsync(10_000)
      expect(settled).toBe(false)

      const postMessage = finishInstall(stub, installing)
      await vi.advanceTimersByTimeAsync(1500)

      expect(await applied).toBe(true)
      expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
      expect(location.href).toBe(`${ORIGIN}/tournaments/42`)
    })

    it("releases the app when the download truly fails, without looping", async () => {
      // The only escape hatch from a mandatory update: offline, the app must
      // stay usable instead of being condemned.
      const installing = createInstallingWorker()
      stubFetch({ version: '99.9.9', minVersion: FORCING_MIN_VERSION })
      stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      const { checkVersion, applyUpdate, isUpdateDeferred } = await loadModule()
      await checkVersion()
      vi.useFakeTimers()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(120_000)

      expect(await applied).toBe(false)
      expect(isUpdateDeferred()).toBe(true)
      expect(location.reload).not.toHaveBeenCalled()

      // A subsequent navigation must not restart the same wait.
      expect(await applyUpdate('/tournaments/43')).toBe(false)
      expect(location.href).toBe(`${ORIGIN}/`)
    })
  })

  describe('routine update', () => {
    it('signals the bundle ready as soon as the background precache finishes', async () => {
      // Regression: without this signal, a routine release would only land on the
      // next cold start — the router guard never learned that the
      // worker was waiting.
      const installing = createInstallingWorker()
      stubFetch({ version: '99.9.9' })
      const stub = stubServiceWorker({ waiting: false, installing })
      const { checkVersion, isUpdateReady } = await loadModule()

      await checkVersion()
      expect(isUpdateReady()).toBe(false)

      finishInstall(stub, installing)
      await Promise.resolve()
      await Promise.resolve()

      expect(isUpdateReady()).toBe(true)
    })

    it('hands back control quickly when the bundle is slow, without canceling the download', async () => {
      const installing = createInstallingWorker()
      stubFetch({ version: '99.9.9' })
      const stub = stubServiceWorker({ waiting: false, installing })
      const { checkVersion, applyUpdate, isUpdateReady } = await loadModule()
      await checkVersion()
      vi.useFakeTimers()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(8000)

      expect(await applied).toBe(false)
      expect(isUpdateReady()).toBe(false)

      // The install keeps going in the background: the next navigation will apply with a
      // simple reload.
      finishInstall(stub, installing)
      await vi.advanceTimersByTimeAsync(0)
      expect(isUpdateReady()).toBe(true)
    })
  })

  describe('applyUpdate', () => {
    it('asks the waiting worker to take control, then reloads', async () => {
      const { postMessage } = stubServiceWorker()
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(1500)

      expect(await applied).toBe(true)
      expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
      expect(location.href).toBe(`${ORIGIN}/tournaments/42`)
    })

    it("reloads the current page when no destination is provided", async () => {
      stubServiceWorker()
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate()
      await vi.advanceTimersByTimeAsync(1500)
      await applied

      expect(location.reload).toHaveBeenCalled()
    })

    it("leaves time to read the overlay before reloading", async () => {
      stubServiceWorker()
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(1400)
      expect(location.href).toBe(`${ORIGIN}/`)

      await vi.advanceTimersByTimeAsync(100)
      await applied
      expect(location.href).toBe(`${ORIGIN}/tournaments/42`)
    })

    it('revalidates the worker before handing it control', async () => {
      // A waiting worker may be left over from an earlier deployment: activating
      // it as-is would strand the app on an intermediate version.
      const { registration, postMessage } = stubServiceWorker({ waiting: true })
      stubLocation()
      vi.useFakeTimers()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(1500)
      await applied

      expect(registration.update).toHaveBeenCalled()
      expect(registration.update.mock.invocationCallOrder[0]).toBeLessThan(
        postMessage.mock.invocationCallOrder[0],
      )
    })

    it('reloads regardless if the waiting worker never hands back control', async () => {
      stubServiceWorker({ cooperative: false })
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate('/tournaments/42')
      // Handover budget, then the display floor that runs behind it.
      await vi.advanceTimersByTimeAsync(6500)
      await applied

      expect(location.href).toBe(`${ORIGIN}/tournaments/42`)
    })

    it("never reloads while the old worker still controls the page", async () => {
      // Regression: reloading here would serve the old bundle from the precache, hence
      // a new version mismatch, hence a new overlay — the infinite loop.
      const installing = createInstallingWorker()
      stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate, usePWAUpdate } = await loadModule()
      const { updatePhase } = usePWAUpdate()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(10)
      expect(updatePhase.value).toBe('downloading')

      await vi.advanceTimersByTimeAsync(120_000)

      expect(await applied).toBe(false)
      expect(location.reload).not.toHaveBeenCalled()
      expect(location.href).toBe(`${ORIGIN}/`)
    })

    it('hands back control without blocking when the worker fails to install', async () => {
      const installing = createInstallingWorker()
      stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate('/tournaments/42')
      await Promise.resolve()
      installing.transitionTo('redundant')

      expect(await applied).toBe(false)
      expect(location.reload).not.toHaveBeenCalled()
    })

    it('applies as soon as the downloading worker is installed', async () => {
      const installing = createInstallingWorker()
      const stub = stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate } = await loadModule()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(10)
      const postMessage = finishInstall(stub, installing)
      await vi.advanceTimersByTimeAsync(1500)

      expect(await applied).toBe(true)
      expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
      expect(location.href).toBe(`${ORIGIN}/tournaments/42`)
    })

    it("exposes isApplying during the operation to drive the overlay", async () => {
      stubServiceWorker()
      stubLocation()
      vi.useFakeTimers()
      const { applyUpdate, usePWAUpdate } = await loadModule()
      const { isApplying } = usePWAUpdate()

      expect(isApplying.value).toBe(false)
      const applied = applyUpdate('/tournaments/42')
      expect(isApplying.value).toBe(true)

      await vi.advanceTimersByTimeAsync(1500)
      await applied
    })
  })

  describe('dismissUpdate', () => {
    it("hides the overlay and leaves the page in place when the download finishes", async () => {
      const installing = createInstallingWorker()
      const stub = stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate, dismissUpdate, usePWAUpdate } = await loadModule()
      const { overlayVisible } = usePWAUpdate()

      const applied = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(10)
      expect(overlayVisible.value).toBe(true)

      dismissUpdate()
      expect(overlayVisible.value).toBe(false)

      finishInstall(stub, installing)
      await vi.advanceTimersByTimeAsync(2000)

      expect(await applied).toBe(false)
      expect(location.reload).not.toHaveBeenCalled()
      expect(location.href).toBe(`${ORIGIN}/`)
    })

    it('applies on the next navigation, once the worker is ready', async () => {
      const installing = createInstallingWorker()
      const stub = stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate, dismissUpdate, isUpdateReady } = await loadModule()

      const deferredRun = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(10)
      dismissUpdate()
      finishInstall(stub, installing)
      await vi.advanceTimersByTimeAsync(2000)
      await deferredRun
      expect(isUpdateReady()).toBe(true)

      const applied = applyUpdate('/tournaments/7')
      await vi.advanceTimersByTimeAsync(1500)

      expect(await applied).toBe(true)
      expect(location.href).toBe(`${ORIGIN}/tournaments/7`)
    })

    it('no longer blocks navigation while the worker lags behind', async () => {
      const installing = createInstallingWorker()
      stubServiceWorker({ waiting: false, installing })
      stubLocation()
      vi.useFakeTimers()
      const { applyUpdate, dismissUpdate } = await loadModule()

      const deferredRun = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(10)
      dismissUpdate()
      await vi.advanceTimersByTimeAsync(120_000)
      await deferredRun

      expect(await applyUpdate('/tournaments/7')).toBe(false)
    })

    it("resumes on its own when the worker lands long after the abandonment", async () => {
      // A worker that finishes installing stays in `waiting` indefinitely: nothing
      // signals the new bundle's arrival once you've stopped watching for it.
      const installing = createInstallingWorker()
      const stub = stubServiceWorker({ waiting: false, installing })
      const location = stubLocation()
      vi.useFakeTimers()
      const { applyUpdate, dismissUpdate, isUpdateReady } = await loadModule()

      const abandoned = applyUpdate('/tournaments/42')
      await vi.advanceTimersByTimeAsync(10)
      dismissUpdate()
      await vi.advanceTimersByTimeAsync(120_000)
      await abandoned
      expect(isUpdateReady()).toBe(false)

      finishInstall(stub, installing)
      await vi.advanceTimersByTimeAsync(0)
      expect(isUpdateReady()).toBe(true)

      const applied = applyUpdate('/tournaments/7')
      await vi.advanceTimersByTimeAsync(1500)

      expect(await applied).toBe(true)
      expect(location.href).toBe(`${ORIGIN}/tournaments/7`)
    })
  })

  describe('shouldApplyAtBoot', () => {
    it('stays out of the way when no update is pending', async () => {
      stubServiceWorker()
      stubFetch({ version: __APP_VERSION__ })
      const { checkVersion, shouldApplyAtBoot } = await loadModule()
      await checkVersion()

      expect(await shouldApplyAtBoot()).toBe(false)
    })

    it('applies a mandatory update even while it is still downloading', async () => {
      stubServiceWorker({ waiting: false, installing: createInstallingWorker() })
      stubFetch({ version: '99.0.1', minVersion: FORCING_MIN_VERSION })
      const { checkVersion, shouldApplyAtBoot } = await loadModule()
      await checkVersion()

      expect(await shouldApplyAtBoot()).toBe(true)
    })

    it('leaves a routine update still downloading to the background', async () => {
      stubServiceWorker({ waiting: false, installing: createInstallingWorker() })
      stubFetch({ version: '99.0.1' })
      const { checkVersion, shouldApplyAtBoot } = await loadModule()
      await checkVersion()

      expect(await shouldApplyAtBoot()).toBe(false)
    })

    it('applies a routine update whose bundle is already waiting', async () => {
      stubServiceWorker({ waiting: true })
      stubFetch({ version: '99.0.1' })
      const { checkVersion, shouldApplyAtBoot } = await loadModule()
      await checkVersion()

      expect(await shouldApplyAtBoot()).toBe(true)
    })

    it('applies a routine update when no worker controls the page', async () => {
      stubServiceWorker({ waiting: false, controlled: false })
      stubFetch({ version: '99.0.1' })
      const { checkVersion, shouldApplyAtBoot } = await loadModule()
      await checkVersion()

      expect(await shouldApplyAtBoot()).toBe(true)
    })
  })
})
