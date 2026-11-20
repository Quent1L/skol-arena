import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rankedSeasonService } from "../../ranked-season.service";
import { appUsers, disciplines, rankedSeasonConfigs, tournaments, user as betterAuthUser } from "../../../db/schema";
import { eq } from "drizzle-orm";

/**
 * The dates carried by a draft are a plan. A season that opens late, or is cut
 * short before its planned term, used to keep advertising that plan: the window
 * every reader derives from it (momentum chart, rewind, "days played") then
 * covered days the season was not running.
 */
describe("Ranked season lifecycle dates", () => {
  let adminId: string;
  let disciplineId: string;

  const today = () => new Date().toISOString().slice(0, 10);
  const shift = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function createSeason(opts: { status: "draft" | "ongoing"; startDate: string; endDate: string }) {
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
        status: opts.status,
        startDate: opts.startDate,
        endDate: opts.endDate,
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

  async function storedDates(id: string) {
    const [row] = await testDb
      .select({ startDate: tournaments.startDate, endDate: tournaments.endDate })
      .from(tournaments)
      .where(eq(tournaments.id, id));
    return row;
  }

  beforeAll(async () => {
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `season-dates-auth-${Date.now()}`,
        name: "Season Dates Admin",
        email: `season-dates-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();

    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Season Dates Admin",
        shortName: "SEADAT",
        externalId: authUser.id,
        role: "super_admin",
      })
      .returning();
    adminId = user.id;

    const [discipline] = await testDb
      .insert(disciplines)
      .values({ name: `Season dates discipline ${Date.now()}` })
      .returning();
    disciplineId = discipline.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("moves the start date to the day the season is actually started", async () => {
    const season = await createSeason({
      status: "draft",
      startDate: shift(-30),
      endDate: shift(30),
    });

    await rankedSeasonService.startSeason(season.id, adminId);

    const stored = await storedDates(season.id);
    expect(stored.startDate).toBe(today());
    // The planned term is untouched: only the start really happened.
    expect(stored.endDate).toBe(shift(30));
  });

  it("moves the end date to the day a season is cut short", async () => {
    const season = await createSeason({
      status: "ongoing",
      startDate: shift(-10),
      endDate: shift(60),
    });

    await rankedSeasonService.endSeason(season.id, adminId);

    const stored = await storedDates(season.id);
    expect(stored.endDate).toBe(today());
    expect(stored.startDate).toBe(shift(-10));
  });

  it("never ends a season before it began", async () => {
    // Someone pushed the start into the future, then closed the season anyway.
    const season = await createSeason({
      status: "ongoing",
      startDate: shift(5),
      endDate: shift(60),
    });

    await rankedSeasonService.endSeason(season.id, adminId);

    const stored = await storedDates(season.id);
    expect(stored.endDate).toBe(shift(5));
  });
});
