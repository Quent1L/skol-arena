import { isCompetitionRanking, ranksFromScores } from '@skol-arena/shared/types/index'

/**
 * Placement of the sides of a match of three sides or more, as the result step
 * edits it. Pure functions: the step keeps an order (who finished where) and a
 * tie flag per side (shares the place of the side above), the API wants ranks.
 */

/** Rank per side position: 1 = first, tied sides share a rank (1, 1, 3). */
export type RankMap = Record<number, number>

/** Ranks from a finishing order; a tied side takes the rank of the side above it. */
export function ranksFromOrder(order: number[], tied: Record<number, boolean>): RankMap {
  const ranks: RankMap = {}
  order.forEach((position, index) => {
    const above = order[index - 1]
    ranks[position] = index > 0 && tied[position] ? ranks[above] : index + 1
  })
  return ranks
}

/** Positions sorted by rank, the position settling ties: the order the list shows. */
export function orderFromRanks(positions: number[], ranks: RankMap): number[] {
  const rankOf = (position: number) => ranks[position] ?? Number.POSITIVE_INFINITY
  return [...positions].sort((a, b) => rankOf(a) - rankOf(b) || a - b)
}

/** Which sides share the rank of the side listed above them. */
export function tiesFromRanks(order: number[], ranks: RankMap): Record<number, boolean> {
  return Object.fromEntries(
    order.map((position, index) => [
      position,
      index > 0 && ranks[position] !== undefined && ranks[position] === ranks[order[index - 1]],
    ]),
  )
}

/** Ranks read from the scores: highest first, equal scores tied. */
export function ranksFromScoreMap(positions: number[], scores: Record<number, number>): RankMap {
  const ranks = ranksFromScores(
    positions.map((position) => ({ position, score: scores[position] ?? 0 })),
  )
  return Object.fromEntries(positions.map((position) => [position, ranks.get(position) ?? 1]))
}

/** Every side placed, and the places form a valid ranking. */
export function isCompleteRanking(positions: number[], ranks: RankMap): boolean {
  if (positions.some((position) => ranks[position] === undefined)) return false
  return isCompetitionRanking(positions.map((position) => ranks[position]))
}

/** How many sides share first place: more than one is a draw. */
export function firstPlaceCount(ranks: RankMap): number {
  return Object.values(ranks).filter((rank) => rank === 1).length
}
