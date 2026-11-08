/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const repo = {
  getComputedStats: mock(async (_id: string): Promise<unknown> => null),
  setComputedStats: mock(async (_id: string, _stats: unknown) => {}),
  getTournamentMode: mock(async (_id: string): Promise<any> => null),
  getOutcomeDistribution: mock(async (_id: string): Promise<any[]> => []),
  getMatchesWithSidesAndPlayers: mock(async (_id: string): Promise<any[]> => []),
  getMomentum: mock(async (_id: string): Promise<any[]> => []),
};
mock.module("../../repository/tournament-stats.repository", () => ({ tournamentStatsRepository: repo }));
mock.module("../tournament-ruleset.service", () => ({
  tournamentRulesetService: {
    getForTournament: async () => ({
      outcomeTypes: [{ id: "ot-1", name: "Penalties", isDefault: false, reasons: [] }],
    }),
  },
}));

const { tournamentStatsService } = await import("../tournament-stats.service");
const { NotFoundError } = await import("../../types/errors");

let counter = 0;
function side(position: number, playerIds: string[]) {
  const id = `e-${position}-${playerIds.join("")}`;
  return {
    position,
    entryId: id,
    entry: {
      id,
      players: playerIds.map((p) => ({
        playerId: p,
        player: { id: p, displayName: p.toUpperCase(), shortName: p },
      })),
    },
  };
}

/** `minutesAgo` orders matches in time; "A" means side 1 won. */
function match(winnerSide: "A" | "B" | null, a: string[], b: string[], minutesAgo: number, outcomeTypeId: string | null = null) {
  return {
    id: `m${counter++}`,
    winnerSide,
    playedAt: new Date(Date.now() - minutesAgo * 60_000),
    outcomeTypeId,
    outcomeType: outcomeTypeId ? { id: outcomeTypeId, name: "Penalties", isDefault: false } : null,
    sides: [side(1, a), side(2, b)],
  };
}

const flexInfo = { teamMode: "flex", allowDraw: true, startDate: "2020-01-01", endDate: "2020-01-03", rankedConfig: null };

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockClear();
  repo.getComputedStats.mockImplementation(async () => null);
  repo.getTournamentMode.mockImplementation(async () => flexInfo);
  repo.getOutcomeDistribution.mockImplementation(async () => []);
  repo.getMatchesWithSidesAndPlayers.mockImplementation(async () => []);
  repo.getMomentum.mockImplementation(async () => []);
});

describe("tournamentStatsService.getStats", () => {
  it("serves the cached payload without computing anything", async () => {
    const cached = { totalMatches: 99 };
    repo.getComputedStats.mockImplementationOnce(async () => cached);
    expect(await tournamentStatsService.getStats("t1")).toBe(cached as any);
    expect(repo.getTournamentMode).not.toHaveBeenCalled();
    expect(repo.setComputedStats).not.toHaveBeenCalled();
  });

  it("raises NotFoundError for an unknown tournament", async () => {
    repo.getTournamentMode.mockImplementationOnce(async () => null);
    await expect(tournamentStatsService.getStats("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("computes, stores and returns the stats", async () => {
    repo.getMatchesWithSidesAndPlayers.mockImplementation(async () => [
      match("A", ["ann"], ["bob"], 5),
      match("A", ["ann"], ["bob"], 4),
      match("A", ["ann"], ["bob"], 3),
      match("B", ["ann"], ["bob"], 2),
      match("B", ["ann"], ["bob"], 1),
    ]);
    repo.getOutcomeDistribution.mockImplementation(async () => [
      { outcomeTypeId: "ot-1", count: 2 },
      { outcomeTypeId: null, count: 3 },
    ]);
    repo.getMomentum.mockImplementation(async () => [{ date: "2020-01-02", matchCount: 4 }]);

    const stats = await tournamentStatsService.getStats("t1");

    expect(stats.totalMatches).toBe(5);
    expect(stats.outcomeDistribution).toEqual([
      { outcomeTypeId: "ot-1", outcomeTypeName: "Penalties", isDefault: false, count: 2 },
      { outcomeTypeId: null, outcomeTypeName: null, isDefault: true, count: 3 },
    ]);
    // Days with no match are filled in up to the tournament's end date.
    expect(stats.momentum.map((d) => d.date)).toEqual(["2020-01-01", "2020-01-02", "2020-01-03"]);
    expect(stats.momentum[1].matchCount).toBe(4);
    // bob lost the 3 first matches then won twice: current win streak 2, ann current loss streak 2.
    expect(stats.winStreaks.map((s) => s.playerId)).toEqual(["bob"]);
    expect(stats.lossStreaks.map((s) => s.playerId)).toEqual(["ann"]);
    // ann was never beaten in her first three matches: an invincible run of 3.
    expect(stats.invincibleStreaks.find((s) => s.playerId === "ann")?.currentStreak).toBe(3);
    expect(stats.bestSoloPlayers.entries.length).toBeGreaterThan(0);
    expect(repo.setComputedStats).toHaveBeenCalledTimes(1);
  });

  it("builds team and duo boards in flex mode only", async () => {
    const duos = [
      match("A", ["a", "b"], ["c", "d"], 3),
      match("A", ["a", "b"], ["c", "d"], 2),
      match("B", ["a", "b"], ["c", "d"], 1),
    ];
    repo.getMatchesWithSidesAndPlayers.mockImplementation(async () => duos);

    const flex = await tournamentStatsService.getStats("t1");
    expect(flex.bestTeams.entries).toHaveLength(2);
    expect(flex.bestDuoPlayers.entries.length).toBeGreaterThan(0);

    repo.getTournamentMode.mockImplementation(async () => ({ ...flexInfo, teamMode: "static" }));
    const fixed = await tournamentStatsService.getStats("t2");
    expect(fixed.bestTeams.entries).toEqual([]);
    expect(fixed.bestDuoPlayers.entries).toEqual([]);
  });

  it("builds the asymmetric solo board only when the ranked config allows it", async () => {
    repo.getMatchesWithSidesAndPlayers.mockImplementation(async () => [
      match("A", ["a"], ["b", "c"], 2),
      match("A", ["a"], ["b", "c"], 1),
    ]);
    repo.getTournamentMode.mockImplementation(async () => ({
      ...flexInfo,
      rankedConfig: { allowAsymmetricMatches: true },
    }));
    const stats = await tournamentStatsService.getStats("t1");
    expect(stats.bestAsymmetricSoloPlayers.entries.length).toBeGreaterThan(0);
  });
});
