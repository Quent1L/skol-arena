import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { rulesService } from "../../rules.service";
import {
  appUsers,
  user as betterAuthUser,
  organizations,
  organizationMembers,
  playerBadges,
  rules,
  tournaments,
} from "../../../db/schema";

/**
 * The tournament badges tab lists who holds each badge, awards counted across every
 * season the viewer can see: a private organization's seasons count for its members only.
 */
describe("Badge holders of a tournament (integration)", () => {
  let aliceId: string;
  let bobId: string;
  let carolId: string;
  let outsiderId: string;
  let superAdminId: string;
  let ruleId: string;
  let currentSeasonId: string;
  let pastSeasonId: string;
  let privateSeasonId: string;

  async function createUser(name: string, role: "super_admin" | "player" = "player") {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: authUser!.id, role })
      .returning();
    return appUser!.id;
  }

  async function createSeason(name: string, organizationId: string | null) {
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "open",
        createdBy: aliceId,
        organizationId,
      })
      .returning();
    return tournament!.id;
  }

  async function award(playerId: string, seasonId: string) {
    await testDb.insert(playerBadges).values({ playerId, ruleId, seasonId });
  }

  async function holdersFor(viewerId: string | null) {
    const badges = await rulesService.listAvailableBadgesWithHolders({ id: currentSeasonId, disciplineId: null }, viewerId);
    return badges.find((b) => b.ruleId === ruleId)!.holders!;
  }

  beforeAll(async () => {
    aliceId = await createUser("Alice");
    bobId = await createUser("Bob");
    carolId = await createUser("Carol");
    outsiderId = await createUser("Outsider");
    superAdminId = await createUser("Admin", "super_admin");

    const [rule] = await testDb
      .insert(rules)
      .values({
        triggerEvent: "match_submitted",
        type: "badge",
        scope: "global",
        priority: 0,
        name: "Sniper",
        conditions: { all: [] },
        action: { type: "badge", icon: "fa fa-trophy", label: "Sniper", description: "Sniper" },
        isActive: true,
        createdBy: aliceId,
      })
      .returning();
    ruleId = rule!.id;

    const [org] = await testDb
      .insert(organizations)
      .values({ name: `Org-${Date.now()}`, createdBy: carolId })
      .returning();
    await testDb.insert(organizationMembers).values({ organizationId: org!.id, userId: carolId, role: "member" });

    currentSeasonId = await createSeason("Current", null);
    pastSeasonId = await createSeason("Past", null);
    privateSeasonId = await createSeason("Private", org!.id);

    await award(aliceId, currentSeasonId);
    await award(aliceId, pastSeasonId);
    await award(bobId, pastSeasonId);
    await award(carolId, privateSeasonId);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("counts awards per player across seasons, this season's holders first", async () => {
    const holders = await holdersFor(outsiderId);

    expect(holders.map((h) => [h.displayName, h.count, h.earnedHere])).toEqual([
      ["Alice", 2, true],
      ["Bob", 1, false],
    ]);
  });

  it("counts a private organization's seasons for its members only", async () => {
    const forMember = await holdersFor(carolId);
    const forAnonymous = await holdersFor(null);

    expect(forMember.map((h) => h.displayName)).toContain("Carol");
    expect(forAnonymous.map((h) => h.displayName)).not.toContain("Carol");
  });

  it("lets a super admin see every season", async () => {
    const holders = await holdersFor(superAdminId);

    expect(holders.map((h) => h.displayName)).toEqual(["Alice", "Bob", "Carol"]);
  });
});
