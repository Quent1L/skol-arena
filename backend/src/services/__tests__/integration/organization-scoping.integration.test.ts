import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import {
  tournaments,
  appUsers,
  user as betterAuthUser,
  organizations,
  organizationMembers,
} from "../../../db/schema";
import { tournamentService } from "../../tournament.service";
import { ForbiddenError } from "../../../types/errors";

/**
 * A competition attached to an organization is only listed for its members. Until
 * the audit that rule lived in one route file and was applied by the handlers there
 * alone, so the routes that forgot to call it — the team list, a match, the join —
 * handed the whole thing to anyone holding the UUID.
 *
 * These cover the rule itself against a real database, membership rows included,
 * rather than the per-route wiring: route coverage is what api/__tests__/
 * route-guards.test.ts is for.
 */
describe("Organization scoping (integration)", () => {
  let memberId: string;
  let outsiderId: string;
  let adminId: string;
  let scopedTournamentId: string;
  let openTournamentId: string;

  async function createUser(name: string, role: "super_admin" | "player" = "player") {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `auth-${suffix}`,
        name,
        email: `${suffix}@example.com`,
        emailVerified: true,
      })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({
        displayName: name,
        shortName: name.slice(0, 3).toUpperCase(),
        externalId: authUser!.id,
        role,
      })
      .returning();
    return appUser!.id;
  }

  async function createTournament(name: string, organizationId: string | null) {
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: "championship",
        teamMode: "static",
        minTeamSize: 1,
        maxTeamSize: 1,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "open",
        createdBy: adminId,
        organizationId,
      })
      .returning();
    return tournament!.id;
  }

  beforeAll(async () => {
    adminId = await createUser("Admin", "super_admin");
    memberId = await createUser("Member");
    outsiderId = await createUser("Outsider");

    const [org] = await testDb
      .insert(organizations)
      .values({ name: `Org-${Date.now()}`, createdBy: adminId })
      .returning();

    await testDb
      .insert(organizationMembers)
      .values({ organizationId: org!.id, userId: memberId, role: "member" });

    scopedTournamentId = await createTournament("Scoped", org!.id);
    openTournamentId = await createTournament("Open", null);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lets a member read a tournament scoped to their organization", async () => {
    await expect(
      tournamentService.assertCanAccess(scopedTournamentId, memberId),
    ).resolves.toBeUndefined();
  });

  it("refuses a signed-in outsider", async () => {
    await expect(
      tournamentService.assertCanAccess(scopedTournamentId, outsiderId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses an anonymous reader", async () => {
    await expect(
      tournamentService.assertCanAccess(scopedTournamentId, null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a super admin read it without being a member", async () => {
    await expect(
      tournamentService.assertCanAccess(scopedTournamentId, adminId),
    ).resolves.toBeUndefined();
  });

  it("leaves a tournament with no organization open to everyone", async () => {
    await expect(
      tournamentService.assertCanAccess(openTournamentId, outsiderId),
    ).resolves.toBeUndefined();
    await expect(
      tournamentService.assertCanAccess(openTournamentId, null),
    ).resolves.toBeUndefined();
  });

  it("refuses an outsider trying to enter the scoped tournament", async () => {
    await expect(
      tournamentService.joinTournament(outsiderId, { tournamentId: scopedTournamentId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("still lists the scoped tournament for its member only", async () => {
    const forMember = await tournamentService.listTournaments(undefined, {
      id: memberId,
      role: "player",
    });
    const forOutsider = await tournamentService.listTournaments(undefined, {
      id: outsiderId,
      role: "player",
    });

    expect(forMember.some((t) => t.id === scopedTournamentId)).toBe(true);
    expect(forOutsider.some((t) => t.id === scopedTournamentId)).toBe(false);
    expect(forOutsider.some((t) => t.id === openTournamentId)).toBe(true);
  });
});
