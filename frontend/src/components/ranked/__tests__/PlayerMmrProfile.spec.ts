import { describe, it, expect, vi } from 'vitest'
import { mountWithPlugins } from '@/test-support/mount'
import { makeTier, makePlayerMmr } from '@/test-support/factories'
import type { CareerPeak } from '@/composables/ranked/career'
import type { MmrChartPoint } from '@skol-arena/shared'
import PlayerMmrProfile from '../PlayerMmrProfile.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

const tiers = [
  makeTier({ id: 'bronze', level: 1, name: 'Bronze', minMmr: 700 }),
  makeTier({ id: 'legend', level: 2, name: 'Légende', minMmr: 1400 }),
]

function point(mmrBefore: number, mmrDelta: number, playedAt: string): MmrChartPoint {
  return {
    matchId: `m-${playedAt}`,
    mmrBefore,
    mmrAfter: mmrBefore + mmrDelta,
    mmrDelta,
    playedAt: new Date(playedAt),
  } as MmrChartPoint
}

// The chart, the relation lists and the badges each pull their own data; the tile
// under test needs none of it.
const stubs = {
  Chart: true,
  SelectButton: true,
  InfoTooltip: true,
  PlayerRelationStats: true,
  PlayerBadges: true,
  RecentFormSection: true,
  MatchOutcomeDistribution: true,
}

function mountProfile(props: Record<string, unknown> = {}) {
  return mountWithPlugins(PlayerMmrProfile, {
    props: {
      mmr: makePlayerMmr({ currentMmr: 1200, matchesPlayed: 10 }),
      tiers,
      ...props,
    },
    global: { stubs },
  })
}

function peakTile(wrapper: ReturnType<typeof mountProfile>) {
  return wrapper.find('[data-test="peak-tile"]')
}

describe('PlayerMmrProfile peak tile', () => {
  const history = [
    point(1000, 40, '2026-07-20T10:00:00Z'),
    point(1040, 60, '2026-07-21T10:00:00Z'),
    point(1100, -80, '2026-07-22T10:00:00Z'),
  ]

  it('falls back to the peak of the season being shown', () => {
    const wrapper = mountProfile({ history })

    expect(peakTile(wrapper).text().replace(/ | |\s/g, '')).toContain('1100')
    expect(wrapper.find('[data-test="peak-season"]').exists()).toBe(false)
  })

  it('prefers the all-time record when the caller resolved one', () => {
    const careerPeak: CareerPeak = {
      mmr: 1620,
      seasonId: 'old',
      seasonName: 'Saison 1',
      tier: tiers[1],
    }
    const wrapper = mountProfile({ history, careerPeak })

    expect(peakTile(wrapper).text().replace(/ | |\s/g, '')).toContain('1620')
  })

  it('names the season the record was set in', () => {
    const careerPeak: CareerPeak = {
      mmr: 1620,
      seasonId: 'old',
      seasonName: 'Saison 1',
      tier: tiers[1],
    }
    const wrapper = mountProfile({ history, careerPeak })

    const season = wrapper.find('[data-test="peak-season"]')
    expect(season.exists()).toBe(true)
    expect(season.attributes('title')).toBe('Saison 1')
  })

  it('shows the tier the record was worth in its own season, not today', () => {
    // 1620 sits in Bronze on the ladder passed as `tiers`; the record carries the
    // Légende it was worth on the ladder of the season that set it.
    const legendOfTheDay = makeTier({ id: 'old-legend', level: 2, name: 'Légende 2024', minMmr: 1500 })
    const wrapper = mountProfile({
      history,
      tiers: [makeTier({ id: 'only', level: 1, name: 'Bronze', minMmr: 700 })],
      careerPeak: { mmr: 1620, seasonId: 'old', seasonName: 'Saison 1', tier: legendOfTheDay },
    })

    expect(peakTile(wrapper).find('i[title]').attributes('title')).toBe('Légende 2024')
  })

  it('falls back to the current MMR when the season has no history yet', () => {
    const wrapper = mountProfile({ history: [] })

    expect(peakTile(wrapper).text().replace(/ | |\s/g, '')).toContain('1200')
  })

  it('shows a dash for a player who has never played', () => {
    const wrapper = mountProfile({
      mmr: makePlayerMmr({ currentMmr: 1000, matchesPlayed: 0 }),
      history: [],
    })

    expect(peakTile(wrapper).text()).toContain('—')
  })
})
