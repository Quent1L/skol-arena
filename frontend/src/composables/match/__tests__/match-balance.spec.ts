import { describe, it, expect } from 'vitest'
import type { MatchSideInput } from '@skol-arena/shared/types/index'

import {
  computeMatchBalance,
  getBalanceVerdict,
  toPercents,
  type PlayerStandings,
} from '../match-balance'

function standings(entries: Record<string, number>, placement: string[] = []): PlayerStandings {
  return Object.fromEntries(
    Object.entries(entries).map(([id, mmr]) => [id, { mmr, isPlacement: placement.includes(id) }]),
  )
}

const sides = (a: string[], b: string[]): MatchSideInput[] => [
  { position: 1, playerIds: a },
  { position: 2, playerIds: b },
]

describe('computeMatchBalance', () => {
  it('splits evenly when both sides average the same MMR', () => {
    const balance = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1000, b: 1000 }))

    expect(balance).not.toBeNull()
    expect(balance!.probA).toBeCloseTo(0.5, 10)
    expect(balance!.probB).toBeCloseTo(0.5, 10)
    expect(balance!.avgA).toBe(1000)
    expect(balance!.avgB).toBe(1000)
  })

  it('gives the Elo odds for a 400-point gap', () => {
    const balance = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1400, b: 1000 }))

    expect(balance!.probA).toBeCloseTo(10 / 11, 6)
    expect(balance!.probB).toBeCloseTo(1 / 11, 6)
  })

  it('averages a team side before comparing', () => {
    const balance = computeMatchBalance(
      sides(['a', 'b'], ['c', 'd']),
      standings({ a: 1200, b: 800, c: 1000, d: 1000 }),
    )

    expect(balance!.avgA).toBe(1000)
    expect(balance!.probA).toBeCloseTo(0.5, 10)
  })

  it('flags a line-up holding a player still in placement', () => {
    const balance = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1000, b: 1000 }, ['b']))

    expect(balance!.hasProvisional).toBe(true)
  })

  it('returns null without a snapshot, with an empty side, or with a missing player', () => {
    expect(computeMatchBalance(sides(['a'], ['b']), null)).toBeNull()
    expect(computeMatchBalance(sides(['a'], []), standings({ a: 1000 }))).toBeNull()
    expect(computeMatchBalance(sides(['a'], ['b']), standings({ a: 1000 }))).toBeNull()
  })
})

describe('toPercents', () => {
  it('poses side B as the complement so the two always total 100', () => {
    const balance = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1004, b: 1000 }))!
    const percents = toPercents(balance)

    expect(percents.a + percents.b).toBe(100)
  })
})

describe('getBalanceVerdict', () => {
  it('reads the same thresholds as the ranked match label', () => {
    const even = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1000, b: 1000 }))!
    const favoriteA = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1400, b: 1000 }))!
    const favoriteB = computeMatchBalance(sides(['a'], ['b']), standings({ a: 1000, b: 1400 }))!

    expect(getBalanceVerdict(even)).toBe('even')
    expect(getBalanceVerdict(favoriteA)).toBe('favoriteA')
    expect(getBalanceVerdict(favoriteB)).toBe('favoriteB')
  })
})
