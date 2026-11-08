import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { standingsRepository } from "../../../repository/standings.repository";
import { playerStatsRepository } from "../../../repository/player-stats.repository";
import { tournamentStatsRepository } from "../../../repository/tournament-stats.repository";
import { matchResultRepository } from "../../../repository/match-result.repository";
import { makeSeeder } from "../helpers/db-seed";

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("statistics repositories (integration)", () => {
  let admin: string;
  let ann: string;
  let bob: string;
  let tournamentId: string;
  let entryAnn: string;
  let entryBob: string;
  let m1: string;
  let m2: string;

  beforeAll(async () => {
    admin = await seed.createUser("Admin");
    ann = await seed.createUser("Ann");
    bob = await seed.createUser("Bob");
    tournamentId = await seed.createTournament(admin, { teamMode: "flex" });
    entryAnn = await seed.createEntry(tournamentId, [ann]);
    entryBob = await seed.createEntry(tournamentId, [bob]);
    m1 = await seed.createMatch({ tournamentId, entryA: entryAnn, entryB: entryBob, scoreA: 3, scoreB: 1, winnerSide: "A", playedAt: new Date("2026-04-01T10:00:00Z") });
    m2 = await seed.createMatch({ tournamentId, entryA: entryBob, entryB: entryAnn, scoreA: 2, scoreB: 2, winnerSide: null, playedAt: new Date("2026-04-03T10:00:00Z") });
  });

  describe("standings", () => {
    it("loads the tournament, its entries and teams", async () => {
      expect((await standingsRepository.getTournamentWithScoring(tournamentId))?.id).toBe(tournamentId);
      expect(await standingsRepository.getTournamentTeams(tournamentId)).toEqual([]);
      const entries = await standingsRepository.getTournamentEntries(tournamentId);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.players).toHaveLength(1);
    });

    it("loads finalized matches with their sides", async () => {
      expect(await standingsRepository.getMatchesWithSides(tournamentId, ["finalized"])).toHaveLength(2);
      expect(await standingsRepository.getMatchesWithSides(tournamentId, ["cancelled"])).toHaveLength(0);
      expect(await standingsRepository.getMatchesForStandings(tournamentId, ["finalized"])).toHaveLength(2);
      expect(await standingsRepository.getMatchSides([])).toEqual([]);
      expect(await standingsRepository.getMatchSides([m1, m2])).toHaveLength(4);
    });

    it("replaces the per-player points of a tournament", async () => {
      await standingsRepository.insertPlayerPoints([]);
      await standingsRepository.insertPlayerPoints([
        { matchId: m1, playerId: ann, pointsAwarded: 3, countsForRanking: true },
        { matchId: m1, playerId: bob, pointsAwarded: 0, countsForRanking: true },
      ]);
      const pointRows = async () =>
        (await standingsRepository.getPlayerPointsForStandings(tournamentId, ["finalized"])).flatMap((m) => m.playerPoints);
      expect(await pointRows()).toHaveLength(2);
      await standingsRepository.deletePlayerPointsForTournament(tournamentId, ["finalized"]);
      expect(await pointRows()).toHaveLength(0);
    });

    it("caches computed standings and overwrites them", async () => {
      expect(await standingsRepository.getComputedData(tournamentId, "standings")).toBeNull();
      await standingsRepository.setComputedData(tournamentId, "standings", { entries: [1] } as never);
      await standingsRepository.setComputedData(tournamentId, "standings", { entries: [2] } as never);
      expect(await standingsRepository.getComputedData(tournamentId, "standings")).toMatchObject({ entries: [2] });
    });
  });

  describe("player stats", () => {
    it("reads a profile and the entries a player played", async () => {
      expect((await playerStatsRepository.getPlayerProfile(ann))?.displayName).toBe("Ann");
      expect(await playerStatsRepository.getPlayerProfile(MISSING)).toBeUndefined();

      const entries = await playerStatsRepository.getPlayerEntries(ann);
      expect(entries).toHaveLength(1);
      expect(await playerStatsRepository.getPlayerEntries(ann, { tournamentId })).toHaveLength(1);
      expect(await playerStatsRepository.getPlayerEntries(ann, { tournamentId: MISSING })).toHaveLength(0);
      expect(await playerStatsRepository.getPlayerEntries(ann, { tournamentMode: "bracket" })).toHaveLength(0);
      expect(await playerStatsRepository.getPlayerEntries(ann, { teamMode: "flex" })).toHaveLength(1);
      expect(await playerStatsRepository.getPlayerEntries(ann, {}, [MISSING])).toHaveLength(1);
    });

    it("counts players per entry and lists the players of entries", async () => {
      expect(await playerStatsRepository.getEntryPlayerCounts([])).toEqual(new Map());
      expect((await playerStatsRepository.getEntryPlayerCounts([entryAnn])).get(entryAnn)).toBe(1);
      expect(await playerStatsRepository.getPlayersInEntries([])).toEqual([]);
      expect(await playerStatsRepository.getPlayersInEntries([entryAnn, entryBob])).toHaveLength(2);
    });

    it("returns match results, history and the players around them", async () => {
      expect(await playerStatsRepository.getPlayerMatchResults([], ann)).toEqual([]);
      const results = await playerStatsRepository.getPlayerMatchResults([entryAnn], ann);
      expect(results).toHaveLength(2);

      const history = await playerStatsRepository.getPlayerMatchHistory(ann, { limit: 1 });
      expect(history).toBeDefined();
      expect(await playerStatsRepository.getPlayerMatchHistory(ann, { tournamentId, offset: 1 })).toBeDefined();

      expect(await playerStatsRepository.getMatchPlayersForSides([])).toEqual([]);
      expect(await playerStatsRepository.getMatchPlayersForSides([m1])).toHaveLength(2);
    });

    it("reads recent form, outcome names, tournaments and participants", async () => {
      expect(await playerStatsRepository.getPlayerRecentForm(ann)).toHaveLength(2);
      expect(await playerStatsRepository.getPlayerRecentForm(ann, 1, tournamentId)).toHaveLength(1);
      expect(await playerStatsRepository.getOutcomeTypeNames([])).toEqual([]);
      expect(await playerStatsRepository.getOutcomeTypeNames([MISSING])).toEqual([]);
      expect((await playerStatsRepository.getPlayerTournaments(ann)).map((t) => t.id)).toEqual([tournamentId]);
      expect((await playerStatsRepository.getPlayerIdsByTournament(tournamentId)).sort()).toEqual([ann, bob].sort());
    });
  });

  describe("tournament stats", () => {
    it("reads mode, outcome distribution, finalized matches and momentum", async () => {
      expect((await tournamentStatsRepository.getTournamentMode(tournamentId))?.teamMode).toBe("flex");
      expect(await tournamentStatsRepository.getOutcomeDistribution(tournamentId)).toEqual([{ outcomeTypeId: null, count: 2 }]);
      expect(await tournamentStatsRepository.getMatchesWithSidesAndPlayers(tournamentId)).toHaveLength(2);
      const momentum = await tournamentStatsRepository.getMomentum(tournamentId);
      expect(momentum.map((d) => d.date)).toEqual(["2026-04-01", "2026-04-03"]);
    });

    it("caches, overwrites and drops the computed stats", async () => {
      expect(await tournamentStatsRepository.getComputedStats(tournamentId)).toBeNull();
      await tournamentStatsRepository.setComputedStats(tournamentId, { totalMatches: 1 } as never);
      await tournamentStatsRepository.setComputedStats(tournamentId, { totalMatches: 2 } as never);
      expect(await tournamentStatsRepository.getComputedStats(tournamentId)).toMatchObject({ totalMatches: 2 });
      await tournamentStatsRepository.deleteComputedStats(tournamentId);
      expect(await tournamentStatsRepository.getComputedStats(tournamentId)).toBeNull();
    });
  });

  describe("match results", () => {
    it("reads, reports and finalizes a result", async () => {
      const tmp = await seed.createMatch({ tournamentId, entryA: entryAnn, entryB: entryBob, status: "scheduled", winnerSide: null, finalized: false });
      expect(await matchResultRepository.getByMatchId(MISSING)).toBeUndefined();
      expect(await matchResultRepository.isFinalized(tmp)).toBe(false);

      await matchResultRepository.markAsReported(tmp, ann, "https://proof");
      expect(await matchResultRepository.isReported(tmp)).toBe(true);
      expect((await matchResultRepository.getByMatchId(tmp))?.reporter?.id).toBe(ann);

      await matchResultRepository.markAsFinalized(tmp, admin, "admin_override");
      expect(await matchResultRepository.isFinalized(tmp)).toBe(true);
      expect((await matchResultRepository.getByMatchId(tmp))?.finalizationReason).toBe("admin_override");

      await matchResultRepository.delete(tmp);
      expect(await matchResultRepository.getByMatchId(tmp)).toBeUndefined();
      expect(await matchResultRepository.isReported(tmp)).toBeFalsy();
    });

    it("creates a result inside a transaction", async () => {
      const tmp = await seed.createMatch({ tournamentId, entryA: entryAnn, entryB: entryBob, status: "scheduled", winnerSide: null, finalized: false });
      await matchResultRepository.delete(tmp);
      await testDb.transaction(async (tx) => {
        await matchResultRepository.create(tmp, { reportedBy: bob, reportedAt: new Date() }, tx as never);
      });
      expect((await matchResultRepository.getByMatchId(tmp))?.reportedBy).toBe(bob);
    });
  });
});
