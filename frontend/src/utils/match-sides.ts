import { countFirstPlaces, classifyRank } from '@skol-arena/shared/types/index'

/**
 * Display helpers for the sides of a match of any size. A duel keeps its A-versus-B
 * layout everywhere; from three sides on, screens show the sides as a ranking.
 */

interface PlacedSide {
  position: number
  rank?: number | null
}

export type PlacementOutcome = 'WIN' | 'LOSS' | 'DRAW'

export function isNwayMatch(sides: readonly unknown[]): boolean {
  return sides.length > 2
}

/** Best placement first; sides without a result keep their position order. */
export function sortByPlacement<T extends PlacedSide>(sides: readonly T[]): T[] {
  const rankOf = (side: T) => side.rank ?? Number.POSITIVE_INFINITY
  return [...sides].sort((a, b) => rankOf(a) - rankOf(b) || a.position - b.position)
}

/**
 * Win / draw / loss of one side from the placements: alone in first place wins,
 * sharing it draws, any other place loses. `null` while the match has no result.
 */
export function placementOutcome(
  sides: readonly PlacedSide[],
  side: PlacedSide | undefined,
): PlacementOutcome | null {
  if (!side || side.rank == null) return null
  const ranks = new Map(sides.map((s) => [s.position, s.rank ?? 0]))
  const { isWin, isDraw } = classifyRank(side.rank, countFirstPlaces(ranks))
  if (isWin) return 'WIN'
  return isDraw ? 'DRAW' : 'LOSS'
}

/** "2v2", "1v1v1"…: one figure per side, the given side first. */
export function matchFormatLabel(
  sides: readonly { position: number; players: readonly unknown[] }[],
  firstPosition?: number,
): string {
  const ordered = [...sides].sort((a, b) => {
    if (a.position === firstPosition) return -1
    if (b.position === firstPosition) return 1
    return a.position - b.position
  })
  return ordered.map((side) => side.players.length).join('v')
}
