import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

const update = vi.hoisted(() => ({
  applyUpdate: vi.fn(),
  checkVersionThrottled: vi.fn(),
  isUpdateDeferred: vi.fn(() => false),
  isUpdateForcedPending: vi.fn(() => false),
  isUpdatePending: vi.fn(() => false),
  isUpdateReady: vi.fn(() => false),
  updatesBlocked: vi.fn(() => false),
}))
vi.mock('@/composables/pwa/pwa.update', () => update)

const stale = vi.hoisted(() => ({
  isStaleChunkError: vi.fn(() => false),
  recoverFromStaleChunk: vi.fn(),
}))
vi.mock('@/composables/pwa/stale-chunk', () => stale)

// Navigating would resolve the lazy views, so the guards the module registers are captured as
// they are added and called directly: these tests stay on the guards' own logic.
const captured = vi.hoisted(() => ({
  beforeEach: [] as ((to: unknown) => unknown)[],
  onError: [] as ((error: unknown, to: { fullPath: string }) => void)[],
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    createRouter: (options: Parameters<typeof actual.createRouter>[0]) => {
      const router = actual.createRouter(options)
      const { beforeEach, onError } = router
      router.beforeEach = ((fn) => (captured.beforeEach.push(fn), beforeEach(fn))) as typeof beforeEach
      router.onError = ((fn) => (captured.onError.push(fn), onError(fn))) as typeof onError
      return router
    },
  }
})

vi.mock('../guards', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireSettingsAccess: vi.fn(),
  redirectIfAuthenticated: vi.fn(),
}))

const { default: router } = await import('../index')
const { adminRoute } = await import('../admin-routes')

const guard = captured.beforeEach

function named(routes: RouteRecordRaw[]): RouteRecordRaw[] {
  return routes.flatMap((route) => [route, ...named(route.children ?? [])])
}

const allRoutes = () => named(router.getRoutes() as unknown as RouteRecordRaw[])
const to = (name: string, fullPath = '/x') => ({ name, fullPath }) as RouteLocationNormalized

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  setOnline(true)
  update.isUpdatePending.mockReturnValue(false)
  update.isUpdateForcedPending.mockReturnValue(false)
  update.isUpdateReady.mockReturnValue(false)
  update.isUpdateDeferred.mockReturnValue(false)
  update.updatesBlocked.mockReturnValue(false)
})

describe('route table', () => {
  it('gives every route name once', () => {
    const names = router
      .getRoutes()
      .map((r) => r.name)
      .filter(Boolean)
    expect(new Set(names).size).toBe(names.length)
  })

  it('points every breadcrumb parent at an existing route', () => {
    const names = new Set(router.getRoutes().map((r) => r.name))
    const orphans = router
      .getRoutes()
      .filter((r) => r.meta.parent && !names.has(r.meta.parent))
      .map((r) => `${String(r.name)} -> ${r.meta.parent}`)
    expect(orphans).toEqual([])
  })

  it('mounts the admin section behind the admin layout and its guard', () => {
    expect(adminRoute.path).toBe('/admin')
    expect(adminRoute.beforeEnter).toBeDefined()
    expect(adminRoute.meta?.requiresAuth).toBe(true)
    expect(adminRoute.children?.length).toBeGreaterThan(0)
    expect(router.hasRoute('admin-tournaments')).toBe(true)
  })

  it('declares only lazily imported views', () => {
    const eager = allRoutes().filter(
      (r) => r.component && typeof r.component !== 'function',
    )
    expect(eager).toEqual([])
  })

  it('resolves the admin children under /admin', () => {
    expect(router.resolve({ name: 'admin-tournament-edit', params: { id: '1' } }).path).toBe(
      '/admin/tournaments/1/edit',
    )
  })
})

describe('global guard', () => {
  it('registers a global guard', () => {
    expect(guard).toHaveLength(1)
  })

  it('sends an offline user to the offline screen, remembering where they were going', () => {
    setOnline(false)
    expect(guard[0](to('home', '/tournaments/1'))).toEqual({
      name: 'offline',
      query: { redirect: '/tournaments/1' },
    })
  })

  it('never redirects the offline screen onto itself', () => {
    setOnline(false)
    expect(guard[0](to('offline'))).toBe(true)
  })

  it('checks for a new version on a plain navigation', () => {
    expect(guard[0](to('home'))).toBeUndefined()
    expect(update.checkVersionThrottled).toHaveBeenCalledTimes(1)
    expect(update.applyUpdate).not.toHaveBeenCalled()
  })

  it('applies a routine update onto the destination once it is ready', () => {
    update.isUpdatePending.mockReturnValue(true)
    update.isUpdateReady.mockReturnValue(true)

    expect(guard[0](to('home', '/tournaments/2'))).toBe(false)
    expect(update.applyUpdate).toHaveBeenCalledWith('/tournaments/2')
  })

  it('lets a routine update wait while its bundle is still downloading', () => {
    update.isUpdatePending.mockReturnValue(true)

    expect(guard[0](to('home'))).toBeUndefined()
    expect(update.applyUpdate).not.toHaveBeenCalled()
    expect(update.checkVersionThrottled).toHaveBeenCalled()
  })

  it('interrupts for a mandatory update even before the bundle is ready', () => {
    update.isUpdatePending.mockReturnValue(true)
    update.isUpdateForcedPending.mockReturnValue(true)

    expect(guard[0](to('home', '/p'))).toBe(false)
    expect(update.applyUpdate).toHaveBeenCalledWith('/p')
  })

  it('respects a deferred mandatory update and a blocked updater', () => {
    update.isUpdatePending.mockReturnValue(true)
    update.isUpdateForcedPending.mockReturnValue(true)
    update.isUpdateDeferred.mockReturnValue(true)
    expect(guard[0](to('home'))).toBeUndefined()

    update.isUpdateDeferred.mockReturnValue(false)
    update.updatesBlocked.mockReturnValue(true)
    expect(guard[0](to('home'))).toBeUndefined()

    expect(update.applyUpdate).not.toHaveBeenCalled()
  })
})

describe('router.onError', () => {
  const failing = { fullPath: '/tournaments/3' }

  it('reloads onto the destination after a stale chunk', () => {
    stale.isStaleChunkError.mockReturnValue(true)
    const error = new Error('chunk')

    captured.onError[0](error, failing)

    expect(stale.recoverFromStaleChunk).toHaveBeenCalledWith('/tournaments/3')
  })

  it('leaves any other navigation error alone', () => {
    stale.isStaleChunkError.mockReturnValue(false)

    captured.onError[0](new Error('other'), failing)

    expect(stale.recoverFromStaleChunk).not.toHaveBeenCalled()
  })
})
