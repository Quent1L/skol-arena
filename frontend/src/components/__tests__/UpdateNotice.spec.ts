import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createI18n } from 'vue-i18n'

const updateNotice = ref<string | null>(null)
const clearUpdateNotice = vi.fn(() => {
  updateNotice.value = null
})
vi.mock('@/composables/pwa/pwa.update', () => ({
  usePWAUpdate: () => ({ updateNotice, clearUpdateNotice }),
}))

import UpdateNotice from '../UpdateNotice.vue'
import { useWhatsNewDotFlight } from '@/composables/whats-new/dot-flight'
import { holdScreenWhile } from '@/composables/useScreenTakeover'

const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  messages: { fr: { updateNotice: { done: 'Mise à jour effectuée' } } },
})

function addAvatarDot(): HTMLElement {
  const dot = document.createElement('span')
  dot.setAttribute('data-whats-new-target', '')
  dot.getBoundingClientRect = () =>
    ({ width: 8, height: 8, top: 16, bottom: 24, left: 300, right: 308 }) as DOMRect
  document.body.appendChild(dot)
  return dot
}

/** Mounts a stand-in for an MMR recap, shown while `open` is true. */
function mountTakeover(open: ReturnType<typeof ref<boolean>>) {
  return mount(
    defineComponent({
      setup() {
        holdScreenWhile(() => open.value === true)
        return () => null
      },
    }),
  )
}

function mountNotice() {
  return mount(UpdateNotice, { attachTo: document.body, global: { plugins: [i18n] } })
}

describe('UpdateNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearUpdateNotice.mockClear()
    useWhatsNewDotFlight().inFlight.value = false
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    updateNotice.value = null
  })

  it('stays silent when no update landed', async () => {
    const wrapper = mountNotice()
    await flushPromises()

    expect(wrapper.find('.status-pill').exists()).toBe(false)
    wrapper.unmount()
  })

  it('announces the update, then goes away on its own', async () => {
    updateNotice.value = '2.5.0'
    const wrapper = mountNotice()
    await vi.advanceTimersByTimeAsync(800)

    expect(wrapper.find('.status-pill').text()).toContain('Mise à jour effectuée')
    expect(wrapper.find('[data-testid="update-notice-dot"]').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(2000)
    expect(clearUpdateNotice).toHaveBeenCalledOnce()
    expect(wrapper.find('.status-pill').exists()).toBe(false)
    wrapper.unmount()
  })

  it('carries the what’s new dot and hands it over to the avatar', async () => {
    addAvatarDot()
    updateNotice.value = '2.5.0'
    const { inFlight } = useWhatsNewDotFlight()
    const wrapper = mountNotice()
    await vi.advanceTimersByTimeAsync(800)

    expect(wrapper.find('[data-testid="update-notice-dot"]').exists()).toBe(true)
    // The header's own dot stays hidden until the flying one lands.
    expect(inFlight.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    expect(inFlight.value).toBe(false)
    wrapper.unmount()
  })

  it('waits for a full-screen moment to close before showing', async () => {
    const recapOpen = ref(true)
    const recap = mountTakeover(recapOpen)
    updateNotice.value = '2.5.0'
    const wrapper = mountNotice()

    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.find('.status-pill').exists()).toBe(false)

    recapOpen.value = false
    await vi.advanceTimersByTimeAsync(800)
    expect(wrapper.find('.status-pill').exists()).toBe(true)
    wrapper.unmount()
    recap.unmount()
  })

  it('withdraws and starts over when a full-screen moment opens mid-way', async () => {
    const recapOpen = ref(false)
    const recap = mountTakeover(recapOpen)
    updateNotice.value = '2.5.0'
    const wrapper = mountNotice()
    await vi.advanceTimersByTimeAsync(800)
    expect(wrapper.find('.status-pill').exists()).toBe(true)

    recapOpen.value = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.find('.status-pill').exists()).toBe(false)
    expect(clearUpdateNotice).not.toHaveBeenCalled()

    recapOpen.value = false
    await vi.advanceTimersByTimeAsync(800)
    expect(wrapper.find('.status-pill').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(clearUpdateNotice).toHaveBeenCalledOnce()
    wrapper.unmount()
    recap.unmount()
  })
})
