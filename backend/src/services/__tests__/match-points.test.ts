import { describe, it, expect } from "bun:test";
import {
  classifyRank,
  isCompetitionRanking,
  pairwiseResult,
  ranksFromScores,
  resolveRanks,
  resolveStoredRanks,
  type TournamentScoringConfig,
} from "@skol-arena/shared";
import { computeMatchOutcome } from "../match-points";

const matchResult: TournamentScoringConfig = {
  pointPerVictory: 3,
  pointPerDraw: 1,
  pointPerLoss: 0,
  pointsSource: "match_result",
  rankPoints: null,
};

const pointsOf = (outcome: ReturnType<typeof computeMatchOutcome>) => outcome.sides.map((s) => s.pointsAwarded);
const ranksOf = (outcome: ReturnType<typeof computeMatchOutcome>) => outcome.sides.map((s) => s.rank);

describe("match ranking", () => {
  it("ranks by score, highest first, ties sharing a rank", () => {
    const ranks = ranksFromScores([
      { position: 1, score: 5 },
      { position: 2, score: 9 },
      { position: 3, score: 5 },
      { position: 4, score: 1 },
    ]);
    expect([...ranks.entries()].sort(([a], [b]) => a - b)).toEqual([
      [1, 2],
      [2, 1],
      [3, 2],
      [4, 4],
    ]);
  });

  it("prefers explicit ranks over the winner pick and the scores", () => {
    const ranks = resolveRanks(
      [
        { position: 1, score: 10, rank: 2 },
        { position: 2, score: 0, rank: 1 },
      ],
      1,
    );
    expect(ranks.get(2)).toBe(1);
  });

  it("reads a draw from a null winner pick", () => {
    const ranks = resolveRanks([{ position: 1 }, { position: 2 }], null);
    expect([...ranks.values()]).toEqual([1, 1]);
  });

  it("falls back to the stored A/B letter when a side has no rank", () => {
    const ranks = resolveStoredRanks([{ position: 1 }, { position: 2 }], "B");
    expect(ranks.get(1)).toBe(2);
    expect(ranks.get(2)).toBe(1);
  });

  it("classifies a lone first as a win and a shared first as a draw", () => {
    expect(classifyRank(1, 1)).toEqual({ isWin: true, isDraw: false, isLoss: false });
    expect(classifyRank(1, 2)).toEqual({ isWin: false, isDraw: true, isLoss: false });
    expect(classifyRank(2, 1)).toEqual({ isWin: false, isDraw: false, isLoss: true });
  });

  it("scores a duel within the match by relative rank", () => {
    expect(pairwiseResult(2, 3)).toBe(1);
    expect(pairwiseResult(2, 2)).toBe(0.5);
    expect(pairwiseResult(3, 1)).toBe(0);
  });

  it("accepts competition rankings only", () => {
    expect(isCompetitionRanking([3, 1, 2])).toBe(true);
    expect(isCompetitionRanking([1, 1, 3])).toBe(true);
    expect(isCompetitionRanking([1, 2, 2])).toBe(true);
    expect(isCompetitionRanking([1, 1, 2])).toBe(false);
    expect(isCompetitionRanking([2, 3])).toBe(false);
  });
});

describe("computeMatchOutcome", () => {
  describe("two sides (legacy behaviour)", () => {
    it("gives the winner the victory points and the A letter", () => {
      const outcome = computeMatchOutcome(
        [
          { position: 1, score: 10 },
          { position: 2, score: 5 },
        ],
        matchResult,
      );
      expect(outcome.winnerSide).toBe("A");
      expect(pointsOf(outcome)).toEqual([3, 0]);
    });

    it("gives a draw on equal scores", () => {
      const outcome = computeMatchOutcome(
        [
          { position: 1, score: 5 },
          { position: 2, score: 5 },
        ],
        matchResult,
      );
      expect(outcome.winnerSide).toBeNull();
      expect(pointsOf(outcome)).toEqual([1, 1]);
    });

    it("lets the winner pick override the scores", () => {
      const outcome = computeMatchOutcome(
        [
          { position: 1, score: 0 },
          { position: 2, score: 0 },
        ],
        matchResult,
        2,
      );
      expect(outcome.winnerSide).toBe("B");
      expect(pointsOf(outcome)).toEqual([0, 3]);
    });
  });

  describe("three sides and more", () => {
    const sides = [
      { position: 1, score: 4, rank: 2 },
      { position: 2, score: 9, rank: 1 },
      { position: 3, score: 1, rank: 3 },
    ];

    it("never sets an A/B winner", () => {
      expect(computeMatchOutcome(sides, matchResult).winnerSide).toBeNull();
    });

    it("gives the victory to the lone first only with the match_result source", () => {
      expect(pointsOf(computeMatchOutcome(sides, matchResult))).toEqual([0, 3, 0]);
    });

    it("gives the draw points to every side sharing first place", () => {
      const tied = [
        { position: 1, rank: 1 },
        { position: 2, rank: 1 },
        { position: 3, rank: 3 },
      ];
      expect(pointsOf(computeMatchOutcome(tied, matchResult))).toEqual([1, 1, 0]);
    });

    it("reads the placement table with the rank source", () => {
      const config = { ...matchResult, pointsSource: "rank" as const, rankPoints: [10, 6, 3] };
      expect(pointsOf(computeMatchOutcome(sides, config))).toEqual([6, 10, 3]);
    });

    it("repeats the table's last value past its end", () => {
      const config = { ...matchResult, pointsSource: "rank" as const, rankPoints: [5, 2] };
      expect(pointsOf(computeMatchOutcome(sides, config))).toEqual([2, 5, 2]);
    });

    it("falls back to win/loss points when the rank source has no table", () => {
      const config = { ...matchResult, pointsSource: "rank" as const };
      expect(pointsOf(computeMatchOutcome(sides, config))).toEqual([0, 3, 0]);
    });

    it("awards the raw score with the score source", () => {
      const config = { ...matchResult, pointsSource: "score" as const };
      expect(pointsOf(computeMatchOutcome(sides, config))).toEqual([4, 9, 1]);
    });

    it("derives the ranking from the scores when no rank is given", () => {
      const outcome = computeMatchOutcome(
        sides.map(({ position, score }) => ({ position, score })),
        matchResult,
      );
      expect(ranksOf(outcome)).toEqual([2, 1, 3]);
    });
  });
});
