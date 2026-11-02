import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import BadgeProgressBars from '../BadgeProgressBars.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('fr') }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

describe('BadgeProgressBars', () => {
  it('shows one line per counter', () => {
    const wrapper = mountWithUi(BadgeProgressBars, {
      props: {
        counters: [
          { current: 3, target: 10, window: 'season' },
          { current: 12, target: 10, window: 'season' },
        ],
      },
    })
    expect(wrapper.findAll('[data-test="counter"]')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('badgeProgress.allSeasons')
  })

  it('says when a counter spans every season', () => {
    const wrapper = mountWithUi(BadgeProgressBars, {
      props: { counters: [{ current: 3, target: 10, window: 'discipline' }] },
    })
    expect(wrapper.text()).toContain('badgeProgress.allSeasons')
  })
})
