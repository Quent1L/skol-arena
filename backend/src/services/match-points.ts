// Ranks and championship points of every side of a match, whatever its number of sides.
// With exactly two sides it reproduces the legacy A/B winner and win/draw/loss points.

import {
  countFirstPlaces,
  classifyRank,
  resolveRanks,
  winnerSideFromRanks,
  type RankableSide,
  type TournamentScoringConfig,
} from "@skol-arena/shared";

export interface SideOutcome {
  position: number;
  score: number | null;
  rank: number;
  pointsAwarded: number;
}

export interface MatchOutcome {
  sides: SideOutcome[];
  /** A/B winner of a two-side match; null on a draw and for 3+ sides. */
  winnerSide: "A" | "B" | null;
}

/** Points a side earns from its placement, under the tournament's points source. */
export function pointsForRank(
  rank: number,
  firstPlaces: number,
  score: number | null,
  config: TournamentScoringConfig,
): number {
  if (config.pointsSource === "score") return score ?? 0;
  if (config.pointsSource === "rank") {
    const table = config.rankPoints;
    if (table && table.length > 0) return table[rank - 1] ?? table[table.length - 1] ?? 0;
  }
  const { isWin, isDraw } = classifyRank(rank, firstPlaces);
  if (isDraw) return config.pointPerDraw;
  return isWin ? config.pointPerVictory : config.pointPerLoss;
}

/**
 * Resolves the rank of every side (see `resolveRanks` for the priority) and the points it
 * earns. `winnerPosition` is the two-side winner pick, null meaning a draw.
 */
export function computeMatchOutcome(
  sides: RankableSide[],
  config: TournamentScoringConfig,
  winnerPosition?: number | null,
): MatchOutcome {
  const ranks = resolveRanks(sides, winnerPosition);
  const firstPlaces = countFirstPlaces(ranks);
  return {
    sides: sides.map((side) => {
      const rank = ranks.get(side.position) ?? 1;
      const score = side.score ?? null;
      return {
        position: side.position,
        score,
        rank,
        pointsAwarded: pointsForRank(rank, firstPlaces, score, config),
      };
    }),
    winnerSide: winnerSideFromRanks(ranks),
  };
}
