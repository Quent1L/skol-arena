import { describe, it, expect, vi } from 'vitest'
import { RouterLinkStub } from '@vue/test-utils'
import type { WinStreakEntry } from '@skol-arena/shared'
import { mountWithPlugins } from '@/test-support/mount'
import StreakLeadersCard from '../StreakLeadersCard.vue'

// t() echoes the key, plus the interpolated count when there is one, so assertions can
// check both the wording used and the number fed to it.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { count?: number }) => (params ? `${key}:${params.count}` : key),
  }),
}))

function entry(overrides: Partial<WinStreakEntry> = {}): WinStreakEntry {
  return {
    playerId: 'p1',
    displayName: 'Thomas',
    shortName: 'THO',
    currentStreak: 5,
    ...overrides,
  }
}

function entries(count: number): WinStreakEntry[] {
  return Array.from({ length: count }, (_, i) =>
    entry({ playerId: `p${i}`, displayName: `Player ${i}`, currentStreak: count - i }),
  )
}

function mountCard(items: WinStreakEntry[], props: Record<string, unknown> = {}) {
  return mountWithPlugins(StreakLeadersCard, {
    props: {
      title: 'Win streaks',
      icon: 'fa fa-fire',
      variant: 'orange' as const,
      entries: items,
      unitLabel: 'consecutive wins',
      tooltip: 'what counts as a streak',
      ...props,
    },
  })
}

describe('StreakLeadersCard', () => {
  it('collapses to the first three entries and offers to expand the rest', () => {
    const wrapper = mountCard(entries(5))

    const rows = wrapper.findAll('[data-test="stat-leader-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('Player 0')
    expect(wrapper.text()).not.toContain('Player 3')

    const button = wrapper.get('[data-test="toggle-entries"]')
    expect(button.text()).toContain('common.showMore:2')
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('reveals every entry once expanded, and collapses back', async () => {
    const wrapper = mountCard(entries(5))

    await wrapper.get('[data-test="toggle-entries"]').trigger('click')

    expect(wrapper.findAll('[data-test="stat-leader-row"]')).toHaveLength(5)
    expect(wrapper.text()).toContain('Player 4')
    const button = wrapper.get('[data-test="toggle-entries"]')
    expect(button.text()).toContain('common.showLess')
    expect(button.attributes('aria-expanded')).toBe('true')

    await button.trigger('click')
    expect(wrapper.findAll('[data-test="stat-leader-row"]')).toHaveLength(3)
  })

  it('hides the toggle when nothing is left to reveal', () => {
    const wrapper = mountCard(entries(3))

    expect(wrapper.findAll('[data-test="stat-leader-row"]')).toHaveLength(3)
    expect(wrapper.find('[data-test="toggle-entries"]').exists()).toBe(false)
  })

  it('honours a custom collapsed count', () => {
    const wrapper = mountCard(entries(5), { collapsedCount: 1 })

    expect(wrapper.findAll('[data-test="stat-leader-row"]')).toHaveLength(1)
    expect(wrapper.get('[data-test="toggle-entries"]').text()).toContain('common.showMore:4')
  })

  it('applies the variant colours to the bar and to the streak value', () => {
    const wrapper = mountCard(entries(2), { variant: 'blue' })

    expect(wrapper.html()).toContain('bg-blue-500')
    expect(wrapper.html()).toContain('text-blue-600')
  })

  it('draws each bar relative to the longest streak of the card', () => {
    const wrapper = mountCard([entry({ currentStreak: 8 }), entry({ playerId: 'p2', currentStreak: 2 })])

    const bars = wrapper.findAll('[data-test="stat-leader-row"] .h-full')
    expect(bars[0].attributes('style')).toContain('width: 100%')
    expect(bars[1].attributes('style')).toContain('width: 25%')
  })

  it('links each streak holder to their profile', () => {
    const wrapper = mountCard([entry()], { tournamentId: 't1' })

    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      path: '/players/p1',
      query: { tournamentId: 't1' },
    })
  })

  it('renders the streak value and its unit label', () => {
    const wrapper = mountCard([entry({ currentStreak: 7 })])

    const row = wrapper.get('[data-test="stat-leader-row"]')
    expect(row.text()).toContain('Thomas')
    expect(row.text()).toContain('7')
    expect(row.text()).toContain('consecutive wins')
  })
})
