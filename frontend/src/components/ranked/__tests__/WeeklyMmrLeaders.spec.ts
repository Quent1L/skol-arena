import { describe, it, expect, vi } from 'vitest'
import { RouterLinkStub } from '@vue/test-utils'
import type { WeeklyMmrLeader } from '@skol-arena/shared'
import { mountWithPlugins } from '@/test-support/mount'
import WeeklyMmrLeaders from '../WeeklyMmrLeaders.vue'

// t() echoes the key, plus the interpolated count when there is one, so assertions can
// check both the wording used and the number fed to it.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, count?: number) => (count === undefined ? key : `${key}:${count}`),
  }),
}))

function leader(overrides: Partial<WeeklyMmrLeader> = {}): WeeklyMmrLeader {
  return {
    playerId: 'p1',
    displayName: 'Thomas',
    shortName: 'THO',
    mmrGained: 42,
    matchesPlayed: 5,
    ...overrides,
  }
}

function mountCard(props: {
  gainers?: WeeklyMmrLeader[]
  losers?: WeeklyMmrLeader[]
  tournamentId?: string | null
}) {
  return mountWithPlugins(WeeklyMmrLeaders, {
    props: { gainers: [], losers: [], ...props },
  })
}

describe('WeeklyMmrLeaders', () => {
  it('sorts gains in the received order and prefixes the delta with a +', () => {
    const wrapper = mountCard({
      gainers: [
        leader({ playerId: 'a', displayName: 'Alice', mmrGained: 60 }),
        leader({ playerId: 'b', displayName: 'Bob', mmrGained: 25 }),
      ],
    })
    const text = wrapper.find('[data-test="gainers-list"]').text()
    expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Bob'))
    expect(text).toContain('+60')
    expect(text).toContain('+25')
  })

  it('shows losses with their negative sign, no + added', () => {
    const wrapper = mountCard({
      losers: [leader({ playerId: 'c', displayName: 'Chloe', mmrGained: -33 })],
    })
    const text = wrapper.find('[data-test="losers-list"]').text()
    expect(text).toContain('-33')
    expect(text).not.toContain('+')
  })

  it('shows the number of matches played this week', () => {
    const wrapper = mountCard({ gainers: [leader({ matchesPlayed: 7 })] })
    expect(wrapper.find('[data-test="gainers-list"]').text()).toContain(
      'tournamentStatsTab.weeklyMmr.matchCount:7',
    )
  })

  it('replaces an empty column with the dedicated message', () => {
    const wrapper = mountCard({ gainers: [leader()] })
    expect(wrapper.find('[data-test="losers-list"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('tournamentStatsTab.weeklyMmr.empty')
  })

  it('points to the player profile while keeping the tournament context', () => {
    const wrapper = mountCard({
      gainers: [leader({ playerId: 'p9' })],
      tournamentId: 't1',
    })
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ path: '/players/p9', query: { tournamentId: 't1' } })
  })

  it('sizes the bars relative to the column leader', () => {
    const wrapper = mountCard({
      gainers: [
        leader({ playerId: 'a', mmrGained: 80 }),
        leader({ playerId: 'b', mmrGained: 20 }),
      ],
    })
    const bars = wrapper.find('[data-test="gainers-list"]').findAll('.rounded-full .rounded-full')
    expect(bars[0].attributes('style')).toContain('width: 100%')
    expect(bars[1].attributes('style')).toContain('width: 25%')
  })
})
