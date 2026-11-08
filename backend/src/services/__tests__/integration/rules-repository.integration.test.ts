import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rulesRepository as repo } from "../../../repository/rules.repository";
import { makeSeeder } from "../helpers/db-seed";
import { disciplines } from "../../../db/schema";

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("rulesRepository (integration)", () => {
  let admin: string;
  let ann: string;
  let bob: string;
  let disciplineId: string;
  let seasonA: string;
  let seasonB: string;

  const rule = (extra: Record<string, unknown> = {}) =>
    ({
      triggerEvent: "match_submitted",
      type: "badge",
      scope: "global",
      name: `Rule ${Math.random().toString(16).slice(2)}`,
      conditions: { all: [] },
      action: { type: "badge", label: "Champion", icon: "star", recurrence: "once" },
      createdBy: admin,
      ...extra,
    }) as never;

  beforeAll(async () => {
    admin = await seed.createUser("Admin");
    ann = await seed.createUser("Ann");
    bob = await seed.createUser("Bob");
    const [discipline] = await testDb.insert(disciplines).values({ name: `Discipline-${Date.now()}` }).returning();
    disciplineId = discipline!.id;
    seasonA = await seed.createTournament(admin, { mode: "ranked" });
    seasonB = await seed.createTournament(admin, { mode: "ranked" });
  });

  describe("rules", () => {
    it("creates, reads, lists with filters, updates and deletes", async () => {
      const created = await repo.create(rule({ name: "First", priority: 5 }));
      expect(created?.engineVersion).toBeDefined();
      expect((await repo.getById(created!.id))?.name).toBe("First");
      expect(await repo.getById(MISSING)).toBeUndefined();

      const inactive = await repo.create(rule({ name: "Dormant", type: "message", isActive: false, triggerEvent: "other" }));
      expect((await repo.list()).length).toBeGreaterThanOrEqual(2);
      expect((await repo.list({ type: "message" })).map((r) => r.id)).toEqual([inactive!.id]);
      expect((await repo.list({ triggerEvent: "other" })).map((r) => r.id)).toEqual([inactive!.id]);
      expect((await repo.list({ scope: "global", isActive: false })).map((r) => r.id)).toEqual([inactive!.id]);

      const updated = await repo.update(created!.id, { name: "Renamed", isActive: false });
      expect(updated).toMatchObject({ name: "Renamed", isActive: false, disabledReason: null });

      await repo.delete(created!.id);
      expect(await repo.getById(created!.id)).toBeUndefined();
    });

    it("lists active rules for a trigger, global ones plus the discipline's own", async () => {
      const global = await repo.create(rule({ triggerEvent: "season_end", priority: 1 }));
      const scoped = await repo.create(rule({ triggerEvent: "season_end", scope: "discipline", disciplineId, priority: 9 }));
      await repo.create(rule({ triggerEvent: "season_end", isActive: false }));

      expect((await repo.listActiveByTrigger("season_end", null)).map((r) => r.id)).toEqual([global!.id]);
      expect((await repo.listActiveByTrigger("season_end", disciplineId)).map((r) => r.id)).toEqual([scoped!.id, global!.id]);
    });
  });

  describe("badges", () => {
    let once: string;
    let seasonal: string;

    beforeAll(async () => {
      once = (await repo.create(rule({ name: "Once", action: { type: "badge", label: "Once", icon: "x", recurrence: "once" } })))!.id;
      seasonal = (await repo.create(rule({ name: "Seasonal", action: { type: "badge", label: "Seasonal", icon: "x", recurrence: "per_season" } })))!.id;
    });

    it("awards a once-only badge a single time", async () => {
      expect(await repo.awardBadge(ann, once, null, seasonA, "once")).not.toBeNull();
      expect(await repo.awardBadge(ann, once, null, seasonB, "once")).toBeNull();
      expect(await repo.holdsBadge(ann, once)).toBe(true);
      expect(await repo.holdsBadge(bob, once)).toBe(false);
    });

    it("awards a seasonal badge once per season and honours a past award date", async () => {
      const past = new Date("2024-01-01T00:00:00Z");
      expect(await repo.awardBadge(ann, seasonal, null, seasonA, "per_season", past)).not.toBeNull();
      expect(await repo.awardBadge(ann, seasonal, null, seasonA, "per_season")).toBeNull();
      expect(await repo.awardBadge(ann, seasonal, null, seasonB, "per_season")).not.toBeNull();
      const badges = await repo.listBadgesByPlayer(ann);
      expect(badges.find((b) => b.awardedAt.getTime() === past.getTime())?.ruleId).toBe(seasonal);
      expect(badges.length).toBe(3);
    });

    it("lists badges by season and player, with holders", async () => {
      expect((await repo.listBadgesByPlayerAndSeason(ann, seasonA)).map((b) => b.ruleId).sort()).toEqual([once, seasonal].sort());
      expect((await repo.listBadgesBySeason(seasonB)).map((b) => b.ruleId)).toEqual([seasonal]);
      expect(await repo.countBadgeHolders(once)).toBe(1);
      expect(await repo.listBadgeHolderPlayerIds(once)).toEqual([ann]);
      expect((await repo.listBadgeAwards(seasonal)).map((a) => a.seasonId).sort()).toEqual([seasonA, seasonB].sort());

      expect(await repo.listBadgeHolders([], seasonA, null)).toEqual([]);
      const holders = await repo.listBadgeHolders([once, seasonal], seasonA, null);
      expect(holders.find((h) => h.ruleId === seasonal)).toMatchObject({ id: ann, count: 2, earnedHere: true });
    });

    it("tracks which badges the player has seen", async () => {
      const unseen = await repo.getUnviewedBadgesForSeason(ann, seasonA);
      expect(unseen).toHaveLength(2);
      await repo.markBadgesViewed([], ann);
      await repo.markBadgesViewed(unseen.map((b) => b.id), bob);
      expect(await repo.getUnviewedBadgesForSeason(ann, seasonA)).toHaveLength(2);
      await repo.markBadgesViewed(unseen.map((b) => b.id), ann);
      expect(await repo.getUnviewedBadgesForSeason(ann, seasonA)).toHaveLength(0);
    });

    it("revokes by season, by null season, or everywhere", async () => {
      expect(await repo.revokeBadge(ann, seasonal, seasonA)).toBe(1);
      expect(await repo.revokeBadge(ann, seasonal, null)).toBe(0);
      expect(await repo.revokeBadge(ann, seasonal)).toBe(1);
      expect(await repo.revokeBadge(ann, once)).toBe(1);
      expect(await repo.holdsBadge(ann, once)).toBe(false);
    });
  });

  describe("reconciliation state", () => {
    it("creates the single state row dirty on first read, then stamps a run", async () => {
      expect(await repo.getReconciliationState()).toMatchObject({ dirty: true, silentNextRun: true, lastRunAt: null });
      await repo.clearDirtyAndStampRun();
      const state = await repo.getReconciliationState();
      expect(state).toMatchObject({ dirty: false, silentNextRun: false });
      await repo.markBadgeRulesDirty();
      expect((await repo.getReconciliationState()).dirty).toBe(true);
      await repo.clearDirtyAndStampRun();
      expect(state.lastRunAt).toBeInstanceOf(Date);
      expect((await repo.getReconciliationState()).dirty).toBe(false);
    });
  });
});
