import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NETWORK_ERROR } from '@/utils/HttpErrors'

/**
 * useAuth keeps its state at module level: each test re-imports the module to start
 * from an "unknown" session (sessionData === undefined).
 */

const getSession = vi.fn()
const me = vi.fn()

vi.mock('@/lib/auth-client', () => ({
  authClient: { getSession: (...args: unknown[]) => getSession(...args) },
}))

vi.mock('@/composables/user/user.api', () => ({
  userApi: { me: (...args: unknown[]) => me(...args) },
}))

vi.mock('@/composables/config/config.service', () => ({
  useConfigService: () => ({ config: { value: null } }),
}))

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key } },
}))

async function loadUseAuth() {
  vi.resetModules()
  const mod = await import('@/composables/useAuth')
  return mod.useAuth()
}

const SESSION_OK = { data: { user: { id: 'u1', email: 'a@b.c' }, session: { token: 't' } } }
const APP_USER = { id: 'u1', email: 'a@b.c', role: 'player' }

beforeEach(() => {
  getSession.mockReset()
  me.mockReset()
  localStorage.clear()
})

describe('useAuth — transient failures', () => {
  it('leaves the session in an unknown state when the backend is unreachable', async () => {
    getSession.mockRejectedValue(new Error('Failed to fetch'))
    const auth = await loadUseAuth()

    await expect(auth.initialize()).rejects.toMatchObject({ cause: NETWORK_ERROR })

    // The crux of the bug: the state must NOT be pinned to "logged out".
    expect(auth.isInitialized.value).toBe(false)
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('retries once before giving up, then succeeds', async () => {
    getSession.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(SESSION_OK)
    me.mockResolvedValue(APP_USER)
    const auth = await loadUseAuth()

    await auth.initialize()

    expect(getSession).toHaveBeenCalledTimes(2)
    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('treats a 5xx as transient, not as a logout', async () => {
    getSession.mockResolvedValue({ error: { status: 503, message: 'Bad Gateway' } })
    const auth = await loadUseAuth()

    await expect(auth.initialize()).rejects.toMatchObject({ cause: NETWORK_ERROR })
    expect(auth.isInitialized.value).toBe(false)
  })

  it('allows a new attempt after a network failure, without a reload', async () => {
    getSession.mockRejectedValue(new Error('Failed to fetch'))
    const auth = await loadUseAuth()
    await expect(auth.initialize()).rejects.toThrow()

    // The backend comes back: the next navigation must really redo the call.
    getSession.mockReset()
    getSession.mockResolvedValue(SESSION_OK)
    me.mockResolvedValue(APP_USER)

    await auth.initialize()

    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('does not log out when /users/me fails transiently', async () => {
    getSession.mockResolvedValue(SESSION_OK)
    me.mockRejectedValue(new Error('boom', { cause: NETWORK_ERROR }))
    const auth = await loadUseAuth()

    await expect(auth.initialize()).rejects.toMatchObject({ cause: NETWORK_ERROR })
    expect(auth.isInitialized.value).toBe(false)
  })
})

describe('useAuth — real authentication errors', () => {
  it('writes the logged-out state on a 401, with no retry', async () => {
    getSession.mockResolvedValue({ error: { status: 401, message: 'Unauthorized' } })
    const auth = await loadUseAuth()

    await auth.initialize()

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(auth.isInitialized.value).toBe(true)
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('logs out if /users/me returns a 401', async () => {
    getSession.mockResolvedValue(SESSION_OK)
    me.mockRejectedValue(new Error('Unauthorized'))
    const auth = await loadUseAuth()

    await auth.initialize()

    expect(auth.isInitialized.value).toBe(true)
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('propagates INVITATION_CODE_REQUIRED to the guard', async () => {
    getSession.mockResolvedValue(SESSION_OK)
    me.mockRejectedValue(new Error('code required', { cause: 'INVITATION_CODE_REQUIRED' }))
    const auth = await loadUseAuth()

    await expect(auth.initialize()).rejects.toMatchObject({
      cause: 'INVITATION_CODE_REQUIRED',
    })
  })
})

describe('useAuth — concurrent calls', () => {
  it('triggers only one network call for two simultaneous initialize()', async () => {
    getSession.mockResolvedValue(SESSION_OK)
    me.mockResolvedValue(APP_USER)
    const auth = await loadUseAuth()

    await Promise.all([auth.initialize(), auth.initialize()])

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(me).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('does not let a concurrent guard conclude "not authenticated"', async () => {
    getSession.mockResolvedValue(SESSION_OK)
    me.mockResolvedValue(APP_USER)
    const auth = await loadUseAuth()

    const first = auth.initialize()
    const second = auth.initialize()
    await Promise.all([first, second])

    // Before the fix the second call returned immediately with
    // sessionData === undefined and the guard redirected to /login.
    expect(auth.isAuthenticated.value).toBe(true)
  })
})
