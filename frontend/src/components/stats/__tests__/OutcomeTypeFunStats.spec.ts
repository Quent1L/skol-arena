import { describe, it, expect, vi, afterEach } from 'vitest'
import { RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import type {
  OutcomeTypeFunStat,
  OutcomeTypeLeader,
  OutcomeTypeLeaderboard,
} from '@skol-arena/shared'
import { mountWithPlugins } from '@/test-support/mount'
import InfoTooltip from '@/components/InfoTooltip.vue'
import OutcomeTypeFunStats from '../OutcomeTypeFunStats.vue'

// t() echoes the key, plus the interpolated value when there is one, so assertions can
// check both the wording used and the number fed to it.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { count?: number; pct?: number; name?: string }) => {
      if (!params) return key
      const value = params.count ?? params.pct ?? params.name
      return `${key}:${value}`
    },
  }),
}))

function leader(overrides: Partial<OutcomeTypeLeader> = {}): OutcomeTypeLeader {
  return {
    playerId: 'p1',
    displayName: 'Thomas',
    shortName: 'THO',
    count: 37,
    matchesPlayed: 40,
    ratePct: 92,
    sharePct: 53,
    rank: 1,
    tiedCount: 1,
    ...overrides,
  }
}

function board(
  leaders: OutcomeTypeLeader[],
  overrides: Partial<OutcomeTypeLeaderboard> = {},
): OutcomeTypeLeaderboard {
  return {
    leaders,
    omittedNames: [],
    omittedCount: 0,
    isFlat: false,
    isLowSample: false,
    ...overrides,
  }
}

function funStat(overrides: Partial<OutcomeTypeFunStat> = {}): OutcomeTypeFunStat {
  return {
    outcomeTypeId: 'ot1',
    outcomeTypeName: 'Normal end',
    totalMatches: 124,
    topWinnersByVolume: board([leader()]),
    topWinnersByRate: board([leader({ playerId: 'p2', displayName: 'Rémi', ratePct: 88 })]),
    topLosersByVolume: board([leader({ playerId: 'p3', displayName: 'Matéo', count: 21 })]),
    topLosersByRate: board([leader({ playerId: 'p4', displayName: 'Julien', ratePct: 64 })]),
    ...overrides,
  }
}

/** The rate column's tooltip — the volume column carries the first one. */
function rateTooltip(wrapper: ReturnType<typeof mountWithPlugins>) {
  return wrapper.findAllComponents(InfoTooltip)[1]!
}

/** Clicks a card's flip button and fast-forwards past the mid-flip content swap. */
async function flipCard(wrapper: VueWrapper, index = 0): Promise<void> {
  await wrapper.findAll('[data-test="outcome-type-side-toggle"]')[index]!.trigger('click')
  await vi.advanceTimersByTimeAsync(150)
}

describe('OutcomeTypeFunStats', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows volume and efficiency side by side for each outcome type', () => {
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [funStat()] } })

    const text = wrapper.text()
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.king:Normal end')
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.matchCount:124')
    // volume column: win count + share of total
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.winCount:37')
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.shareOfTotal:53')
    // efficiency column: rate + sample size
    expect(text).toContain('Rémi')
    expect(text).toContain('88 %')
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.matchCount:40')
  })

  it('the card’s button names the view it leads to', () => {
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [funStat()] } })

    expect(wrapper.find('[data-test="outcome-type-side-toggle"]').text()).toContain(
      'tournamentStatsTab.outcomeTypeFunStats.viewLosers',
    )
  })

  it('flips both columns of the card to the losers on click', async () => {
    vi.useFakeTimers()
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [funStat()] } })

    expect(wrapper.text()).toContain('Thomas')

    await flipCard(wrapper)

    const text = wrapper.text()
    expect(text).toContain('Matéo')
    expect(text).toContain('Julien')
    expect(text).not.toContain('Thomas')
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.lossCount:21')
    // the card title follows the side too
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.victim:Normal end')
    expect(text).not.toContain('tournamentStatsTab.outcomeTypeFunStats.king')
    // and the button now offers to flip back
    expect(wrapper.find('[data-test="outcome-type-side-toggle"]').text()).toContain(
      'tournamentStatsTab.outcomeTypeFunStats.viewWinners',
    )
  })

  it('only flips the clicked card, not the others', async () => {
    vi.useFakeTimers()
    const statA = funStat({ outcomeTypeId: 'ot1', outcomeTypeName: 'Normal end' })
    const statB = funStat({
      outcomeTypeId: 'ot2',
      outcomeTypeName: 'Critical end',
      topWinnersByVolume: board([leader({ playerId: 'p5', displayName: 'Sacha' })]),
    })
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [statA, statB] } })

    expect(wrapper.text()).toContain('Thomas')
    expect(wrapper.text()).toContain('Sacha')

    await flipCard(wrapper, 0)

    const text = wrapper.text()
    expect(text).toContain('Matéo') // first card switched to losers
    expect(text).not.toContain('Thomas')
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.victim:Normal end')
    // second card untouched, stays on winners
    expect(text).toContain('Sacha')
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.king:Critical end')
  })

  it('talks about vulnerability, not efficiency, on the losers’ side', async () => {
    vi.useFakeTimers()
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [funStat()] } })

    expect(wrapper.text()).toContain('tournamentStatsTab.outcomeTypeFunStats.efficiency')
    expect(rateTooltip(wrapper).props('text')).toBe(
      'tournamentStatsTab.outcomeTypeFunStats.efficiencyTooltip:3',
    )

    await flipCard(wrapper)

    const text = wrapper.text()
    expect(text).toContain('tournamentStatsTab.outcomeTypeFunStats.vulnerability')
    expect(text).not.toContain('tournamentStatsTab.outcomeTypeFunStats.efficiency')
    expect(rateTooltip(wrapper).props('text')).toBe(
      'tournamentStatsTab.outcomeTypeFunStats.vulnerabilityTooltip:3',
    )
  })

  it('flags a small sample and adapts the tooltip', () => {
    const stats = [
      funStat({
        topWinnersByRate: board([leader({ playerId: 'p2' })], { isLowSample: true }),
      }),
    ]
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats } })

    expect(wrapper.find('[data-test="low-sample-badge"]').text()).toContain(
      'tournamentStatsTab.lowSample:3',
    )
    expect(rateTooltip(wrapper).props('text')).toBe('tournamentStatsTab.lowSampleTooltip:3')
  })

  it('explains the weighting when the threshold is met', () => {
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [funStat()] } })

    expect(wrapper.find('[data-test="low-sample-badge"]').exists()).toBe(false)
    expect(rateTooltip(wrapper).props('text')).toBe(
      'tournamentStatsTab.outcomeTypeFunStats.efficiencyTooltip:3',
    )
  })

  it('also explains the volume column’s criterion', () => {
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, { props: { stats: [funStat()] } })

    expect(wrapper.findAllComponents(InfoTooltip)[0]!.props('text')).toBe(
      'tournamentStatsTab.outcomeTypeFunStats.volumeTooltip',
    )
  })

  it('shows an empty state when no rate can be computed', () => {
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, {
      props: {
        stats: [funStat({ topWinnersByVolume: board([]), topWinnersByRate: board([]) })],
      },
    })

    expect(wrapper.find('[data-test="volume-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rate-list"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('tournamentStatsTab.outcomeTypeFunStats.noRateData')
  })

  it('shows the rank, not the position in the list', () => {
    const tied = board([
      leader({ playerId: 'p1', displayName: 'Thomas', rank: 1, tiedCount: 2 }),
      leader({ playerId: 'p2', displayName: 'Rémi', rank: 1, tiedCount: 2 }),
      leader({ playerId: 'p3', displayName: 'Matéo', rank: 3, tiedCount: 1, count: 12 }),
    ])
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, {
      props: { stats: [funStat({ topWinnersByVolume: tied })] },
    })

    const badges = wrapper.find('[data-test="volume-list"]').findAll('span.rounded-full')
    expect(badges.map((b) => b.text())).toEqual(['1', '1', '3'])
    // The medal follows the rank, so both leaders wear the same one.
    expect(badges[0]!.classes()).toEqual(badges[1]!.classes())
  })

  it('flags once per group the players no criterion separates', () => {
    const tied = board([
      leader({ playerId: 'p1', rank: 1, tiedCount: 2 }),
      leader({ playerId: 'p2', displayName: 'Rémi', rank: 1, tiedCount: 2 }),
    ])
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, {
      props: { stats: [funStat({ topWinnersByVolume: tied })] },
    })

    const markers = wrapper.find('[data-test="volume-list"]').findAll('[data-test="ex-aequo"]')
    expect(markers).toHaveLength(1)
    expect(markers[0]!.text()).toContain('tournamentStatsTab.outcomeTypeFunStats.exAequo')
  })

  it('counts the ties left out by the cutoff', () => {
    const cut = board([leader()], { omittedCount: 4, omittedNames: ['A', 'B', 'C', 'D'] })
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, {
      props: { stats: [funStat({ topWinnersByVolume: cut })] },
    })

    expect(wrapper.find('[data-test="more-tied"]').text()).toBe(
      'tournamentStatsTab.outcomeTypeFunStats.moreTied:4',
    )
  })

  it('replaces the podium with an honor roll when nothing separates them', () => {
    const flat = board(
      [
        leader({ playerId: 'p1', rank: 1, tiedCount: 3 }),
        leader({ playerId: 'p2', displayName: 'Rémi', rank: 1, tiedCount: 3 }),
        leader({ playerId: 'p3', displayName: 'Matéo', rank: 1, tiedCount: 3 }),
      ],
      { isFlat: true },
    )
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, {
      props: { stats: [funStat({ topWinnersByVolume: flat })] },
    })

    const roll = wrapper.find('[data-test="honour-roll"]')
    expect(wrapper.find('[data-test="volume-list"]').exists()).toBe(false)
    expect(roll.text()).toContain('tournamentStatsTab.outcomeTypeFunStats.noRanking')
    expect(roll.text()).toContain('tournamentStatsTab.outcomeTypeFunStats.honourRollWinners:3')
    expect(roll.text()).toContain('Rémi')
  })

  it('links back to the player profile while keeping the tournament context', () => {
    const wrapper = mountWithPlugins(OutcomeTypeFunStats, {
      props: { stats: [funStat()], tournamentId: 't1' },
    })

    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      path: '/players/p1',
      query: { tournamentId: 't1' },
    })
  })
})
