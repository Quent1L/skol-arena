import { averageMmr, calculateExpectedScore } from '@skol-arena/shared/types/index'
import type { MatchSideInput } from '@skol-arena/shared/types/index'

/**
 * Line-up balance for the match wizard. Pure arithmetic, kept out of
 * `match.service` so it can be imported without dragging in the HTTP layer.
 *
 * The two formulas come from `@skol-arena/shared` — the very ones the server
 * runs when it prices the match — so the preview and the outcome cannot drift.
 */

/** A player's standing at the match date, as returned by the MMR snapshot. */
export interface PlayerStanding {
  mmr: number
  isPlacement: boolean
}

export type PlayerStandings = Record<string, PlayerStanding>

/** Below/above these, one side is no longer an even bet. Mirrors `getMatchLabel`. */
export const UNDERDOG_THRESHOLD = 0.35
export const FAVORITE_THRESHOLD = 0.65

export interface MatchBalance {
  avgA: number
  avgB: number
  /** Elo expected score of side A; side B is its complement. */
  probA: number
  probB: number
  /** At least one player had not finished placement — the reading is soft. */
  hasProvisional: boolean
}

/**
 * `null` when the balance cannot be stated: no snapshot yet, fewer than two
 * sides, or a side with nobody in it. Callers hide the bar rather than showing
 * a 50/50 that means "unknown".
 */
export function computeMatchBalance(
  sides: MatchSideInput[],
  standings: PlayerStandings | null | undefined,
): MatchBalance | null {
  if (!standings) return null
  if (sides.length < 2) return null

  const [sideA, sideB] = sides
  const idsA = sideA.playerIds ?? []
  const idsB = sideB.playerIds ?? []
  if (idsA.length === 0 || idsB.length === 0) return null

  // A player missing from the snapshot means the side cannot be averaged
  // honestly — better no bar than one built on a silent zero.
  if (![...idsA, ...idsB].every((id) => id in standings)) return null
  const standingsA = idsA.map((id) => standings[id]!)
  const standingsB = idsB.map((id) => standings[id]!)

  const avgA = averageMmr(standingsA.map((s) => s.mmr))
  const avgB = averageMmr(standingsB.map((s) => s.mmr))
  const probA = calculateExpectedScore(avgA, avgB)

  return {
    avgA: Math.round(avgA),
    avgB: Math.round(avgB),
    probA,
    probB: 1 - probA,
    hasProvisional: [...standingsA, ...standingsB].some((s) => s.isPlacement),
  }
}

export type BalanceVerdict = 'even' | 'favoriteA' | 'favoriteB'

export function getBalanceVerdict(balance: MatchBalance): BalanceVerdict {
  if (balance.probA > FAVORITE_THRESHOLD) return 'favoriteA'
  if (balance.probA < UNDERDOG_THRESHOLD) return 'favoriteB'
  return 'even'
}

/**
 * Percentages shown on the bar. Only side A is rounded and side B is posed as
 * its complement — rounding both independently can total 101.
 */
export function toPercents(balance: MatchBalance): { a: number; b: number } {
  const a = Math.round(balance.probA * 100)
  return { a, b: 100 - a }
}
