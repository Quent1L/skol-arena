import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { playerMmrRepository } from "../../../repository/player-mmr.repository";
import { tournaments, appUsers, user as betterAuthUser, matches, mmrHistory } from "../../../db/schema";

describe("Season MMR aggregates (integration)", () => {
  let adminId: string;
  let seasonId: string;
  let otherSeasonId: string;
  let playedAtCursor: number;

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

  async function createSeason(name: string) {
    const [season] = await testDb
      .insert(tournaments)
      .values({
        name: `${name} ${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: "ranked",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "finished",
        createdBy: adminId,
      })
      .returning();
    return season.id;
  }

  // mmr_history has no timestamp of its own: the chronological order that seeds the
  // aggregates comes from matches.playedAt, so every match gets a distinct one.
  async function createMatch(targetSeasonId: string) {
    playedAtCursor += 60_000;
    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: targetSeasonId,
        status: "finalized",
        winnerSide: "A",
        playedAt: new Date(playedAtCursor),
        createdBy: adminId,
      })
      .returning();
    return match.id;
  }

  /** Replays a run of MMR values for one player, starting from `startMmr`. */
  async function seedRun(playerId: string, startMmr: number, afters: number[], targetSeasonId = seasonId) {
    let before = startMmr;
    for (const after of afters) {
      await testDb.insert(mmrHistory).values({
        seasonId: targetSeasonId,
        playerId,
        matchId: await createMatch(targetSeasonId),
        mmrBefore: before,
        mmrAfter: after,
        mmrDelta: after - before,
        kEffective: 32,
        opponentAvgMmr: before,
        isPlacement: false,
        outcome: after >= before ? "win" : "loss",
        winStreakAfter: 0,
        lossStreakAfter: 0,
        matchesPlayedAfter: 0,
      });
      before = after;
    }
  }

  async function statsFor(playerId: string, minMatches = 0, targetSeasonId = seasonId) {
    const rows = await playerMmrRepository.getSeasonMmrStats(targetSeasonId, minMatches);
    return rows.find((row) => row.playerId === playerId);
  }

  beforeAll(async () => {
    adminId = await createPlayer("Admin");
  });

  beforeEach(async () => {
    seasonId = await createSeason("Ranked season");
    otherSeasonId = await createSeason("Other season");
    playedAtCursor = new Date("2026-01-02T10:00:00Z").getTime();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("peaks at the highest MMR reached during the season", async () => {
    const playerId = await createPlayer("Climber");
    await seedRun(playerId, 1000, [1020, 1080, 1040]);

    expect((await statsFor(playerId))?.peakMmr).toBe(1080);
  });

  it("peaks at the entry MMR for a player who only ever lost", async () => {
    const playerId = await createPlayer("Faller");
    await seedRun(playerId, 1000, [980, 950, 930]);

    expect((await statsFor(playerId))?.peakMmr).toBe(1000);
  });

  it("averages the season including the entry MMR", async () => {
    const playerId = await createPlayer("Average");
    // seed 1000, then 1020 / 1005 / 1040 -> (1000 + 3065) / 4
    await seedRun(playerId, 1000, [1020, 1005, 1040]);

    expect((await statsFor(playerId))?.avgMmr).toBe(1016);
  });

  it("counts the matches played, not the entry seed", async () => {
    const playerId = await createPlayer("Counter");
    await seedRun(playerId, 1000, [1020, 1005]);

    expect((await statsFor(playerId))?.matchesPlayed).toBe(2);
  });

  it("excludes players below the placement threshold", async () => {
    const rookie = await createPlayer("Rookie");
    const regular = await createPlayer("Regular");
    await seedRun(rookie, 1000, [1400]);
    await seedRun(regular, 1000, [1010, 1020, 1030, 1040, 1050]);

    const rows = await playerMmrRepository.getSeasonMmrStats(seasonId, 5);
    expect(rows.map((row) => row.playerId)).toEqual([regular]);
  });

  it("keeps everyone when the season has no placement matches", async () => {
    const rookie = await createPlayer("NoThreshold");
    await seedRun(rookie, 1000, [1400]);

    expect(await statsFor(rookie, 0)).toBeDefined();
  });

  it("does not mix matches from another season", async () => {
    const playerId = await createPlayer("TwoSeasons");
    await seedRun(playerId, 1000, [1020]);
    await seedRun(playerId, 1500, [1600], otherSeasonId);

    expect((await statsFor(playerId))?.peakMmr).toBe(1020);
    expect((await statsFor(playerId, 0, otherSeasonId))?.peakMmr).toBe(1600);
  });

  it("returns nothing for a season without any history", async () => {
    expect(await playerMmrRepository.getSeasonMmrStats(seasonId, 0)).toEqual([]);
  });
});
