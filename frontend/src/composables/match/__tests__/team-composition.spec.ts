import { describe, it, expect } from 'vitest'

import { balanceTeams, shuffleTeams, type TeamSplit } from '../team-composition'
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

  it('keeps the only fair split even if it is the current one', () => {
    const current: TeamSplit = [
      ['a', 'b'],
      ['c', 'd'],
    ]
    const split = balanceTeams(['a', 'b', 'c', 'd'], ratings, current, () => 0.9)

    expect(sorted(split!)).toEqual(sorted(current))
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
