import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { playerMmrRepository as repo } from "../../../repository/player-mmr.repository";
import { makeSeeder } from "../helpers/db-seed";

const seed = makeSeeder(testDb);

describe("playerMmrRepository (integration)", () => {
  let ann: string;
  let bob: string;
  let seasonId: string;
  let m1: string;
  let m2: string;
  let m3: string;
  const t1 = new Date("2026-05-01T10:00:00Z");
  const t2 = new Date("2026-05-02T10:00:00Z");
  const t3 = new Date("2026-05-03T10:00:00Z");

  const history = (
    playerId: string,
    matchId: string,
    before: number,
    after: number,
    outcome: "win" | "loss" | "draw" | null,
    n: number,
  ) => ({
    seasonId,
    playerId,
    matchId,
    mmrBefore: before,
    mmrAfter: after,
    mmrDelta: after - before,
    kEffective: 32,
    opponentAvgMmr: 1000,
    isPlacement: n <= 1,
    outcome,
    winStreakAfter: outcome === "win" ? 1 : 0,
    lossStreakAfter: outcome === "loss" ? 1 : 0,
    matchesPlayedAfter: n,
  });

  beforeAll(async () => {
    const admin = await seed.createUser("Admin");
    ann = await seed.createUser("Ann");
    bob = await seed.createUser("Bob");
    seasonId = await seed.createTournament(admin, { mode: "ranked" });
    const [eA, eB] = await Promise.all([seed.createEntry(seasonId, [ann]), seed.createEntry(seasonId, [bob])]);
    m1 = await seed.createMatch({ tournamentId: seasonId, entryA: eA, entryB: eB, playedAt: t1 });
    m2 = await seed.createMatch({ tournamentId: seasonId, entryA: eA, entryB: eB, playedAt: t2, winnerSide: "B" });
    m3 = await seed.createMatch({ tournamentId: seasonId, entryA: eA, entryB: eB, playedAt: t3, winnerSide: null });
  });

  it("creates a rating row, then updates it in place", async () => {
    const base = {
      seasonId,
      playerId: ann,
      currentMmr: 1000,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      winStreak: 0,
      maxWinStreak: 0,
      lossStreak: 0,
      maxLossStreak: 0,
    };
    const created = await repo.upsert(base);
    const updated = await repo.upsert({
      ...base,
      currentMmr: 1030,
      matchesPlayed: 1,
      wins: 1,
      winStreak: 1,
      maxWinStreak: 1,
    });
    expect(updated?.id).toBe(created?.id);
    expect(updated).toMatchObject({ currentMmr: 1030, draws: 0 });
    await repo.upsert({ ...base, playerId: bob, currentMmr: 990, matchesPlayed: 1, losses: 1, draws: 1 });

    expect((await repo.getBySeasonAndPlayer(seasonId, ann))?.currentMmr).toBe(1030);
    expect((await repo.getAllPlayersBySeasonId(seasonId)).map((p) => p.playerId).sort()).toEqual([ann, bob].sort());
    expect((await repo.getByPlayerAcrossSeasons(ann)).map((p) => p.seasonId)).toEqual([seasonId]);
    const mmrs = await repo.getPlayerCurrentMmrs(seasonId, [ann, bob]);
    expect(mmrs.get(bob)).toBe(990);
    expect((await repo.getPlayerCurrentMmrs(seasonId, [])).size).toBe(0);
  });

  it("records history in single and batch writes", async () => {
    await repo.createMmrHistory(history(ann, m1, 1000, 1030, "win", 1));
    await repo.createMmrHistoryBatch([]);
    await repo.createMmrHistoryBatch([
      history(bob, m1, 1000, 970, "loss", 1),
      history(ann, m2, 1030, 1010, "loss", 2),
      history(bob, m2, 970, 990, "win", 2),
      history(ann, m3, 1010, 1010, "draw", 3),
      history(bob, m3, 990, 990, null, 3),
    ]);
    expect((await repo.getMmrHistoryForPlayerAndMatch(seasonId, ann, m1))?.mmrAfter).toBe(1030);
    expect(
      await repo.getMmrHistoryForPlayerAndMatch(seasonId, ann, "00000000-0000-4000-8000-000000000000"),
    ).toBeUndefined();
  });

  it("orders the season with each player's recent results, legacy rows included", async () => {
    const board = await repo.getBySeasonOrdered(seasonId);
    expect(board.map((p) => p.playerId)).toEqual([ann, bob]);
    const bobRow = board[1] as unknown as { recentResults: { outcome: string }[] };
    // Oldest first; the row without a stored outcome falls back on the delta sign (0 → draw).
    expect(bobRow.recentResults.map((r) => r.outcome)).toEqual(["loss", "win", "draw"]);
    expect(await repo.getBySeasonOrdered("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("reads history pages, ordered series and chart points", async () => {
    const page = await repo.getMmrHistory(seasonId, ann, 2, 0);
    expect(page.map((r) => r.matchId)).toEqual([m3, m2]);
    expect(page[0]).toMatchObject({ teamSizeA: 1, teamSizeB: 1 });
    expect((await repo.getMmrHistory(seasonId, ann, 2, 2)).map((r) => r.matchId)).toEqual([m1]);

    expect((await repo.getMmrHistoryOrdered(seasonId, ann)).map((r) => r.matchId)).toEqual([m1, m2, m3]);
    const chart = await repo.getMmrChartSeries(seasonId, ann);
    expect(chart.map((p) => p.mmrAfter)).toEqual([1030, 1010, 1010]);

    const many = await repo.getMmrHistoryOrderedForPlayers(seasonId, [ann, bob]);
    expect(many.get(bob)?.map((r) => r.matchId)).toEqual([m1, m2, m3]);
    expect((await repo.getMmrHistoryOrderedForPlayers(seasonId, [])).size).toBe(0);
  });

  it("lists the matches of a season, or of several seasons, in play order", async () => {
    expect(await repo.getSeasonMatchIdsOrdered(seasonId)).toEqual([m1, m2, m3]);
    expect(await repo.getSeasonsMatchesOrdered([])).toEqual([]);
    const all = await repo.getSeasonsMatchesOrdered([seasonId]);
    expect(all.map((r) => r.matchId)).toEqual([m1, m2, m3]);
    expect(await repo.getSeasonsMatchesOrdered([seasonId], bob)).toHaveLength(3);
    expect(await repo.getMatchPlayersForHistory([])).toEqual([]);
    expect(await repo.getMatchPlayersForHistory([m1])).toHaveLength(2);
  });

  it("rebuilds a checkpoint from the history before a date", async () => {
    expect(await repo.getCheckpointState(seasonId, ann, t1)).toBeNull();
    const state = await repo.getCheckpointState(seasonId, ann, t3);
    expect(state).toMatchObject({ mmr: 1010, wins: 1, losses: 1, draws: 0, maxWinStreak: 1, maxLossStreak: 1 });
    const withDraw = await repo.getCheckpointState(seasonId, ann, new Date("2026-06-01"));
    expect(withDraw?.draws).toBe(1);
  });

  it("preloads opponent ratings and pages through finalized matches", async () => {
    expect((await repo.preloadOpponentHistories(seasonId, [], [bob])).size).toBe(0);
    expect((await repo.preloadOpponentHistories(seasonId, [m1], [])).size).toBe(0);
    expect((await repo.preloadOpponentHistories(seasonId, [m1, m2], [bob])).size).toBe(2);

    const first = await repo.getFinalizedMatchesPageForSeason(seasonId, undefined, 2);
    expect(first.map((m) => m.id)).toEqual([m1, m2]);
    const next = await repo.getFinalizedMatchesPageForSeason(
      seasonId,
      { playedAt: first[1]!.playedAt, id: first[1]!.id },
      2,
    );
    expect(next.map((m) => m.id)).toEqual([m3]);
  });

  it("computes weekly leaders and season / career statistics", async () => {
    const leaders = await repo.getMmrDeltasSince(seasonId, new Date("2026-04-01"));
    expect(leaders.find((l) => l.playerId === ann)).toMatchObject({ matchesPlayed: 3 });

    const stats = await repo.getSeasonMmrStats(seasonId, 1);
    expect(stats.find((s) => s.playerId === ann)).toMatchObject({ matchesPlayed: 3, peakMmr: 1030 });
    expect(await repo.getSeasonMmrStats(seasonId, 99)).toEqual([]);

    const career = await repo.getPlayerCareerMmrStats(ann);
    expect(career[0]).toMatchObject({ seasonId, entryMmr: 1000, matchesPlayed: 3 });
  });

  it("deletes history from a date, then wholesale, and rating rows", async () => {
    await repo.deleteMmrHistoryForPlayer(seasonId, ann, new Date("2099-01-01"));
    expect(await repo.getMmrHistoryOrdered(seasonId, ann)).toHaveLength(3);
    await repo.deleteMmrHistoryForPlayer(seasonId, ann, t2);
    expect((await repo.getMmrHistoryOrdered(seasonId, ann)).map((r) => r.matchId)).toEqual([m1]);
    await repo.deleteMmrHistoryForPlayer(seasonId, ann);
    expect(await repo.getMmrHistoryOrdered(seasonId, ann)).toEqual([]);

    await repo.deleteBySeasonAndPlayer(seasonId, ann);
    expect(await repo.getBySeasonAndPlayer(seasonId, ann)).toBeUndefined();

    await repo.deleteAllMmrHistoryForSeason(seasonId);
    expect(await repo.getSeasonMatchIdsOrdered(seasonId)).toEqual([]);
  });
});
