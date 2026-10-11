/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPlayerStatsRepo = {
  getPlayerEntries: mock((_p: any, _f: any) => Promise.resolve([{ entryId: "eA" }] as any[])),
  getPlayerMatchResults: mock((_ids: any, _p: any) => Promise.resolve([] as any[])),
  getPlayersInEntries: mock((_ids: any) => Promise.resolve([] as any[])),
  getEntryPlayerCounts: mock((_ids: any) => Promise.resolve(new Map<string, number>())),
};
mock.module("../../repository/player-stats.repository", () => ({
  playerStatsRepository: mockPlayerStatsRepo,
}));
mock.module("../../repository/match-sides.repository", () => ({ matchSidesRepository: {} }));
mock.module("../../repository/player-computed-data.repository", () => ({
  playerComputedDataRepository: {},
}));

import { PlayerStatsService } from "../player-stats.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function result(matchId: string, oppEntryId: string, winnerSide: string | null, allowDraw = false) {
  return {
    matchId,
    entryId: "eA",
    ownScore: 0,
    ownPosition: 1, // player A always on side A in these fixtures
    winnerSide,
    oppEntryId,
    oppScore: 0,
    allowDraw,
    pointsAwarded: null,
    outcomeTypeId: null,
  };
}

function entryPlayer(entryId: string, playerId: string) {
  return { entryId, playerId, displayName: playerId, shortName: playerId };
}

describe("computeDirectH2H", () => {
  const service = new PlayerStatsService();

  it("counts only matches against player B from A's perspective", async () => {
    mockPlayerStatsRepo.getPlayerMatchResults.mockResolvedValueOnce([
      result("m1", "eB", "A"), // A win vs B
      result("m2", "eB", "B"), // A loss vs B (= B win)
      result("m3", "eC", "A"), // A win vs C → excluded
      result("m4", "eB", null, true), // draw vs B
    ] as any);
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([
      entryPlayer("eB", "B"),
      entryPlayer("eC", "C"),
    ] as any);

    const h2h = await (service as any).computeDirectH2H("A", "B", {});

    expect(h2h.matchesPlayed).toBe(3);
    expect(h2h.playerAWins).toBe(1);
    expect(h2h.playerBWins).toBe(1);
    expect(h2h.draws).toBe(1);
    expect(h2h.playerAWinRate).toBe(33);
  });

  it("scores a match of three sides on who finished ahead of whom", async () => {
    // A 2nd, B 3rd, C 1st: A lost the match but beat B
    const threeWay = (oppEntryId: string, oppRank: number) => ({
      ...result("m5", oppEntryId, null),
      ownRank: 2,
      oppRank,
      firstPlaces: 1,
    });
    mockPlayerStatsRepo.getPlayerMatchResults.mockResolvedValueOnce([threeWay("eB", 3), threeWay("eC", 1)] as any);
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([
      entryPlayer("eB", "B"),
      entryPlayer("eC", "C"),
    ] as any);

    const h2h = await (service as any).computeDirectH2H("A", "B", {});

    expect(h2h.matchesPlayed).toBe(1);
    expect(h2h.playerAWins).toBe(1);
    expect(h2h.playerBWins).toBe(0);
  });

  it("returns an empty record when the two never met", async () => {
    mockPlayerStatsRepo.getPlayerMatchResults.mockResolvedValueOnce([result("m1", "eC", "A")] as any);
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([entryPlayer("eC", "C")] as any);

    const h2h = await (service as any).computeDirectH2H("A", "B", {});

    const emptySubRecord = { matchesPlayed: 0, playerAWins: 0, playerBWins: 0, draws: 0, playerAWinRate: 0 };
    expect(h2h).toEqual({ ...emptySubRecord, solo: emptySubRecord, team: emptySubRecord });
  });

  it("returns empty when player A has no entries", async () => {
    mockPlayerStatsRepo.getPlayerEntries.mockResolvedValueOnce([] as any);

    const h2h = await (service as any).computeDirectH2H("A", "B", {});

    expect(h2h.matchesPlayed).toBe(0);
  });
});

describe("computeTogether", () => {
  const service = new PlayerStatsService();

  it("counts only matches where B is on player A's own side", async () => {
    // A on side A. m1/m2 teamed with B (own entry eA1), m3 solo entry eA2 (no B).
    mockPlayerStatsRepo.getPlayerEntries.mockResolvedValueOnce([{ entryId: "eA1" }, { entryId: "eA2" }] as any);
    mockPlayerStatsRepo.getPlayerMatchResults.mockResolvedValueOnce([
      { ...result("m1", "eX", "A"), entryId: "eA1" }, // team win with B
      { ...result("m2", "eX", "B"), entryId: "eA1" }, // team loss with B
      { ...result("m3", "eX", "A"), entryId: "eA2" }, // A without B → excluded
    ] as any);
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([
      entryPlayer("eA1", "A"),
      entryPlayer("eA1", "B"),
      entryPlayer("eA2", "A"),
    ] as any);

    const together = await (service as any).computeTogether("A", "B", {});

    expect(together.matchesPlayed).toBe(2);
    expect(together.wins).toBe(1);
    expect(together.losses).toBe(1);
    expect(together.draws).toBe(0);
    expect(together.winRate).toBe(50);
  });

  it("returns empty when they never teamed up", async () => {
    mockPlayerStatsRepo.getPlayerEntries.mockResolvedValueOnce([{ entryId: "eA1" }] as any);
    mockPlayerStatsRepo.getPlayerMatchResults.mockResolvedValueOnce([
      { ...result("m1", "eX", "A"), entryId: "eA1" },
    ] as any);
    mockPlayerStatsRepo.getPlayersInEntries.mockResolvedValueOnce([entryPlayer("eA1", "A")] as any);

    const together = await (service as any).computeTogether("A", "B", {});

    expect(together).toEqual({
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
    });
  });
});
