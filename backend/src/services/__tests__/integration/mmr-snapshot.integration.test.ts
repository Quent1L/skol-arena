import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
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
  mmrHistory,
  rankedSeasonConfigs,
  seasonMmrSeeds,
} from "../../../db/schema";

/**
 * The wizard's balance preview reads the MMR the players held on the day the
 * match was played, which is the one thing the unit test's mocks cannot prove:
 * the cut-off is a join on `matches.playedAt`, not a column on `mmr_history`.
 */
describe("MMR snapshot at a past date (integration)", () => {
  const BASE_MMR = 1000;
  const PLACEMENT_MATCHES = 3;

  let adminId: string;
  let seasonId: string;

  async function createPlayer(name: string) {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({
        displayName: name,
        shortName: name.slice(0, 3).toUpperCase(),
        externalId: authUser.id,
        role: "player",
      })
      .returning();
    return appUser.id;
  }

  async function createSeason(withConfig = true) {
    const [season] = await testDb
      .insert(tournaments)
      .values({
        name: `Ranked season ${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ongoing",
        createdBy: adminId,
      })
      .returning();
    if (withConfig) {
      await testDb.insert(rankedSeasonConfigs).values({
        tournamentId: season.id,
        baseMmr: BASE_MMR,
        kFactor: 32,
        placementMatches: PLACEMENT_MATCHES,
      });
    }
    return season.id;
  }

  /** One rated match for `playerId` on `playedAt`, closing at `mmrAfter`. */
  async function rateMatch(playerId: string, playedAt: string, mmrBefore: number, mmrAfter: number) {
    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: seasonId,
        status: "finalized",
        winnerSide: "A",
        playedAt: new Date(playedAt),
        createdBy: adminId,
      })
      .returning();
    await testDb.insert(mmrHistory).values({
      seasonId,
      playerId,
      matchId: match.id,
      mmrBefore,
      mmrAfter,
      mmrDelta: mmrAfter - mmrBefore,
      kEffective: 32,
      opponentAvgMmr: mmrBefore,
      isPlacement: false,
      outcome: mmrAfter >= mmrBefore ? "win" : "loss",
      winStreakAfter: 0,
      lossStreakAfter: 0,
      matchesPlayedAfter: 0,
    });
  }

  async function snapshotAt(playerIds: string[], at: string) {
    const rows = await mmrCalculationService.getMmrSnapshotAt(seasonId, playerIds, new Date(at));
    return Object.fromEntries(rows.map((r) => [r.playerId, r]));
  }

  beforeAll(async () => {
    adminId = await createPlayer("Admin");
  });

  beforeEach(async () => {
    seasonId = await createSeason();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("reports the MMR held on the match date, not the current one", async () => {
    const playerId = await createPlayer("Climber");
    await rateMatch(playerId, "2026-02-01T10:00:00Z", 1000, 1050);
    await rateMatch(playerId, "2026-02-10T10:00:00Z", 1050, 1200);
    await rateMatch(playerId, "2026-02-20T10:00:00Z", 1200, 1400);

    // A match entered late, dated between the second and the third.
    expect((await snapshotAt([playerId], "2026-02-15T10:00:00Z"))[playerId].mmr).toBe(1050 + 150);
    expect((await snapshotAt([playerId], "2026-03-01T10:00:00Z"))[playerId].mmr).toBe(1400);
  });

  it("falls back to the season base before the player's first match", async () => {
    const playerId = await createPlayer("Debutant");
    await rateMatch(playerId, "2026-02-01T10:00:00Z", 1000, 1050);

    const snapshot = await snapshotAt([playerId], "2026-01-15T10:00:00Z");
    expect(snapshot[playerId].mmr).toBe(BASE_MMR);
    expect(snapshot[playerId].isPlacement).toBe(true);
  });

  it("prefers the carry-over seed over the season base", async () => {
    const playerId = await createPlayer("CarriedOver");
    await testDb.insert(seasonMmrSeeds).values({ seasonId, playerId, seedMmr: 1330, sourceSeasonId: null });

    expect((await snapshotAt([playerId], "2026-02-01T10:00:00Z"))[playerId].mmr).toBe(1330);
  });

  it("counts placement against the matches played before that date", async () => {
    const playerId = await createPlayer("Placing");
    await rateMatch(playerId, "2026-02-01T10:00:00Z", 1000, 1010);
    await rateMatch(playerId, "2026-02-02T10:00:00Z", 1010, 1020);
    await rateMatch(playerId, "2026-02-03T10:00:00Z", 1020, 1030);

    // Two matches in at the earlier date, three at the later one.
    expect((await snapshotAt([playerId], "2026-02-03T09:00:00Z"))[playerId].isPlacement).toBe(true);
    expect((await snapshotAt([playerId], "2026-02-04T10:00:00Z"))[playerId].isPlacement).toBe(false);
  });

  it("ignores another player's history", async () => {
    const playerId = await createPlayer("Watched");
    const otherId = await createPlayer("Unrelated");
    await rateMatch(otherId, "2026-02-01T10:00:00Z", 1000, 1500);

    expect((await snapshotAt([playerId], "2026-03-01T10:00:00Z"))[playerId].mmr).toBe(BASE_MMR);
  });

  it("rejects a tournament that carries no ranked config", async () => {
    const playerId = await createPlayer("Stray");
    seasonId = await createSeason(false);

    await expect(mmrCalculationService.getMmrSnapshotAt(seasonId, [playerId], new Date())).rejects.toThrow(
      "SEASON_NOT_FOUND",
    );
  });
});
