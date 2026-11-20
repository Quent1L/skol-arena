import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { matchConfirmationRepository as confirmations } from "../../../repository/match-confirmation.repository";
import { matchSidesRepository as sides } from "../../../repository/match-sides.repository";
import { makeSeeder } from "../helpers/db-seed";

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("match confirmations and sides (integration)", () => {
  let ann: string;
  let bob: string;
  let cat: string;
  let tournamentId: string;
  let entryA: string;
  let entryB: string;
  let matchId: string;
  let otherMatchId: string;

  beforeAll(async () => {
    const admin = await seed.createUser("Admin");
    [ann, bob, cat] = (await Promise.all(["Ann", "Bob", "Cat"].map((n) => seed.createUser(n)))) as [
      string,
      string,
      string,
    ];
    tournamentId = await seed.createTournament(admin);
    entryA = await seed.createEntry(tournamentId, [ann, cat]);
    entryB = await seed.createEntry(tournamentId, [bob]);
    matchId = await seed.createMatch({ tournamentId, entryA, entryB, scoreA: 4, scoreB: 2, winnerSide: "A" });
    otherMatchId = await seed.createMatch({ tournamentId, entryA, entryB, status: "scheduled", winnerSide: null });
  });

  describe("confirmations", () => {
    it("creates and reads a confirmation, separating pre and post finalization ones", async () => {
      await confirmations.create({ matchId, playerId: bob, isConfirmed: true, isContested: false, sidePosition: 2 });
      expect((await confirmations.getByMatchAndPlayer(matchId, bob))?.player.id).toBe(bob);
      expect(await confirmations.getByMatchAndPlayer(matchId, bob, true)).toBeUndefined();
      expect(await confirmations.getByMatchAndPlayer(matchId, ann)).toBeUndefined();
      expect(await confirmations.hasPlayerConfirmed(matchId, bob)).toBe(true);
      expect(await confirmations.hasPlayerConfirmed(matchId, ann)).toBe(false);
      expect(await confirmations.hasPlayerContested(matchId, bob)).toBe(false);
    });

    it("upserts: creates the first time, updates afterwards", async () => {
      const created = await confirmations.upsert({
        matchId,
        playerId: ann,
        isConfirmed: false,
        isContested: true,
        contestationReason: "wrong score",
        sidePosition: 1,
      });
      expect(created?.isContested).toBe(true);
      const updated = await confirmations.upsert({
        matchId,
        playerId: ann,
        isConfirmed: true,
        isContested: false,
        contestationReason: null,
        sidePosition: 1,
      });
      expect(updated).toMatchObject({ id: created!.id, isConfirmed: true, isContested: false });
      expect(await confirmations.getByMatchId(matchId)).toHaveLength(2);
    });

    it("updates a record in place", async () => {
      const updated = await confirmations.update(matchId, bob, { isContested: true, contestationReason: "no" });
      expect(updated).toMatchObject({ isContested: true, contestationReason: "no" });
      expect(await confirmations.hasPlayerContested(matchId, bob)).toBe(true);
      expect(await confirmations.hasAnyContestation(matchId)).toBe(true);
    });

    it("counts confirmations", async () => {
      expect(await confirmations.countConfirmationsByMatch(matchId)).toEqual({ total: 2, confirmed: 2, contested: 1 });
      expect(await confirmations.countConfirmationsByMatch(MISSING)).toEqual({ total: 0, confirmed: 0, contested: 0 });
    });

    it("resets everyone but one player, leaving post-finalization disputes alone", async () => {
      await confirmations.create({
        matchId,
        playerId: cat,
        isConfirmed: false,
        isContested: true,
        isPostFinalization: true,
      });
      await confirmations.resetConfirmationsExcept(matchId, ann);

      const bobNow = await confirmations.getByMatchAndPlayer(matchId, bob);
      expect(bobNow).toMatchObject({ isConfirmed: false, isContested: false, contestationReason: null });
      expect((await confirmations.getByMatchAndPlayer(matchId, ann))?.isConfirmed).toBe(true);
      expect((await confirmations.getByMatchAndPlayer(matchId, cat, true))?.isContested).toBe(true);
    });

    it("finds matches with an open post-finalization dispute and answers per player", async () => {
      expect(await confirmations.getMatchIdsWithOpenPostDispute([])).toEqual([]);
      expect(await confirmations.getMatchIdsWithOpenPostDispute([matchId, otherMatchId])).toEqual([matchId]);
      expect(await confirmations.hasPlayerDisputedPostFinalization(matchId, cat)).toBe(true);
      expect(await confirmations.hasPlayerDisputedPostFinalization(matchId, bob)).toBe(false);
    });

    it("deletes post-finalization disputes, one record, then everything", async () => {
      await confirmations.deletePostFinalizationByMatchId(matchId);
      expect(await confirmations.hasPlayerDisputedPostFinalization(matchId, cat)).toBe(false);

      await confirmations.delete(matchId, bob);
      expect(await confirmations.getByMatchAndPlayer(matchId, bob)).toBeUndefined();

      await confirmations.deleteByMatchId(matchId);
      expect(await confirmations.getByMatchId(matchId)).toEqual([]);
      expect(await confirmations.hasAnyContestation(matchId)).toBe(false);
    });
  });

  describe("sides", () => {
    it("reads sides in position order with their entries", async () => {
      const found = await sides.getByMatchId(matchId);
      expect(found.map((s) => s.position)).toEqual([1, 2]);
      expect(found[0]!.entry.players.map((p) => p.player.id).sort()).toEqual([ann, cat].sort());
    });

    it("finds a side by entry, by position and across matches", async () => {
      expect((await sides.getByMatchAndEntry(matchId, entryB))?.position).toBe(2);
      expect(await sides.getByMatchAndEntry(matchId, MISSING)).toBeUndefined();
      expect((await sides.getByPosition(matchId, 1))?.entryId).toBe(entryA);
      const many = await sides.getByMatchIds([matchId, otherMatchId]);
      expect(many).toHaveLength(4);
      expect(await sides.getByMatchIds([])).toEqual([]);
      expect(await sides.isEntryInMatch(matchId, entryA)).toBe(true);
      expect(await sides.isEntryInMatch(matchId, MISSING)).toBe(false);
    });

    it("returns the winning entry, or null when nobody won", async () => {
      expect((await sides.getWinnerEntry(matchId))?.id).toBe(entryA);
      expect(await sides.getWinnerEntry(otherMatchId)).toBeNull();
      expect(await sides.getWinnerEntry(MISSING)).toBeNull();
    });

    it("updates scores and points", async () => {
      await sides.updateScores(otherMatchId, [
        { entryId: entryA, score: 7 },
        { entryId: entryB, score: null },
      ]);
      const points = await sides.updatePointsAwarded(otherMatchId, entryA, 3);
      expect(points?.pointsAwarded).toBe(3);
      const updated = await sides.getByMatchId(otherMatchId);
      expect(updated.map((s) => s.score)).toEqual([7, null]);
    });

    it("creates sides, refusing an empty list, and deletes them", async () => {
      const tmp = await seed.createMatch({ tournamentId, entryA, entryB });
      await sides.deleteByMatchId(tmp);
      expect(await sides.getByMatchId(tmp)).toEqual([]);
      await expect(sides.createSides(tmp, [])).rejects.toThrow("At least one side");
      const created = await sides.createSides(tmp, [
        { entryId: entryA, position: 1, score: 1 },
        { entryId: entryB, position: 2, score: 0, pointsAwarded: 2 },
      ]);
      expect(created.map((c) => c.pointsAwarded)).toEqual([0, 2]);
    });
  });
});
