import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

const DISMISS_KEY = 'pwa_install_dismissed_at'

function setUserAgent(value: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value)
}

function stubDisplayMode(standalone: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as never
}

/** Fresh module state per test: the install state lives at module scope. */
async function mountInstall() {
  vi.resetModules()
  const { usePWAInstall } = await import('../pwa.install')
  let api!: ReturnType<typeof usePWAInstall>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = usePWAInstall()
        return () => h('div')
      },
    }),
  )
  return { api, wrapper }
}

function fireInstallPrompt(outcome: 'accepted' | 'dismissed') {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  })
  window.dispatchEvent(event)
  return { event, prompt }
}

beforeEach(() => {
  localStorage.clear()
  stubDisplayMode(false)
  setUserAgent('Mozilla/5.0 (Linux; Android 14)')
})

afterEach(() => vi.restoreAllMocks())

describe('usePWAInstall', () => {
  it('detects an already installed app from the display mode', async () => {
    stubDisplayMode(true)
    const { api } = await mountInstall()

    expect(api.isInstalled.value).toBe(true)
    expect(api.canInstall.value).toBe(false)
  })

  it('offers the banner on mobile once the browser fires the install prompt', async () => {
    const { api } = await mountInstall()
    expect(api.shouldShowBanner.value).toBe(false)

    const { event } = fireInstallPrompt('accepted')

    expect(event.defaultPrevented).toBe(true)
    expect(api.canInstall.value).toBe(true)
    expect(api.shouldShowBanner.value).toBe(true)
  })

  it('never shows the banner on desktop', async () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)')
    const { api } = await mountInstall()
    fireInstallPrompt('accepted')

    expect(api.canInstall.value).toBe(true)
    expect(api.shouldShowBanner.value).toBe(false)
  })

  it('marks the app installed after an accepted prompt', async () => {
    const { api } = await mountInstall()
    const { prompt } = fireInstallPrompt('accepted')

    await api.triggerInstall()

    expect(prompt).toHaveBeenCalled()
    expect(api.isInstalled.value).toBe(true)
    expect(api.canInstall.value).toBe(false)
  })

  it('does not mark the app installed after a refused prompt', async () => {
    const { api } = await mountInstall()
    fireInstallPrompt('dismissed')

    await api.triggerInstall()

    expect(api.isInstalled.value).toBe(false)
    expect(api.canInstall.value).toBe(false)
  })

  it('does nothing without a deferred prompt', async () => {
    const { api } = await mountInstall()

    await api.triggerInstall()

    expect(api.isInstalled.value).toBe(false)
  })

  it('shows the manual instructions on iOS instead of prompting', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    const { api } = await mountInstall()
    expect(api.canInstall.value).toBe(true)

    await api.triggerInstall()

    expect(api.showIOSInstructions.value).toBe(true)
    expect(api.shouldShowBanner.value).toBe(false)
  })

  it('reacts to the appinstalled event', async () => {
    const { api } = await mountInstall()
    fireInstallPrompt('accepted')

    window.dispatchEvent(new Event('appinstalled'))

    expect(api.isInstalled.value).toBe(true)
    expect(api.canInstall.value).toBe(false)
  })

  it('remembers a dismissal and honours it for 15 days only', async () => {
    const first = await mountInstall()
    fireInstallPrompt('accepted')
    first.api.dismissBanner()
    expect(first.api.shouldShowBanner.value).toBe(false)
    expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull()

    const recent = await mountInstall()
    fireInstallPrompt('accepted')
    expect(recent.api.shouldShowBanner.value).toBe(false)

    localStorage.setItem(DISMISS_KEY, String(Date.now() - 16 * 24 * 60 * 60 * 1000))
    const expired = await mountInstall()
    fireInstallPrompt('accepted')
    expect(expired.api.shouldShowBanner.value).toBe(true)
  })
})
