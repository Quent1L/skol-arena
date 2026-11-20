import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { i18n } from '@/i18n'
import { enableAutoUnmount } from '@vue/test-utils'
import { mountWithPlugins, mountWithUi } from '@/test-support/mount'
import FieldEditabilityNote from '../forms/FieldEditabilityNote.vue'
import PasswordInput from '../forms/PasswordInput.vue'
import PageTitleBar from '../ui/PageTitleBar.vue'
import SplashLoader from '../SplashLoader.vue'
import NotificationBell from '../NotificationBell.vue'
import NotificationsInit from '../NotificationsInit.vue'
import PwaInstallBanner from '../PwaInstallBanner.vue'

enableAutoUnmount(afterEach)

const unreadCount = ref(0)
const load = vi.fn()
const connect = vi.fn()
const disconnect = vi.fn()
const isAuthenticated = ref(false)
vi.mock('@/composables/notification/notification.service', () => ({
  useNotificationService: () => ({ unreadCount, load }),
}))
vi.mock('@/composables/notification/notification.socket', () => ({
  useNotificationSocket: () => ({ connect, disconnect }),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ isAuthenticated }) }))
const closeVotePrompt = vi.fn()
vi.mock('@/composables/votes/useVotePrompt', () => ({
  useVotePrompt: () => ({ close: closeVotePrompt }),
}))

const pwa = {
  shouldShowBanner: ref(false),
  showIOSInstructions: ref(false),
  triggerInstall: vi.fn(),
  dismissBanner: vi.fn(),
}
vi.mock('@/composables/pwa/pwa.install', () => ({ usePWAInstall: () => pwa }))

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'en'
  unreadCount.value = 0
  isAuthenticated.value = false
  pwa.shouldShowBanner.value = false
  pwa.showIOSInstructions.value = false
})

const plugins = [i18n]

describe('FieldEditabilityNote', () => {
  it('warns that saving recalculates the standings, ahead of the lock note', () => {
    const wrapper = mountWithPlugins(FieldEditabilityNote, {
      props: { recalculates: true, lockedByMatches: true, matchCount: 2 },
      global: { plugins },
    })

    expect(wrapper.text()).toContain('recalculates the standings')
    expect(wrapper.text()).not.toContain('Locked')
  })

  it('explains a lock with the result count', () => {
    const wrapper = mountWithPlugins(FieldEditabilityNote, {
      props: { lockedByMatches: true, matchCount: 3 },
      global: { plugins },
    })

    expect(wrapper.text()).toContain('Locked: 3 result(s)')
  })

  it('renders nothing for a field that is simply locked by structure', () => {
    const wrapper = mountWithPlugins(FieldEditabilityNote, { global: { plugins } })

    expect(wrapper.find('p').exists()).toBe(false)
  })
})

describe('PasswordInput', () => {
  it('toggles between hidden and visible', async () => {
    const wrapper = mountWithUi(PasswordInput, {
      props: { modelValue: 'secret' },
      global: { plugins },
    })
    const input = () => wrapper.find('input')
    const toggle = () => wrapper.find('button[aria-pressed]')

    expect(input().attributes('type')).toBe('password')
    expect(toggle().attributes('aria-pressed')).toBe('false')

    await toggle().trigger('click')

    expect(input().attributes('type')).toBe('text')
    expect(toggle().attributes('aria-pressed')).toBe('true')
  })
})

describe('PageTitleBar', () => {
  it('renders the title as the page heading, with the inner class and leading slot', () => {
    const wrapper = mountWithPlugins(PageTitleBar, {
      props: { title: 'Badges', innerClass: 'max-w-xl' },
      slots: { leading: '<button id="back">back</button>' },
    })

    expect(wrapper.find('h1').text()).toBe('Badges')
    expect(wrapper.find('.max-w-xl').exists()).toBe(true)
    expect(wrapper.find('#back').exists()).toBe(true)
  })
})

describe('SplashLoader', () => {
  it('shows the overlay only while visible', async () => {
    const wrapper = mountWithPlugins(SplashLoader, {
      props: { visible: true },
      global: { plugins, stubs: { Transition: false } },
    })
    expect(wrapper.find('.splash-overlay').exists()).toBe(true)

    await wrapper.setProps({ visible: false })

    expect(wrapper.find('.splash-overlay').exists()).toBe(false)
  })
})

describe('NotificationBell', () => {
  it('labels the trigger and mounts with no unread notification', () => {
    const wrapper = mountWithUi(NotificationBell, { global: { plugins } })

    expect(wrapper.find('button').attributes('aria-label')).toBe(
      i18n.global.t('notificationBell.ariaLabel'),
    )
  })

  it('shows the unread count', async () => {
    unreadCount.value = 4
    const wrapper = mountWithUi(NotificationBell, { global: { plugins } })

    expect(wrapper.text()).toContain('4')
  })
})

describe('NotificationsInit', () => {
  it('connects and loads once authenticated, and disconnects on logout', async () => {
    mountWithPlugins(NotificationsInit, { global: { plugins } })
    expect(connect).not.toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalledTimes(1)

    isAuthenticated.value = true
    await nextTick()
    expect(load).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(1)

    isAuthenticated.value = false
    await nextTick()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it('drops the pending vote prompt on logout, so the next account never sees it', async () => {
    isAuthenticated.value = true
    mountWithPlugins(NotificationsInit, { global: { plugins } })
    closeVotePrompt.mockClear()

    isAuthenticated.value = false
    await nextTick()

    expect(closeVotePrompt).toHaveBeenCalledTimes(1)
  })

  it('connects straight away when already signed in, and disconnects on unmount', () => {
    isAuthenticated.value = true
    const wrapper = mountWithPlugins(NotificationsInit, { global: { plugins } })
    expect(connect).toHaveBeenCalledTimes(1)

    wrapper.unmount()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('PwaInstallBanner', () => {
  const mountBanner = () =>
    mountWithUi(PwaInstallBanner, {
      global: { plugins, stubs: { Transition: false } },
      attachTo: document.body,
    })

  it('stays hidden by default', () => {
    expect(mountBanner().find('.install-banner').exists()).toBe(false)
  })

  it('installs or dismisses from the banner', async () => {
    pwa.shouldShowBanner.value = true
    const wrapper = mountBanner()
    const buttons = wrapper.findAll('.install-banner button')

    await buttons[0].trigger('click')
    expect(pwa.triggerInstall).toHaveBeenCalledTimes(1)

    await buttons[1].trigger('click')
    expect(pwa.dismissBanner).toHaveBeenCalledTimes(1)
  })

  it('shows the iOS instructions and closes them', async () => {
    pwa.showIOSInstructions.value = true
    const wrapper = mountBanner()
    expect(wrapper.text()).toContain('Add to Home Screen')

    await wrapper.find('.install-banner button').trigger('click')

    expect(pwa.showIOSInstructions.value).toBe(false)
  })
})
