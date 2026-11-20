import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rankedSeasonService } from "../../ranked-season.service";
import { mmrCalculationService } from "../../mmr-calculation.service";
import { mmrSeedRepository } from "../../../repository/mmr-seed.repository";
import {
  tournaments,
  disciplines,
  appUsers,
  user as betterAuthUser,
  matches,
  matchSides,
  tournamentEntries,
  tournamentEntryPlayers,
  rankedSeasonConfigs,
  rankTiers,
  playerMmr,
  mmrHistory,
  seasonMmrSeeds,
} from "../../../db/schema";
import { eq, and } from "drizzle-orm";

const BASE_MMR = 1000;

describe("Cross-season MMR carry-over (integration)", () => {
  let adminId: string;
  let sourceSeasonId: string;
  let newSeasonId: string;
  let playedAtCursor: number;

  async function createPlayer(name: string, role: "player" | "super_admin" = "player") {
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
        role,
      })
      .returning();
    return appUser.id;
  }

  async function createDiscipline() {
    const [discipline] = await testDb
      .insert(disciplines)
      .values({ name: `Discipline ${Math.random().toString(16).slice(2)}` })
      .returning();
    return discipline.id;
  }

  async function createSeason(
    name: string,
    status: "draft" | "ongoing" | "finished",
    config: Partial<typeof rankedSeasonConfigs.$inferInsert> = {},
    disciplineId?: string,
  ) {
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
        status,
        disciplineId,
        createdBy: adminId,
      })
      .returning();
    await testDb.insert(rankedSeasonConfigs).values({
      tournamentId: season.id,
      baseMmr: BASE_MMR,
      kFactor: 32,
      placementMatches: 5,
      ...config,
    });
    return season.id;
  }

  /** A settled player of the source season: MMR plus enough matches to be placed. */
  async function seedSourcePlayer(name: string, currentMmr: number, matchesPlayed = 10) {
    const playerId = await createPlayer(name);
    await testDb.insert(playerMmr).values({
      seasonId: sourceSeasonId,
      playerId,
      currentMmr,
      matchesPlayed,
      wins: matchesPlayed,
      losses: 0,
    });
    return playerId;
  }

  async function seedsOf(seasonId: string) {
    const rows = await testDb
      .select({ playerId: seasonMmrSeeds.playerId, seedMmr: seasonMmrSeeds.seedMmr })
      .from(seasonMmrSeeds)
      .where(eq(seasonMmrSeeds.seasonId, seasonId));
    return new Map(rows.map((row) => [row.playerId, row.seedMmr]));
  }

  async function createEntry(seasonId: string, playerId: string) {
    const [entry] = await testDb
      .insert(tournamentEntries)
      .values({ tournamentId: seasonId, entryType: "PLAYER" })
      .returning();
    await testDb.insert(tournamentEntryPlayers).values({ entryId: entry.id, playerId });
    return entry.id;
  }

  /** One finalized 1v1, side A winning, ready for processMatchFinalization. */
  async function createFinalizedMatch(seasonId: string, winnerId: string, loserId: string) {
    playedAtCursor += 60_000;
    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: seasonId,
        status: "finalized",
        winnerSide: "A",
        playedAt: new Date(playedAtCursor),
        createdBy: adminId,
      })
      .returning();
    await testDb.insert(matchSides).values([
      { matchId: match.id, entryId: await createEntry(seasonId, winnerId), position: 1, score: 0 },
      { matchId: match.id, entryId: await createEntry(seasonId, loserId), position: 2, score: 0 },
    ]);
    return match.id;
  }

  beforeAll(async () => {
    // startSeason goes through the permission check, hence the role.
    adminId = await createPlayer("Admin", "super_admin");
  });

  beforeEach(async () => {
    sourceSeasonId = await createSeason("Source season", "finished");
    playedAtCursor = new Date("2026-06-01T10:00:00Z").getTime();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  async function createCarryOverSeason(overrides: Partial<typeof rankedSeasonConfigs.$inferInsert> = {}) {
    newSeasonId = await createSeason("New season", "draft", {
      usePreviousMmr: true,
      softResetFactor: 0.5,
      sourceMmrSeasonId: sourceSeasonId,
      ...overrides,
    });
    await rankedSeasonService.syncMmrSeeds(newSeasonId);
    return newSeasonId;
  }

  it("compresses each player towards the source season's median, re-centred on baseMmr", async () => {
    const top = await seedSourcePlayer("Top", 1600);
    const middle = await seedSourcePlayer("Middle", 1240);
    const bottom = await seedSourcePlayer("Bottom", 900);

    await createCarryOverSeason();

    const seeds = await seedsOf(newSeasonId);
    // median = 1240 → the median player lands exactly on baseMmr, the others keep
    // half of their distance to it.
    expect(seeds.get(middle)).toBe(BASE_MMR);
    expect(seeds.get(top)).toBe(1180);
    expect(seeds.get(bottom)).toBe(830);
  });

  it("puts nobody in the leaderboard: a carried-over player has no player_mmr row", async () => {
    await seedSourcePlayer("Top", 1600);
    await seedSourcePlayer("Middle", 1240);
    await seedSourcePlayer("Bottom", 900);

    await createCarryOverSeason();

    const rows = await testDb.select().from(playerMmr).where(eq(playerMmr.seasonId, newSeasonId));
    expect(rows).toHaveLength(0);
    expect((await seedsOf(newSeasonId)).size).toBe(3);
  });

  it("skips players who never finished their placement in the source season", async () => {
    const settled = await seedSourcePlayer("Settled", 1200);
    const unsettled = await seedSourcePlayer("Unsettled", 1800, 2);

    await createCarryOverSeason();

    const seeds = await seedsOf(newSeasonId);
    expect(seeds.has(settled)).toBe(true);
    // Their 1800 was noise, and it never enters the median either.
    expect(seeds.has(unsettled)).toBe(false);
    expect(seeds.get(settled)).toBe(BASE_MMR);
  });

  it("a factor of 0 seeds everyone at baseMmr", async () => {
    const top = await seedSourcePlayer("Top", 1600);
    const bottom = await seedSourcePlayer("Bottom", 700);

    await createCarryOverSeason({ softResetFactor: 0 });

    const seeds = await seedsOf(newSeasonId);
    expect(seeds.get(top)).toBe(BASE_MMR);
    expect(seeds.get(bottom)).toBe(BASE_MMR);
  });

  it("turning the carry-over off drops the seeds", async () => {
    await seedSourcePlayer("Top", 1600);
    await createCarryOverSeason();
    expect((await seedsOf(newSeasonId)).size).toBe(1);

    await testDb
      .update(rankedSeasonConfigs)
      .set({ usePreviousMmr: false })
      .where(eq(rankedSeasonConfigs.tournamentId, newSeasonId));
    await rankedSeasonService.syncMmrSeeds(newSeasonId);

    expect((await seedsOf(newSeasonId)).size).toBe(0);
  });

  it("re-syncing is idempotent: the source season's MMR is frozen", async () => {
    await seedSourcePlayer("Top", 1600);
    await seedSourcePlayer("Bottom", 900);
    await createCarryOverSeason();
    const first = await seedsOf(newSeasonId);

    await rankedSeasonService.syncMmrSeeds(newSeasonId);

    expect(await seedsOf(newSeasonId)).toEqual(first);
  });

  it("falls back to the last finished season of the discipline when no source is set", async () => {
    // The fallback is scoped by discipline, so both seasons need to share one.
    const disciplineId = await createDiscipline();
    sourceSeasonId = await createSeason("Source season", "finished", {}, disciplineId);
    const player = await seedSourcePlayer("Solo", 1400);

    newSeasonId = await createSeason(
      "New season",
      "draft",
      { usePreviousMmr: true, softResetFactor: 0.5, sourceMmrSeasonId: null },
      disciplineId,
    );
    await rankedSeasonService.syncMmrSeeds(newSeasonId);

    expect((await seedsOf(newSeasonId)).get(player)).toBe(BASE_MMR);
  });

  it("the first finalized match starts from the seeded MMR, not from baseMmr", async () => {
    const winner = await seedSourcePlayer("Winner", 1600);
    const loser = await seedSourcePlayer("Loser", 900);
    await seedSourcePlayer("Median", 1240);
    await createCarryOverSeason();

    const seeds = await seedsOf(newSeasonId);
    const winnerSeed = seeds.get(winner)!;
    const loserSeed = seeds.get(loser)!;

    const matchId = await createFinalizedMatch(newSeasonId, winner, loser);
    await mmrCalculationService.processMatchFinalization(matchId);

    const history = await testDb
      .select({ playerId: mmrHistory.playerId, mmrBefore: mmrHistory.mmrBefore })
      .from(mmrHistory)
      .where(and(eq(mmrHistory.seasonId, newSeasonId), eq(mmrHistory.matchId, matchId)));
    const beforeOf = new Map(history.map((row) => [row.playerId, row.mmrBefore]));
    expect(beforeOf.get(winner)).toBe(winnerSeed);
    expect(beforeOf.get(loser)).toBe(loserSeed);
    expect(winnerSeed).not.toBe(BASE_MMR);
  });

  it("a full deterministic recalculation keeps the seeded starting point", async () => {
    const winner = await seedSourcePlayer("Winner", 1600);
    const loser = await seedSourcePlayer("Loser", 900);
    await seedSourcePlayer("Median", 1240);
    await createCarryOverSeason();

    const matchId = await createFinalizedMatch(newSeasonId, winner, loser);
    await mmrCalculationService.processMatchFinalization(matchId);
    const afterFinalization = await testDb
      .select({ playerId: playerMmr.playerId, currentMmr: playerMmr.currentMmr })
      .from(playerMmr)
      .where(eq(playerMmr.seasonId, newSeasonId));

    await mmrCalculationService.recalculateSeasonMmrDeterministic(newSeasonId);

    const afterRecalc = await testDb
      .select({ playerId: playerMmr.playerId, currentMmr: playerMmr.currentMmr })
      .from(playerMmr)
      .where(eq(playerMmr.seasonId, newSeasonId));
    const sortById = (rows: { playerId: string; currentMmr: number }[]) =>
      [...rows].sort((a, b) => a.playerId.localeCompare(b.playerId));
    expect(sortById(afterRecalc)).toEqual(sortById(afterFinalization));
    // And only the two players who actually played hold a row.
    expect(afterRecalc).toHaveLength(2);
  });

  // The ladder is percentile-based, so copying a season's tiers means copying its
  // shape onto the new MMR scale — a raw baseMmr for every tier collapses it.
  describe("ladder copied from another season", () => {
    // The peak distribution is read through mmr_history, and only players past the
    // source season's placement threshold count — one match is enough here.
    beforeEach(async () => {
      sourceSeasonId = await createSeason("Source season", "finished", {
        placementMatches: 1,
      });
    });

    /** Writes a run of MMR values into the source season's history. */
    async function seedHistory(playerId: string, startMmr: number, afters: number[]) {
      let before = startMmr;
      for (const after of afters) {
        playedAtCursor += 60_000;
        const [match] = await testDb
          .insert(matches)
          .values({
            tournamentId: sourceSeasonId,
            status: "finalized",
            winnerSide: "A",
            playedAt: new Date(playedAtCursor),
            createdBy: adminId,
          })
          .returning();
        await testDb.insert(mmrHistory).values({
          seasonId: sourceSeasonId,
          playerId,
          matchId: match.id,
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

    async function startWithCopiedTiers(config: Partial<typeof rankedSeasonConfigs.$inferInsert> = {}) {
      newSeasonId = await createSeason("New season", "draft", {
        usePreviousMmr: true,
        softResetFactor: 0.5,
        sourceMmrSeasonId: sourceSeasonId,
        sourceTierSeasonId: sourceSeasonId,
        ...config,
      });
      await rankedSeasonService.startSeason(newSeasonId, adminId);
      return testDb
        .select({
          level: rankTiers.level,
          name: rankTiers.name,
          minMmr: rankTiers.minMmr,
          percentile: rankTiers.percentile,
          subRanks: rankTiers.subRanks,
        })
        .from(rankTiers)
        .where(eq(rankTiers.seasonId, newSeasonId))
        .orderBy(rankTiers.level);
    }

    async function seedSourceLadder() {
      await testDb.insert(rankTiers).values([
        { seasonId: sourceSeasonId, level: 1, name: "Rookie", percentile: 0, minMmr: 700 },
        { seasonId: sourceSeasonId, level: 2, name: "Challenger", percentile: 0.4, minMmr: 900 },
        { seasonId: sourceSeasonId, level: 3, name: "Legend", percentile: 0.9, minMmr: 1500 },
      ]);
    }

    /** A player whose peak sits above where they finished. */
    async function seedSourcePlayerWithPeak(name: string, finalMmr: number, peak: number) {
      const playerId = await seedSourcePlayer(name, finalMmr);
      await seedHistory(playerId, finalMmr, [peak, finalMmr]);
      return playerId;
    }

    it("keep (default): copies the source thresholds verbatim", async () => {
      await seedSourceLadder();
      await seedSourcePlayer("Top", 1600);
      await seedSourcePlayer("Middle", 1240);
      await seedSourcePlayer("Bottom", 900);

      const tiers = await startWithCopiedTiers();

      expect(tiers.map((t) => t.minMmr)).toEqual([700, 900, 1500]);
      expect(tiers.map((t) => t.name)).toEqual(["Rookie", "Challenger", "Legend"]);
      expect(tiers.map((t) => t.percentile)).toEqual([0, 0.4, 0.9]);
    });

    it("percentile: rebuilds the thresholds from the source season's peak MMR", async () => {
      await seedSourceLadder();
      // Peaks 1300 / 1100 / 1000; medianalways the middle one.
      await seedSourcePlayerWithPeak("Top", 1200, 1300);
      await seedSourcePlayerWithPeak("Middle", 1000, 1100);
      await seedSourcePlayerWithPeak("Bottom", 900, 1000);

      const tiers = await startWithCopiedTiers({ tierScalingMode: "percentile" });

      // anchor = median peak = 1100, factor 0.5, baseMmr 1000.
      // floor = min(1000, lowest seed 950, 1000 + (1000-1100)*0.5 = 950) = 950
      // p0.4 → sorted[1] = 1100 → 1000
      // p0.9 → sorted[2] = 1300 → 1100
      expect(tiers.map((t) => t.minMmr)).toEqual([950, 1000, 1100]);
      // The thresholds keep telling the tiers apart.
      expect(new Set(tiers.map((t) => t.minMmr)).size).toBe(3);
    });

    it("percentile: leaves the bottom tier under the lowest seed and under baseMmr", async () => {
      await seedSourceLadder();
      await seedSourcePlayerWithPeak("Top", 1600, 1700);
      await seedSourcePlayerWithPeak("Middle", 1240, 1300);
      // Finished far below their peak: the seed the ladder has to reach down to.
      await seedSourcePlayerWithPeak("Bottom", 700, 800);

      const tiers = await startWithCopiedTiers({ tierScalingMode: "percentile" });
      const lowestSeed = Math.min(...(await seedsOf(newSeasonId)).values());

      expect(tiers[0].minMmr).toBeLessThanOrEqual(lowestSeed);
      expect(tiers[0].minMmr).toBeLessThanOrEqual(BASE_MMR);
    });

    it("percentile without carry-over: the ladder is shifted, not squeezed", async () => {
      await seedSourceLadder();
      await seedSourcePlayerWithPeak("Top", 1200, 1300);
      await seedSourcePlayerWithPeak("Middle", 1000, 1100);
      await seedSourcePlayerWithPeak("Bottom", 900, 1000);

      const tiers = await startWithCopiedTiers({
        tierScalingMode: "percentile",
        usePreviousMmr: false,
      });

      // factor 1: the 1000→1300 peak spread is kept, re-centred on baseMmr 1000.
      expect(tiers.map((t) => t.minMmr)).toEqual([900, 1000, 1200]);
    });

    it("percentile with no eligible player in the source: thresholds are left as they are", async () => {
      await seedSourceLadder();
      await seedSourcePlayer("OnlyUnsettled", 1500, 1);

      const tiers = await startWithCopiedTiers({ tierScalingMode: "percentile" });

      expect(tiers.map((t) => t.minMmr)).toEqual([700, 900, 1500]);
    });

    it("falls back to the default tiers when the source season has no ladder", async () => {
      await seedSourcePlayer("Top", 1600);
      const tiers = await startWithCopiedTiers();
      expect(tiers).toHaveLength(5);
      expect(tiers.map((t) => t.name)).toEqual(["Rookie", "Challenger", "Confirmé", "Expert", "Légende"]);
    });
  });

  it("seeds nothing when the source season has no eligible player", async () => {
    await seedSourcePlayer("OnlyUnsettled", 1500, 1);
    await createCarryOverSeason();
    expect((await seedsOf(newSeasonId)).size).toBe(0);
    expect(await mmrSeedRepository.getMapBySeason(newSeasonId)).toEqual(new Map());
  });
});
