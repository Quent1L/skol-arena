import { describe, it, expect } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

import fr from '@/i18n/messages/fr.json'
import en from '@/i18n/messages/en.json'
import { useNotificationText } from '../notification.i18n'
import type { RawNotification } from '../notification.api'

const ISO = '2026-06-01T15:00:00.000Z'

function makeNotif(overrides: Partial<RawNotification> = {}): RawNotification {
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
      matchDate: ISO,
      opponents: 'Titi',
      teammates: 'Tata',
    },
    actionUrl: null,
    requiresAction: false,
    isRead: false,
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Renders through a real component so useI18n resolves against the actual message
 * files — the point of the composable is that translations really apply.
 */
function render(notif: RawNotification, locale: 'fr' | 'en' = 'fr') {
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'fr',
    messages: { fr, en },
  })

  const Harness = defineComponent({
    setup() {
      return useNotificationText()
    },
    render: () => null,
  })

  const wrapper = mount(Harness, { global: { plugins: [i18n] } })
  return {
    title: wrapper.vm.renderTitle(notif),
    message: wrapper.vm.renderMessage(notif),
  }
}

describe('useNotificationText', () => {
  it('renders the notification from its key and params', () => {
    const { title, message } = render(makeNotif())
    expect(title).toBe('Toto vous a ajouté dans un match 1v1')
    expect(message).toContain('🏆 Coupe')
    expect(message).toContain('⚔️ Adversaires : Titi')
    expect(message).toContain('👥 Coéquipiers : Tata')
  })

  it('follows the locale selected in the app', () => {
    const { title, message } = render(makeNotif(), 'en')
    expect(title).toBe('Toto added you to a 1v1 match')
    expect(message).toContain('⚔️ Opponents: Titi')
  })

  it('formats an ISO matchDate in the device timezone', () => {
    // vitest.config pins TZ, so this asserts the instant is rendered locally, not raw
    const expected = new Intl.DateTimeFormat('fr', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ISO))

    expect(render(makeNotif()).message).toContain(`📅 ${expected}`)
  })

  it('accepts a matchDate already turned into a Date by the interceptor', () => {
    const notif = makeNotif({
      translationParams: { ...makeNotif().translationParams, matchDate: new Date(ISO) },
    })
    const expected = new Intl.DateTimeFormat('fr', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ISO))

    expect(render(notif).message).toContain(`📅 ${expected}`)
  })

  it('resolves a null matchDate to the localized placeholder', () => {
    const notif = makeNotif({
      translationParams: { ...makeNotif().translationParams, matchDate: null },
    })
    expect(render(notif).message).toContain('📅 À définir')
    expect(render(notif, 'en').message).toContain('📅 To be defined')
  })

  it('leaves a legacy pre-formatted matchDate untouched', () => {
    const notif = makeNotif({
      translationParams: { ...makeNotif().translationParams, matchDate: '18/07/2026 12:34' },
    })
    expect(render(notif).message).toContain('📅 18/07/2026 12:34')
  })

  it('does not reinterpret an ambiguous legacy date as MM/DD', () => {
    const notif = makeNotif({
      translationParams: { ...makeNotif().translationParams, matchDate: '05/06/2026 12:34' },
    })
    expect(render(notif).message).toContain('📅 05/06/2026 12:34')
  })

  it('resolves empty participant lists to localized placeholders', () => {
    const notif = makeNotif({
      translationParams: {
        ...makeNotif().translationParams,
        teammates: '',
        opponents: '',
        creatorName: null,
      },
    })
    const { title, message } = render(notif)
    expect(title).toBe('Un joueur vous a ajouté dans un match 1v1')
    expect(message).toContain('👥 Coéquipiers : Aucun')
    expect(message).toContain('⚔️ Adversaires : Joueur inconnu')
  })

  it('falls back to the server-rendered text when the key is unknown here', () => {
    const notif = makeNotif({
      titleKey: 'notifications.SOMETHING_NEW_TITLE',
      messageKey: 'notifications.SOMETHING_NEW_MESSAGE',
    })
    const { title, message } = render(notif)
    expect(title).toBe('server title')
    expect(message).toBe('server message')
  })

  it('falls back for notifications stored before the keys were exposed', () => {
    const notif = makeNotif({
      titleKey: undefined,
      messageKey: undefined,
      translationParams: undefined,
    })
    const { title, message } = render(notif)
    expect(title).toBe('server title')
    expect(message).toBe('server message')
  })
})
