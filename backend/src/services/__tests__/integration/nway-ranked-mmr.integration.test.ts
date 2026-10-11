import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { mmrCalculationService } from "../../mmr-calculation.service";
import {
  tournaments,
  appUsers,
  user as betterAuthUser,
  matches,
  matchSides,
  tournamentEntries,
  tournamentEntryPlayers,
  rankedSeasonConfigs,
  playerMmr,
  mmrHistory,
} from "../../../db/schema";
import { asc, eq } from "drizzle-orm";

const BASE_MMR = 1000;

describe("Ranked MMR of a match of three sides (integration)", () => {
  let adminId: string;
  let seasonId: string;
  let players: string[];
  let matchId: string;

  async function createPlayer(name: string, role: "player" | "super_admin" = "player") {
    const suffix = `${name}-${crypto.randomUUID()}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({ displayName: name, shortName: name.slice(0, 3), externalId: authUser.id, role })
      .returning();
    return appUser.id;
  }

  async function createEntry(playerId: string) {
    const [entry] = await testDb
      .insert(tournamentEntries)
      .values({ tournamentId: seasonId, entryType: "PLAYER" })
      .returning();
    await testDb.insert(tournamentEntryPlayers).values({ entryId: entry.id, playerId });
    return entry.id;
  }

  const mmrOf = async () => {
    const rows = await testDb.select().from(playerMmr).where(eq(playerMmr.seasonId, seasonId));
    return players.map((id) => rows.find((r) => r.playerId === id)?.currentMmr);
  };

  beforeAll(async () => {
    adminId = await createPlayer("Admin", "super_admin");
    players = [await createPlayer("First"), await createPlayer("Second"), await createPlayer("Third")];

    const [season] = await testDb
      .insert(tournaments)
      .values({
        name: `N-way ranked ${crypto.randomUUID()}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        maxSidesPerMatch: 3,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ongoing",
        createdBy: adminId,
      })
      .returning();
    seasonId = season.id;
    // No placement phase: every duel moves the plain K-factor amount.
    await testDb
      .insert(rankedSeasonConfigs)
      .values({ tournamentId: seasonId, baseMmr: BASE_MMR, kFactor: 32, placementMatches: 0 });

    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: seasonId,
        status: "finalized",
        winnerSide: null,
        playedAt: new Date("2026-06-01T10:00:00Z"),
        createdBy: adminId,
      })
      .returning();
    matchId = match.id;
    // Positions deliberately differ from the placements
    await testDb.insert(matchSides).values([
      { matchId, entryId: await createEntry(players[1]), position: 1, score: 0, rank: 2 },
      { matchId, entryId: await createEntry(players[2]), position: 2, score: 0, rank: 3 },
      { matchId, entryId: await createEntry(players[0]), position: 3, score: 0, rank: 1 },
    ]);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("moves the first up, the last down and the middle one not at all", async () => {
    await mmrCalculationService.processMatchFinalization(matchId);

    expect(await mmrOf()).toEqual([BASE_MMR + 16, BASE_MMR, BASE_MMR - 16]);
    const history = await testDb
      .select({ playerId: mmrHistory.playerId, outcome: mmrHistory.outcome })
      .from(mmrHistory)
      .where(eq(mmrHistory.matchId, matchId))
      .orderBy(asc(mmrHistory.mmrAfter));
    expect(history.map((h) => h.outcome)).toEqual(["loss", "loss", "win"]);
  });

  it("lands on the same MMR through the deterministic season replay", async () => {
    await mmrCalculationService.recalculateSeasonMmrDeterministic(seasonId);

    expect(await mmrOf()).toEqual([BASE_MMR + 16, BASE_MMR, BASE_MMR - 16]);
  });
});
