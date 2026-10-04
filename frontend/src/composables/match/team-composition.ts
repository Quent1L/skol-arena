import { averageMmr, calculateExpectedScore } from '@skol-arena/shared/types/index'
import type { PlayerStandings } from '@/composables/match/match-balance'

/**
 * Automatic line-ups for the composition step. Pure functions, kept out of
 * `match.service` for the same reason as `match-balance`: no HTTP layer.
 *
 * Both return two sides of `ceil(n/2)` and `floor(n/2)` players.
 */

export type TeamSplit = [string[], string[]]

/**
 * Splits whose score matches the best one, up to float noise, are ties.
 * Picking at random among them lets a second tap offer an alternative
 * instead of the same line-up again — never a less even one.
 */
export const TIE_EPSILON = 1e-9

type Rng = () => number

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function shuffleTeams(ids: string[], rng: Rng = Math.random): TeamSplit {
  const shuffled = shuffle(ids, rng)
  const half = Math.ceil(ids.length / 2)
  return [shuffled.slice(0, half), shuffled.slice(half)]
}

/** Every `size`-element subset of `items`, order preserved. */
function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [head, ...rest] = items
  const withHead = combinations(rest, size - 1).map((combo) => [head, ...combo])
  return [...withHead, ...combinations(rest, size)]
}

/** All splits of `ids`, each listed once: a split and its mirror are the same line-up. */
function allSplits(ids: string[]): TeamSplit[] {
  const [first, ...rest] = ids
  const half = Math.ceil(ids.length / 2)
  return combinations(rest, half - 1).map((others) => {
    const sideA = [first, ...others]
    const inA = new Set(sideA)
    return [sideA, ids.filter((id) => !inA.has(id))]
  })
}

/** Distance from a coin flip: 0 is a perfectly even match. */
function splitScore([a, b]: TeamSplit, standings: PlayerStandings): number {
  const avgA = averageMmr(a.map((id) => standings[id].mmr))
  const avgB = averageMmr(b.map((id) => standings[id].mmr))
  return Math.abs(calculateExpectedScore(avgA, avgB) - 0.5)
}

function sameSet(a: string[], b: string[]): boolean {
  const ids = new Set(a)
  return a.length === b.length && b.every((id) => ids.has(id))
}

/** Same line-up whichever side is Team 1: swapping sides changes nobody's teammates. */
function sameSplit([a, b]: TeamSplit, [currentA, currentB]: TeamSplit): boolean {
  return (
    (sameSet(a, currentA) && sameSet(b, currentB)) || (sameSet(a, currentB) && sameSet(b, currentA))
  )
}

/**
 * Every split tied for the best balance, by the same Elo formulas as the
 * balance bar. `null` when a player has no standing — balancing on a missing
 * rating would be a guess.
 */
function fairSplits(ids: string[], standings: PlayerStandings): TeamSplit[] | null {
  if (ids.length < 2 || ids.some((id) => !standings[id])) return null

  const scored = allSplits(ids).map((split) => ({ split, score: splitScore(split, standings) }))
  const best = Math.min(...scored.map((s) => s.score))
  return scored.filter((s) => s.score <= best + TIE_EPSILON).map((s) => s.split)
}

/**
 * `current` is the one and only fairest line-up: balancing again could only
 * swap the sides, so the button has nothing left to offer.
 */
export function isOnlyFairSplit(
  ids: string[],
  standings: PlayerStandings,
  current: TeamSplit,
): boolean {
  const fair = fairSplits(ids, standings)
  return fair !== null && fair.length === 1 && sameSplit(fair[0], current)
}

/**
 * The fairest split by MMR. `null` when a player has no standing. `current`
 * is skipped when another equally fair split exists; when it is the only one
 * it comes back untouched, sides included.
 */
export function balanceTeams(
  ids: string[],
  standings: PlayerStandings,
  current?: TeamSplit,
  rng: Rng = Math.random,
): TeamSplit | null {
  const fair = fairSplits(ids, standings)
  if (!fair) return null

  const pool = current ? fair.filter((split) => !sameSplit(split, current)) : fair
  if (pool.length === 0 && current) return current

  const [a, b] = pool[Math.floor(rng() * pool.length)]
  // `allSplits` always seats the first player on side A; flip half the time
  // so they are not stuck in Team 1. An odd roster keeps the extra player in A.
  return a.length === b.length && rng() < 0.5 ? [b, a] : [a, b]
}
