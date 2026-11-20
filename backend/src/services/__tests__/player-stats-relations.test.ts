/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";
import type { PlayerRelationStat } from "@skol-arena/shared";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPlayerStatsRepo = {
  getPlayersInEntries: mock((_ids: any) => Promise.resolve([] as any[])),
};
mock.module("../../repository/player-stats.repository", () => ({
  playerStatsRepository: mockPlayerStatsRepo,
}));
mock.module("../../repository/match-sides.repository", () => ({ matchSidesRepository: {} }));
mock.module("../../repository/player-computed-data.repository", () => ({
  playerComputedDataRepository: {},
}));

import { PlayerStatsService, rankRelationsByWeightedRate } from "../player-stats.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** ownPosition is always 1 here, so winnerSide "A" is a win and "B" a loss. */
function result(matchId: string, entryId: string, oppEntryId: string, winnerSide: string | null) {
  return {
    matchId,
    entryId,
    ownScore: 0,
    ownPosition: 1,
    winnerSide,
    oppEntryId,
    oppScore: 0,
    allowDraw: false,
    pointsAwarded: null,
    outcomeTypeId: null,
  };
}

function entryPlayer(entryId: string, playerId: string) {
  return { entryId, playerId, displayName: playerId, shortName: playerId };
}

/** n matches on `entryId` vs `oppEntryId`, the first `wins` of them won by the player. */
function series(prefix: string, entryId: string, oppEntryId: string, n: number, wins: number) {
  return Array.from({ length: n }, (_, i) => result(`${prefix}${i}`, entryId, oppEntryId, i < wins ? "A" : "B"));
}

function relation(playerId: string, count: number, wins: number): PlayerRelationStat {
  return {
    playerId,
    displayName: playerId,
    shortName: playerId,
    count,
    wins,
    losses: count - wins,
    winRate: Math.round((wins / count) * 100),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("rankRelationsByWeightedRate", () => {
  const byWinRate = (r: PlayerRelationStat) => r.wins / r.count;

  it("drops relations below the 3-match threshold", () => {
    const ranked = rankRelationsByWeightedRate([relation("perfect", 2, 2), relation("solid", 3, 2)], byWinRate);
    expect(ranked.map((r) => r.playerId)).toEqual(["solid"]);
  });

  it("ranks a long good record above a short perfect one", () => {
    // 28 × 82% → 0.82 × √28 ≈ 4.34 ; 4 × 100% → 1 × √4 = 2
    const ranked = rankRelationsByWeightedRate([relation("lucky", 4, 4), relation("proven", 28, 23)], byWinRate);
    expect(ranked.map((r) => r.playerId)).toEqual(["proven", "lucky"]);
  });

  it("breaks score ties on match count", () => {
    const ranked = rankRelationsByWeightedRate(
      [relation("few", 4, 2), relation("many", 16, 4)], // 0.5 × 2 = 1 ; 0.25 × 4 = 1
      byWinRate,
    );
    expect(ranked.map((r) => r.playerId)).toEqual(["many", "few"]);
  });

  it("returns an empty list when nobody reaches the threshold", () => {
    expect(rankRelationsByWeightedRate([relation("a", 1, 1), relation("b", 2, 1)], byWinRate)).toEqual([]);
  });

  it("keeps at most 3 relations", () => {
    const all = ["a", "b", "c", "d", "e"].map((id) => relation(id, 10, 5));
    expect(rankRelationsByWeightedRate(all, byWinRate)).toHaveLength(3);
  });

  it("breaks a full tie on the record before falling back to the id", () => {
    const named = (playerId: string, displayName: string, draws = 0) => ({
      ...relation(playerId, 10, 5),
      losses: 5 - draws,
      displayName,
    });

    // Same rate, same sample: the more decisive record wins, id or not.
    const byDraws = rankRelationsByWeightedRate([named("a", "Zoe"), named("z", "Alice", 2)], byWinRate);
    expect(byDraws[0]!.playerId).toBe("z");

    // Nothing left to compare: the id closes the chain.
    expect(rankRelationsByWeightedRate([named("z", "Zoe"), named("a", "Alice")], byWinRate)[0]!.playerId).toBe("a");
  });

  it("ignores display names, so renaming never reshuffles the ranking", () => {
    const named = (playerId: string, displayName: string) => ({
      ...relation(playerId, 10, 5),
      displayName,
    });

    for (const [nameOfA, nameOfZ] of [
      ["Alice", "Zoe"],
      ["Zoe", "Alice"],
    ]) {
      const ranked = rankRelationsByWeightedRate([named("z", nameOfZ!), named("a", nameOfA!)], byWinRate);
      expect(ranked.map((r) => r.playerId)).toEqual(["a", "z"]);
    }
  });

  it("crowns the same relation whatever order the list arrives in", () => {
    const tied = [relation("z", 10, 5), relation("a", 10, 5), relation("m", 10, 5)];

    expect(rankRelationsByWeightedRate(tied, byWinRate).map((r) => r.playerId)).toEqual(
      rankRelationsByWeightedRate([...tied].reverse(), byWinRate).map((r) => r.playerId),
    );
  });
});

describe("computePartnerStats", () => {
  const service = new PlayerStatsService();

  it("weights best partners by match count and exposes their win rate", async () => {
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([
      entryPlayer("e1", "A"),
      entryPlayer("e1", "P1"),
      entryPlayer("e2", "A"),
      entryPlayer("e2", "P2"),
      entryPlayer("e3", "A"),
      entryPlayer("e3", "P3"),
    ] as any);

    const matchResults = [
      ...series("p1_", "e1", "eOpp", 3, 3), // P1: 100% over 3 → 1.73
      ...series("p2_", "e2", "eOpp", 9, 7), // P2: 78% over 9 → 2.33
      ...series("p3_", "e3", "eOpp", 2, 2), // P3: 100% over 2 → below threshold
    ];

    const { best, frequent } = await (service as any).computePartnerStats(matchResults, ["e1", "e2", "e3"], "A", 50);

    expect(best.map((p: PlayerRelationStat) => p.playerId)).toEqual(["P2", "P1"]);
    expect(best[0]).toMatchObject({ count: 9, wins: 7, winRate: 78, chemistryDelta: 28 });
    // frequent still ranks on raw volume and ignores the threshold
    expect(frequent.map((p: PlayerRelationStat) => p.playerId)).toEqual(["P2", "P1", "P3"]);
  });
});

describe("computeNemesisStats", () => {
  const service = new PlayerStatsService();

  it("ranks opponents by loss rate weighted by match count, not by raw losses", async () => {
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([
      entryPlayer("o1", "O1"),
      entryPlayer("o2", "O2"),
      entryPlayer("o3", "O3"),
    ] as any);

    const matchResults = [
      ...series("o1_", "e1", "o1", 10, 6), // O1: 4 losses, 40% loss rate → 1.26
      ...series("o2_", "e1", "o2", 4, 1), // O2: 3 losses, 75% loss rate → 1.50
      ...series("o3_", "e1", "o3", 2, 0), // O3: 2 losses but below threshold
    ];

    const nemeses = await (service as any).computeNemesisStats(matchResults, ["e1"], "A");

    // O1 has the most losses in absolute terms, yet O2 is the real nemesis
    expect(nemeses.map((n: PlayerRelationStat) => n.playerId)).toEqual(["O2", "O1"]);
    expect(nemeses[0]).toMatchObject({ count: 4, wins: 1, losses: 3, winRate: 25 });
  });
});
