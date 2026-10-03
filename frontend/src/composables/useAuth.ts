/**
 * Composable for authentication with Better Auth
 */

import { ref, computed } from 'vue'
import { authClient } from '@/lib/auth-client'
import { userApi, type UserResponse } from '@/composables/user/user.api'
import { useConfigService } from '@/composables/config/config.service'
import { NETWORK_ERROR, isNetworkError, isTransientStatus } from '@/utils/HttpErrors'
import { translateAuthError } from '@/utils/AuthErrors'
import { i18n } from '@/i18n'
import { useAvatarService } from '@/composables/avatar/avatar.service'

const sessionData = ref()
const appUserData = ref<UserResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const kioskSettingsLocked = ref(localStorage.getItem('kiosk_settings_locked') === 'true')

const RETRY_DELAY_MS = 600

function networkError(): Error {
  return new Error(i18n.global.t('auth.errors.sessionFetchGeneric'), { cause: NETWORK_ERROR })
}

/** Shared in-flight promises: keeps two concurrent guards from racing each other. */
let inFlightCheck: Promise<unknown> | null = null
let inFlightInit: Promise<void> | null = null

/**
 * Fetches the user's data from the /users/me API
 */
async function fetchUserData() {
  try {
    const userData = await userApi.me()
    appUserData.value = userData
    // Spares the header its own lookup, and keeps it right after an upload.
    useAvatarService().remember(userData.id, userData.avatarVersion ?? null)
  } catch (err) {
    console.error('Error fetching user data:', err)
    appUserData.value = null
    throw err
  }
}

/**
 * Construit l'URL de logout Keycloak
 */
function buildKeycloakLogoutUrl(issuer: string, clientId?: string): string {
  const postLogoutRedirectUri = window.location.origin + '/login'
  const logoutUrl = `${issuer}/protocol/openid-connect/logout`

  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutRedirectUri,
  })

  if (clientId) {
    params.append('client_id', clientId)
  }

  return `${logoutUrl}?${params.toString()}`
}

export function useAuth() {
  const currentUser = computed(() => sessionData.value?.data?.user || null)
  const appUser = computed(() => appUserData.value)
  const isAuthenticated = computed(() => !!sessionData.value?.data?.user && !!appUserData.value)
  const isSuperAdmin = computed(() => appUserData.value?.role === 'super_admin' || false)
  const isAdmin = computed(
    () =>
      appUserData.value?.role === 'super_admin' ||
      appUserData.value?.role === 'tournament_admin' ||
      false,
  )
  const userRole = computed(() => appUserData.value?.role || 'player')
  const token = computed(() => sessionData.value?.data?.session?.token || null)
  const isInitialized = computed(() => sessionData.value !== undefined)

  /**
   * A single round-trip to Better Auth.
   * Throws an error marked NETWORK_ERROR when the failure is transient, leaving the
   * session state untouched — the caller then decides whether to retry.
   */
  async function fetchSessionOnce() {
    let result
    try {
      result = await authClient.getSession()
    } catch {
      // better-fetch rejection: unreachable network, CORS, DNS, timeout.
      throw networkError()
    }

    if (result.error) {
      if (isTransientStatus(result.error.status)) {
        throw networkError()
      }
      // Explicit auth response (401, 403...): no session, a legitimate case.
      const message = translateAuthError(result.error, 'auth.errors.sessionFetch')
      error.value = message
      sessionData.value = { data: { user: null, session: null } }
      appUserData.value = null
      throw new Error(message)
    }

    return result
  }

  async function checkSession(force = false) {
    if (inFlightCheck && !force) {
      return inFlightCheck
    }

    loading.value = true
    error.value = null

    const run = (async () => {
      try {
        // A single retry on network error: covers a restarting backend / cold start,
        // a frequent cause of false logouts.
        let result
        try {
          result = await fetchSessionOnce()
        } catch (err) {
          if (!isNetworkError(err)) throw err
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          result = await fetchSessionOnce()
        }

        sessionData.value = result
        return result
      } catch (err) {
        error.value =
          err instanceof Error ? err.message : i18n.global.t('auth.errors.sessionFetchGeneric')
        // NB: the logged-out state is NOT written here. Either fetchSessionOnce already
        // did it for a real 401, or the failure is transient and the session stays
        // unknown (`undefined`) so a later navigation retries.
        throw err
      } finally {
        loading.value = false
        inFlightCheck = null
      }
    })()

    inFlightCheck = run
    return run
  }

  /**
   * Login with email and password
   */
  async function login(credentials: { email: string; password: string }) {
    loading.value = true
    error.value = null

    try {
      const result = await authClient.signIn.email({
        email: credentials.email,
        password: credentials.password,
      })

      if (result.error) {
        // Thrown translated too: the catch below re-reads err.message into error.value.
        const message = translateAuthError(result.error, 'auth.errors.login')
        error.value = message
        throw new Error(message)
      }

      localStorage.removeItem('kiosk_settings_locked')
      kioskSettingsLocked.value = false
      await checkSession(true)

      await fetchUserData()

      return result
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.global.t('auth.errors.loginGeneric')
      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Sign-up with email and password
   */
  async function register(credentials: {
    email: string
    name?: string
    password: string
    passwordConfirm: string
  }) {
    loading.value = true
    error.value = null

    try {
      const signUpData: {
        email: string
        password: string
        name: string
      } = {
        email: credentials.email,
        password: credentials.password,
        name: credentials.name ?? credentials.email.split('@')[0] ?? 'User',
      }

      const result = await authClient.signUp.email(signUpData)

      if (result.error) {
        const errorMessage = translateAuthError(result.error, 'auth.errors.register')

        error.value = errorMessage
        throw new Error(errorMessage)
      }

      await initialize()

      return result
    } catch (err: unknown) {
      // Handle invitation-code-specific errors
      let message = i18n.global.t('auth.errors.registerGeneric')

      if (err instanceof Error) {
        message = err.message
      } else if ((err as { error?: { message?: string } })?.error?.message) {
        message = (err as { error: { message: string } }).error.message
      } else if ((err as { message?: string })?.message) {
        message = (err as { message: string }).message
      }

      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Initializes the session at application startup
   */
  async function initialize() {
    if (sessionData.value !== undefined) {
      return // Already initialized
    }
    if (inFlightInit) {
      return inFlightInit // Two concurrent guards await the same promise
    }

    const run = (async () => {
      try {
        console.log('Initializing user session...')
        await checkSession()

        // If the user is logged in, fetch their data
        if (sessionData.value?.data?.user) {
          try {
            await fetchUserData()
          } catch (fetchError: unknown) {
            // If the error is INVITATION_CODE_REQUIRED, propagate it so the guard can handle it
            if ((fetchError as { cause?: string })?.cause === 'INVITATION_CODE_REQUIRED') {
              throw fetchError
            }
            // Transient error on /users/me: the Better Auth session is still valid.
            // Reset the state to "unknown" to retry, rather than logging out.
            if (isNetworkError(fetchError)) {
              sessionData.value = undefined
              appUserData.value = null
              throw fetchError
            }
            // Real auth error (401): legitimate logout.
            console.warn('Error fetching user data:', fetchError)
            sessionData.value = { data: { user: null, session: null } }
            appUserData.value = null
          }
        }
      } catch (err: unknown) {
        if ((err as { cause?: string })?.cause === 'INVITATION_CODE_REQUIRED') {
          throw err
        }
        // Transient failure: pin nothing. `sessionData` stays `undefined` so
        // `isInitialized` stays false and the next navigation really retries.
        if (isNetworkError(err)) {
          throw err
        }
        // Authentication error: legitimate logged-out state.
        sessionData.value = { data: { user: null, session: null } }
        appUserData.value = null
      } finally {
        inFlightInit = null
      }
    })()

    inFlightInit = run
    return run
  }

  /**
   * Logout
   */
  async function logout() {
    loading.value = true
    error.value = null

    try {
      // Log out of Better Auth
      await authClient.signOut()
      sessionData.value = undefined
      appUserData.value = null

      // If Keycloak is enabled, redirect to Keycloak logout
      const { config } = useConfigService()
      if (config.value?.auth?.keycloak?.enabled && config.value?.auth?.keycloak?.issuer) {
        const keycloakLogoutUrl = buildKeycloakLogoutUrl(
          config.value.auth.keycloak.issuer,
          config.value.auth.keycloak.clientId || undefined,
        )
        window.location.href = keycloakLogoutUrl
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.global.t('auth.errors.logoutGeneric')
      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }


  /**
   * Password reset request
   */
  async function requestPasswordReset(email: string) {
    loading.value = true
    error.value = null

    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (result.error) {
        const message = translateAuthError(result.error, 'auth.errors.passwordResetRequest')
        error.value = message
        throw new Error(message)
      }

      return result
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : i18n.global.t('auth.errors.passwordResetRequestGeneric')
      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * providerId of every account linked to the session: "credential" for the
   * native password, "keycloak" for SSO. An SSO-only user has no password,
   * so the change-password flow cannot apply to them.
   */
  async function listAuthProviders(): Promise<string[]> {
    const result = await authClient.listAccounts()
    if (result.error) {
      throw new Error(translateAuthError(result.error, 'auth.errors.sessionFetch'))
    }
    return (result.data ?? []).map((account) => account.providerId)
  }

  /**
   * Password reset with token
   */
  async function resetPassword(token: string, newPassword: string) {
    loading.value = true
    error.value = null

    try {
      const result = await authClient.resetPassword({
        newPassword,
        token,
      })

      if (result.error) {
        const message = translateAuthError(result.error, 'auth.errors.passwordReset')
        error.value = message
        throw new Error(message)
      }

      return result
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : i18n.global.t('auth.errors.passwordResetGeneric')
      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Password change (logged-in user)
   */
  async function changePassword(currentPassword: string, newPassword: string) {
    loading.value = true
    error.value = null

    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      })

      if (result.error) {
        const message = translateAuthError(result.error, 'auth.errors.passwordChange')
        error.value = message
        throw new Error(message)
      }

      return result
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : i18n.global.t('auth.errors.passwordChangeGeneric')
      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }

  function lockKioskSettings() {
    localStorage.setItem('kiosk_settings_locked', 'true')
    kioskSettingsLocked.value = true
  }

  return {
    currentUser,
    appUser,
    isAuthenticated,
    isSuperAdmin,
    isAdmin,
    userRole,
    loading,
    error,
    isInitialized,
    login,
    register,
    logout,
    checkSession,
    fetchUserData,
    initialize,
    authClient,
    token,
    requestPasswordReset,
    resetPassword,
    changePassword,
    listAuthProviders,
    kioskSettingsLocked,
    lockKioskSettings,
  }
}
