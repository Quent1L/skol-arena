/**
 * Global service for handling uncaught errors
 */

import type { AppToast } from '@/composables/useAppToast'
import { isLeaving } from '@/utils/app-lifecycle'
import { isNetworkError } from '@/utils/HttpErrors'
import { i18n } from '@/i18n'

// Singleton to access the app toast
let toastInstance: AppToast | null = null

const TOAST_LIFE_MS = 8000

/**
 * An unreachable backend fails several calls in a row (config, session, retry...).
 * This lock prevents stacking one toast per call: a single message, for as long as
 * the toast stays visible.
 */
let networkToastVisible = false

/**
 * Initialize the service with the Toast instance
 * To be called in App.vue after mounting
 */
export function initErrorService(toast: AppToast) {
  toastInstance = toast
  console.log('[Error Service] Toast instance registered')
}

/**
 * Unreachable server: an explicit message rather than raw browser text
 * ("NetworkError when attempting to fetch resource"), and one toast at a time.
 * This is not an application bug — hence the `warn` severity.
 */
function showNetworkError() {
  if (networkToastVisible || !toastInstance) {
    return
  }

  networkToastVisible = true
  setTimeout(() => {
    networkToastVisible = false
  }, TOAST_LIFE_MS)

  toastInstance.add({
    severity: 'warn',
    summary: i18n.global.t('errorService.serverUnreachableSummary'),
    detail: i18n.global.t('errorService.serverUnreachableDetail'),
    life: TOAST_LIFE_MS,
  })
}

/**
 * Show an error in a toast
 */
function showError(error: Error | string, detail?: string) {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorDetail = detail || (typeof error === 'object' && error.stack ? i18n.global.t('errorService.checkConsole') : undefined)

  console.error('[Global Error Handler]', error)

  // The page is being replaced: whatever just failed was cut short by our own
  // reload, and the toast would flash by on a screen that no longer exists.
  if (isLeaving()) {
    return
  }

  // Network failure: dedicated message, never the browser's technical text.
  if (isNetworkError(error)) {
    showNetworkError()
    return
  }

  // If the toast isn't available yet, just log
  if (!toastInstance) {
    console.warn('[Error Service] Toast not available yet, error logged to console only')
    return
  }

  toastInstance.add({
    severity: 'error',
    summary: i18n.global.t('errorService.summary'),
    detail: errorMessage || errorDetail || i18n.global.t('errorService.unexpectedError'),
    life: TOAST_LIFE_MS,
  })
}

/**
 * Uncaught JavaScript error handler
 */
function handleError(event: ErrorEvent) {
  event.preventDefault()

  const errorMessage = event.message || i18n.global.t('errorService.uncaughtJs')
  const location = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : i18n.global.t('errorService.unknownLocation')

  console.error('[Uncaught Error]', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  })

  showError(
    errorMessage,
    i18n.global.t('errorService.locationPrefix', { location })
  )
}

/**
 * Unhandled promise rejection handler
 */
function handleUnhandledRejection(event: PromiseRejectionEvent) {
  event.preventDefault()

  const reason = event.reason
  let errorMessage = i18n.global.t('errorService.unhandledRejection')
  let errorDetail: string | undefined

  if (reason instanceof Error) {
    errorMessage = reason.message
    errorDetail = reason.name
  } else if (typeof reason === 'string') {
    errorMessage = reason
  } else if (reason && typeof reason === 'object') {
    // Handle API errors (format { error: { code, message } })
    if (reason.error?.message) {
      errorMessage = reason.error.message
      errorDetail = reason.error.code
    } else if (reason.message) {
      errorMessage = reason.message
    } else {
      errorMessage = JSON.stringify(reason)
    }
  }

  console.error('[Unhandled Promise Rejection]', {
    reason,
    promise: event.promise,
  })

  // Forward the Error itself rather than its message: `cause` is what marks a
  // transient network failure, and a plain string drops it — which is how an
  // unreachable backend surfaced as a raw "Failed to fetch" error toast instead of
  // the dedicated "server unreachable" one.
  showError(reason instanceof Error ? reason : errorMessage, errorDetail)
}

/**
 * Install the global error interceptors
 */
function install() {
  // Intercept uncaught JavaScript errors
  window.addEventListener('error', handleError)

  // Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', handleUnhandledRejection)

  console.log('[Error Service] Global error handlers installed')
}

/**
 * Uninstall the global error interceptors
 */
function uninstall() {
  window.removeEventListener('error', handleError)
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)

  console.log('[Error Service] Global error handlers uninstalled')
}

// Export the service as an object
export const errorService = {
  install,
  uninstall,
  showError,
  showNetworkError,
}

// Export the function for Vue components
export function useErrorService() {
  return errorService
}
