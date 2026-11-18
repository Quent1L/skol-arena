import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type {
  PlayerRewindPayload,
  RewindBundle,
  SeasonRewindPayload,
} from '@skol-arena/shared/types/index'
import { buildRewindCards, daysUntil, groupArchiveByDiscipline } from '../rewind.service'
import { useRewindDeck } from '../useRewindDeck'

function seasonPayload(overrides: Partial<SeasonRewindPayload> = {}): SeasonRewindPayload {
  return {
    version: 1,
    season: {
      seasonId: 's1',
      name: 'Winter Cup',
      disciplineName: 'Babyfoot',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      allowDraw: true,
    },
    totals: { playerCount: 12, matchCount: 240, averageMmr: 1000 },
    performance: { king: null, peakMmr: null, progression: null, sniper: null },
    combat: {
      biggestUpset: null,
      giantKiller: null,
      leaderHunter: null,
      rivalry: null,
      nemesis: null,
    },
    endurance: {
      marathon: null,
      topOneKing: null,
      topThreeKing: null,
      topFiveKing: null,
      longestStreak: null,
    },
    cooperation: { duo: null, bestPartner: null },
    ...overrides,
  }
}

const player = { playerId: 'p1', displayName: 'Alice', shortName: 'ALI' }

function playerPayload(overrides: Partial<PlayerRewindPayload> = {}): PlayerRewindPayload {
  return {
    version: 1,
    player,
    finalRank: {
      rank: 2,
      totalPlayers: 12,
      mmr: 1200,
      tier: { name: 'Expert', level: 4, iconClass: null },
    },
    totals: { matchesPlayed: 40, wins: 25, losses: 14, draws: 1, winRate: 63 },
    journey: {
      initialMmr: 1000,
      finalMmr: 1200,
      netDelta: 200,
      points: [
        { mmrBefore: 1000, mmrAfter: 1050, mmrDelta: 50, outcome: 'win', playedAt: new Date() },
        { mmrBefore: 1050, mmrAfter: 1200, mmrDelta: 150, outcome: 'win', playedAt: new Date() },
      ],
    },
    bestRank: { bestRank: 1, matchesInTop1: 5, matchesInTop3: 20, matchesInTop5: 30 },
    peak: {
      mmr: 1250,
      matchId: 'm9',
      playedAt: new Date(),
      tier: { name: 'Expert', level: 4, iconClass: null },
    },
    streaks: {
      bestWinStreak: 6,
      bestWinStreakMmr: 132,
      bestUnbeatenStreak: 8,
      worstLossStreak: 3,
      worstLossStreakMmr: -58,
    },
    feats: {
      bestMmrGain: null,
      biggestUpsetGap: null,
      giantKillerWins: 0,
      bestPartner: null,
      mostFacedOpponent: null,
      nemesis: null,
    },
    badges: [],
    percentiles: {
      matchesPlayed: { topPercent: 20, rank: 3, poolSize: 12 },
      winRate: { topPercent: 10, rank: 1, poolSize: 8 },
      progression: { topPercent: 15, rank: 2, poolSize: 8 },
      winStreak: { topPercent: 25, rank: 2, poolSize: 8 },
    },
    conclusion: { nextSeason: null },
    awardsWon: [],
    ...overrides,
  }
}

function bundleOf(overrides: Partial<RewindBundle> = {}): RewindBundle {
  return { season: seasonPayload(), player: playerPayload(), ...overrides }
}

function mountDeck(bundle: Ref<RewindBundle | null>, handlers = {}) {
  let api!: ReturnType<typeof useRewindDeck>
  const Host = defineComponent({
    setup() {
      api = useRewindDeck(bundle, handlers)
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { api, wrapper }
}

describe('buildRewindCards', () => {
  it('drops award cards when the season handed out nothing', () => {
    const cards = buildRewindCards(bundleOf())
    expect(cards).not.toContain('awardsPerformance')
    expect(cards).not.toContain('awardsCombat')
  })

  it('keeps an award card as soon as one award in the group exists', () => {
    const season = seasonPayload({
      endurance: {
        marathon: { player, value: 247, detail: 247 },
        topOneKing: null,
        topThreeKing: null,
        topFiveKing: null,
        longestStreak: null,
      },
    })

    expect(buildRewindCards(bundleOf({ season }))).toContain('awardsEndurance')
  })

  it('shows the votes card only for a season that ran votes', () => {
    expect(buildRewindCards(bundleOf())).not.toContain('awardsVotes')

    const votes = {
      fairPlayPrize: { player, value: 92, detail: 12 },
      fairPlayPodium: [{ player, value: 92, detail: 12 }],
      teamCarrier: null,
      mostInvolved: null,
      kindest: null,
      strictestJudge: null,
      topSupporter: null,
      fairPlayWorst: null,
      totals: { votes: 12, positiveRate: 92, topTag: null },
    }
    expect(buildRewindCards(bundleOf({ season: seasonPayload({ votes }) }))).toContain('awardsVotes')
  })

  it('hides the badges card when the player earned none', () => {
    expect(buildRewindCards(bundleOf())).not.toContain('badges')

    const withBadge = playerPayload({
      badges: [
        {
          id: 'b1',
          playerId: 'p1',
          ruleId: 'r1',
          icon: 'fa fa-medal',
          label: 'First blood',
          description: '',
          awardedAt: new Date(),
          matchId: 'm1',
        },
      ],
    })
    expect(buildRewindCards(bundleOf({ player: withBadge }))).toContain('badges')
  })

  it('hides the peak card when the player never climbed above their start', () => {
    const flat = playerPayload({
      peak: { mmr: 1000, matchId: null, playedAt: null, tier: null },
    })
    expect(buildRewindCards(bundleOf({ player: flat }))).not.toContain('peak')
  })

  it('hides the journey card when there is nothing to draw', () => {
    const single = playerPayload({
      journey: { initialMmr: 1000, finalMmr: 1000, netDelta: 0, points: [] },
    })
    expect(buildRewindCards(bundleOf({ player: single }))).not.toContain('journey')
  })

  it('hides the feats card when no feat stands out', () => {
    expect(buildRewindCards(bundleOf())).not.toContain('feats')
  })

  it('keeps only season-wide cards when there is no player deck', () => {
    const season = seasonPayload({
      cooperation: { duo: null, bestPartner: { player, value: 3, detail: 40 } },
    })
    const cards = buildRewindCards({ season, player: null })

    expect(cards).toEqual(['intro', 'awardsCooperation', 'conclusion'])
  })

  it('keeps the canonical order', () => {
    const cards = buildRewindCards(bundleOf())
    expect(cards.indexOf('intro')).toBeLessThan(cards.indexOf('finalRank'))
    expect(cards.indexOf('finalRank')).toBeLessThan(cards.indexOf('totals'))
    expect(cards.at(-1)).toBe('conclusion')
  })

  // A stored rewind keeps the format it was generated in, so a deck watched
  // years ago must still be that deck — never today's cards fed with a payload
  // that predates them.
  it('shows every current card on a payload of the current version', () => {
    expect(buildRewindCards(bundleOf())).toContain('percentiles')
  })

  it('hides cards a stored payload is too old to feed', () => {
    // What a v1 payload looks like once the deck has moved on to v2.
    const bundle = bundleOf({
      season: seasonPayload({ version: 0 }),
      player: playerPayload({ version: 0 }),
    })

    expect(buildRewindCards(bundle)).toEqual([])
  })

  it('gates player cards and award cards on their own payload version', () => {
    const season = seasonPayload({
      version: 1,
      cooperation: { duo: null, bestPartner: { player, value: 3, detail: 40 } },
    })
    const cards = buildRewindCards({ season, player: playerPayload({ version: 0 }) })

    expect(cards).toContain('awardsCooperation')
    expect(cards).not.toContain('finalRank')
  })
})

describe('useRewindDeck', () => {
  it('starts on the first card', () => {
    const { api } = mountDeck(ref(bundleOf()))
    expect(api.index.value).toBe(0)
    expect(api.current.value).toBe('intro')
    expect(api.isFirst.value).toBe(true)
  })

  it('walks forward and back within bounds', async () => {
    const { api } = mountDeck(ref(bundleOf()))

    api.next()
    expect(api.index.value).toBe(1)

    // The cooldown guards against a double tap skipping two cards.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 1000)
    api.previous()
    expect(api.index.value).toBe(0)

    vi.setSystemTime(Date.now() + 1000)
    api.previous()
    expect(api.index.value).toBe(0)
    vi.useRealTimers()
  })

  it('swallows a second navigation fired within the cooldown', () => {
    const { api } = mountDeck(ref(bundleOf()))
    api.next()
    api.next()
    expect(api.index.value).toBe(1)
  })

  it('fires onComplete only once the last card is moved past', () => {
    const onComplete = vi.fn()
    const { api } = mountDeck(ref(bundleOf()), { onComplete })

    api.goTo(api.cards.value.length - 2)
    expect(onComplete).not.toHaveBeenCalled()

    // Landing on the conclusion is not watching it.
    api.next()
    expect(api.index.value).toBe(api.cards.value.length - 1)
    expect(onComplete).not.toHaveBeenCalled()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 1000)
    api.next()
    expect(onComplete).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not complete the deck on a jump straight to the last card', () => {
    const onComplete = vi.fn()
    const { api } = mountDeck(ref(bundleOf()), { onComplete })

    api.goTo(api.cards.value.length - 1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('ignores a jump outside the deck', () => {
    const { api } = mountDeck(ref(bundleOf()))
    api.goTo(-1)
    api.goTo(999)
    expect(api.index.value).toBe(0)
  })

  it('reports progress across the deck', () => {
    const { api } = mountDeck(ref(bundleOf()))
    expect(api.progress.value).toBeCloseTo(1 / api.cards.value.length)
  })

  it('exposes an empty deck when there is no bundle yet', () => {
    const { api } = mountDeck(ref(null))
    expect(api.cards.value).toEqual([])
    expect(api.current.value).toBeNull()
    expect(api.progress.value).toBe(0)
  })

  it('exits on Escape', () => {
    const onExit = vi.fn()
    mountDeck(ref(bundleOf()), { onExit })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onExit).toHaveBeenCalled()
  })

  it('advances with the right arrow key', () => {
    const { api } = mountDeck(ref(bundleOf()))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(api.index.value).toBe(1)
  })

  it('stops listening to the keyboard once unmounted', () => {
    const { api, wrapper } = mountDeck(ref(bundleOf()))
    wrapper.unmount()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(api.index.value).toBe(0)
  })
})

describe('daysUntil', () => {
  const now = new Date('2026-08-05T12:00:00Z')

  it('rounds a partial day up so the last day still counts', () => {
    expect(daysUntil(new Date('2026-08-06T06:00:00Z'), now)).toBe(1)
  })

  it('returns 0 once the window has closed', () => {
    expect(daysUntil(new Date('2026-08-04T12:00:00Z'), now)).toBe(0)
  })
})

describe('groupArchiveByDiscipline', () => {
  const entry = (seasonId: string, disciplineName: string | null) => ({
    seasonId,
    seasonName: seasonId,
    disciplineName,
    startDate: new Date(),
    endDate: new Date(),
    generatedAt: new Date(),
    viewedAt: null,
  })

  it('gathers seasons under their discipline, preserving order', () => {
    const groups = groupArchiveByDiscipline([
      entry('s1', 'Babyfoot'),
      entry('s2', 'Ping-pong'),
      entry('s3', 'Babyfoot'),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].discipline).toBe('Babyfoot')
    expect(groups[0].entries.map((e) => e.seasonId)).toEqual(['s1', 's3'])
  })

  it('keeps seasons without a discipline in their own group', () => {
    const groups = groupArchiveByDiscipline([entry('s1', null)])
    expect(groups[0].discipline).toBeNull()
  })
})
