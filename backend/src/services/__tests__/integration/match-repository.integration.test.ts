import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { matchRepository } from "../../../repository/match.repository";
import { insertTournamentConfigs } from "../helpers/tournament-config-test-helpers";
import { makeSeeder } from "../helpers/db-seed";
import { BadRequestError } from "../../../types/errors";
import { teams } from "../../../db/schema";

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("matchRepository (integration)", () => {
  let admin: string;
  let [ann, bob, cat, dan]: string[] = [];
  let tournamentId: string;
  let otherTournamentId: string;
  let finalizedId: string; // ann+bob beat cat+dan 3-1
  let scheduledId: string; // ann vs cat, nothing played yet
  let secondId: string; // ann+bob vs cat+dan again, 2-2 draw
  const earlier = new Date("2026-02-01T10:00:00Z");

  beforeAll(async () => {
    admin = await seed.createUser("Admin");
    [ann, bob, cat, dan] = await Promise.all(["Ann", "Bob", "Cat", "Dan"].map((n) => seed.createUser(n)));
    tournamentId = await seed.createTournament(admin);
    otherTournamentId = await seed.createTournament(admin);
    await insertTournamentConfigs(testDb, tournamentId);
    await insertTournamentConfigs(testDb, otherTournamentId);

    finalizedId = await matchRepository.create({
      tournamentId,
      sides: [
        { position: 1, playerIds: [ann!, bob!] },
        { position: 2, playerIds: [cat!, dan!] },
      ],
      scoreA: 3,
      scoreB: 1,
      status: "finalized",
      reportedBy: ann,
      playedAt: earlier,
      createdBy: admin,
    });
    scheduledId = await matchRepository.create({
      tournamentId,
      sides: [
        { position: 1, playerIds: [ann!] },
        { position: 2, playerIds: [cat!] },
      ],
      playedAt: new Date("2026-03-01T10:00:00Z"),
    });
    secondId = await matchRepository.create({
      tournamentId,
      sides: [
        { position: 1, playerIds: [ann!, bob!] },
        { position: 2, playerIds: [cat!, dan!] },
      ],
      scoreA: 2,
      scoreB: 2,
      status: "reported",
      reportedBy: bob,
      playedAt: new Date("2026-02-15T10:00:00Z"),
    });
  });

  describe("create and read", () => {
    it("settles winner and points for a played match", async () => {
      const match = await matchRepository.getById(finalizedId);
      expect(match?.status).toBe("finalized");
      expect(match?.result?.finalizationReason).toBeUndefined();
      const scores = match!.sides.map((s) => s.score);
      expect(scores).toEqual([3, 1]);
    });

    it("records a draw as equal scores", async () => {
      const match = await matchRepository.getById(secondId);
      expect(match!.sides.map((s) => s.score)).toEqual([2, 2]);
    });

    it("leaves a scheduled match without result or points", async () => {
      const match = await matchRepository.getById(scheduledId);
      expect(match?.status).toBe("scheduled");
      expect(match!.sides.map((s) => s.score)).toEqual([0, 0]);
    });

    it("returns null for an unknown match and a bare row for the simple read", async () => {
      expect(await matchRepository.getById(MISSING)).toBeNull();
      expect((await matchRepository.getByIdSimple(finalizedId))?.tournamentId).toBe(tournamentId);
      expect(await matchRepository.getStatusesByIds([finalizedId, scheduledId])).toEqual(
        expect.arrayContaining([
          { id: finalizedId, status: "finalized" },
          { id: scheduledId, status: "scheduled" },
        ]),
      );
    });
  });

  describe("finalization", () => {
    it("lets only the first of two concurrent finalizations through", async () => {
      // Its own tournament, so the listing and counting fixtures stay untouched.
      const ownTournamentId = await seed.createTournament(admin);
      await insertTournamentConfigs(testDb, ownTournamentId);
      const id = await matchRepository.create({
        tournamentId: ownTournamentId,
        sides: [
          { position: 1, playerIds: [ann!] },
          { position: 2, playerIds: [cat!] },
        ],
        scoreA: 1,
        scoreB: 0,
        status: "reported",
        reportedBy: ann,
        playedAt: earlier,
        createdBy: admin,
      });
      const finalize = () => matchRepository.update(id, { status: "finalized", finalizedAt: new Date() });

      const results = await Promise.allSettled([finalize(), finalize()]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const [rejected] = results.filter((r) => r.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestError);
      expect((rejected as PromiseRejectedResult).reason.code).toBe("MATCH_ALREADY_FINALIZED");
    });

    it("never brings a match cancelled meanwhile back as finalized", async () => {
      const ownTournamentId = await seed.createTournament(admin);
      await insertTournamentConfigs(testDb, ownTournamentId);
      const id = await matchRepository.create({
        tournamentId: ownTournamentId,
        sides: [
          { position: 1, playerIds: [ann!] },
          { position: 2, playerIds: [cat!] },
        ],
        scoreA: 1,
        scoreB: 0,
        status: "reported",
        reportedBy: ann,
        playedAt: earlier,
        createdBy: admin,
      });
      // The finalize read "reported" and passed its check, then a cancel committed.
      await matchRepository.update(id, { status: "cancelled" });

      await expect(matchRepository.update(id, { status: "finalized", finalizedAt: new Date() })).rejects.toThrow(
        "MATCH_ALREADY_FINALIZED",
      );
      expect((await matchRepository.getById(id))?.status).toBe("cancelled");
    });
  });

  describe("listing", () => {
    it("filters by tournament, status and player", async () => {
      expect(await matchRepository.list({ tournamentId })).toHaveLength(3);
      expect(await matchRepository.list({ tournamentId: otherTournamentId })).toEqual([]);
      expect(await matchRepository.list({ tournamentId, status: "finalized" })).toHaveLength(1);
      expect(await matchRepository.list({ playerId: dan })).toHaveLength(2);
      expect(await matchRepository.list({ playerId: admin })).toEqual([]);
      expect((await matchRepository.list()).length).toBeGreaterThanOrEqual(3);
    });

    it("paginates match cards with a total, filtered by player and status", async () => {
      const page = await matchRepository.listMatchCards({ tournamentId, limit: 2, offset: 0 }, null);
      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(3);

      const mine = await matchRepository.listMatchCards({ playerIds: `${ann},${bob}`, limit: 10, offset: 0 }, null);
      expect(mine.data).toHaveLength(2);

      const finalized = await matchRepository.listMatchCards({ status: "finalized", limit: 10, offset: 0 }, null);
      expect(finalized.data.every((c) => c.status === "finalized")).toBe(true);

      const bracketOnly = await matchRepository.listMatchCards({ bracketMode: true, limit: 10, offset: 0 }, null);
      expect(bracketOnly.data.length).toBeGreaterThanOrEqual(3);
    });

    it("keeps competitions that belong to no organisation visible to everyone", async () => {
      const visible = await matchRepository.listMatchCards({ tournamentId, limit: 10, offset: 0 }, [MISSING]);
      expect(visible.total).toBe(3);
    });
  });

  describe("counting", () => {
    it("counts matches of a tournament, entered ones, and per user", async () => {
      expect(await matchRepository.countByTournament(tournamentId)).toBe(3);
      expect(await matchRepository.countEnteredMatches(tournamentId)).toBe(2);
      expect(await matchRepository.countMatchesForUser(tournamentId, ann!)).toBe(3);
      expect(await matchRepository.countMatchesForUser(tournamentId, ann!, finalizedId)).toBe(2);
      expect(await matchRepository.countMatchesForUser(tournamentId, admin)).toBe(0);
    });

    it("counts partner and opponent repetitions", async () => {
      expect(await matchRepository.countMatchesWithSamePartner(tournamentId, ann!, bob!)).toBe(2);
      expect(await matchRepository.countMatchesWithSamePartner(tournamentId, ann!, bob!, finalizedId)).toBe(1);
      expect(await matchRepository.countMatchesWithSamePartner(tournamentId, ann!, cat!)).toBe(0);
      expect(await matchRepository.countMatchesWithSamePartner(tournamentId, admin, bob!)).toBe(0);
      expect(await matchRepository.countMatchesWithSameOpponent(tournamentId, ann!, cat!)).toBeGreaterThanOrEqual(2);
      expect(await matchRepository.countMatchesWithSameOpponent(tournamentId, ann!, bob!)).toBe(0);
      expect(await matchRepository.countMatchesWithSameOpponent(tournamentId, ann!, cat!, undefined, 2)).toBe(2);
    });

    it("counts team repetitions, exactly and head to head", async () => {
      expect(await matchRepository.countMatchesForTeam(tournamentId, [ann!, bob!])).toBe(2);
      expect(await matchRepository.countMatchesForTeam(tournamentId, [ann!, bob!], secondId)).toBe(1);
      expect(await matchRepository.countMatchesForTeam(tournamentId, [])).toBe(0);
      expect(await matchRepository.countMatchesTeamsVsTeam(tournamentId, [ann!, bob!], [cat!, dan!])).toBe(2);
      expect(await matchRepository.countMatchesTeamsVsTeam(tournamentId, [ann!, bob!], [cat!, dan!], secondId)).toBe(1);
      expect(await matchRepository.countMatchesTeamsVsTeam(tournamentId, [], [cat!])).toBe(0);
    });

    it("counts finalized matches before a date", async () => {
      expect(await matchRepository.countFinalizedMatchesForUserBefore(tournamentId, ann!, new Date("2026-02-10T00:00:00Z"))).toBe(1);
      expect(await matchRepository.countFinalizedMatchesForUserBefore(tournamentId, ann!, new Date("2026-02-10T00:00:00Z"), finalizedId)).toBe(0);
      expect(await matchRepository.countFinalizedMatchesForUserBefore(tournamentId, admin, new Date())).toBe(0);
    });
  });

  describe("participation helpers", () => {
    it("tells who is in a match and lists the players", async () => {
      expect(await matchRepository.isUserInMatch(finalizedId, ann!)).toBe(true);
      expect(await matchRepository.isUserInMatch(finalizedId, admin)).toBe(false);
      expect((await matchRepository.getPlayerIdsForMatch(finalizedId)).sort()).toEqual([ann!, bob!, cat!, dan!].sort());
      const participations = await matchRepository.getParticipationsByMatchId(finalizedId);
      expect(participations.filter((p) => p.teamSide === "A").map((p) => p.playerId).sort()).toEqual([ann!, bob!].sort());
    });

    it("finds earlier matches with the same two entries", async () => {
      const sides = (await matchRepository.getById(finalizedId))!.sides;
      const [a, b] = sides.map((s) => s.entryId as string);
      expect(await matchRepository.findMatchesWithSameEntries(tournamentId, a!, b!)).toEqual(
        expect.arrayContaining([finalizedId, secondId]),
      );
      expect(await matchRepository.findMatchesWithSameEntries(tournamentId, a!, b!, finalizedId)).toEqual([secondId]);
    });

    it("detects a player already playing at the same minute", async () => {
      const clash = await matchRepository.findPlayerConflictAtTime([ann!], earlier, tournamentId);
      expect(clash?.playerId).toBe(ann!);
      expect(await matchRepository.findPlayerConflictAtTime([ann!], earlier, tournamentId, finalizedId)).toBeNull();
      expect(await matchRepository.findPlayerConflictAtTime([], earlier, tournamentId)).toBeNull();
      expect(await matchRepository.findPlayerConflictAtTime([ann!], new Date("2020-01-01"), tournamentId)).toBeNull();
    });

    it("lists reported matches awaiting finalization", async () => {
      const pending = await matchRepository.getMatchesPendingFinalization();
      expect(pending.map((m) => m.id)).toContain(secondId);
    });
  });

  describe("tournament access", () => {
    it("loads a tournament with its configs", async () => {
      expect((await matchRepository.getTournament(tournamentId))?.id).toBe(tournamentId);
    });

    it("validates that picked teams belong to the tournament and differ", async () => {
      const [teamA] = await testDb.insert(teams).values({ name: "A", tournamentId, createdBy: admin }).returning();
      const [teamB] = await testDb.insert(teams).values({ name: "B", tournamentId, createdBy: admin }).returning();
      await matchRepository.validateEntriesForTournament(tournamentId, teamA!.id, teamB!.id);
      await matchRepository.validateEntriesForTournament(tournamentId);
      await expect(matchRepository.validateEntriesForTournament(tournamentId, teamA!.id, teamA!.id)).rejects.toBeInstanceOf(BadRequestError);
      await expect(matchRepository.validateEntriesForTournament(otherTournamentId, teamA!.id)).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("delete", () => {
    it("removes a match", async () => {
      await matchRepository.delete(secondId);
      expect(await matchRepository.getById(secondId)).toBeNull();
      expect(await matchRepository.countByTournament(tournamentId)).toBe(2);
    });
  });
});
