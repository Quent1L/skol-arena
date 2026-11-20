import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { playerMmrRepository } from "../../../repository/player-mmr.repository";
import { tournaments, appUsers, user as betterAuthUser, matches, mmrHistory } from "../../../db/schema";

describe("Player career MMR aggregates (integration)", () => {
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

  async function careerFor(playerId: string, targetSeasonId = seasonId) {
    const rows = await playerMmrRepository.getPlayerCareerMmrStats(playerId);
    return rows.find((row) => row.seasonId === targetSeasonId);
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

  it("peaks at the highest MMR reached during a season", async () => {
    const playerId = await createPlayer("CareerClimber");
    await seedRun(playerId, 1000, [1020, 1080, 1040]);

    expect((await careerFor(playerId))?.peakMmr).toBe(1080);
  });

  it("peaks at the entry MMR for a season the player only ever lost in", async () => {
    const playerId = await createPlayer("CareerFaller");
    await seedRun(playerId, 1000, [980, 950, 930]);

    const row = await careerFor(playerId);
    expect(row?.peakMmr).toBe(1000);
    expect(row?.entryMmr).toBe(1000);
  });

  it("averages each season including its entry MMR", async () => {
    const playerId = await createPlayer("CareerAverage");
    // seed 1000, then 1020 / 1005 / 1040 -> (1000 + 3065) / 4
    await seedRun(playerId, 1000, [1020, 1005, 1040]);

    expect((await careerFor(playerId))?.avgMmr).toBe(1016);
  });

  it("returns one row per season, each aggregated on its own history", async () => {
    const playerId = await createPlayer("CareerTwoSeasons");
    await seedRun(playerId, 1000, [1020]);
    await seedRun(playerId, 1500, [1600], otherSeasonId);

    const rows = await playerMmrRepository.getPlayerCareerMmrStats(playerId);
    expect(rows).toHaveLength(2);
    expect((await careerFor(playerId))?.peakMmr).toBe(1020);
    expect((await careerFor(playerId, otherSeasonId))?.peakMmr).toBe(1600);
  });

  it("keeps a season the player never completed their placements in", async () => {
    // The season leaderboard filters these out; a career must not, or whole
    // seasons vanish from the player's history with no explanation.
    const playerId = await createPlayer("CareerRookie");
    await seedRun(playerId, 1000, [1400]);

    const row = await careerFor(playerId);
    expect(row?.matchesPlayed).toBe(1);
    expect(row?.peakMmr).toBe(1400);
  });

  it("ignores the seasons of other players", async () => {
    const playerId = await createPlayer("CareerMine");
    const otherId = await createPlayer("CareerTheirs");
    await seedRun(playerId, 1000, [1020]);
    await seedRun(otherId, 1000, [1900], otherSeasonId);

    const rows = await playerMmrRepository.getPlayerCareerMmrStats(playerId);
    expect(rows.map((row) => row.seasonId)).toEqual([seasonId]);
  });

  it("returns nothing for a player with no rated match", async () => {
    const playerId = await createPlayer("CareerEmpty");
    expect(await playerMmrRepository.getPlayerCareerMmrStats(playerId)).toEqual([]);
  });

  // The whole point of duplicating the aggregate SQL: a career row and the season
  // leaderboard row for the same (player, season) have to show the same numbers.
  it("agrees with getSeasonMmrStats on the same season", async () => {
    const playerId = await createPlayer("CareerParity");
    await seedRun(playerId, 1000, [1020, 1005, 1120, 1090, 1075]);

    const career = await careerFor(playerId);
    const season = (await playerMmrRepository.getSeasonMmrStats(seasonId, 0)).find((row) => row.playerId === playerId);

    expect(career?.peakMmr).toBe(season!.peakMmr);
    expect(career?.avgMmr).toBe(season!.avgMmr);
    expect(career?.matchesPlayed).toBe(season!.matchesPlayed);
  });
});
