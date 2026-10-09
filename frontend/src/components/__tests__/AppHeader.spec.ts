import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref, type PropType } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { mountWithUi } from '@/test-support/mount'
import { makeAuthMock, type AuthMockState } from '@/test-support/mock-modules'
import { useAuth } from '@/composables/useAuth'
import AppHeader from '../AppHeader.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ name: 'home', path: '/' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/composables/useViewport', () => ({ useViewport: () => ({ isMobile: ref(false) }) }))

const whatsNew = vi.hoisted(() => ({ unseen: { value: true }, open: vi.fn() }))
vi.mock('@/composables/whats-new/useWhatsNew', () => ({
  useWhatsNew: () => ({
    hasUnseen: computed(() => whatsNew.unseen.value),
    url: 'https://skol-arena.com/changelog#v2.1.0',
    open: whatsNew.open,
  }),
}))

/** Renders the menu's items inline, through the real `item-leading` slot, next to its trigger. */
const DropdownMenuStub = defineComponent({
  props: { items: { type: Array as PropType<DropdownMenuItem[][]>, required: true } },
  setup(props, { slots }) {
    const ui = { itemLeadingIcon: (_: { class?: string } = {}) => '' }
    return () =>
      h('div', [
        slots.default?.({ open: false }),
        h(
          'ul',
          props.items.flat().map((item, index) =>
            h('li', { 'data-key': item.value, onClick: () => item.onSelect?.(new Event('select')) }, [
              slots['item-leading']?.({ item, active: false, index, ui }),
              item.label,
            ]),
          ),
        ),
      ])
  },
})

function mountHeader(role: AuthMockState['role'] = 'player') {
  const state: AuthMockState = {
    user: { id: 'u1', email: 'a@b.c', displayName: 'Alice' },
    role,
    initialized: true,
  }
  vi.mocked(useAuth).mockReturnValue(makeAuthMock(state) as unknown as ReturnType<typeof useAuth>)
  return mountWithUi(AppHeader, {
    global: {
      stubs: {
        DropdownMenu: DropdownMenuStub,
        NotificationBell: true,
        NotificationDropdown: true,
        SkolLogo: true,
        PlayerAvatar: true,
      },
    },
  })
}

describe('AppHeader — what’s new', () => {
  beforeEach(() => {
    whatsNew.unseen.value = true
    whatsNew.open.mockClear()
  })

  it('lists the entry and badges both the entry and the avatar while unseen', () => {
    const wrapper = mountHeader()

    const entry = wrapper.find('[data-key="whats-new"]')
    expect(entry.text()).toContain('appHeader.menu.whatsNew')
    expect(entry.find('[data-testid="whats-new-dot"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="avatar-whats-new-dot"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label*="appHeader.whatsNewAvailable"]').exists()).toBe(true)
  })

  it('drops both badges once seen', () => {
    whatsNew.unseen.value = false
    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="whats-new-dot"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="avatar-whats-new-dot"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="appHeader.userMenuAriaLabel"]').exists()).toBe(true)
  })

  it('opens the changelog from the entry', async () => {
    const wrapper = mountHeader()

    await wrapper.find('[data-key="whats-new"]').trigger('click')

    expect(whatsNew.open).toHaveBeenCalledOnce()
  })

  it('hides the entry and the badge on a kiosk', () => {
    const wrapper = mountHeader('kiosk')

    expect(wrapper.find('[data-key="whats-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="avatar-whats-new-dot"]').exists()).toBe(false)
  })
})
