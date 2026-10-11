// ============================================
// Placement of the sides of a match (N-way aware)
// ============================================
//
// A match opposes 2..MAX_SIDES_PER_MATCH sides. Each side's result is its rank, in
// competition ranking: 1 is first and tied sides share a rank (1, 1, 3). With exactly two
// sides this collapses to the A/B winner every two-side reader knows, so the helpers below
// are the one place both shapes meet.

export const MIN_SIDES_PER_MATCH = 2;
export const MAX_SIDES_PER_MATCH = 8;

export interface RankableSide {
  position: number;
  score?: number | null;
  rank?: number | null;
}

/** Ranks the sides by score, highest first, equal scores sharing a rank. */
export function ranksFromScores(sides: RankableSide[]): Map<number, number> {
  const ranks = new Map<number, number>();
  const sorted = [...sides].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  let rank = 0;
  let previous: number | null = null;
  sorted.forEach((side, index) => {
    const score = side.score ?? 0;
    if (previous === null || score !== previous) rank = index + 1;
    ranks.set(side.position, rank);
    previous = score;
  });
  return ranks;
}

/**
 * Resolves the rank of every side, by priority:
 * 1. an explicit rank on every side,
 * 2. a two-side winner pick (`winnerPosition`, null meaning a draw),
 * 3. the scores,
 * 4. nothing to go on: everyone shares first place.
 */
export function resolveRanks(sides: RankableSide[], winnerPosition?: number | null): Map<number, number> {
  if (sides.length > 0 && sides.every((s) => s.rank != null)) {
    return new Map(sides.map((s) => [s.position, s.rank as number]));
  }
  if (winnerPosition !== undefined) {
    return new Map(sides.map((s) => [s.position, winnerPosition === null || s.position === winnerPosition ? 1 : 2]));
  }
  if (sides.some((s) => s.score != null)) return ranksFromScores(sides);
  return new Map(sides.map((s) => [s.position, 1]));
}

/** Maps the stored two-side winner letter to a position (A → 1, B → 2, draw → null). */
export function winnerSideToPosition(winnerSide: string | null | undefined): number | null {
  if (winnerSide === "A") return 1;
  if (winnerSide === "B") return 2;
  return null;
}

/**
 * Ranks of a stored match: the per-side rank when present, else derived from the legacy
 * A/B winner letter.
 */
export function resolveStoredRanks(sides: RankableSide[], winnerSide: string | null | undefined): Map<number, number> {
  return resolveRanks(
    sides.map((s) => ({ position: s.position, rank: s.rank })),
    winnerSideToPosition(winnerSide),
  );
}

export function countFirstPlaces(ranks: Map<number, number>): number {
  let count = 0;
  for (const rank of ranks.values()) if (rank === 1) count += 1;
  return count;
}

export interface RankOutcome {
  isWin: boolean;
  isDraw: boolean;
  isLoss: boolean;
}

/**
 * Win / draw / loss of a side from its rank: alone in first place is a win, sharing first
 * place is a draw, anything else is a loss.
 */
export function classifyRank(rank: number | undefined, firstPlaces: number): RankOutcome {
  const isWin = rank === 1 && firstPlaces === 1;
  const isDraw = rank === 1 && firstPlaces > 1;
  return { isWin, isDraw, isLoss: !isWin && !isDraw };
}

/** Outcome of the side at `position` within the resolved ranks. */
export function sideOutcome(ranks: Map<number, number>, position: number): RankOutcome {
  return classifyRank(ranks.get(position), countFirstPlaces(ranks));
}

/** Result of a duel between two sides of the same match: 1 ahead, 0.5 tied, 0 behind. */
export function pairwiseResult(myRank: number, opponentRank: number): 1 | 0.5 | 0 {
  if (myRank < opponentRank) return 1;
  if (myRank === opponentRank) return 0.5;
  return 0;
}

/** The two-side A/B winner letter of resolved ranks; null for a draw or for 3+ sides. */
export function winnerSideFromRanks(ranks: Map<number, number>): "A" | "B" | null {
  if (ranks.size !== 2) return null;
  const a = ranks.get(1);
  const b = ranks.get(2);
  if (a == null || b == null || a === b) return null;
  return a < b ? "A" : "B";
}

/**
 * Whether the ranks form a valid competition ranking: sorted, the first is 1 and each next
 * one either ties the previous or equals its own 1-based index (1, 1, 3 — never 1, 1, 2).
 */
export function isCompetitionRanking(ranks: number[]): boolean {
  const sorted = [...ranks].sort((a, b) => a - b);
  return sorted.every((rank, index) => (index === 0 ? rank === 1 : rank === sorted[index - 1] || rank === index + 1));
}

/** Whether the positions are exactly 1..N, each once. */
export function hasContiguousPositions(positions: number[]): boolean {
  const sorted = [...positions].sort((a, b) => a - b);
  return sorted.every((position, index) => position === index + 1);
}
