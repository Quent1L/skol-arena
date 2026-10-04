import { describe, it, expect } from 'vitest'

import { balanceTeams, isOnlyFairSplit, shuffleTeams, type TeamSplit } from '../team-composition'
import type { PlayerStandings } from '../match-balance'

function standings(entries: Record<string, number>): PlayerStandings {
  return Object.fromEntries(
    Object.entries(entries).map(([id, mmr]) => [id, { mmr, isPlacement: false }]),
  )
}

/** Deterministic rng cycling through the given values. */
function seq(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

/** A line-up regardless of player order or which side is Team 1. */
const sorted = ([a, b]: TeamSplit) =>
  [[...a].sort(), [...b].sort()].sort((x, y) => x.join().localeCompare(y.join()))

describe('shuffleTeams', () => {
  it('keeps every player exactly once, larger side first on an odd roster', () => {
    const [a, b] = shuffleTeams(['p1', 'p2', 'p3', 'p4', 'p5'])

    expect(a).toHaveLength(3)
    expect(b).toHaveLength(2)
    expect([...a, ...b].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('is driven by the rng', () => {
    // rng always 0: each Fisher-Yates step swaps with index 0.
    expect(shuffleTeams(['a', 'b', 'c', 'd'], () => 0)).toEqual([
      ['b', 'c'],
      ['d', 'a'],
    ])
  })
})

describe('balanceTeams', () => {
  const ratings = standings({ a: 1600, b: 1400, c: 1550, d: 1450 })

  it('finds the fairest split', () => {
    const split = balanceTeams(['a', 'b', 'c', 'd'], ratings, undefined, () => 0)

    expect(sorted(split!)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('returns null when a player has no rating', () => {
    expect(balanceTeams(['a', 'b', 'x'], ratings)).toBeNull()
  })

  it('offers another fair split than the current one when there is one', () => {
    const even = standings({ a: 1500, b: 1500, c: 1500, d: 1500 })
    const current: TeamSplit = [
      ['a', 'b'],
      ['c', 'd'],
    ]

    for (const r of [0, 0.3, 0.6, 0.99]) {
      const split = balanceTeams(['a', 'b', 'c', 'd'], even, current, seq(r, 0.9))
      expect(sorted(split!)).not.toEqual(sorted(current))
    }
  })

  it('never trades the fairest split for a merely close one', () => {
    // {a,d}/{b,c} is 2.5 MMR apart, {a,c}/{b,d} 12.5: close, but not a tie.
    const close = standings({ a: 1500, b: 1510, c: 1530, d: 1545 })
    const best = [
      ['a', 'd'],
      ['b', 'c'],
    ]

    for (const current of [undefined, best as TeamSplit]) {
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const split = balanceTeams(['a', 'b', 'c', 'd'], close, current, seq(r, 0.9))
        expect(sorted(split!)).toEqual(best)
      }
    }
  })

  it('leaves the only fair split untouched, sides included', () => {
    // Team 1 holds c,d: a flip would only swap the sides, so none happens.
    const current: TeamSplit = [
      ['c', 'd'],
      ['a', 'b'],
    ]

    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(balanceTeams(['a', 'b', 'c', 'd'], ratings, current, () => r)).toEqual(current)
    }
  })

  it('keeps the extra player in Team 1 on an odd roster', () => {
    const split = balanceTeams(
      ['a', 'b', 'c'],
      standings({ a: 1000, b: 1500, c: 1500 }),
      undefined,
      () => 0,
    )

    expect(split![0]).toHaveLength(2)
    expect(split![1]).toHaveLength(1)
  })
})

describe('isOnlyFairSplit', () => {
  const ids = ['a', 'b', 'c', 'd']
  const ratings = standings({ a: 1600, b: 1400, c: 1550, d: 1450 })

  it('is true on the single fairest split, whichever side is Team 1', () => {
    expect(
      isOnlyFairSplit(ids, ratings, [
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe(true)
    expect(
      isOnlyFairSplit(ids, ratings, [
        ['d', 'c'],
        ['b', 'a'],
      ]),
    ).toBe(true)
  })

  it('is false while a fairer split is still to be found', () => {
    expect(
      isOnlyFairSplit(ids, ratings, [
        ['a', 'c'],
        ['b', 'd'],
      ]),
    ).toBe(false)
  })

  it('is false when other splits are just as fair', () => {
    const even = standings({ a: 1500, b: 1500, c: 1500, d: 1500 })
    expect(
      isOnlyFairSplit(ids, even, [
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe(false)
  })

  it('is false when a rating is missing', () => {
    expect(
      isOnlyFairSplit([...ids, 'x'], ratings, [
        ['a', 'b', 'x'],
        ['c', 'd'],
      ]),
    ).toBe(false)
  })
})
