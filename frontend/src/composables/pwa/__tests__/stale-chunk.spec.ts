import { describe, it, expect, beforeEach, vi } from 'vitest'

const checkVersion = vi.fn<() => Promise<boolean>>()
const applyUpdate = vi.fn<(target?: string) => Promise<boolean>>()
const reloadServesLatest = vi.fn<() => boolean>()
const showError = vi.fn()
vi.mock('../pwa.update', () => ({ checkVersion, applyUpdate, reloadServesLatest }))
vi.mock('@/composables/useErrorService', () => ({ errorService: { showError } }))
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))

const ORIGIN = 'http://localhost:3000'

function stubLocation(path = '/') {
  const location = { href: `${ORIGIN}${path}`, origin: ORIGIN, reload: vi.fn() }
  Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
  return location
}

function stubOnline(onLine: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: onLine, configurable: true })
}

async function load() {
  return import('../stale-chunk')
}

describe('stale-chunk', () => {
  beforeEach(() => {
    vi.resetModules()
    checkVersion.mockReset().mockResolvedValue(false)
    applyUpdate.mockReset().mockResolvedValue(true)
    reloadServesLatest.mockReset().mockReturnValue(true)
    showError.mockReset()
    sessionStorage.clear()
    stubOnline(true)
  })

  it('recognises the stale chunk messages of every engine', async () => {
    const { isStaleChunkError } = await load()
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(
      true,
    )
    expect(isStaleChunkError('error loading dynamically imported module: x')).toBe(true)
    expect(isStaleChunkError('Importing a module script failed.')).toBe(true)
    expect(isStaleChunkError(new Error('Network Error'))).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })

  it('applies the new version onto the destination when one is served', async () => {
    const location = stubLocation('/')
    checkVersion.mockResolvedValue(true)
    const { recoverFromStaleChunk } = await load()

    await recoverFromStaleChunk('/admin/users')

    expect(applyUpdate).toHaveBeenCalledWith(`${ORIGIN}/admin/users`)
    expect(location.reload).not.toHaveBeenCalled()
    expect(location.href).toBe(`${ORIGIN}/`)
  })

  it('falls back to a plain navigation when no update is pending', async () => {
    const location = stubLocation('/')
    const { recoverFromStaleChunk } = await load()

    await recoverFromStaleChunk('/admin/users')

    expect(applyUpdate).not.toHaveBeenCalled()
    expect(location.href).toBe(`${ORIGIN}/admin/users`)
  })

  it('reloads the current page when no destination is given', async () => {
    const location = stubLocation('/admin')
    const { recoverFromStaleChunk } = await load()

    await recoverFromStaleChunk()

    expect(location.reload).toHaveBeenCalledOnce()
  })

  it('lets the router, which knows the destination, win over the preload event', async () => {
    const location = stubLocation('/')
    const { recoverFromStaleChunk } = await load()

    // Vite dispatches `vite:preloadError` before the rejection reaches the router.
    const fromPreloadEvent = recoverFromStaleChunk()
    const fromRouter = recoverFromStaleChunk('/admin/users')
    await Promise.all([fromPreloadEvent, fromRouter])

    expect(checkVersion).toHaveBeenCalledOnce()
    expect(location.reload).not.toHaveBeenCalled()
    expect(location.href).toBe(`${ORIGIN}/admin/users`)
  })

  it('reloads once the new worker controls the page, even if the update was not applied', async () => {
    const location = stubLocation('/admin')
    checkVersion.mockResolvedValue(true)
    applyUpdate.mockResolvedValue(false)
    const { recoverFromStaleChunk } = await load()

    await recoverFromStaleChunk()

    expect(location.reload).toHaveBeenCalledOnce()
    expect(showError).not.toHaveBeenCalled()
  })

  it('explains instead of reloading onto the stale shell the old worker would serve', async () => {
    const location = stubLocation('/')
    checkVersion.mockResolvedValue(true)
    applyUpdate.mockResolvedValue(false)
    reloadServesLatest.mockReturnValue(false)
    const { recoverFromStaleChunk } = await load()

    await recoverFromStaleChunk('/admin/users')

    expect(location.reload).not.toHaveBeenCalled()
    expect(location.href).toBe(`${ORIGIN}/`)
    expect(showError).toHaveBeenCalledWith('errorService.updateRequired')

    // Nothing is left locked: the next failure tries again.
    await recoverFromStaleChunk('/admin/users')
    expect(checkVersion).toHaveBeenCalledTimes(2)
  })

  it('does not reload twice in a row onto the same page', async () => {
    const location = stubLocation('/admin')
    await (await load()).recoverFromStaleChunk()
    vi.resetModules()
    await (await load()).recoverFromStaleChunk()

    expect(location.reload).toHaveBeenCalledOnce()
  })

  it('does nothing offline', async () => {
    const location = stubLocation('/admin')
    stubOnline(false)
    const { recoverFromStaleChunk } = await load()

    await recoverFromStaleChunk()

    expect(checkVersion).not.toHaveBeenCalled()
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('handles the several handlers one failure triggers only once', async () => {
    const location = stubLocation('/admin')
    const { recoverFromStaleChunk } = await load()

    await Promise.all([recoverFromStaleChunk(), recoverFromStaleChunk()])

    expect(checkVersion).toHaveBeenCalledOnce()
    expect(location.reload).toHaveBeenCalledOnce()
  })
})
