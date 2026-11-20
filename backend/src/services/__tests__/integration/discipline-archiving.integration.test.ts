import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { disciplineService } from "../../discipline.service";
import { outcomeTypeService } from "../../outcome-type.service";
import {
  appUsers,
  disciplines,
  matches,
  outcomeReasons,
  outcomeTypes,
  tournaments,
  user as betterAuthUser,
} from "../../../db/schema";
import { eq } from "drizzle-orm";
import { ConflictError, ErrorCode } from "../../../types/errors";

/**
 * A match must never lose the outcome it was played under: before archiving, a
 * deleted outcome type left `matches.outcome_type_id` NULL and the match silently
 * fell back to a hardcoded points: 3 / mmrMultiplier: 1, rewriting standings
 * tiebreakers and MMR for competitions that were already over.
 *
 * These tests pin both halves of the fix — the restrict foreign keys and the
 * service-level preflight that turns them into a legible 409.
 */
describe("Discipline and outcome archiving", () => {
  let actorId: string;

  const dates = () => {
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return { startDate: today, endDate: nextWeek };
  };

  async function createDiscipline(name: string) {
    const [discipline] = await testDb
      .insert(disciplines)
      .values({ name, teamInteractionMode: "COLLABORATIVE" })
      .returning();
    return discipline;
  }

  async function createOutcomeType(disciplineId: string, name: string, isDefault = false) {
    const [outcomeType] = await testDb.insert(outcomeTypes).values({ disciplineId, name, isDefault }).returning();
    return outcomeType;
  }

  /** A bare match row is enough: the foreign keys under test are on `matches` itself. */
  async function createMatch(
    tournamentId: string,
    outcomeTypeId: string | null,
    outcomeReasonId: string | null = null,
  ) {
    const [match] = await testDb
      .insert(matches)
      .values({ tournamentId, outcomeTypeId, outcomeReasonId, status: "finalized" })
      .returning();
    return match;
  }

  /**
   * Inserted directly rather than through the service: these tests only need a
   * row for the matches to hang off, and the service caps a user at five drafts.
   */
  async function createTournament(disciplineId: string) {
    const { startDate, endDate } = dates();
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `Archiving ${Date.now()}-${Math.random()}`,
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        createdBy: actorId,
        disciplineId,
        startDate,
        endDate,
      })
      .returning();
    return tournament;
  }

  beforeAll(async () => {
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `archiving-auth-${Date.now()}`,
        name: "Archiving Admin",
        email: `archiving-admin-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();

    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Archiving Admin",
        shortName: "ARCHAD",
        externalId: authUser.id,
        role: "super_admin",
      })
      .returning();
    actorId = user.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe("foreign keys", () => {
    it("refuses to delete an outcome type a match was played under", async () => {
      const discipline = await createDiscipline(`FK Type ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Normal");
      const tournament = await createTournament(discipline.id);
      await createMatch(tournament.id, outcomeType.id);

      // Raw delete, bypassing the service preflight: this is the database itself
      // refusing, which is what keeps history safe even on paths that forget to check.
      await expect(testDb.delete(outcomeTypes).where(eq(outcomeTypes.id, outcomeType.id)).execute()).rejects.toThrow();

      const [survivor] = await testDb.select().from(outcomeTypes).where(eq(outcomeTypes.id, outcomeType.id));
      expect(survivor).toBeDefined();
    });

    it("refuses to delete an outcome reason a match was recorded with", async () => {
      const discipline = await createDiscipline(`FK Reason ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Forfait");
      const [reason] = await testDb
        .insert(outcomeReasons)
        .values({ outcomeTypeId: outcomeType.id, name: "Absent" })
        .returning();
      const tournament = await createTournament(discipline.id);
      await createMatch(tournament.id, outcomeType.id, reason.id);

      await expect(testDb.delete(outcomeReasons).where(eq(outcomeReasons.id, reason.id)).execute()).rejects.toThrow();
    });

    it("still deletes an outcome type nothing was played under, reasons included", async () => {
      const discipline = await createDiscipline(`FK Unused ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Jamais joué");
      await testDb.insert(outcomeReasons).values({ outcomeTypeId: outcomeType.id, name: "Sans usage" });

      await outcomeTypeService.deleteOutcomeType(outcomeType.id);

      const remaining = await testDb.select().from(outcomeTypes).where(eq(outcomeTypes.id, outcomeType.id));
      expect(remaining).toHaveLength(0);

      // The reason cascaded with its parent rather than blocking it.
      const orphanReasons = await testDb
        .select()
        .from(outcomeReasons)
        .where(eq(outcomeReasons.outcomeTypeId, outcomeType.id));
      expect(orphanReasons).toHaveLength(0);
    });

    it("leaves a match that already had no outcome type alone", async () => {
      const discipline = await createDiscipline(`FK Legacy ${Date.now()}`);
      const tournament = await createTournament(discipline.id);
      const match = await createMatch(tournament.id, null);

      const [stored] = await testDb.select().from(matches).where(eq(matches.id, match.id));
      expect(stored.outcomeTypeId).toBeNull();
    });
  });

  describe("deletion preflight", () => {
    it("refuses a discipline used by a tournament and names the blocker", async () => {
      const discipline = await createDiscipline(`Blocked ${Date.now()}`);
      await createTournament(discipline.id);

      const error = await disciplineService
        .deleteDiscipline(discipline.id)
        .then(() => null)
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.DISCIPLINE_IN_USE);
      expect((error as ConflictError).details?.blockers).toContainEqual({
        resource: "tournaments",
        count: 1,
      });
    });

    it("refuses an outcome type used by a match and counts them", async () => {
      const discipline = await createDiscipline(`Blocked Type ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Normal");
      const tournament = await createTournament(discipline.id);
      await createMatch(tournament.id, outcomeType.id);
      await createMatch(tournament.id, outcomeType.id);

      const error = await outcomeTypeService
        .deleteOutcomeType(outcomeType.id)
        .then(() => null)
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.OUTCOME_TYPE_IN_USE);
      expect((error as ConflictError).details?.blockers).toContainEqual({
        resource: "matches",
        count: 2,
      });
    });

    it("deletes a discipline nothing references, cascading its outcome types", async () => {
      const discipline = await createDiscipline(`Unused ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Normal");

      await disciplineService.deleteDiscipline(discipline.id);

      const remainingTypes = await testDb.select().from(outcomeTypes).where(eq(outcomeTypes.id, outcomeType.id));
      expect(remainingTypes).toHaveLength(0);
    });
  });

  describe("archiving", () => {
    it("hides an archived discipline from the list but keeps it resolvable", async () => {
      const discipline = await createDiscipline(`Archivable ${Date.now()}`);
      await createTournament(discipline.id);

      await disciplineService.archiveDiscipline(discipline.id, actorId);

      const listed = await disciplineService.listDisciplines();
      expect(listed.find((d) => d.id === discipline.id)).toBeUndefined();

      const withArchived = await disciplineService.listDisciplines(true);
      expect(withArchived.find((d) => d.id === discipline.id)).toBeDefined();

      // Resolving by id must keep working: past results still have to render.
      const resolved = await disciplineService.getDisciplineById(discipline.id);
      expect(resolved.archivedAt).not.toBeNull();
      expect(resolved.archivedBy).toBe(actorId);
    });

    it("refuses to archive twice, and to restore something not archived", async () => {
      const discipline = await createDiscipline(`Twice ${Date.now()}`);

      await disciplineService.archiveDiscipline(discipline.id, actorId);
      await expect(disciplineService.archiveDiscipline(discipline.id, actorId)).rejects.toThrow(ConflictError);

      await disciplineService.restoreDiscipline(discipline.id);
      await expect(disciplineService.restoreDiscipline(discipline.id)).rejects.toThrow(ConflictError);
    });

    it("drops the default flag when an outcome type is archived", async () => {
      const discipline = await createDiscipline(`Default ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Normal", true);

      const archived = await outcomeTypeService.archiveOutcomeType(outcomeType.id, actorId);

      // An archived type is no longer offered, so it must not stay the one
      // pre-selected on a new match.
      expect(archived.isDefault).toBe(false);
      expect(archived.archivedAt).not.toBeNull();
    });

    it("keeps an archived outcome type out of the entry list but resolvable", async () => {
      const discipline = await createDiscipline(`Entry ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Retiré");
      const tournament = await createTournament(discipline.id);
      await createMatch(tournament.id, outcomeType.id);

      await outcomeTypeService.archiveOutcomeType(outcomeType.id, actorId);

      const selectable = await outcomeTypeService.listOutcomeTypes(discipline.id);
      expect(selectable.find((o) => o.id === outcomeType.id)).toBeUndefined();

      const all = await outcomeTypeService.listOutcomeTypes(discipline.id, true);
      expect(all.find((o) => o.id === outcomeType.id)).toBeDefined();

      const resolved = await outcomeTypeService.getOutcomeTypeById(outcomeType.id);
      expect(resolved.name).toBe("Retiré");
    });

    it("restores an archived outcome type back into the entry list", async () => {
      const discipline = await createDiscipline(`Restore ${Date.now()}`);
      const outcomeType = await createOutcomeType(discipline.id, "Revenu");

      await outcomeTypeService.archiveOutcomeType(outcomeType.id, actorId);
      const restored = await outcomeTypeService.restoreOutcomeType(outcomeType.id);

      expect(restored.archivedAt).toBeNull();
      const selectable = await outcomeTypeService.listOutcomeTypes(discipline.id);
      expect(selectable.find((o) => o.id === outcomeType.id)).toBeDefined();
    });
  });
});
