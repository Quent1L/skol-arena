import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { appUsers, user as authUser, session, organizations, organizationMembers } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { userRepository } from "../../../repository/user.repository";
import { detectAccentFolding } from "../../../utils/accent-folding";

const tag = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createUser(name: string, extra: Partial<typeof appUsers.$inferInsert> = {}) {
  const suffix = `${name}-${tag}`;
  const [auth] = await testDb
    .insert(authUser)
    .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
    .returning();
  const [app] = await testDb
    .insert(appUsers)
    .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: auth!.id, ...extra })
    .returning();
  return { app: app!, auth: auth! };
}

const listQuery = {
  limit: 50,
  offset: 0,
  sortBy: "displayName",
  sortDir: "asc",
} as const;

describe("userRepository (integration)", () => {
  let ann: Awaited<ReturnType<typeof createUser>>;
  let bob: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;

  const [v1, v2] = [randomUUID(), randomUUID()];

  beforeAll(async () => {
    await detectAccentFolding();
    ann = await createUser("Anaïs");
    bob = await createUser("Bob");
    admin = await createUser("Chief", { role: "super_admin" });
  });

  it("finds a profile by id and by external id", async () => {
    expect((await userRepository.getById(ann.app.id))?.displayName).toBe("Anaïs");
    expect((await userRepository.getByExternalId(ann.auth.id))?.id).toBe(ann.app.id);
    expect(await userRepository.getById("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("creates and updates a profile", async () => {
    const created = await userRepository.createAppUser({ displayName: "Dan", shortName: "DAN" });
    expect(created?.id).toBeDefined();
    const updated = await userRepository.updateAppUser(created!.id, { displayName: "Daniel", role: "tournament_admin" });
    expect(updated).toMatchObject({ displayName: "Daniel", role: "tournament_admin" });
  });

  describe("avatars", () => {
    it("stores, reads and swaps avatar versions", async () => {
      expect(await userRepository.getAvatarVersion(bob.app.id)).toBeNull();
      await userRepository.setAvatarVersion(bob.app.id, v1);
      expect(await userRepository.getAvatarVersion(bob.app.id)).toBe(v1);
      expect(await userRepository.swapAvatarVersion(bob.app.id, v2)).toBe(v1);
      expect(await userRepository.getAvatarVersion(bob.app.id)).toBe(v2);
    });

    it("lists versions for those who have one, skipping archived users in the lookup", async () => {
      expect(await userRepository.getAvatarVersions([])).toEqual([]);
      const lookup = await userRepository.getAvatarVersions([bob.app.id, ann.app.id]);
      expect(lookup).toEqual([{ id: bob.app.id, avatarVersion: v2 }]);
      const all = await userRepository.listAvatarVersions();
      expect(all.find((r) => r.id === bob.app.id)?.avatarVersion).toBe(v2);
    });
  });

  describe("trust score", () => {
    it("increments, decrements without going below zero, and resets", async () => {
      const id = ann.app.id;
      await userRepository.incrementTrustScore(id);
      await userRepository.incrementTrustScore(id);
      expect((await userRepository.getById(id))?.trustScoreCount).toBe(2);
      await userRepository.decrementTrustScore(id);
      expect((await userRepository.getById(id))?.trustScoreCount).toBe(1);
      await userRepository.decrementTrustScore(id);
      await userRepository.decrementTrustScore(id);
      expect((await userRepository.getById(id))?.trustScoreCount).toBe(0);
      await userRepository.incrementTrustScore(id);
      await userRepository.resetTrustScore(id);
      expect((await userRepository.getById(id))?.trustScoreCount).toBe(0);
    });
  });

  describe("search and listing", () => {
    it("searches case- and accent-insensitively and treats wildcards literally", async () => {
      const hits = await userRepository.searchByName("anais");
      expect(hits.map((h) => h.id)).toContain(ann.app.id);
      expect(await userRepository.searchByName("%")).toEqual([]);
    });

    it("returns every user with their identity", async () => {
      const all = await userRepository.getAllUsers();
      expect(all.find((u) => u.id === ann.app.id)?.externalUser?.email).toBe(`Anaïs-${tag}@example.com`);
    });

    it("filters the admin listing by search, role and status", async () => {
      const bySearch = await userRepository.listUsersAdmin({ ...listQuery, search: `bob-${tag}` });
      expect(bySearch.data.map((u) => u.id)).toEqual([bob.app.id]);
      expect(bySearch.total).toBe(1);

      const byRole = await userRepository.listUsersAdmin({ ...listQuery, role: "super_admin" });
      expect(byRole.data.every((u) => u.role === "super_admin")).toBe(true);
      expect(byRole.data.map((u) => u.id)).toContain(admin.app.id);

      const active = await userRepository.listUsersAdmin({ ...listQuery, status: "active" });
      const deactivated = await userRepository.listUsersAdmin({ ...listQuery, status: "deactivated" });
      expect(active.data.every((u) => u.deactivatedAt === null)).toBe(true);
      expect(deactivated.data.every((u) => u.deactivatedAt !== null)).toBe(true);
    });

    it("sorts and paginates with a stable total", async () => {
      const asc = await userRepository.listUsersAdmin({ ...listQuery, limit: 2 });
      const desc = await userRepository.listUsersAdmin({ ...listQuery, limit: 2, sortDir: "desc" });
      expect(asc.data).toHaveLength(2);
      expect(asc.total).toBeGreaterThanOrEqual(3);
      expect(asc.data[0]!.displayName <= asc.data[1]!.displayName).toBe(true);
      expect(desc.data[0]!.displayName >= desc.data[1]!.displayName).toBe(true);
      const byLogin = await userRepository.listUsersAdmin({ ...listQuery, sortBy: "lastLoginAt" });
      expect(byLogin.total).toBe(asc.total);
    });
  });

  describe("counts and stats", () => {
    it("counts active users of a role", async () => {
      expect(await userRepository.countByRole("super_admin")).toBeGreaterThanOrEqual(1);
    });

    it("aggregates the admin stats", async () => {
      const stats = await userRepository.getAdminStats();
      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.byRole.super_admin).toBeGreaterThanOrEqual(1);
      expect(stats.newThisMonth).toBeGreaterThanOrEqual(3);
    });
  });

  describe("last activity", () => {
    it("records a login", async () => {
      await userRepository.touchLastLogin(ann.auth.id);
      expect((await userRepository.getById(ann.app.id))?.lastLoginAt).toBeInstanceOf(Date);
    });

    it("only refreshes the activity when the stored value is stale", async () => {
      const long = new Date(Date.now() - 3_600_000);
      await testDb.update(appUsers).set({ lastLoginAt: long }).where(eq(appUsers.id, bob.app.id));

      await userRepository.touchLastSeen(bob.auth.id, new Date(Date.now() - 7_200_000));
      expect((await userRepository.getById(bob.app.id))?.lastLoginAt?.getTime()).toBe(long.getTime());

      await userRepository.touchLastSeen(bob.auth.id, new Date(Date.now() - 60_000));
      expect((await userRepository.getById(bob.app.id))!.lastLoginAt!.getTime()).toBeGreaterThan(long.getTime());
    });
  });

  describe("admin detail and deletion blockers", () => {
    it("returns the detail with organisation memberships", async () => {
      const [org] = await testDb.insert(organizations).values({ name: `Org-${tag}`, createdBy: admin.app.id }).returning();
      await testDb.insert(organizationMembers).values({ organizationId: org!.id, userId: ann.app.id });

      const detail = await userRepository.getUserAdminDetail(ann.app.id);
      expect(detail?.organizations.map((o) => o.name)).toEqual([`Org-${tag}`]);
      expect(await userRepository.getUserAdminDetail("00000000-0000-4000-8000-000000000000")).toBeNull();
    });

    it("lists what a permanent deletion would destroy", async () => {
      expect(await userRepository.getDeletionBlockers(bob.app.id)).toEqual([]);
      const blockers = await userRepository.getDeletionBlockers(admin.app.id);
      expect(blockers).toEqual([{ resource: "organizations", count: 1 }]);
    });
  });

  describe("lifecycle", () => {
    it("archives a user, dropping the identity but keeping the profile", async () => {
      const eve = await createUser("Eve");
      await testDb.insert(session).values({
        id: `s-${tag}`, token: `tok-${tag}`, userId: eve.auth.id, expiresAt: new Date(Date.now() + 1000),
      } as never);
      await userRepository.revokeSessions(eve.auth.id);
      expect(await testDb.select().from(session).where(eq(session.userId, eve.auth.id))).toHaveLength(0);

      await userRepository.archiveUser(eve.app.id, eve.auth.id, admin.app.id, "Archived", "ARC");
      const archived = await userRepository.getById(eve.app.id);
      expect(archived).toMatchObject({ externalId: null, displayName: "Archived", archivedBy: admin.app.id });
      expect(await userRepository.countArchived()).toBeGreaterThanOrEqual(1);
      expect(await userRepository.getAvatarVersions([eve.app.id])).toEqual([]);
    });

    it("restores an archived profile onto a new identity", async () => {
      const old = await createUser("Old");
      await userRepository.archiveUser(old.app.id, old.auth.id, admin.app.id, "Gone", "GON");
      const fresh = await createUser("Fresh");

      await userRepository.restoreArchivedUser(old.app.id, fresh.app.id, fresh.auth.id, "Back", "BAK");

      const restored = await userRepository.getById(old.app.id);
      expect(restored).toMatchObject({ externalId: fresh.auth.id, displayName: "Back", archivedAt: null });
      expect(await userRepository.getById(fresh.app.id)).toBeUndefined();
    });

    it("hard deletes a profile and its identity", async () => {
      const tmp = await createUser("Tmp");
      await userRepository.deleteUserPermanently(tmp.app.id, tmp.auth.id);
      expect(await userRepository.getById(tmp.app.id)).toBeUndefined();
      expect(await userRepository.isEmailTaken(tmp.auth.email, "other")).toBe(false);
    });

    it("updates and checks emails", async () => {
      await userRepository.updateExternalUserEmail(ann.auth.id, `new-${tag}@example.com`);
      expect(await userRepository.isEmailTaken(`new-${tag}@example.com`, "someone-else")).toBe(true);
      expect(await userRepository.isEmailTaken(`new-${tag}@example.com`, ann.auth.id)).toBe(false);
    });
  });
});
