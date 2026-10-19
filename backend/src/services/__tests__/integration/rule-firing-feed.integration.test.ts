import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rulesService, encodeFeedCursor } from "../../rules.service";
import { BadRequestError } from "../../../types/errors";
import { appUsers, user as betterAuthUser, ruleFirings, rules } from "../../../db/schema";
import type { RuleFiringResult, RuleType } from "@skol-arena/shared";

describe("Global rule firing feed & overview (integration)", () => {
  let playerId: string;
  let messageRuleId: string;
  let badgeRuleId: string;

  async function createUser(name: string) {
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

  async function createRule(type: RuleType, name: string) {
    const [rule] = await testDb
      .insert(rules)
      .values({
        triggerEvent: "match_submitted",
        type,
        scope: "global",
        priority: 0,
        name,
        conditions: { all: [] },
        action:
          type === "badge"
            ? { type: "badge", icon: "fa fa-trophy", label: name, description: name }
            : { type: "message", variants: ["Bravo"] },
        isActive: true,
        createdBy: playerId,
      })
      .returning();
    return rule.id;
  }

  /** `createdAt` is raw timestamptz text, so tests can pin microseconds. */
  async function seedFiring(ruleId: string, type: RuleType, createdAt: string, result: RuleFiringResult) {
    const [row] = await testDb
      .insert(ruleFirings)
      .values({
        ruleId,
        ruleType: type,
        engineVersion: 1,
        triggerEvent: "match_submitted",
        playerId,
        matchId: null,
        seasonId: null,
        result,
        createdAt: sql`${createdAt}::timestamptz`,
      })
      .returning({ id: ruleFirings.id });
    return row.id;
  }

  beforeAll(async () => {
    playerId = await createUser("Feeder");
    messageRuleId = await createRule("message", "Encouragement");
    badgeRuleId = await createRule("badge", "Trophée");
  });

  beforeEach(async () => {
    await testDb.delete(ruleFirings);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("pages newest first without skipping rows that share a millisecond", async () => {
    // Three rows inside the same millisecond: a cursor rounded to a JS Date would
    // skip the ones after the first page boundary.
    await seedFiring(messageRuleId, "message", "2026-01-01 10:00:00.123100+00", "selected");
    await seedFiring(messageRuleId, "message", "2026-01-01 10:00:00.123200+00", "selected");
    await seedFiring(badgeRuleId, "badge", "2026-01-01 10:00:00.123300+00", "awarded");
    await seedFiring(badgeRuleId, "badge", "2026-01-01 09:00:00+00", "already_held");

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await rulesService.getFiringFeed({ limit: 1, cursor, includeHeld: true });
      seen.push(...page.items.map((i) => i.createdAt));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(4);
    expect([...seen].sort().reverse()).toEqual(seen);
  });

  it("breaks createdAt ties on id", async () => {
    const at = "2026-01-01 10:00:00+00";
    const ids = await Promise.all([1, 2, 3].map(() => seedFiring(messageRuleId, "message", at, "selected")));

    const first = await rulesService.getFiringFeed({ limit: 2 });
    const second = await rulesService.getFiringFeed({ limit: 2, cursor: first.nextCursor! });

    const paged = [...first.items, ...second.items].map((i) => i.id);
    expect(paged).toEqual([...ids].sort().reverse());
    expect(second.nextCursor).toBeNull();
  });

  it("carries the rule's name and filters by type, rule and result", async () => {
    await seedFiring(messageRuleId, "message", "2026-01-01 10:00:00+00", "selected");
    await seedFiring(messageRuleId, "message", "2026-01-01 11:00:00+00", "superseded");
    await seedFiring(badgeRuleId, "badge", "2026-01-01 12:00:00+00", "awarded");

    const all = await rulesService.getFiringFeed({ limit: 30 });
    expect(all.items.map((i) => i.ruleName)).toEqual(["Trophée", "Encouragement", "Encouragement"]);
    expect(all.items[0]!.playerName).toBe("Feeder");

    const badges = await rulesService.getFiringFeed({ limit: 30, type: "badge" });
    expect(badges.items.map((i) => i.ruleType)).toEqual(["badge"]);

    const byRule = await rulesService.getFiringFeed({ limit: 30, ruleId: messageRuleId });
    expect(byRule.items).toHaveLength(2);

    const superseded = await rulesService.getFiringFeed({ limit: 30, result: "superseded" });
    expect(superseded.items.map((i) => i.result)).toEqual(["superseded"]);
  });

  it("hides badges already held unless asked for", async () => {
    await seedFiring(badgeRuleId, "badge", "2026-01-01 10:00:00+00", "awarded");
    await seedFiring(badgeRuleId, "badge", "2026-01-01 11:00:00+00", "already_held");

    const byDefault = await rulesService.getFiringFeed({ limit: 30 });
    expect(byDefault.items.map((i) => i.result)).toEqual(["awarded"]);

    const included = await rulesService.getFiringFeed({ limit: 30, includeHeld: true });
    expect(included.items.map((i) => i.result)).toEqual(["already_held", "awarded"]);

    const explicit = await rulesService.getFiringFeed({ limit: 30, result: "already_held" });
    expect(explicit.items.map((i) => i.result)).toEqual(["already_held"]);
  });

  it("rejects a cursor it did not issue", async () => {
    const forged = Buffer.from("'; drop table rules; --|x").toString("base64url");
    await expect(rulesService.getFiringFeed({ limit: 10, cursor: forged })).rejects.toBeInstanceOf(BadRequestError);
    await expect(rulesService.getFiringFeed({ limit: 10, cursor: "garbage" })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("round-trips a well-formed cursor", async () => {
    const cursor = encodeFeedCursor({ cursorAt: "2099-01-01 00:00:00+00", id: crypto.randomUUID() });
    await seedFiring(messageRuleId, "message", "2026-01-01 10:00:00+00", "selected");
    const page = await rulesService.getFiringFeed({ limit: 10, cursor });
    expect(page.items).toHaveLength(1);
  });

  it("sums every rule into the overview, windowed and all-time", async () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    const day = 24 * 60 * 60 * 1000;
    await seedFiring(messageRuleId, "message", iso(day), "selected");
    await seedFiring(badgeRuleId, "badge", iso(2 * day), "awarded");
    await seedFiring(badgeRuleId, "badge", iso(3 * day), "already_held");
    await seedFiring(badgeRuleId, "badge", iso(60 * day), "awarded");

    const overview = await rulesService.getFiringOverview(30);

    expect(overview.totals.fired).toBe(4);
    expect(overview.windowTotals.fired).toBe(3);
    expect(overview.timeline.reduce((sum, d) => sum + d.messages, 0)).toBe(1);
    // The already-held match is a firing, not a badge won.
    expect(overview.timeline.reduce((sum, d) => sum + d.badges, 0)).toBe(1);

    const byRule = new Map(overview.rules.map((r) => [r.ruleId, r.fired]));
    expect(byRule.get(messageRuleId)).toBe(1);
    expect(byRule.get(badgeRuleId)).toBe(3);
  });
});
