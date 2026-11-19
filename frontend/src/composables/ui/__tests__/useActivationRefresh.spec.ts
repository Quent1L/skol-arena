import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeepAlive, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { STALE_AFTER_MS, useActivationRefresh } from '../useActivationRefresh'

const writes = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/config/ApiConfig', () => ({ writeSequence: () => writes.count }))

const refresh = vi.fn()
const eventsMissed = ref(false)

const Kept = defineComponent({
  name: 'KeptView',
  setup() {
    useActivationRefresh(refresh, eventsMissed)
    return () => h('div')
  },
})
const Other = defineComponent({ render: () => h('span') })

/** Mounts `Kept` under a KeepAlive; `whileAway` runs between leaving and coming back. */
function mountHost() {
  const shown = ref(true)
  mount(
    defineComponent({
      setup: () => () => h(KeepAlive, null, [shown.value ? h(Kept) : h(Other)]),
    }),
  )
  return async (whileAway: () => void = () => {}) => {
    shown.value = false
    await nextTick()
    whileAway()
    shown.value = true
    await nextTick()
  }
}

describe('useActivationRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refresh.mockClear()
    eventsMissed.value = false
    writes.count = 0
  })
  afterEach(() => vi.useRealTimers())

  it('does not refresh on mount nor on a quick return with nothing moved', async () => {
    await mountHost()()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes when a write was sent while away', async () => {
    await mountHost()(() => (writes.count += 1))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('refreshes and clears the flag when socket events may have been missed', async () => {
    const roundTrip = mountHost()
    eventsMissed.value = true
    await roundTrip()
    expect(refresh).toHaveBeenCalledOnce()
    expect(eventsMissed.value).toBe(false)
  })

  it('refreshes after a long absence', async () => {
    await mountHost()(() => vi.advanceTimersByTime(STALE_AFTER_MS + 1))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
