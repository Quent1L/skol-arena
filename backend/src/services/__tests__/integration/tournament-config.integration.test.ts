import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
} from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { tournamentService } from "../../tournament.service";
import { tournamentRepository } from "../../../repository/tournament.repository";
import { BadRequestError } from "../../../types/errors";
import {
  appUsers,
  championshipConfigs,
  tournaments,
  tournamentScoringConfigs,
  user as betterAuthUser,
} from "../../../db/schema";
import { eq } from "drizzle-orm";
import { CHAMPIONSHIP_DEFAULTS, SCORING_DEFAULTS } from "@skol-arena/shared";

/**
 * The scoring and championship knobs live in 1:1 satellites keyed on the
 * tournament. Which rows exist is what tells the rest of the app whether a mode
 * awards points and whether its matches are capped, so the lifecycle of those
 * rows is worth pinning down.
 */
describe("Tournament config satellites", () => {
  let creatorId: string;

  const dates = () => {
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    return { startDate: today, endDate: nextWeek };
  };

  async function readConfigs(tournamentId: string) {
    const [scoring] = await testDb
      .select()
      .from(tournamentScoringConfigs)
      .where(eq(tournamentScoringConfigs.tournamentId, tournamentId));
    const [championship] = await testDb
      .select()
      .from(championshipConfigs)
      .where(eq(championshipConfigs.tournamentId, tournamentId));
    return { scoring, championship };
  }

  beforeAll(async () => {
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `config-auth-${Date.now()}`,
        name: "Config Owner",
        email: `config-owner-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();

    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Config Owner",
        shortName: "CFGOW",
        externalId: authUser.id,
        role: "super_admin",
      })
      .returning();
    creatorId = user.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("creates both rows for a championship, with the requested values", async () => {
    const tournament = await tournamentService.createTournament({
      name: `Config Championship ${Date.now()}`,
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      createdBy: creatorId,
      scoringConfig: { pointPerVictory: 5 },
      championshipConfig: { maxTimesWithSamePartner: 4 },
      ...dates(),
    });

    const { scoring, championship } = await readConfigs(tournament.id);

    // Fields left out fall back to the shared defaults, not to null.
    expect(scoring.pointPerVictory).toBe(5);
    expect(scoring.pointPerDraw).toBe(SCORING_DEFAULTS.pointPerDraw);
    expect(scoring.pointPerLoss).toBe(SCORING_DEFAULTS.pointPerLoss);
    expect(championship.maxTimesWithSamePartner).toBe(4);
    expect(championship.maxMatchesPerPlayer).toBe(
      CHAMPIONSHIP_DEFAULTS.maxMatchesPerPlayer,
    );
  });

  it("creates only the scoring row for a bracket", async () => {
    const tournament = await tournamentService.createTournament({
      name: `Config Bracket ${Date.now()}`,
      mode: "bracket",
      teamMode: "static",
      minTeamSize: 2,
      maxTeamSize: 2,
      createdBy: creatorId,
      ...dates(),
    });

    const { scoring, championship } = await readConfigs(tournament.id);

    expect(scoring).toBeDefined();
    expect(championship).toBeUndefined();
  });

  it("leaves ranked seasons to the season service", async () => {
    // A season needs its MMR configuration, which only rankedSeasonService creates.
    await expect(
      tournamentService.createTournament({
        name: `Config Ranked ${Date.now()}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        createdBy: creatorId,
        ...dates(),
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("upserts the configs on update and returns them on the row", async () => {
    const created = await tournamentService.createTournament({
      name: `Config Update ${Date.now()}`,
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      createdBy: creatorId,
      ...dates(),
    });

    const updated = await tournamentRepository.update(created.id, {
      scoringConfig: { pointPerVictory: 2, pointPerDraw: 0, pointPerLoss: 1 },
      championshipConfig: { maxMatchesPerPlayer: 42 },
    });

    expect(updated.scoringConfig?.pointPerVictory).toBe(2);
    expect(updated.championshipConfig?.maxMatchesPerPlayer).toBe(42);

    const { scoring, championship } = await readConfigs(created.id);
    expect(scoring.pointPerDraw).toBe(0);
    // Untouched fields of a partial update keep their value.
    expect(championship.maxTimesWithSamePartner).toBe(
      CHAMPIONSHIP_DEFAULTS.maxTimesWithSamePartner,
    );
  });

  it("cascades both rows when the tournament is deleted", async () => {
    const tournament = await tournamentService.createTournament({
      name: `Config Cascade ${Date.now()}`,
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      createdBy: creatorId,
      ...dates(),
    });

    await testDb.delete(tournaments).where(eq(tournaments.id, tournament.id));

    const { scoring, championship } = await readConfigs(tournament.id);
    expect(scoring).toBeUndefined();
    expect(championship).toBeUndefined();
  });
});
