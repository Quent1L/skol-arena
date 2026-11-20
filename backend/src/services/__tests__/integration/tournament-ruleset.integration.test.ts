import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { tournamentRulesetService } from "../../tournament-ruleset.service";
import { rulesetPropagationService } from "../../ruleset-propagation.service";
import { disciplineService } from "../../discipline.service";
import { outcomeTypeService } from "../../outcome-type.service";
import { appUsers, disciplines, matches, outcomeTypes, tournaments, user as betterAuthUser } from "../../../db/schema";
import { eq } from "drizzle-orm";

/**
 * The point of the snapshot: what a competition was played under stops moving
 * when it opens, so editing a discipline can no longer rewrite the numbers of a
 * competition that is already running or already over.
 */
describe("Tournament ruleset snapshot", () => {
  let actorId: string;

  const dates = () => {
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return { startDate: today, endDate: nextWeek };
  };

  async function createDiscipline(name: string, mode: "INDIVIDUAL" | "COLLABORATIVE" = "COLLABORATIVE") {
    const [discipline] = await testDb.insert(disciplines).values({ name, teamInteractionMode: mode }).returning();
    return discipline;
  }

  async function createOutcomeType(disciplineId: string, name: string, points = 3) {
    const [outcomeType] = await testDb.insert(outcomeTypes).values({ disciplineId, name, points }).returning();
    return outcomeType;
  }

  async function createTournament(
    disciplineId: string | null,
    status: "draft" | "open" | "ongoing" | "finished" = "draft",
    mode: "championship" | "ranked" = "championship",
  ) {
    const { startDate, endDate } = dates();
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `Ruleset ${Date.now()}-${Math.random()}`,
        mode,
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        createdBy: actorId,
        disciplineId,
        status,
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
        id: `ruleset-auth-${Date.now()}`,
        name: "Ruleset Admin",
        email: `ruleset-admin-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();

    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Ruleset Admin",
        shortName: "RULEAD",
        externalId: authUser.id,
        role: "super_admin",
      })
      .returning();
    actorId = user.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe("while the competition is a draft", () => {
    it("tracks the discipline, because no match can exist yet", async () => {
      const discipline = await createDiscipline(`Draft ${Date.now()}`);
      await createOutcomeType(discipline.id, "Normal", 3);
      const tournament = await createTournament(discipline.id, "draft");

      await tournamentRulesetService.seed(tournament.id, discipline.id);

      // The admin is still setting things up: a correction to the discipline
      // must be picked up, not require a propagation.
      await createOutcomeType(discipline.id, "Forfait", 1);
      const payload = await tournamentRulesetService.getForTournament(tournament.id);

      expect(payload.outcomeTypes.map((o) => o.name).sort()).toEqual(["Forfait", "Normal"]);
    });
  });

  describe("once the competition has opened", () => {
    it("stops following the discipline", async () => {
      const discipline = await createDiscipline(`Frozen ${Date.now()}`, "COLLABORATIVE");
      const normal = await createOutcomeType(discipline.id, "Normal", 3);
      const tournament = await createTournament(discipline.id, "draft");

      await tournamentRulesetService.seed(tournament.id, discipline.id);
      await tournamentRulesetService.freeze(tournament.id);
      await testDb.update(tournaments).set({ status: "ongoing" }).where(eq(tournaments.id, tournament.id));

      // Exactly the scenario that used to corrupt a running competition.
      await outcomeTypeService.updateOutcomeType(normal.id, { points: 99 });
      await disciplineService.updateDiscipline(discipline.id, {
        teamInteractionMode: "INDIVIDUAL",
      });
      await createOutcomeType(discipline.id, "Ajouté après", 7);

      const payload = await tournamentRulesetService.getForTournament(tournament.id);

      expect(payload.outcomeTypes).toHaveLength(1);
      expect(payload.outcomeTypes[0].points).toBe(3);
      expect(payload.discipline?.teamInteractionMode).toBe("COLLABORATIVE");
    });

    it("keeps a finished competition out of reach entirely", async () => {
      const discipline = await createDiscipline(`Finished ${Date.now()}`);
      await createOutcomeType(discipline.id, "Normal", 3);
      const tournament = await createTournament(discipline.id, "finished");
      await tournamentRulesetService.seed(tournament.id, discipline.id);

      const impacted = await rulesetPropagationService.listImpactedCompetitions(discipline.id);
      expect(impacted.find((c) => c.id === tournament.id)).toBeUndefined();

      // Even asked for by id, it is refused rather than silently rewritten.
      const [result] = await rulesetPropagationService.propagate(discipline.id, [tournament.id]);
      expect(result.status).toBe("failed");

      const payload = await tournamentRulesetService.getForTournament(tournament.id);
      expect(payload.outcomeTypes[0].points).toBe(3);
    });
  });

  describe("propagation", () => {
    it("lists running competitions with their entered-match count and drift", async () => {
      const discipline = await createDiscipline(`Impacted ${Date.now()}`);
      const normal = await createOutcomeType(discipline.id, "Normal", 3);
      const tournament = await createTournament(discipline.id, "ongoing");
      await tournamentRulesetService.seed(tournament.id, discipline.id);

      await testDb.insert(matches).values({
        tournamentId: tournament.id,
        outcomeTypeId: normal.id,
        status: "finalized",
      });
      // Not an entered result: it must not inflate the count the admin is shown.
      await testDb.insert(matches).values({
        tournamentId: tournament.id,
        outcomeTypeId: normal.id,
        status: "scheduled",
      });

      const before = await rulesetPropagationService.listImpactedCompetitions(discipline.id);
      const beforeEntry = before.find((c) => c.id === tournament.id)!;
      expect(beforeEntry.matchCount).toBe(1);
      expect(beforeEntry.hasDrift).toBe(false);

      await outcomeTypeService.updateOutcomeType(normal.id, { points: 10 });

      const after = await rulesetPropagationService.listImpactedCompetitions(discipline.id);
      expect(after.find((c) => c.id === tournament.id)!.hasDrift).toBe(true);
    });

    it("moves the ruleset and recalculates the competition", async () => {
      const discipline = await createDiscipline(`Propagate ${Date.now()}`);
      const normal = await createOutcomeType(discipline.id, "Normal", 3);
      const tournament = await createTournament(discipline.id, "ongoing");
      await tournamentRulesetService.seed(tournament.id, discipline.id);

      await outcomeTypeService.updateOutcomeType(normal.id, { points: 10 });
      const [result] = await rulesetPropagationService.propagate(discipline.id, [tournament.id]);

      expect(result.status).toBe("recalculated");

      const payload = await tournamentRulesetService.getForTournament(tournament.id);
      expect(payload.outcomeTypes[0].points).toBe(10);

      // The synchronous path clears its own marker; nothing is left "recalculating".
      const row = await tournamentRulesetService.getRow(tournament.id);
      expect(row?.recalcPendingAt ?? null).toBeNull();
    });

    it("does not let one failing target abort the others", async () => {
      const discipline = await createDiscipline(`Partial ${Date.now()}`);
      await createOutcomeType(discipline.id, "Normal", 3);
      const good = await createTournament(discipline.id, "ongoing");
      const finished = await createTournament(discipline.id, "finished");
      await tournamentRulesetService.seed(good.id, discipline.id);
      await tournamentRulesetService.seed(finished.id, discipline.id);

      const results = await rulesetPropagationService.propagate(discipline.id, [finished.id, good.id]);

      expect(results.find((r) => r.tournamentId === finished.id)?.status).toBe("failed");
      expect(results.find((r) => r.tournamentId === good.id)?.status).toBe("recalculated");
    });
  });

  describe("self-sufficiency", () => {
    it("keeps an outcome type its matches reference even without the discipline", async () => {
      // Competitions like this exist: deleting a discipline used to set
      // tournaments.discipline_id to NULL while the matches kept their outcome.
      const discipline = await createDiscipline(`Orphan ${Date.now()}`);
      const stray = await createOutcomeType(discipline.id, "Orpheline", 4);
      const tournament = await createTournament(null, "ongoing");

      await testDb.insert(matches).values({
        tournamentId: tournament.id,
        outcomeTypeId: stray.id,
        status: "finalized",
      });

      await tournamentRulesetService.seed(tournament.id, null);
      const payload = await tournamentRulesetService.getForTournament(tournament.id);

      expect(payload.discipline).toBeNull();
      expect(payload.outcomeTypes.find((o) => o.id === stray.id)?.points).toBe(4);
    });
  });
});
