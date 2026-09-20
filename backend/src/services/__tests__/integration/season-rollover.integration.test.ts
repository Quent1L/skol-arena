import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
} from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rankedSeasonRolloverService } from "../../ranked-season-rollover.service";
import { rankedSeasonService } from "../../ranked-season.service";
import {
  appUsers,
  disciplines,
  playerMmr,
  rankedSeasonAutomations,
  rankedSeasonConfigs,
  rankTiers,
  seasonMmrSeeds,
  tournamentParticipants,
  tournaments,
  user as betterAuthUser,
} from "../../../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Chaining a season is the sum of several existing mechanisms (close, create, start, ladder
 * copy, MMR seeds) plus one new one (re-registering the players). These tests pin the seam
 * between them, and above all the two properties the scheduler depends on: running the job
 * twice must not produce two successors, and a chain interrupted halfway must be resumable.
 */
describe("Ranked season rollover", () => {
  let adminId: string;
  const playerIds: string[] = [];

  // A discipline may hold only one active ranked season, and `tournaments.name` is UNIQUE, so
  // both are scoped per case rather than shared across the file.
  let caseCounter = 0;

  async function freshDiscipline(): Promise<string> {
    const [discipline] = await testDb
      .insert(disciplines)
      .values({ name: `Rollover discipline ${Date.now()}-${caseCounter}` })
      .returning();
    return discipline.id;
  }

  const shift = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function createPlayer(label: string): Promise<string> {
    const unique = `${label}-${Date.now()}-${Math.random()}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `rollover-auth-${unique}`,
        name: label,
        email: `rollover-${unique}@example.com`,
        emailVerified: true,
      })
      .returning();
    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: label,
        shortName: label.slice(0, 6).toUpperCase(),
        externalId: authUser.id,
        role: "player",
      })
      .returning();
    return user.id;
  }

  /** An ongoing season whose term has already passed, with players registered and ranked. */
  async function seedOngoingSeason(opts?: {
    participantsMinMatches?: number;
    carryParticipants?: boolean;
    mode?: "chain" | "close";
  }) {
    const label = `case${++caseCounter}`;
    const nameTemplate = `Saison ${label} {n}`;
    const disciplineId = await freshDiscipline();

    const [season] = await testDb
      .insert(tournaments)
      .values({
        name: `Rollover source ${Date.now()}-${Math.random()}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        createdBy: adminId,
        disciplineId,
        status: "ongoing",
        startDate: shift(-40),
        endDate: shift(-1),
        validationMode: "strict",
      })
      .returning();

    await testDb.insert(rankedSeasonConfigs).values({
      tournamentId: season.id,
      baseMmr: 1000,
      kFactor: 32,
      placementMatches: 2,
    });

    // A ladder to copy, and players who have settled on it.
    await testDb.insert(rankTiers).values([
      { seasonId: season.id, level: 1, name: "Rookie", nameKey: "ROOKIE", percentile: 0, minMmr: 700 },
      { seasonId: season.id, level: 2, name: "Legend", nameKey: "LEGEND", percentile: 0.9, minMmr: 1400 },
    ]);

    // playerIds[2] stays below the placement threshold on purpose.
    const matchCounts = [8, 5, 1];
    const mmrs = [1400, 1000, 900];
    for (const [index, playerId] of playerIds.entries()) {
      await testDb.insert(tournamentParticipants).values({
        tournamentId: season.id,
        userId: playerId,
        status: "active",
      });
      await testDb.insert(playerMmr).values({
        seasonId: season.id,
        playerId,
        currentMmr: mmrs[index],
        matchesPlayed: matchCounts[index],
      });
    }

    const [automation] = await testDb
      .insert(rankedSeasonAutomations)
      .values({
        tournamentId: season.id,
        enabled: true,
        mode: opts?.mode ?? "chain",
        durationDays: 30,
        nameTemplate,
        nextSeasonNumber: 1,
        carryParticipants: opts?.carryParticipants ?? true,
        participantsMinMatches: opts?.participantsMinMatches ?? 0,
        carryTiers: true,
        tierScalingMode: "keep",
        carryMmr: true,
        softResetFactor: 0.5,
        nextRolloverAt: new Date(Date.now() - 60_000),
      })
      .returning();

    return { season, automation, disciplineId, nameTemplate, label };
  }

  async function activeParticipantIds(seasonId: string): Promise<string[]> {
    const rows = await testDb
      .select({ userId: tournamentParticipants.userId })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, seasonId),
          eq(tournamentParticipants.status, "active"),
        ),
      );
    return rows.map((row) => row.userId).sort();
  }

  beforeAll(async () => {
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `rollover-admin-${Date.now()}`,
        name: "Rollover Admin",
        email: `rollover-admin-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();
    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Rollover Admin",
        shortName: "ROLADM",
        externalId: authUser.id,
        role: "super_admin",
      })
      .returning();
    adminId = user.id;

    for (const label of ["Alice", "Bob", "Carol"]) {
      playerIds.push(await createPlayer(label));
    }
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("closes the season, opens its successor and carries everything over", async () => {
    const { season, disciplineId, label } = await seedOngoingSeason();

    const report = await rankedSeasonRolloverService.rolloverDue();

    expect(report.failed.some((row) => row.seasonId === season.id)).toBe(false);
    const outcome = report.rolledOver.find((row) => row.seasonId === season.id);
    expect(outcome).toBeDefined();
    const nextId = outcome!.nextSeasonId;

    const [closed] = await testDb
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, season.id));
    expect(closed.status).toBe("finished");

    const [next] = await testDb.select().from(tournaments).where(eq(tournaments.id, nextId));
    expect(next.status).toBe("ongoing");
    expect(next.name).toBe(`Saison ${label} 2`);
    // The term is the configured duration, counted from the day it opened.
    expect(next.startDate).toBe(shift(0));
    expect(next.endDate).toBe(shift(30));
    // General settings are cloned from the season that just closed.
    expect(next.minTeamSize).toBe(1);
    expect(next.maxTeamSize).toBe(2);
    expect(next.disciplineId).toBe(disciplineId);

    // The ladder was copied rather than reset to the default five tiers.
    const tiers = await testDb.select().from(rankTiers).where(eq(rankTiers.seasonId, nextId));
    expect(tiers.map((tier) => tier.name).sort()).toEqual(["Legend", "Rookie"]);

    // MMR carried over as seeds — and only for players past the placement threshold.
    const seeds = await testDb
      .select()
      .from(seasonMmrSeeds)
      .where(eq(seasonMmrSeeds.seasonId, nextId));
    expect(seeds).toHaveLength(2);

    // Seeds must not put anyone in the leaderboard before they have played.
    const ranked = await testDb.select().from(playerMmr).where(eq(playerMmr.seasonId, nextId));
    expect(ranked).toHaveLength(0);

    // The point of the feature: the new season is not empty, so a match can be created at once.
    expect(await activeParticipantIds(nextId)).toEqual([...playerIds].sort());

    // The chain moved onto the successor, one season further along.
    const [carried] = await testDb
      .select()
      .from(rankedSeasonAutomations)
      .where(eq(rankedSeasonAutomations.tournamentId, nextId));
    // The source season is the scope's only started one, so the successor is number 2 and the
    // one after it number 3.
    expect(carried.nextSeasonNumber).toBe(3);
    expect(carried.enabled).toBe(true);
    expect(carried.nextSeasonId).toBeNull();
    expect(carried.nextRolloverAt).not.toBeNull();
  });

  it("does not create a second successor when the job runs again", async () => {
    const { season } = await seedOngoingSeason();

    const first = await rankedSeasonRolloverService.rolloverDue();
    const created = first.rolledOver.find((row) => row.seasonId === season.id);
    expect(created).toBeDefined();

    const second = await rankedSeasonRolloverService.rolloverDue();
    expect(second.rolledOver.some((row) => row.seasonId === season.id)).toBe(false);

    const successors = await testDb
      .select()
      .from(rankedSeasonAutomations)
      .where(eq(rankedSeasonAutomations.tournamentId, season.id));
    expect(successors[0].nextSeasonId).toBe(created!.nextSeasonId);
  });

  it("resumes a chain interrupted after the season was closed", async () => {
    const { season } = await seedOngoingSeason();
    // Exactly the state a crash between "end" and "create" leaves behind.
    await testDb
      .update(tournaments)
      .set({ status: "finished" })
      .where(eq(tournaments.id, season.id));

    const report = await rankedSeasonRolloverService.rolloverDue();

    const outcome = report.rolledOver.find((row) => row.seasonId === season.id);
    expect(outcome).toBeDefined();
    const [next] = await testDb
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, outcome!.nextSeasonId));
    expect(next.status).toBe("ongoing");
  });

  it("only carries players who reached the configured match count", async () => {
    const { season } = await seedOngoingSeason({ participantsMinMatches: 5 });

    const report = await rankedSeasonRolloverService.rolloverDue();
    const outcome = report.rolledOver.find((row) => row.seasonId === season.id);

    // Carol played once; Alice and Bob played 8 and 5.
    expect(outcome!.carriedParticipants).toBe(2);
    expect(await activeParticipantIds(outcome!.nextSeasonId)).toEqual(
      [playerIds[0], playerIds[1]].sort(),
    );
  });

  it("leaves the successor empty when the carry-over is switched off", async () => {
    const { season } = await seedOngoingSeason({ carryParticipants: false });

    const report = await rankedSeasonRolloverService.rolloverDue();
    const outcome = report.rolledOver.find((row) => row.seasonId === season.id);

    expect(outcome!.carriedParticipants).toBe(0);
    expect(await activeParticipantIds(outcome!.nextSeasonId)).toEqual([]);
  });

  it("disambiguates a name the UNIQUE constraint already holds", async () => {
    const { season, label } = await seedOngoingSeason();
    await testDb.insert(tournaments).values({
      name: `Saison ${label} 2`,
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      createdBy: adminId,
      status: "draft",
      startDate: shift(0),
      endDate: shift(10),
    });

    const report = await rankedSeasonRolloverService.rolloverDue();
    const outcome = report.rolledOver.find((row) => row.seasonId === season.id);
    const [next] = await testDb
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, outcome!.nextSeasonId));

    expect(next.name).toBe(`Saison ${label} 2 (2)`);
  });

  describe("{n} numbering", () => {
    /** A season of the same scope, as if an admin had run it by hand before the chain existed. */
    async function seedManualSeason(
      disciplineId: string,
      status: "draft" | "ongoing" | "finished",
    ) {
      await testDb.insert(tournaments).values({
        name: `Manual ${Date.now()}-${Math.random()}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        createdBy: adminId,
        disciplineId,
        status,
        startDate: shift(-60),
        endDate: shift(-30),
        validationMode: "strict",
      });
    }

    it("counts the seasons already run instead of the chain's own position", async () => {
      const { season, disciplineId, label } = await seedOngoingSeason();
      // Three seasons ran before the chain was ever enabled: the two below plus the source.
      await seedManualSeason(disciplineId, "finished");
      await seedManualSeason(disciplineId, "finished");

      const report = await rankedSeasonRolloverService.rolloverDue();
      const outcome = report.rolledOver.find((row) => row.seasonId === season.id);
      const [next] = await testDb
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, outcome!.nextSeasonId));

      expect(next.name).toBe(`Saison ${label} 4`);
    });

    it("ignores a draft, which has not run yet", async () => {
      const { season, disciplineId, label } = await seedOngoingSeason();
      await seedManualSeason(disciplineId, "draft");

      const report = await rankedSeasonRolloverService.rolloverDue();
      const outcome = report.rolledOver.find((row) => row.seasonId === season.id);
      const [next] = await testDb
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, outcome!.nextSeasonId));

      expect(next.name).toBe(`Saison ${label} 2`);
    });

    it("keeps a separate count per discipline", async () => {
      const { season, label } = await seedOngoingSeason();
      // Another discipline's history must not push this chain's numbering forward.
      await seedManualSeason(await freshDiscipline(), "finished");
      await seedManualSeason(await freshDiscipline(), "finished");

      const report = await rankedSeasonRolloverService.rolloverDue();
      const outcome = report.rolledOver.find((row) => row.seasonId === season.id);
      const [next] = await testDb
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, outcome!.nextSeasonId));

      expect(next.name).toBe(`Saison ${label} 2`);
    });

    it("caches the next number on the automation when it is enabled", async () => {
      const { season, disciplineId } = await seedOngoingSeason();
      await seedManualSeason(disciplineId, "finished");
      await seedManualSeason(disciplineId, "finished");

      const refreshed = await rankedSeasonService.refreshNextSeasonNumber(season.id);

      expect(refreshed).toBe(4);
      const [row] = await testDb
        .select()
        .from(rankedSeasonAutomations)
        .where(eq(rankedSeasonAutomations.tournamentId, season.id));
      expect(row.nextSeasonNumber).toBe(4);
    });
  });

  describe("close-only automation", () => {
    async function seasonsOfDiscipline(disciplineId: string) {
      return await testDb
        .select()
        .from(tournaments)
        .where(eq(tournaments.disciplineId, disciplineId));
    }

    async function automationOf(seasonId: string) {
      const [row] = await testDb
        .select()
        .from(rankedSeasonAutomations)
        .where(eq(rankedSeasonAutomations.tournamentId, seasonId));
      return row;
    }

    it("ends the season on its end date and opens nothing after it", async () => {
      const { season, disciplineId } = await seedOngoingSeason({ mode: "close" });

      const report = await rankedSeasonRolloverService.rolloverDue();

      expect(report.closed).toContain(season.id);
      expect(report.rolledOver.some((row) => row.seasonId === season.id)).toBe(false);
      const seasons = await seasonsOfDiscipline(disciplineId);
      expect(seasons).toHaveLength(1);
      expect(seasons[0].status).toBe("finished");

      const automation = await automationOf(season.id);
      expect(automation.nextSeasonId).toBeNull();
      expect(automation.nextRolloverAt).toBeNull();
      expect(automation.lastRolloverAt).not.toBeNull();
    });

    it("is not picked up again once the season is finished", async () => {
      const { season, disciplineId } = await seedOngoingSeason({ mode: "close" });

      await rankedSeasonRolloverService.rolloverDue();
      const second = await rankedSeasonRolloverService.rolloverDue();

      expect(second.closed).not.toContain(season.id);
      expect(second.rolledOver.some((row) => row.seasonId === season.id)).toBe(false);
      expect(await seasonsOfDiscipline(disciplineId)).toHaveLength(1);
    });

    it("leaves a season whose end date is still ahead running", async () => {
      const { season } = await seedOngoingSeason({ mode: "close" });
      await testDb
        .update(rankedSeasonAutomations)
        .set({ nextRolloverAt: new Date(Date.now() + 86_400_000) })
        .where(eq(rankedSeasonAutomations.tournamentId, season.id));

      const report = await rankedSeasonRolloverService.rolloverDue();

      expect(report.closed).not.toContain(season.id);
      const [still] = await testDb.select().from(tournaments).where(eq(tournaments.id, season.id));
      expect(still.status).toBe("ongoing");
    });

    it("schedules the close after the end date when enabled mid-season", async () => {
      const { season } = await seedOngoingSeason({ mode: "close" });
      const endDate = shift(10);
      await testDb.update(tournaments).set({ endDate }).where(eq(tournaments.id, season.id));

      const rest = await automationOf(season.id);
      await rankedSeasonService.setAutomation(
        season.id,
        {
          enabled: true,
          mode: "close",
          durationDays: rest.durationDays,
          nameTemplate: rest.nameTemplate,
          carryParticipants: rest.carryParticipants,
          participantsMinMatches: rest.participantsMinMatches,
          carryTiers: rest.carryTiers,
          tierScalingMode: rest.tierScalingMode,
          carryMmr: rest.carryMmr,
          softResetFactor: rest.softResetFactor,
        },
        adminId,
      );

      const automation = await automationOf(season.id);
      expect(automation.nextRolloverAt?.toISOString()).toBe(
        new Date(`${shift(11)}T00:00:00.000Z`).toISOString(),
      );
    });

    it("moves the scheduled close when the end date is edited", async () => {
      const { season } = await seedOngoingSeason({ mode: "close" });

      await rankedSeasonService.updateSeason(season.id, { endDate: shift(20) }, adminId);

      const automation = await automationOf(season.id);
      expect(automation.nextRolloverAt?.toISOString()).toBe(
        new Date(`${shift(21)}T00:00:00.000Z`).toISOString(),
      );
    });

    it("refuses an early rollover, which has no successor to open", async () => {
      const { season } = await seedOngoingSeason({ mode: "close" });

      await expect(rankedSeasonRolloverService.rolloverNow(season.id, adminId)).rejects.toThrow();
    });
  });
});
