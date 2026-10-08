import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppToast } from '@/composables/useAppToast'
import { NETWORK_ERROR } from '@/utils/HttpErrors'

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key } },
}))

const add = vi.fn()
const toast = { add } as unknown as AppToast

async function loadErrorService() {
  vi.resetModules()
  const mod = await import('@/composables/useErrorService')
  mod.initErrorService(toast)
  return mod.errorService
}

beforeEach(() => {
  add.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('errorService — unreachable server', () => {
  it('replaces the browser’s raw message with an explicit message', async () => {
    const errorService = await loadErrorService()

    errorService.showError(
      new Error('NetworkError when attempting to fetch resource.', { cause: NETWORK_ERROR }),
    )

    expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        severity: 'warn',
        summary: 'errorService.serverUnreachableSummary',
        detail: 'errorService.serverUnreachableDetail',
      }))
  })

  it("does not stack a toast per failed network call", async () => {
    const errorService = await loadErrorService()
    const fail = () => new Error('Failed to fetch', { cause: NETWORK_ERROR })

    // /api/config + /api/auth/get-session + its retry
    errorService.showError(fail())
    errorService.showError(fail())
    errorService.showNetworkError()

    expect(add).toHaveBeenCalledOnce()
  })

  it('shows the toast again after the previous one expires', async () => {
    const errorService = await loadErrorService()

    errorService.showNetworkError()
    vi.advanceTimersByTime(8000)
    errorService.showNetworkError()

    expect(add).toHaveBeenCalledTimes(2)
  })

  it('stays silent when the page is navigating away', async () => {
    // An update reload cuts off in-flight requests: each abort
    // surfaces as a network failure, on a screen that will no longer exist.
    const errorService = await loadErrorService()
    const { markLeaving } = await import('@/utils/app-lifecycle')

    markLeaving()
    errorService.showError(new Error('Failed to fetch', { cause: NETWORK_ERROR }))
    errorService.showError(new Error('Tournament not found', { cause: 'TOURNAMENT_NOT_FOUND' }))

    expect(add).not.toHaveBeenCalled()
  })

  it('keeps the network marker on unhandled rejections', async () => {
    // Regression: the handler forwarded `reason.message`, a string, which
    // lost `cause` — an unreachable backend surfaced as the raw
    // "Failed to fetch" error instead of the dedicated message.
    vi.resetModules()
    const mod = await import('@/composables/useErrorService')
    mod.initErrorService(toast)
    mod.errorService.install()

    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    event.reason = new Error('Failed to fetch', { cause: NETWORK_ERROR })
    window.dispatchEvent(event)
    mod.errorService.uninstall()

    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ severity: 'warn', summary: 'errorService.serverUnreachableSummary' }),
    )
  })

  it('lets real application errors through', async () => {
    const errorService = await loadErrorService()

    errorService.showError(new Error('Tournament not found', { cause: 'TOURNAMENT_NOT_FOUND' }))

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Tournament not found' }),
    )
  })
})
