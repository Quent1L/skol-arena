import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Module-level state: every test re-imports useAuth to start from a blank session. */

const authClient = {
  getSession: vi.fn(),
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  listAccounts: vi.fn(),
}
const me = vi.fn()

vi.mock('@/lib/auth-client', () => ({ authClient }))
vi.mock('@/composables/user/user.api', () => ({ userApi: { me: (...a: unknown[]) => me(...a) } }))
vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key, te: () => false } },
}))

async function loadUseAuth() {
  vi.resetModules()
  const mod = await import('@/composables/useAuth')
  return mod.useAuth()
}

const SESSION = { data: { user: { id: 'u1', email: 'a@b.c' }, session: { token: 'tok' } } }
const PLAYER = { id: 'u1', email: 'a@b.c', role: 'player', avatarVersion: null }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  authClient.getSession.mockResolvedValue(SESSION)
  me.mockResolvedValue(PLAYER)
})

describe('useAuth — derived state', () => {
  it('is empty before anything is loaded', async () => {
    const auth = await loadUseAuth()
    expect(auth.currentUser.value).toBeNull()
    expect(auth.token.value).toBeNull()
    expect(auth.userRole.value).toBe('player')
    expect(auth.isAdmin.value).toBe(false)
    expect(auth.isSuperAdmin.value).toBe(false)
  })

  it.each([
    ['super_admin', true, true],
    ['tournament_admin', true, false],
    ['player', false, false],
  ])('derives admin flags for %s', async (role, admin, superAdmin) => {
    me.mockResolvedValue({ ...PLAYER, role })
    const auth = await loadUseAuth()
    await auth.initialize()
    expect(auth.userRole.value).toBe(role)
    expect(auth.isAdmin.value).toBe(admin)
    expect(auth.isSuperAdmin.value).toBe(superAdmin)
    expect(auth.token.value).toBe('tok')
    expect(auth.appUser.value?.id).toBe('u1')
  })
})

describe('useAuth — login', () => {
  const credentials = { email: 'a@b.c', password: 'pw' }

  it('signs in, refreshes the session and loads the profile', async () => {
    authClient.signIn.email.mockResolvedValue({ data: {} })
    localStorage.setItem('kiosk_settings_locked', 'true')
    const auth = await loadUseAuth()

    await auth.login(credentials)

    expect(authClient.signIn.email).toHaveBeenCalledWith(credentials)
    expect(auth.isAuthenticated.value).toBe(true)
    expect(auth.kioskSettingsLocked.value).toBe(false)
    expect(localStorage.getItem('kiosk_settings_locked')).toBeNull()
    expect(auth.loading.value).toBe(false)
  })

  it('surfaces a refused sign-in', async () => {
    authClient.signIn.email.mockResolvedValue({ error: { message: 'Bad credentials' } })
    const auth = await loadUseAuth()

    await expect(auth.login(credentials)).rejects.toThrow('Bad credentials')

    expect(auth.error.value).toBe('Bad credentials')
    expect(auth.isAuthenticated.value).toBe(false)
    expect(auth.loading.value).toBe(false)
  })

  it('keeps a thrown non-Error as a generic message', async () => {
    authClient.signIn.email.mockRejectedValue('boom')
    const auth = await loadUseAuth()

    await expect(auth.login(credentials)).rejects.toBe('boom')
    expect(auth.error.value).toBe('auth.errors.loginGeneric')
  })
})

describe('useAuth — register', () => {
  it('uses the email local part when no name is given', async () => {
    authClient.signUp.email.mockResolvedValue({ data: {} })
    const auth = await loadUseAuth()

    await auth.register({ email: 'jane@x.io', password: 'pw', passwordConfirm: 'pw' })

    expect(authClient.signUp.email).toHaveBeenCalledWith({
      email: 'jane@x.io',
      password: 'pw',
      name: 'jane',
    })
    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('signs in even when the session was already loaded as logged out', async () => {
    authClient.getSession.mockResolvedValueOnce({ data: null, error: { status: 401 } })
    authClient.signUp.email.mockResolvedValue({ data: {} })
    const auth = await loadUseAuth()
    await auth.initialize()
    expect(auth.isAuthenticated.value).toBe(false)

    await auth.register({ email: 'jane@x.io', password: 'pw', passwordConfirm: 'pw' })

    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('passes the given name through', async () => {
    authClient.signUp.email.mockResolvedValue({ data: {} })
    const auth = await loadUseAuth()

    await auth.register({ email: 'jane@x.io', name: 'Jane', password: 'pw', passwordConfirm: 'pw' })

    expect(authClient.signUp.email.mock.calls[0][0].name).toBe('Jane')
  })

  it('surfaces a refusal such as a bad invitation code', async () => {
    authClient.signUp.email.mockResolvedValue({ error: { message: 'Invitation code required' } })
    const auth = await loadUseAuth()

    await expect(
      auth.register({ email: 'a@b.c', password: 'p', passwordConfirm: 'p' }),
    ).rejects.toThrow('Invitation code required')
    expect(auth.error.value).toBe('Invitation code required')
  })

  it.each([
    [{ error: { message: 'nested' } }, 'nested'],
    [{ message: 'flat' }, 'flat'],
    [{}, 'auth.errors.registerGeneric'],
  ])('reads the message out of a non-Error rejection %#', async (rejection, expected) => {
    authClient.signUp.email.mockRejectedValue(rejection)
    const auth = await loadUseAuth()

    await expect(
      auth.register({ email: 'a@b.c', password: 'p', passwordConfirm: 'p' }),
    ).rejects.toBe(rejection)
    expect(auth.error.value).toBe(expected)
  })
})

describe('useAuth — logout', () => {
  it('clears the session', async () => {
    authClient.signOut.mockResolvedValue({})
    const auth = await loadUseAuth()
    await auth.initialize()

    await auth.logout()

    expect(auth.isAuthenticated.value).toBe(false)
    expect(auth.isInitialized.value).toBe(false)
  })

  it('asks Better Auth to bring the browser back to /login after the IdP logout', async () => {
    authClient.signOut.mockResolvedValue({})
    const auth = await loadUseAuth()

    await auth.logout()

    expect(authClient.signOut).toHaveBeenCalledWith({
      callbackURL: `${window.location.origin}/login`,
    })
  })

  it('reports a failure', async () => {
    authClient.signOut.mockRejectedValue(new Error('offline'))
    const auth = await loadUseAuth()

    await expect(auth.logout()).rejects.toThrow('offline')
    expect(auth.error.value).toBe('offline')
    expect(auth.loading.value).toBe(false)
  })
})

describe.each([
  [
    'requestPasswordReset',
    'requestPasswordReset',
    (a: Awaited<ReturnType<typeof loadUseAuth>>) => a.requestPasswordReset('a@b.c'),
  ],
  [
    'resetPassword',
    'resetPassword',
    (a: Awaited<ReturnType<typeof loadUseAuth>>) => a.resetPassword('tok', 'new'),
  ],
  [
    'changePassword',
    'changePassword',
    (a: Awaited<ReturnType<typeof loadUseAuth>>) => a.changePassword('old', 'new'),
  ],
] as const)('useAuth — %s', (_name, method, run) => {
  it('resolves with the client result', async () => {
    authClient[method].mockResolvedValue({ data: { status: true } })
    const auth = await loadUseAuth()

    await expect(run(auth)).resolves.toEqual({ data: { status: true } })
    expect(auth.loading.value).toBe(false)
  })

  it('throws the translated server error', async () => {
    authClient[method].mockResolvedValue({ error: { message: 'Denied' } })
    const auth = await loadUseAuth()

    await expect(run(auth)).rejects.toThrow('Denied')
    expect(auth.error.value).toBe('Denied')
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    authClient[method].mockRejectedValue('x')
    const auth = await loadUseAuth()

    await expect(run(auth)).rejects.toBe('x')
    expect(auth.error.value).toContain('Generic')
  })
})

describe('useAuth — password reset request', () => {
  it('sends the reset link back to this app', async () => {
    authClient.requestPasswordReset.mockResolvedValue({ data: {} })
    const auth = await loadUseAuth()
    await auth.requestPasswordReset('a@b.c')
    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
      email: 'a@b.c',
      redirectTo: `${window.location.origin}/reset-password`,
    })
  })
})

describe('useAuth — changePassword', () => {
  it('keeps the other sessions alive', async () => {
    authClient.changePassword.mockResolvedValue({ data: {} })
    const auth = await loadUseAuth()
    await auth.changePassword('old', 'new')
    expect(authClient.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old',
      newPassword: 'new',
      revokeOtherSessions: false,
    })
  })
})

describe('useAuth — listAuthProviders', () => {
  it('lists the provider of each linked account', async () => {
    authClient.listAccounts.mockResolvedValue({
      data: [{ providerId: 'credential' }, { providerId: 'keycloak' }],
    })
    const auth = await loadUseAuth()
    expect(await auth.listAuthProviders()).toEqual(['credential', 'keycloak'])
  })

  it('tolerates an empty answer', async () => {
    authClient.listAccounts.mockResolvedValue({ data: null })
    const auth = await loadUseAuth()
    expect(await auth.listAuthProviders()).toEqual([])
  })

  it('throws when the lookup is refused', async () => {
    authClient.listAccounts.mockResolvedValue({ error: { message: 'no session' } })
    const auth = await loadUseAuth()
    await expect(auth.listAuthProviders()).rejects.toThrow('no session')
  })
})

describe('useAuth — kiosk lock', () => {
  it('persists the lock', async () => {
    const auth = await loadUseAuth()
    auth.lockKioskSettings()
    expect(auth.kioskSettingsLocked.value).toBe(true)
    expect(localStorage.getItem('kiosk_settings_locked')).toBe('true')
  })

  it('restores a persisted lock on load', async () => {
    localStorage.setItem('kiosk_settings_locked', 'true')
    const auth = await loadUseAuth()
    expect(auth.kioskSettingsLocked.value).toBe(true)
  })
})
