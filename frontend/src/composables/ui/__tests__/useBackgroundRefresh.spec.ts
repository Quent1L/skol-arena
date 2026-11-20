import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import {
  useBackgroundRefresh,
  REFRESH_INDICATOR_DELAY_MS,
  REFRESH_DONE_MS,
  type BackgroundRefresh,
} from '../useBackgroundRefresh'

// The composable registers onScopeDispose, so it has to live inside a scope —
// as it does in the Pinia store that owns it.
function inScope(): { scope: EffectScope; refresh: BackgroundRefresh } {
  const scope = effectScope()
  const refresh = scope.run(() => useBackgroundRefresh())!
  return { scope, refresh }
}

/** A promise the test resolves by hand, to hold a refresh open. */
function deferred() {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res()
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useBackgroundRefresh', () => {
  it('stays invisible for a refresh that finishes before the delay', async () => {
    const { refresh } = inScope()

    await refresh.run(async () => {})
    await vi.advanceTimersByTimeAsync(REFRESH_DONE_MS * 2)

    expect(refresh.isRefreshing.value).toBe(false)
    expect(refresh.justRefreshed.value).toBe(false)
  })

  it('announces a slow refresh, then confirms it landed', async () => {
    const { refresh } = inScope()
    const pending = deferred()
    const running = refresh.run(() => pending.promise)

    await vi.advanceTimersByTimeAsync(REFRESH_INDICATOR_DELAY_MS)
    expect(refresh.isRefreshing.value).toBe(true)

    pending.resolve()
    await running
    expect(refresh.isRefreshing.value).toBe(false)
    expect(refresh.justRefreshed.value).toBe(true)

    await vi.advanceTimersByTimeAsync(REFRESH_DONE_MS)
    expect(refresh.justRefreshed.value).toBe(false)
  })

  it('keeps the indicator up until the last concurrent refresh settles', async () => {
    const { refresh } = inScope()
    const first = deferred()
    const second = deferred()
    const running = Promise.all([
      refresh.run(() => first.promise),
      refresh.run(() => second.promise),
    ])

    await vi.advanceTimersByTimeAsync(REFRESH_INDICATOR_DELAY_MS)
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh.isRefreshing.value).toBe(true)

    second.resolve()
    await running
    expect(refresh.isRefreshing.value).toBe(false)
    expect(refresh.justRefreshed.value).toBe(true)
  })

  it('propagates the failure and claims nothing was updated', async () => {
    const { refresh } = inScope()
    const pending = deferred()
    const running = refresh.run(() => pending.promise)

    await vi.advanceTimersByTimeAsync(REFRESH_INDICATOR_DELAY_MS)
    pending.reject(new Error('offline'))

    await expect(running).rejects.toThrow('offline')
    expect(refresh.isRefreshing.value).toBe(false)
    expect(refresh.justRefreshed.value).toBe(false)
  })

  it('drops its pending timers when the scope is disposed', async () => {
    const { scope, refresh } = inScope()
    const pending = deferred()
    void refresh.run(() => pending.promise)

    scope.stop()
    await vi.advanceTimersByTimeAsync(REFRESH_INDICATOR_DELAY_MS * 2)

    expect(refresh.isRefreshing.value).toBe(false)
  })
})
