import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { createTestDatabase, closeTestDatabase, getPgliteInstance } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rankedSeasonRepository } from "../../../repository/ranked-season.repository";
import {
  tournaments,
  appUsers,
  user as betterAuthUser,
  matches,
  rankTiers,
  mmrAnimationEvents,
} from "../../../db/schema";
import { and, eq } from "drizzle-orm";

const TIER_NAMES = ["Rookie", "Challenger", "Confirmé", "Expert", "Légende"] as const;

describe("Rank tier levels stay contiguous (integration)", () => {
  let adminId: string;
  let seasonId: string;
  let otherSeasonId: string;

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
        status: "ongoing",
        createdBy: adminId,
      })
      .returning();
    return season.id;
  }

  /** Levels 1..5, minMmr 700 + 200 per level. */
  async function seedTiers(targetSeasonId: string) {
    await testDb.insert(rankTiers).values(
      TIER_NAMES.map((name, index) => ({
        seasonId: targetSeasonId,
        level: index + 1,
        name,
        percentile: index / 10,
        minMmr: 700 + index * 200,
      })),
    );
  }

  async function createMatch() {
    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: seasonId,
        status: "finalized",
        winnerSide: "A",
        playedAt: new Date(),
        createdBy: adminId,
      })
      .returning();
    return match.id;
  }

  async function levelsOf(targetSeasonId: string) {
    const tiers = await rankedSeasonRepository.getRankTiers(targetSeasonId);
    return tiers.map((tier) => tier.level);
  }

  // One match per event: mmr_animation_events is unique on (player, season, match, type).
  async function addAnimationEvent(before: number | null, after: number | null) {
    const [event] = await testDb
      .insert(mmrAnimationEvents)
      .values({
        playerId: adminId,
        seasonId,
        matchId: await createMatch(),
        eventType: "official",
        mmrBefore: 1000,
        mmrAfter: 1020,
        mmrDelta: 20,
        tierBeforeLevel: before,
        tierAfterLevel: after,
        tierBeforeName: before === null ? null : TIER_NAMES[before - 1],
        tierAfterName: after === null ? null : TIER_NAMES[after - 1],
      })
      .returning();
    return event.id;
  }

  async function readAnimationEvent(id: string) {
    const event = await testDb.query.mmrAnimationEvents.findFirst({
      where: eq(mmrAnimationEvents.id, id),
    });
    return { before: event!.tierBeforeLevel, after: event!.tierAfterLevel };
  }

  beforeAll(async () => {
    adminId = await createPlayer("Admin");
  });

  beforeEach(async () => {
    seasonId = await createSeason("Ranked season");
    otherSeasonId = await createSeason("Other season");
    await seedTiers(seasonId);
    await seedTiers(otherSeasonId);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe("updateTier and the default-ladder nameKey", () => {
    /** Levels 1..2 seeded the way the default ladder does: name + key. */
    async function seedLadderTier() {
      await testDb.delete(rankTiers).where(eq(rankTiers.seasonId, seasonId));
      await testDb.insert(rankTiers).values({
        seasonId,
        level: 1,
        name: "Confirmé",
        nameKey: "CONFIRMED",
        percentile: 0.7,
        minMmr: 1100,
      });
    }

    async function keyOf(level: number) {
      const tier = await testDb.query.rankTiers.findFirst({
        where: and(eq(rankTiers.seasonId, seasonId), eq(rankTiers.level, level)),
        columns: { nameKey: true },
      });
      return tier?.nameKey ?? null;
    }

    it("keeps the key when the request language's label is written back", async () => {
      await seedLadderTier();
      await rankedSeasonRepository.updateTier(seasonId, 1, { name: "Confirmé", minMmr: 1150 });
      expect(await keyOf(1)).toBe("CONFIRMED");
    });

    it("keeps the key when another language's label is written back", async () => {
      await seedLadderTier();
      // A client that read the ladder in English PATCHes the whole tier back.
      await rankedSeasonRepository.updateTier(seasonId, 1, { name: "Advanced", minMmr: 1150 });
      expect(await keyOf(1)).toBe("CONFIRMED");
    });

    it("drops the key on a real rename", async () => {
      await seedLadderTier();
      await rankedSeasonRepository.updateTier(seasonId, 1, { name: "Diamant" });
      expect(await keyOf(1)).toBeNull();
    });

    it("leaves the key alone when no name is sent", async () => {
      await seedLadderTier();
      await rankedSeasonRepository.updateTier(seasonId, 1, { minMmr: 1200 });
      expect(await keyOf(1)).toBe("CONFIRMED");
    });
  });

  describe("deleteTier", () => {
    it("closes the gap left in the middle of the ladder", async () => {
      const tiers = await rankedSeasonRepository.deleteTier(seasonId, 3);

      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4]);
      expect(tiers.map((tier) => tier.name)).toEqual(["Rookie", "Challenger", "Expert", "Légende"]);
      // The tiers keep their own minMmr, only the level moves.
      expect(tiers.map((tier) => tier.minMmr)).toEqual([700, 900, 1300, 1500]);
    });

    it("leaves the levels untouched when the last tier goes", async () => {
      await rankedSeasonRepository.deleteTier(seasonId, 5);
      expect(await levelsOf(seasonId)).toEqual([1, 2, 3, 4]);
    });

    it("renumbers everything when the first tier goes", async () => {
      const tiers = await rankedSeasonRepository.deleteTier(seasonId, 1);
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4]);
      expect(tiers[0].name).toBe("Challenger");
    });

    it("does not touch the other seasons", async () => {
      await rankedSeasonRepository.deleteTier(seasonId, 3);
      expect(await levelsOf(otherSeasonId)).toEqual([1, 2, 3, 4, 5]);
    });

    it("shifts the levels frozen in mmr_animation_events", async () => {
      const above = await addAnimationEvent(3, 4);
      const below = await addAnimationEvent(1, 2);

      await rankedSeasonRepository.deleteTier(seasonId, 3);

      // The deleted level no longer resolves to a tier; the level above slides down.
      expect(await readAnimationEvent(above)).toEqual({ before: null, after: 3 });
      expect(await readAnimationEvent(below)).toEqual({ before: 1, after: 2 });
    });

    it("keeps the stored tier name of a deleted rank", async () => {
      const id = await addAnimationEvent(3, 3);
      await rankedSeasonRepository.deleteTier(seasonId, 3);

      const event = await testDb.query.mmrAnimationEvents.findFirst({
        where: eq(mmrAnimationEvents.id, id),
      });
      expect(event!.tierBeforeName).toBe("Confirmé");
    });

    it("is a no-op on the levels when the deleted tier does not exist", async () => {
      const tiers = await rankedSeasonRepository.deleteTier(seasonId, 42);
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("insertTier", () => {
    it("appends at the end of the ladder", async () => {
      const tiers = await rankedSeasonRepository.insertTier(seasonId, {
        level: 6,
        name: "Myth",
        percentile: 0.99,
        minMmr: 1700,
        subRanks: 1,
      });
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(tiers[5].name).toBe("Myth");
    });

    it("clamps a level beyond the end instead of leaving a hole", async () => {
      const tiers = await rankedSeasonRepository.insertTier(seasonId, {
        level: 42,
        name: "Myth",
        percentile: 0.99,
        minMmr: 1700,
        subRanks: 1,
      });
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(tiers[5].name).toBe("Myth");
    });

    it("pushes the tiers above one level up when inserting in the middle", async () => {
      const tiers = await rankedSeasonRepository.insertTier(seasonId, {
        level: 3,
        name: "Inserted",
        percentile: 0.5,
        minMmr: 1050,
        subRanks: 1,
      });
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(tiers.map((tier) => tier.name)).toEqual([
        "Rookie",
        "Challenger",
        "Inserted",
        "Confirmé",
        "Expert",
        "Légende",
      ]);
    });

    it("shifts the levels frozen in mmr_animation_events on a middle insert", async () => {
      const id = await addAnimationEvent(2, 3);

      await rankedSeasonRepository.insertTier(seasonId, {
        level: 3,
        name: "Inserted",
        percentile: 0.5,
        minMmr: 1050,
        subRanks: 1,
      });

      // "Confirmé" moved from level 3 to level 4; "Challenger" did not move.
      expect(await readAnimationEvent(id)).toEqual({ before: 2, after: 4 });
    });
  });

  // The seasons edited before the levels were kept contiguous are fixed by a
  // one-off migration. It already ran on the empty test database, so it is
  // replayed here against a season that actually has holes.
  describe("migration 0063_resequence_rank_tiers", () => {
    async function runResequenceMigration() {
      const sql = readFileSync(join(__dirname, "../../../../drizzle/0063_resequence_rank_tiers.sql"), "utf-8");
      await getPgliteInstance()!.exec(sql);
    }

    it("closes existing holes and realigns the frozen levels", async () => {
      await testDb.delete(rankTiers).where(eq(rankTiers.seasonId, seasonId));
      await testDb.insert(rankTiers).values(
        [1, 2, 4, 7].map((level) => ({
          seasonId,
          level,
          name: `Tier ${level}`,
          percentile: 0,
          minMmr: 700 + level * 100,
        })),
      );
      const shifted = await addAnimationEvent(2, 4);
      const dangling = await addAnimationEvent(null, 3);

      await runResequenceMigration();

      const tiers = await rankedSeasonRepository.getRankTiers(seasonId);
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4]);
      expect(tiers.map((tier) => tier.name)).toEqual(["Tier 1", "Tier 2", "Tier 4", "Tier 7"]);
      expect(await readAnimationEvent(shifted)).toEqual({ before: 2, after: 3 });
      // Level 3 never existed in that season: nothing to point at anymore.
      expect(await readAnimationEvent(dangling)).toEqual({ before: null, after: null });
      // Contiguous seasons are left alone.
      expect(await levelsOf(otherSeasonId)).toEqual([1, 2, 3, 4, 5]);
    });

    it("is idempotent", async () => {
      await runResequenceMigration();
      await runResequenceMigration();
      expect(await levelsOf(seasonId)).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
