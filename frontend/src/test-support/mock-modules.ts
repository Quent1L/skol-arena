import { vi } from 'vitest'
import { ref, computed } from 'vue'

/**
 * Module factories for vi.mock callbacks. vi.mock is hoisted, so specs use:
 *   vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
 */

export function apiConfigMock() {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  }
}

/**
 * vue-i18n mock where t echoes the key, appending #count for pluralized calls.
 * Covers both plural forms: `t(key, { count })` and `t(key, n)`.
 */
export function i18nEchoMock() {
  const t = (key: string, params?: { count?: number } | number) => {
    if (typeof params === 'number') return `${key}#${params}`
    return params?.count !== undefined ? `${key}#${params.count}` : key
  }
  return {
    useI18n: () => ({ t, locale: ref('fr') }),
    createI18n: () => ({ global: { t }, install: () => {} }),
  }
}

/**
 * Mutable auth state + a useAuth return value matching src/composables/useAuth.ts.
 * Use with vi.mocked(useAuth).mockReturnValue(makeAuthMock(state)).
 */
export interface AuthMockState {
  user: { id: string; email: string; displayName?: string } | null
  role: 'player' | 'tournament_admin' | 'super_admin' | 'kiosk'
  initialized: boolean
  /** The account setting; defaults to on, like a fresh account. */
  autoSelectSelfInMatch?: boolean
}

export function makeAuthMock(state: AuthMockState) {
  const currentUser = computed(() => state.user)
  const appUser = computed(() =>
    state.user
      ? {
          id: state.user.id,
          email: state.user.email,
          displayName: state.user.displayName ?? state.user.email,
          role: state.role,
          autoSelectSelfInMatch: state.autoSelectSelfInMatch ?? true,
          betterAuth: { email: state.user.email },
        }
      : null,
  )
  return {
    currentUser,
    appUser,
    isAuthenticated: computed(() => !!state.user),
    isSuperAdmin: computed(() => state.role === 'super_admin'),
    isAdmin: computed(() => state.role === 'super_admin' || state.role === 'tournament_admin'),
    userRole: computed(() => state.role),
    loading: ref(false),
    error: ref<string | null>(null),
    isInitialized: computed(() => state.initialized),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    checkSession: vi.fn(),
    fetchUserData: vi.fn(),
    initialize: vi.fn(async () => {
      state.initialized = true
    }),
    authClient: {},
    token: computed(() => null),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    listAuthProviders: vi.fn(async () => ['credential']),
    kioskSettingsLocked: ref(false),
    lockKioskSettings: vi.fn(),
  }
}
