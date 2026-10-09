import { describe, it, expect, vi } from 'vitest'
import type { PlayerRelationStat } from '@skol-arena/shared'
import { mountWithPlugins } from '@/test-support/mount'
import InfoTooltip from '@/components/InfoTooltip.vue'
import PlayerRelationStats from '../PlayerRelationStats.vue'

// t() echoes the key, plus the interpolated count when there is one, so assertions can
// check both the wording used and the number fed to it.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { count: number }) => (params ? `${key}:${params.count}` : key),
  }),
}))

function relation(overrides: Partial<PlayerRelationStat> = {}): PlayerRelationStat {
  return {
    playerId: 'p1',
    displayName: 'Thomas',
    shortName: 'THO',
    count: 28,
    wins: 23,
    losses: 5,
    winRate: 82,
    chemistryDelta: 12,
    ...overrides,
  }
}

describe('PlayerRelationStats', () => {
  it('shows the win rate and match count of the best partner', () => {
    const wrapper = mountWithPlugins(PlayerRelationStats, {
      props: { bestPartners: [relation()] },
    })

    const text = wrapper.text()
    expect(text).toContain('Thomas')
    expect(text).toContain('82playerRelationStats.winRateSuffix')
    expect(text).toContain('playerRelationStats.matchCount:28')
    expect(text).toContain('+12%')
  })

  it('shows the win rate and matchup count of the nemesis', () => {
    const wrapper = mountWithPlugins(PlayerRelationStats, {
      props: {
        nemeses: [
          relation({ playerId: 'p2', displayName: 'Alice', count: 22, wins: 4, losses: 18, winRate: 18, chemistryDelta: undefined }),
        ],
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Alice')
    expect(text).toContain('18playerRelationStats.winRateSuffix')
    expect(text).toContain('playerRelationStats.confrontationCount:22')
  })

  it('explains the calculation via a tooltip on each weighted card', () => {
    const wrapper = mountWithPlugins(PlayerRelationStats, {
      props: { bestPartners: [relation()], nemeses: [relation({ playerId: 'p2' })] },
    })

    const tooltips = wrapper.findAllComponents(InfoTooltip)
    expect(tooltips.map((c) => c.props('text'))).toEqual([
      'playerRelationStats.bestPartnersTooltip:3',
      'playerRelationStats.toughOpponentsTooltip:3',
    ])
  })

  it('hides the cards when no relation reaches the threshold', () => {
    const wrapper = mountWithPlugins(PlayerRelationStats, {
      props: { mostFrequentPartners: [], bestPartners: [], nemeses: [] },
    })

    expect(wrapper.find('div').exists()).toBe(false)
  })
})
