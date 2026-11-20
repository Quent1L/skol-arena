import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { errorService } from '@/composables/useErrorService.ts'
import { makeAuthMock, type AuthMockState } from '@/test-support/mock-modules'
import { NETWORK_ERROR } from '@/utils/HttpErrors'
import {
  requireAuth,
  requireAdmin,
  requireSettingsAccess,
  redirectIfAuthenticated,
} from '../guards'

vi.mock('@/composables/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/composables/useErrorService.ts', () => ({
  errorService: { showError: vi.fn() },
}))

const to = { fullPath: '/tournaments/42' } as RouteLocationNormalized

const state: AuthMockState = { user: null, role: 'player', initialized: true }
let auth: ReturnType<typeof makeAuthMock>

function setAuth(over: Partial<AuthMockState>) {
  Object.assign(state, { user: null, role: 'player', initialized: true }, over)
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth({})
  auth = makeAuthMock(state)
  vi.mocked(useAuth).mockReturnValue(auth as unknown as ReturnType<typeof useAuth>)
  document.cookie = 'invitation_code=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  localStorage.clear()
})

describe('requireAuth', () => {
  it('lets an authenticated user through', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' } })
    expect(await requireAuth(to)).toBeUndefined()
  })

  it('initializes the session when needed', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' }, initialized: false })
    await requireAuth(to)
    expect(auth.initialize).toHaveBeenCalledOnce()
  })

  it('redirects to /login with the target in the query', async () => {
    expect(await requireAuth(to)).toEqual({
      path: '/login',
      query: { redirect: '/tournaments/42' },
    })
  })

  it('INVITATION_CODE_REQUIRED with no cookie → /submit-invitation + toast', async () => {
    setAuth({ initialized: false })
    auth.initialize.mockRejectedValue(
      new Error('invitation', { cause: 'INVITATION_CODE_REQUIRED' }),
    )
    expect(await requireAuth(to)).toBe('/submit-invitation')
    expect(errorService.showError).toHaveBeenCalledOnce()
  })

  it('INVITATION_CODE_REQUIRED with a cookie → /submit-invitation with no toast', async () => {
    document.cookie = 'invitation_code=abc; path=/'
    setAuth({ initialized: false })
    auth.initialize.mockRejectedValue(
      new Error('invitation', { cause: 'INVITATION_CODE_REQUIRED' }),
    )
    expect(await requireAuth(to)).toBe('/submit-invitation')
    expect(errorService.showError).not.toHaveBeenCalled()
  })

  it('other init error → redirects to /login', async () => {
    setAuth({ initialized: false })
    auth.initialize.mockRejectedValue(new Error('boom'))
    expect(await requireAuth(to)).toEqual({
      path: '/login',
      query: { redirect: '/tournaments/42' },
    })
  })
})

describe('requireAdmin', () => {
  it('redirects an anonymous user to /login', async () => {
    expect(await requireAdmin(to)).toEqual({
      path: '/login',
      query: { redirect: '/tournaments/42' },
    })
  })

  it('lets a super admin through', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' }, role: 'super_admin' })
    expect(await requireAdmin(to)).toBeUndefined()
  })

  it('sends a logged-in player back to home', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' }, role: 'player' })
    expect(await requireAdmin(to)).toEqual({ path: '/', replace: true })
  })

  // The application code is carried by `cause` (see ApiConfig.ts), not by `message`.
  it('INVITATION_CODE_REQUIRED → /submit-invitation', async () => {
    setAuth({ initialized: false })
    auth.initialize.mockRejectedValue(
      new Error('invitation', { cause: 'INVITATION_CODE_REQUIRED' }),
    )
    expect(await requireAdmin(to)).toBe('/submit-invitation')
  })
})

describe('requireSettingsAccess', () => {
  it('redirects an anonymous user to /login', async () => {
    expect(await requireSettingsAccess(to)).toEqual({
      path: '/login',
      query: { redirect: '/tournaments/42' },
    })
  })

  it('blocks a locked kiosk', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' }, role: 'kiosk' })
    localStorage.setItem('kiosk_settings_locked', 'true')
    expect(await requireSettingsAccess(to)).toEqual({ path: '/', replace: true })
  })

  it('lets an unlocked kiosk through', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' }, role: 'kiosk' })
    expect(await requireSettingsAccess(to)).toBeUndefined()
  })

  it('lets a player through', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' } })
    expect(await requireSettingsAccess(to)).toBeUndefined()
  })
})

describe('redirectIfAuthenticated', () => {
  it('sends a logged-in user to the redirect query', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' } })
    const login = {
      fullPath: '/login',
      query: { redirect: '/foo' },
    } as unknown as RouteLocationNormalized
    expect(await redirectIfAuthenticated(login)).toEqual({ path: '/foo', replace: true })
  })

  it('sends to / with no redirect query', async () => {
    setAuth({ user: { id: 'u1', email: 'a@b.c' } })
    const login = { fullPath: '/login', query: {} } as unknown as RouteLocationNormalized
    expect(await redirectIfAuthenticated(login)).toEqual({ path: '/', replace: true })
  })

  it('does nothing for an anonymous user', async () => {
    const login = { fullPath: '/login', query: {} } as unknown as RouteLocationNormalized
    expect(await redirectIfAuthenticated(login)).toBeUndefined()
  })

  it('swallows initialization errors', async () => {
    setAuth({ initialized: false })
    auth.initialize.mockRejectedValue(new Error('boom'))
    const login = { fullPath: '/login', query: {} } as unknown as RouteLocationNormalized
    expect(await redirectIfAuthenticated(login)).toBeUndefined()
  })
})

/**
 * Unreachable backend: no information about the session. Redirecting to /login would
 * show a false logout — that is the bug fixed here.
 */
describe('network failure → /offline, never /login', () => {
  const offline = { name: 'offline', query: { redirect: '/tournaments/42' } }

  function failWithNetworkError() {
    setAuth({ initialized: false })
    auth.initialize.mockRejectedValue(new Error('unreachable', { cause: NETWORK_ERROR }))
  }

  it('requireAuth', async () => {
    failWithNetworkError()
    expect(await requireAuth(to)).toEqual(offline)
  })

  it('requireAdmin', async () => {
    failWithNetworkError()
    expect(await requireAdmin(to)).toEqual(offline)
  })

  it('requireSettingsAccess', async () => {
    failWithNetworkError()
    expect(await requireSettingsAccess(to)).toEqual(offline)
  })

  it('redirectIfAuthenticated', async () => {
    failWithNetworkError()
    const login = { fullPath: '/login', query: {} } as unknown as RouteLocationNormalized
    expect(await redirectIfAuthenticated(login)).toEqual({
      name: 'offline',
      query: { redirect: '/login' },
    })
  })
})
