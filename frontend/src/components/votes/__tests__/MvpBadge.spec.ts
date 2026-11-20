import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import fr from '@/i18n/messages/fr.json'
import { mountWithUi } from '@/test-support/mount'
import MvpBadge from '../MvpBadge.vue'

const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
const mountBadge = (iconOnly: boolean) =>
  mountWithUi(MvpBadge, { props: { iconOnly }, global: { plugins: [i18n] } })

describe('MvpBadge', () => {
  it('drops the label but keeps an accessible name in icon-only mode', () => {
    const badge = mountBadge(true).get('[data-testid="mvp-badge"]')
    expect(badge.text()).toBe('')
    expect(badge.attributes('aria-label')).toBe(fr.matchVotes.mvp.badgeTitle)
  })

  it('shows the MVP label otherwise', () => {
    expect(mountBadge(false).get('[data-testid="mvp-badge"]').text()).toBe('MVP')
  })
})
