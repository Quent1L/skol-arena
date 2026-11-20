import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { migrateStoredRules } from "../../rules-migration.service";
import { appUsers, user as betterAuthUser, rules } from "../../../db/schema";
import { RULES_ENGINE_VERSION, type RuleConditions } from "@skol-arena/shared";
import { eq } from "drizzle-orm";

describe("migrateStoredRules (integration)", () => {
  let adminId: string;

  async function addV1Rule(name: string, conditions: RuleConditions, variants = ["ok"]) {
    const [rule] = await testDb
      .insert(rules)
      .values({
        triggerEvent: "match_submitted",
        type: "message",
        scope: "global",
        priority: 0,
        name,
        conditions,
        action: { type: "message", variants },
        isActive: true,
        engineVersion: 1,
        createdBy: adminId,
      })
      .returning();
    return rule.id;
  }

  const read = async (id: string) => (await testDb.select().from(rules).where(eq(rules.id, id)))[0];

  beforeAll(async () => {
    const suffix = `mig-${Date.now()}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name: "Admin", email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({ displayName: "Admin", shortName: "ADM", externalId: authUser.id, role: "super_admin" })
      .returning();
    adminId = appUser.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  afterEach(async () => {
    await testDb.delete(rules).where(eq(rules.createdBy, adminId));
  });

  it("rewrites a v1 rule in place and stamps the current version", async () => {
    const id = await addV1Rule(
      "Head-to-head",
      {
        all: [
          { fact: "winnerId", operator: "in", value: ["p1"] },
          { fact: "loserId", operator: "in", value: ["p2"] },
        ],
      },
      ["{{winnerId}} beat {{loserId}}"],
    );

    await migrateStoredRules();

    const row = await read(id);
    expect(row.engineVersion).toBe(RULES_ENGINE_VERSION);
    expect(row.isActive).toBe(true);
    expect(row.conditions).toEqual({
      all: [
        { fact: "winnerIds", operator: "containsAny", value: ["p1"] },
        { fact: "loserIds", operator: "containsAny", value: ["p2"] },
      ],
    });
    expect(row.action).toEqual({ type: "message", variants: ["{{winnerIds}} beat {{loserIds}}"] });
  });

  it("is idempotent — a second pass leaves the row untouched", async () => {
    const id = await addV1Rule("Idempotent", { all: [{ fact: "winnerId", operator: "equal", value: "p1" }] });

    await migrateStoredRules();
    const first = await read(id);
    await migrateStoredRules();
    const second = await read(id);

    expect(second.conditions).toEqual(first.conditions);
    expect(second.engineVersion).toBe(first.engineVersion);
    expect(second.updatedAt).toEqual(first.updatedAt);
  });

  it("deactivates a rule no patch can express, leaving its shape readable", async () => {
    const conditions: RuleConditions = { all: [{ fact: "winnerId", operator: "contains", value: "abc" }] };
    const id = await addV1Rule("Unconvertible", conditions);

    await migrateStoredRules();

    const row = await read(id);
    expect(row.isActive).toBe(false);
    // Neither rewritten nor stamped: a human (or a later patch) still sees the original.
    expect(row.engineVersion).toBe(1);
    expect(row.conditions).toEqual(conditions);
    // The reason is stored, not just logged — the admin UI reads it from here.
    expect(row.disabledReason).toContain("no line-up equivalent");
  });

  it("clears a stale reason when a rule finally migrates", async () => {
    const id = await addV1Rule("Rescued", { all: [{ fact: "winnerId", operator: "equal", value: "p1" }] });
    await testDb.update(rules).set({ disabledReason: "stale reason" }).where(eq(rules.id, id));

    await migrateStoredRules();

    const row = await read(id);
    expect(row.disabledReason).toBeNull();
  });

  it("leaves a successfully migrated rule active and unflagged", async () => {
    const id = await addV1Rule("Convertible", { all: [{ fact: "loserId", operator: "notIn", value: ["p9"] }] });

    await migrateStoredRules();

    const row = await read(id);
    expect(row.isActive).toBe(true);
    expect(row.disabledReason).toBeNull();
  });

  it("leaves a rule already at the current version alone", async () => {
    const [rule] = await testDb
      .insert(rules)
      .values({
        triggerEvent: "match_submitted",
        type: "message",
        scope: "global",
        priority: 0,
        name: "Already current",
        conditions: { all: [{ fact: "winnerIds", operator: "contains", value: "p1" }] },
        action: { type: "message", variants: ["ok"] },
        isActive: true,
        engineVersion: RULES_ENGINE_VERSION,
        createdBy: adminId,
      })
      .returning();

    await migrateStoredRules();

    const row = await read(rule.id);
    expect(row.updatedAt).toEqual(rule.updatedAt);
    expect(row.conditions).toEqual(rule.conditions);
  });
});
