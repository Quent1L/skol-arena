/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";

const PLAYED_AT = new Date("2026-03-01T20:00:00Z");

const mockRepo = {
  upsertMany: mock((_rows: any) => Promise.resolve()),
  listPlayersMatches: mock((_s: any, _p: any, _f?: any) => Promise.resolve([] as any[])),
  listMissingMatchIds: mock((_s: any, _p: any, _u: any) => Promise.resolve([] as string[])),
  listForPlayerSeason: mock((_s: any, _p: any, _u: any) => Promise.resolve([] as any[])),
  listPlayersActiveInDisciplineSince: mock((_s: any, _p: any, _d: any) => Promise.resolve([] as string[])),
};
mock.module("../../repository/match-player-facts.repository", () => ({ matchPlayerFactsRepository: mockRepo }));

const mockContext = {
  buildMatchSubmittedContexts: mock((_m: any, _h: any) =>
    Promise.resolve({
      contexts: [{ playerId: "p1", context: { newRank: "silver" } }],
      displayNames: new Map(),
      playedAt: PLAYED_AT,
    } as any),
  ),
};
mock.module("../rules-context.service", () => ({ rulesContextService: mockContext }));

const { RulesMatchHistoryService } = await import("../rules-match-history.service");

describe("RulesMatchHistoryService", () => {
  const service = new RulesMatchHistoryService();

  beforeEach(() => {
    mockRepo.upsertMany.mockClear();
    mockRepo.listPlayersMatches.mockClear();
    mockContext.buildMatchSubmittedContexts.mockClear();
  });

  it("freezes a match from its historical facts, never the player's live state", async () => {
    await service.refreshMatch("m1", "s1");

    expect(mockContext.buildMatchSubmittedContexts).toHaveBeenCalledWith("m1", true);
    expect(mockRepo.upsertMany).toHaveBeenCalledWith([
      { matchId: "m1", playerId: "p1", seasonId: "s1", playedAt: PLAYED_AT, facts: { newRank: "silver" } },
    ]);
  });

  it("rewrites a match shared by two players only once", async () => {
    mockRepo.listPlayersMatches.mockResolvedValue([
      { matchId: "m1", playerId: "p1" },
      { matchId: "m1", playerId: "p2" },
      { matchId: "m2", playerId: "p1" },
    ]);

    await service.refreshPlayers("s1", ["p1", "p2"]);

    expect(mockContext.buildMatchSubmittedContexts).toHaveBeenCalledTimes(2);
  });

  it("carries on past a match that fails to refresh", async () => {
    mockRepo.listPlayersMatches.mockResolvedValue([
      { matchId: "m1", playerId: "p1" },
      { matchId: "m2", playerId: "p1" },
    ]);
    mockRepo.upsertMany.mockRejectedValueOnce(new Error("boom"));

    await service.refreshPlayers("s1", ["p1"]);

    expect(mockRepo.upsertMany).toHaveBeenCalledTimes(2);
  });

  it("reports only the players a backdated match has later matches for", async () => {
    mockRepo.listPlayersMatches.mockResolvedValue([
      { matchId: "backdated", playerId: "p1" },
      { matchId: "backdated", playerId: "p2" },
      { matchId: "later", playerId: "p1" },
    ]);

    const moved = await service.refreshAfterBackdatedMatch("s1", "backdated", ["p1", "p2"], PLAYED_AT);

    expect(moved).toEqual(["p1"]);
    expect(mockContext.buildMatchSubmittedContexts).toHaveBeenCalledTimes(1);
    expect(mockContext.buildMatchSubmittedContexts).toHaveBeenCalledWith("later", true);
  });

  it("also reports players who played on in a later season of the discipline", async () => {
    mockRepo.listPlayersMatches.mockResolvedValue([{ matchId: "backdated", playerId: "p1" }]);
    mockRepo.listPlayersActiveInDisciplineSince.mockResolvedValueOnce(["p1"]);

    const moved = await service.refreshAfterBackdatedMatch("s1", "backdated", ["p1", "p2"], PLAYED_AT);

    expect(moved).toEqual(["p1"]);
    expect(mockContext.buildMatchSubmittedContexts).not.toHaveBeenCalled();
  });
});
