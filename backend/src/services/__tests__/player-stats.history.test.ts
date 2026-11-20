/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const statsRepo = {
  getPlayerMatchHistory: mock(async (..._a: any[]): Promise<any[]> => []),
  getPlayerIdsByTournament: mock(async (..._a: any[]): Promise<string[]> => []),
};
mock.module("../../repository/player-stats.repository", () => ({ playerStatsRepository: statsRepo }));

const sidesRepo = { getByMatchIds: mock(async (..._a: any[]): Promise<any[]> => []) };
mock.module("../../repository/match-sides.repository", () => ({ matchSidesRepository: sidesRepo }));

const computedRepo = { deleteMany: mock(async (..._a: any[]) => {}) };
mock.module("../../repository/player-computed-data.repository", () => ({
  playerComputedDataRepository: computedRepo,
}));

const { playerStatsService } = await import("../player-stats.service");

const row = (over: Record<string, unknown> = {}) => ({
  matchId: "m1",
  tournamentId: "t1",
  tournamentName: "Cup",
  tournamentMode: "ranked",
  tournamentScoreEnabled: true,
  playedAt: new Date("2026-02-01"),
  status: "finalized",
  scoreA: 3,
  scoreB: 1,
  winnerSide: "A",
  teamSizeA: 1,
  teamSizeB: 1,
  mmrDelta: 12,
  outcomeTypeId: "o1",
  outcomeTypeName: "Overtime",
  ...over,
});

const side = (matchId: string, position: number, names: string[]) => ({
  matchId,
  position,
  entry: {
    players: names.map((name) => ({
      player: { id: `id-${name}`, displayName: name, shortName: name.slice(0, 2).toUpperCase() },
    })),
  },
});

beforeEach(() => {
  for (const fn of [...Object.values(statsRepo), sidesRepo.getByMatchIds, computedRepo.deleteMany]) fn.mockClear();
  statsRepo.getPlayerMatchHistory.mockImplementation(async () => []);
  statsRepo.getPlayerIdsByTournament.mockImplementation(async () => []);
  sidesRepo.getByMatchIds.mockImplementation(async () => []);
});

describe("getPlayerMatchHistory", () => {
  it("returns nothing without looking up sides when the player has no match", async () => {
    expect(await playerStatsService.getPlayerMatchHistory("p1", {} as any)).toEqual([]);
    expect(sidesRepo.getByMatchIds).not.toHaveBeenCalled();
  });

  it("assembles each match with the players of both sides", async () => {
    statsRepo.getPlayerMatchHistory.mockImplementation(async () => [row()]);
    sidesRepo.getByMatchIds.mockImplementation(async () => [side("m1", 1, ["Ann"]), side("m1", 2, ["Bob", "Cy"])]);

    const [entry] = await playerStatsService.getPlayerMatchHistory("p1", { limit: 5 } as any);

    expect(sidesRepo.getByMatchIds).toHaveBeenCalledWith(["m1"]);
    expect(entry).toMatchObject({
      id: "p1-m1",
      matchId: "m1",
      playerId: "p1",
      tournament: { id: "t1", name: "Cup", mode: "ranked", scoreEnabled: true },
      scoreA: 3,
      scoreB: 1,
      winnerSide: "A",
      mmrDelta: 12,
      outcomeType: { id: "o1", name: "Overtime" },
    });
    expect(entry.sides.map((s) => s.players.map((p) => p.displayName))).toEqual([["Ann"], ["Bob", "Cy"]]);
    expect(entry.sides[1].players[0]).toEqual({ id: "id-Bob", displayName: "Bob", shortName: "BO" });
  });

  it("fills in the defaults for a match without status, date, delta or outcome", async () => {
    statsRepo.getPlayerMatchHistory.mockImplementation(async () => [
      row({
        playedAt: null,
        status: null,
        winnerSide: null,
        mmrDelta: null,
        outcomeTypeId: null,
        outcomeTypeName: null,
      }),
    ]);

    const [entry] = await playerStatsService.getPlayerMatchHistory("p1", {} as any);

    expect(entry.playedAt).toBeInstanceOf(Date);
    expect(entry.status).toBe("finalized");
    expect(entry.winnerSide).toBeNull();
    expect(entry.mmrDelta).toBeNull();
    expect(entry.outcomeType).toBeNull();
    expect(entry.sides).toEqual([]);
  });

  it("keeps the sides of each match apart", async () => {
    statsRepo.getPlayerMatchHistory.mockImplementation(async () => [row(), row({ matchId: "m2" })]);
    sidesRepo.getByMatchIds.mockImplementation(async () => [side("m1", 1, ["Ann"]), side("m2", 1, ["Zed"])]);

    const entries = await playerStatsService.getPlayerMatchHistory("p1", {} as any);

    expect(entries.map((e) => e.sides[0].players[0].displayName)).toEqual(["Ann", "Zed"]);
  });
});

describe("cache invalidation", () => {
  it("drops one player's cached stats", async () => {
    await playerStatsService.invalidateCache("p1");

    expect(computedRepo.deleteMany).toHaveBeenCalledWith(["p1"]);
  });

  it("drops the cached stats of everyone in a tournament", async () => {
    statsRepo.getPlayerIdsByTournament.mockImplementation(async () => ["p1", "p2"]);

    await playerStatsService.invalidateCacheForTournament("t1");

    expect(computedRepo.deleteMany).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("does not touch the cache of an empty tournament", async () => {
    await playerStatsService.invalidateCacheForTournament("t1");

    expect(computedRepo.deleteMany).not.toHaveBeenCalled();
  });
});
