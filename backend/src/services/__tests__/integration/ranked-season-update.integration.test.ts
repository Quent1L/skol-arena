import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rankedSeasonService } from "../../ranked-season.service";
import {
  appUsers,
  disciplines,
  matches,
  organizations,
  rankedSeasonConfigs,
  tournaments,
  user as betterAuthUser,
} from "../../../db/schema";
import { eq } from "drizzle-orm";
import { BadRequestError, ErrorCode } from "../../../types/errors";

/**
 * A running season used to be frozen outright: a typo in its description could
 * not be fixed without ending it. Only what would make the ladder inconsistent
 * is locked now.
 */
describe("Ranked season updates", () => {
  let adminId: string;
  let disciplineId: string;

  const dates = () => {
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return { startDate: today, endDate: nextWeek };
  };

  async function createSeason(status: "draft" | "ongoing" | "finished") {
    const { startDate, endDate } = dates();
    const [season] = await testDb
      .insert(tournaments)
      .values({
        name: `Season ${Date.now()}-${Math.random()}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        createdBy: adminId,
        disciplineId,
        status,
        startDate,
        endDate,
      })
      .returning();

    await testDb.insert(rankedSeasonConfigs).values({
      tournamentId: season.id,
      baseMmr: 1000,
      kFactor: 32,
      placementMatches: 5,
    });

    return season;
  }

  async function enterResult(seasonId: string) {
    await testDb.insert(matches).values({ tournamentId: seasonId, status: "finalized" });
  }

  async function updateFails(id: string, input: Record<string, unknown>) {
    const err = await rankedSeasonService
      .updateSeason(id, input as never, adminId)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    return err as BadRequestError;
  }

  beforeAll(async () => {
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `season-update-auth-${Date.now()}`,
        name: "Season Admin",
        email: `season-admin-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();

    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Season Admin",
        shortName: "SEASAD",
        externalId: authUser.id,
        role: "super_admin",
      })
      .returning();
    adminId = user.id;

    const [discipline] = await testDb
      .insert(disciplines)
      .values({ name: `Season discipline ${Date.now()}` })
      .returning();
    disciplineId = discipline.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("accepts metadata on a running season", async () => {
    const season = await createSeason("ongoing");
    await enterResult(season.id);

    await rankedSeasonService.updateSeason(season.id, { description: "Corrigé en cours de route" } as never, adminId);

    const [stored] = await testDb
      .select({ description: tournaments.description })
      .from(tournaments)
      .where(eq(tournaments.id, season.id));
    expect(stored.description).toBe("Corrigé en cours de route");
  });

  it("refuses the tier source once the season has started", async () => {
    // Read exactly once, by startSeason, to lay down the thresholds — changing it
    // afterwards would say nothing.
    const season = await createSeason("ongoing");

    const err = await updateFails(season.id, { tierScalingMode: "percentile" });
    expect(err.code).toBe(ErrorCode.TOURNAMENT_FIELD_UPDATE_FORBIDDEN);
  });

  it("allows scoring semantics until a result exists, then locks them", async () => {
    const season = await createSeason("ongoing");

    await rankedSeasonService.updateSeason(season.id, { scoreEnabled: false } as never, adminId);

    await enterResult(season.id);
    const err = await updateFails(season.id, { scoreEnabled: true });
    expect(err.code).toBe(ErrorCode.TOURNAMENT_FIELD_LOCKED_BY_MATCHES);
    expect(err.details).toMatchObject({ matchCount: 1 });
  });

  it("lets the MMR knobs move on a running season", async () => {
    // Accepted rather than refused: the season is replayed so the ladder and the
    // configuration cannot end up saying different things.
    const season = await createSeason("ongoing");
    await enterResult(season.id);

    await rankedSeasonService.updateSeason(season.id, { kFactor: 48 } as never, adminId);

    const [config] = await testDb
      .select({ kFactor: rankedSeasonConfigs.kFactor })
      .from(rankedSeasonConfigs)
      .where(eq(rankedSeasonConfigs.tournamentId, season.id));
    expect(config.kFactor).toBe(48);
  });

  it("still allows everything while the season is a draft", async () => {
    const season = await createSeason("draft");

    await rankedSeasonService.updateSeason(
      season.id,
      { tierScalingMode: "percentile", scoreEnabled: false } as never,
      adminId,
    );

    const [config] = await testDb
      .select({ tierScalingMode: rankedSeasonConfigs.tierScalingMode })
      .from(rankedSeasonConfigs)
      .where(eq(rankedSeasonConfigs.tournamentId, season.id));
    expect(config.tierScalingMode).toBe("percentile");
  });
  it("lets a full form through when the locked fields are resent unchanged", async () => {
    // The season form submits every field it holds, not a diff. Resending a
    // locked field with the value it already has is not an edit, so it must not
    // block the free fields travelling with it.
    const season = await createSeason("ongoing");
    await enterResult(season.id);

    await rankedSeasonService.updateSeason(
      season.id,
      {
        name: "Saison renommée",
        sourceTierSeasonId: null,
        tierScalingMode: "keep",
        scoreEnabled: season.scoreEnabled,
        allowDraw: season.allowDraw,
      } as never,
      adminId,
    );

    const [stored] = await testDb
      .select({ name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, season.id));
    expect(stored.name).toBe("Saison renommée");
  });

  it("persists team sizes, organization and a cleared description on a running season", async () => {
    // These used to be dropped silently: the update reported success and wrote nothing.
    const season = await createSeason("ongoing");
    await enterResult(season.id);
    await testDb.update(tournaments).set({ description: "À effacer" }).where(eq(tournaments.id, season.id));
    const [org] = await testDb
      .insert(organizations)
      .values({ name: `Org ${Date.now()}`, createdBy: adminId })
      .returning();

    await rankedSeasonService.updateSeason(
      season.id,
      { maxTeamSize: 3, description: "", organizationId: org.id } as never,
      adminId,
    );

    const [stored] = await testDb
      .select({
        min: tournaments.minTeamSize,
        max: tournaments.maxTeamSize,
        description: tournaments.description,
        organizationId: tournaments.organizationId,
      })
      .from(tournaments)
      .where(eq(tournaments.id, season.id));
    expect(stored).toEqual({ min: 1, max: 3, description: "", organizationId: org.id });
  });

  it("refuses a team size range that crosses the stored bound", async () => {
    const season = await createSeason("ongoing");

    const err = await updateFails(season.id, { minTeamSize: 3 });
    expect(err.code).toBe(ErrorCode.INVALID_TEAM_SIZE);
  });
});
