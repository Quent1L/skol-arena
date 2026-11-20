import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import fr from '@/i18n/messages/fr.json'
import en from '@/i18n/messages/en.json'
import RecentFormBadges from '../RecentFormBadges.vue'

const mountWith = (locale: 'fr' | 'en', results: Array<'V' | 'D' | 'N'>) =>
  mount(RecentFormBadges, {
    props: { results },
    global: {
      plugins: [createI18n({ legacy: false, locale, fallbackLocale: 'fr', messages: { fr, en } })],
    },
  })

describe('RecentFormBadges', () => {
  it('renders one badge per result, in order', () => {
    const badges = mountWith('fr', ['V', 'D', 'N']).findAll('.w-4.h-4')
    expect(badges.map((b) => b.text())).toEqual(['V', 'D', 'N'])
  })

  // The props stay the domain codes V/D/N; only the letter on screen is translated.
  it('translates the letters, so an English page does not read V / D', () => {
    const badges = mountWith('en', ['V', 'D', 'N']).findAll('.w-4.h-4')
    expect(badges.map((b) => b.text())).toEqual(['W', 'L', 'D'])
  })

  it('color by result: V green, D red, N gray', () => {
    const badges = mountWith('fr', ['V', 'D', 'N']).findAll('.w-4.h-4')
    expect(badges[0].classes()).toContain('bg-green-600')
    expect(badges[1].classes()).toContain('bg-red-600')
    expect(badges[2].classes()).toContain('bg-gray-600')
  })

  it('no badge with no results', () => {
    expect(mountWith('fr', []).findAll('.w-4.h-4')).toHaveLength(0)
  })
})
