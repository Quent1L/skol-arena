import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import fr from '@/i18n/messages/fr.json'
import { mountWithUi } from '@/test-support/mount'
import NotificationItem from '../NotificationItem.vue'
import type { RawNotification } from '@/composables/notification/notification.api'

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/composables/notification/notification.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/composables/notification/notification.service')
  >('@/composables/notification/notification.service')
  return {
    ...actual,
    useNotificationService: () => ({ open: vi.fn(), deleteNotification: vi.fn() }),
  }
})

function makeNotif(over: Partial<RawNotification> = {}): RawNotification {
  return {
    id: 'n-1',
    type: 'MATCH_CREATED',
    title: 'server title',
    message: 'server message',
    titleKey: 'notifications.MATCH_CREATED_TITLE',
    messageKey: 'notifications.MATCH_CREATED_MESSAGE',
    translationParams: {
      creatorName: 'Toto',
      tournamentName: 'Coupe',
      matchFormat: '1v1',
      matchDate: '2026-06-01T15:00:00.000Z',
      opponents: 'Titi',
      teammates: 'Tata',
    },
    actionUrl: null,
    requiresAction: false,
    isRead: false,
    createdAt: new Date(),
    ...over,
  }
}

function mountItem(notif: RawNotification) {
  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  return mountWithUi(NotificationItem, {
    props: { notif },
    global: { plugins: [i18n] },
  })
}

describe('NotificationItem', () => {
  it('renders the notification from its key rather than the server text', () => {
    const wrapper = mountItem(makeNotif())
    expect(wrapper.text()).toContain('Toto vous a ajouté dans un match 1v1')
    expect(wrapper.text()).toContain('Adversaires : Titi')
    expect(wrapper.text()).not.toContain('server title')
  })

  it('renders player names as text, never as markup', () => {
    const wrapper = mountItem(
      makeNotif({
        translationParams: {
          ...makeNotif().translationParams,
          creatorName: '<img src=x onerror=alert(1)>',
        },
      }),
    )

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  })

  it('falls back to the server-rendered text for an unknown key', () => {
    const wrapper = mountItem(makeNotif({ titleKey: 'notifications.UNKNOWN_KEY_TITLE' }))
    expect(wrapper.text()).toContain('server title')
  })

  it('holds the delete affordance back while the action is still owed', () => {
    const wrapper = mountItem(makeNotif({ requiresAction: true }))

    expect(wrapper.text()).toContain('Action')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('draws the card with the icon and accent of its type', () => {
    const wrapper = mountItem(makeNotif({ type: 'BADGE_AWARDED' }))

    expect(wrapper.find('.notif-avatar i').classes()).toContain('fa-medal')
  })

  it('marks an unread notification with a dot, a read one without', () => {
    expect(mountItem(makeNotif()).find('.notif-dot').exists()).toBe(true)
    expect(mountItem(makeNotif({ isRead: true })).find('.notif-dot').exists()).toBe(false)
  })

  it('hands it back once the action has been settled elsewhere', () => {
    const wrapper = mountItem(makeNotif({ requiresAction: true, actionResolved: true }))

    expect(wrapper.text()).not.toContain('Action')
    expect(wrapper.find('button').exists()).toBe(true)
  })
})
