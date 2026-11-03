import { describe, it, expect, vi } from 'vitest'
import type { ClientRankTier, MmrChartPoint } from '@skol-arena/shared'
import { makeTier, makePlayerMmr } from '@/test-support/factories'
import {
  getSubRank,
  getLp,
  isTopTier,
  getNextTier,
  getPrevTier,
  getMatchLabel,
  getTierForMmr,
  getPeakMmr,
  sortBySeasonMetric,
  splitByPlacement,
  getWeeklyMmrGain,
  getCurrentWeekStart,
  useRankedService,
  MMR_FLOOR,
} from '../ranked.service'

vi.mock('../ranked.api', () => ({ rankedApi: {} }))
vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key } },
}))

function tiers(...defs: Array<Partial<ClientRankTier>>): ClientRankTier[] {
  return defs.map((d) => makeTier(d))
}

describe('getNextTier / getPrevTier', () => {
  it('immediate neighbors on contiguous levels', () => {
    const all = tiers({ level: 1 }, { level: 2 }, { level: 3 })
    expect(getNextTier(all[1], all)?.level).toBe(3)
    expect(getPrevTier(all[1], all)?.level).toBe(1)
  })

  it('skips numbering gaps (1, 2, 4)', () => {
    const all = tiers({ level: 1 }, { level: 2 }, { level: 4 })
    expect(getNextTier(all[1], all)?.level).toBe(4)
    expect(getPrevTier(all[2], all)?.level).toBe(2)
  })

  it('null at the extremities', () => {
    const all = tiers({ level: 1 }, { level: 4 })
    expect(getNextTier(all[1], all)).toBeNull()
    expect(getPrevTier(all[0], all)).toBeNull()
  })

  it('does not depend on the order of the given array', () => {
    const all = tiers({ level: 4 }, { level: 1 }, { level: 2 })
    const tier = all.find((t) => t.level === 2)!
    expect(getNextTier(tier, all)?.level).toBe(4)
    expect(getPrevTier(tier, all)?.level).toBe(1)
  })
})

describe('getSubRank', () => {
  it('null when the tier has no sub-ranks (subRanks <= 1)', () => {
    const [tier] = tiers({ level: 1, minMmr: 1000, subRanks: 1 })
    expect(getSubRank(1100, tier, [tier])).toBeNull()
  })

  it('splits the range to the next tier into descending sub-ranks', () => {
    const all = tiers(
      { level: 1, minMmr: 1000, subRanks: 4 },
      { level: 2, minMmr: 1200, subRanks: 1 },
    )
    const tier = all[0]
    // range 1000→1200, sub-range of 50
    expect(getSubRank(1000, tier, all)).toBe(4)
    expect(getSubRank(1049, tier, all)).toBe(4)
    expect(getSubRank(1050, tier, all)).toBe(3)
    expect(getSubRank(1150, tier, all)).toBe(1)
    expect(getSubRank(1199, tier, all)).toBe(1)
  })

  it('clamps to 1 when the MMR exceeds the top of the range', () => {
    const all = tiers(
      { level: 1, minMmr: 1000, subRanks: 4 },
      { level: 2, minMmr: 1200, subRanks: 1 },
    )
    expect(getSubRank(1250, all[0], all)).toBe(1)
  })

  it('clamps to the max when the MMR is under the bottom of the range', () => {
    const all = tiers(
      { level: 1, minMmr: 1000, subRanks: 4 },
      { level: 2, minMmr: 1200, subRanks: 1 },
    )
    expect(getSubRank(900, all[0], all)).toBe(4)
  })

  it('top tier: the range is derived from the gap with the previous tier', () => {
    const all = tiers(
      { level: 1, minMmr: 800, subRanks: 1 },
      { level: 2, minMmr: 1000, subRanks: 4 },
    )
    // rangeTop = 1000 + (1000 - 800) = 1200, sub-range of 50
    expect(getSubRank(1050, all[1], all)).toBe(3)
  })

  it('single tier: default range of 1000', () => {
    const all = tiers({ level: 1, minMmr: 1000, subRanks: 2 })
    // rangeTop = 2000, sub-range of 500
    expect(getSubRank(1100, all[0], all)).toBe(2)
    expect(getSubRank(1600, all[0], all)).toBe(1)
  })
})

describe('getLp', () => {
  it('0 below the MMR floor', () => {
    expect(getLp(MMR_FLOOR - 50, makeTier({ minMmr: 600 }))).toBe(0)
  })

  it('gap above the tier’s minMmr', () => {
    expect(getLp(1250, makeTier({ minMmr: 1200 }))).toBe(50)
  })

  it('never negative when the MMR is below the tier’s minMmr', () => {
    expect(getLp(1100, makeTier({ minMmr: 1200 }))).toBe(0)
  })
})

describe('isTopTier', () => {
  it('true when no tier above', () => {
    const all = tiers({ level: 1 }, { level: 2 })
    expect(isTopTier(all[1], all)).toBe(true)
  })

  it('false when a higher tier exists', () => {
    const all = tiers({ level: 1 }, { level: 2 })
    expect(isTopTier(all[0], all)).toBe(false)
  })
})

describe('getMatchLabel', () => {
  it('rookieProtection: MMR < 900 against an opponent at +100', () => {
    expect(getMatchLabel(850, 1000, 5)).toBe('rankedService.matchLabel.rookieProtection')
  })

  it('exploit: win as a big underdog (E < 0.35)', () => {
    // E = 1/(1+10^(200/400)) ≈ 0.24
    expect(getMatchLabel(1000, 1200, 10)).toBe('rankedService.matchLabel.exploit')
  })

  it('no exploit when the delta is negative', () => {
    expect(getMatchLabel(1000, 1200, -10)).toBeNull()
  })

  it('favorite: big favorite (E > 0.65) regardless of the delta', () => {
    // E = 1/(1+10^(-200/400)) ≈ 0.76
    expect(getMatchLabel(1200, 1000, -5)).toBe('rankedService.matchLabel.favorite')
  })

  it('null for an even match', () => {
    expect(getMatchLabel(1000, 1000, -5)).toBeNull()
  })
})

function point(mmrBefore: number, mmrDelta: number, playedAt: string): MmrChartPoint {
  return { mmrBefore, mmrAfter: mmrBefore + mmrDelta, mmrDelta, playedAt: new Date(playedAt) }
}

describe('getTierForMmr', () => {
  it('null with no tiers', () => {
    expect(getTierForMmr(1000, [])).toBeNull()
  })

  it('returns the highest tier whose minMmr is reached', () => {
    const all = tiers(
      { level: 1, minMmr: 700, name: 'Bronze' },
      { level: 2, minMmr: 1100, name: 'Gold' },
      { level: 3, minMmr: 1500, name: 'Diamond' },
    )
    expect(getTierForMmr(1200, all)?.name).toBe('Gold')
    expect(getTierForMmr(1500, all)?.name).toBe('Diamond')
  })

  it('falls back to the first tier when the MMR is under every threshold', () => {
    const all = tiers({ level: 1, minMmr: 700, name: 'Bronze' }, { level: 2, minMmr: 1100 })
    expect(getTierForMmr(500, all)?.name).toBe('Bronze')
  })
})

describe('getPeakMmr', () => {
  it('null with no history', () => {
    expect(getPeakMmr([])).toBeNull()
  })

  it('retains the highest mmrAfter, even if the player has since dropped', () => {
    const history = [
      point(1000, 40, '2026-07-20T10:00:00Z'),
      point(1040, 60, '2026-07-21T10:00:00Z'),
      point(1100, -80, '2026-07-22T10:00:00Z'),
    ]
    expect(getPeakMmr(history)).toBe(1100)
  })

  it('falls back to the starting MMR when the player has only lost', () => {
    const history = [
      point(1000, -20, '2026-07-20T10:00:00Z'),
      point(980, -30, '2026-07-21T10:00:00Z'),
    ]
    expect(getPeakMmr(history)).toBe(1000)
  })
})

describe('sortBySeasonMetric', () => {
  const seasonPlayer = (id: string, peakMmr: number, avgMmr: number) =>
    ({ ...makePlayerMmr({ player: { id, displayName: id, shortName: id } }), peakMmr, avgMmr })

  const players = [
    seasonPlayer('a', 1200, 1400),
    seasonPlayer('b', 1500, 1100),
    seasonPlayer('c', 1300, 1250),
  ]

  it('sorts by peak, descending', () => {
    expect(sortBySeasonMetric(players, 'peak').map((p) => p.player?.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by average, descending', () => {
    expect(sortBySeasonMetric(players, 'average').map((p) => p.player?.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not mutate the received array', () => {
    sortBySeasonMetric(players, 'peak')
    expect(players.map((p) => p.player?.id)).toEqual(['a', 'b', 'c'])
  })

  it('tolerates an empty list', () => {
    expect(sortBySeasonMetric([], 'peak')).toEqual([])
  })
})

describe('splitByPlacement', () => {
  const player = (id: string, matchesPlayed: number) =>
    makePlayerMmr({ matchesPlayed, player: { id, displayName: id, shortName: id } })

  const players = [player('a', 10), player('b', 4), player('c', 5), player('d', 0)]

  it('separates players who finished placement from the others', () => {
    const { placed, inPlacement } = splitByPlacement(players, 5)
    expect(placed.map((p) => p.player?.id)).toEqual(['a', 'c'])
    expect(inPlacement.map((p) => p.player?.id)).toEqual(['b', 'd'])
  })

  it('preserves the received order within each group', () => {
    const { placed } = splitByPlacement([player('z', 9), player('y', 8)], 5)
    expect(placed.map((p) => p.player?.id)).toEqual(['z', 'y'])
  })

  it('with no placement matches, everyone is ranked', () => {
    const { placed, inPlacement } = splitByPlacement(players, 0)
    expect(placed).toHaveLength(4)
    expect(inPlacement).toEqual([])
  })

  it('tolerates an empty list', () => {
    expect(splitByPlacement([], 5)).toEqual({ placed: [], inPlacement: [], inactive: [] })
  })

  it('sets players who left apart, whatever their placement progress', () => {
    const gone = (id: string, matchesPlayed: number) => ({ ...player(id, matchesPlayed), inactive: true })
    const { placed, inPlacement, inactive } = splitByPlacement(
      [player('a', 10), gone('x', 10), player('b', 1), gone('y', 1)],
      5,
    )
    expect(placed.map((p) => p.player?.id)).toEqual(['a'])
    expect(inPlacement.map((p) => p.player?.id)).toEqual(['b'])
    expect(inactive.map((p) => p.player?.id)).toEqual(['x', 'y'])
  })
})

describe('getWeeklyMmrGain', () => {
  const weekStart = new Date('2026-07-27T00:00:00Z')

  it('ignores matches before the start of the week', () => {
    const history = [
      point(1000, 50, '2026-07-26T23:59:00Z'),
      point(1050, 20, '2026-07-27T09:00:00Z'),
      point(1070, -5, '2026-07-30T09:00:00Z'),
    ]
    expect(getWeeklyMmrGain(history, weekStart)).toEqual({ mmrGained: 15, matchesPlayed: 2 })
  })

  it('returns 0 matches when the player hasn’t played this week', () => {
    const history = [point(1000, 50, '2026-07-20T10:00:00Z')]
    expect(getWeeklyMmrGain(history, weekStart)).toEqual({ mmrGained: 0, matchesPlayed: 0 })
  })

  it('includes the match played right at the start of the week', () => {
    const history = [point(1000, 12, '2026-07-27T00:00:00Z')]
    expect(getWeeklyMmrGain(history, weekStart)).toEqual({ mmrGained: 12, matchesPlayed: 1 })
  })
})

describe('getCurrentWeekStart', () => {
  it('returns Monday 00:00 local of the current week', () => {
    // Thursday 07/30/2026
    const start = getCurrentWeekStart(new Date(2026, 6, 30, 14, 22))
    expect(start.getDay()).toBe(1)
    expect(start.getDate()).toBe(27)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  it('attaches Sunday to the week that just ended', () => {
    const start = getCurrentWeekStart(new Date(2026, 7, 2, 23, 59))
    expect(start.getDate()).toBe(27)
    expect(start.getMonth()).toBe(6)
  })
})

describe('useRankedService().getRank', () => {
  const { getRank } = useRankedService()

  it('null with no tiers', () => {
    expect(getRank(1000, [])).toBeNull()
  })

  it('returns the highest tier whose minMmr is reached', () => {
    const all = tiers(
      { level: 1, minMmr: 700, name: 'Bronze' },
      { level: 2, minMmr: 1100, name: 'Gold' },
      { level: 3, minMmr: 1500, name: 'Diamond' },
    )
    expect(getRank(1200, all)?.name).toBe('Gold')
    expect(getRank(1500, all)?.name).toBe('Diamond')
  })

  it('falls back to the first tier when the MMR is under every threshold', () => {
    const all = tiers({ level: 1, minMmr: 700, name: 'Bronze' }, { level: 2, minMmr: 1100 })
    expect(getRank(500, all)?.name).toBe('Bronze')
  })
})
