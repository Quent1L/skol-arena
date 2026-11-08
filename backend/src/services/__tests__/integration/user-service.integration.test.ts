import { describe, it, expect, mock, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

let resetImpl: (opts: { body: { email: string; redirectTo: string } }) => Promise<unknown> = async () => ({});
const requestPasswordReset = mock((opts: { body: { email: string; redirectTo: string } }) => resetImpl(opts));
mock.module("../../../config/auth", () => ({ auth: { api: { requestPasswordReset } } }));

const { userService } = await import("../../user.service");
const { userRepository } = await import("../../../repository/user.repository");
const { organizationService } = await import("../../organization.service");
const { makeSeeder } = await import("../helpers/db-seed");
const { ConflictError, ForbiddenError, InternalServerError, NotFoundError, UnauthorizedError } = await import("../../../types/errors");
const { invitationRepository } = await import("../../../repository/invitation.repository");
const { organizationRepository } = await import("../../../repository/organization.repository");
const { user: authUser } = await import("../../../db/schema");

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("userService admin operations (integration)", () => {
  let root: string;
  let backup: string;
  let player: string;

  beforeAll(async () => {
    root = await seed.createUser("Root", { role: "super_admin" });
    backup = await seed.createUser("Backup", { role: "super_admin" });
    player = await seed.createUser("Player");
  });

  it("updates a profile, and refuses an unknown one", async () => {
    const renamed = await userService.updateProfile(player, { displayName: "Renamed Player", shortName: "REN" });
    expect(renamed?.displayName).toBe("Renamed Player");
    expect((await userService.updateProfile(player, { displayName: "Renamed Player", shortName: "REN" }))?.displayName).toBe("Renamed Player");
    await expect(userService.updateProfile(MISSING, { displayName: "x", shortName: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("searches, lists, and aggregates for the admin screens", async () => {
    expect((await userService.searchUsers("Renamed")).map((u) => u.id)).toContain(player);
    expect((await userService.getAllUsers()).length).toBeGreaterThanOrEqual(3);
    const list = await userService.listUsersAdmin({ limit: 50, offset: 0, sortBy: "displayName", sortDir: "asc" } as never);
    expect(list.total).toBeGreaterThanOrEqual(3);
    expect((await userService.getAdminStats()).byRole.super_admin).toBeGreaterThanOrEqual(2);
    expect((await userService.getUserAdminDetail(player)).id).toBe(player);
    await expect(userService.getUserAdminDetail(MISSING)).rejects.toBeInstanceOf(NotFoundError);
  });

  describe("adminUpdateUser", () => {
    it("changes name, short name and role", async () => {
      const detail = await userService.adminUpdateUser(root, player, { displayName: "Promoted", shortName: "PRO", role: "tournament_admin" });
      expect(detail).toMatchObject({ displayName: "Promoted", shortName: "PRO", role: "tournament_admin" });
    });

    it("changes the email unless it is taken", async () => {
      const email = `changed-${Date.now()}@example.com`;
      expect((await userService.adminUpdateUser(root, player, { email })).email).toBe(email);
      const taken = (await userService.getUserAdminDetail(backup)).email!;
      await expect(userService.adminUpdateUser(root, player, { email: taken })).rejects.toBeInstanceOf(ConflictError);
    });

    it("refuses to touch oneself, an unknown user, or to demote the last super admin", async () => {
      await expect(userService.adminUpdateUser(root, root, { displayName: "x" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(userService.adminUpdateUser(root, MISSING, { displayName: "x" })).rejects.toBeInstanceOf(NotFoundError);
      await userService.adminUpdateUser(root, backup, { role: "player" });
      await expect(userService.adminUpdateUser(player, root, { role: "player" })).rejects.toBeInstanceOf(ForbiddenError);
      await userService.adminUpdateUser(root, backup, { role: "super_admin" });
    });
  });

  describe("password reset", () => {
    it("asks Better Auth for a reset link back to the app", async () => {
      await userService.sendPasswordReset(player);
      const [{ body }] = requestPasswordReset.mock.calls.at(-1)!;
      expect(body.redirectTo.endsWith("/reset-password")).toBe(true);
      expect(body.email).toContain("@example.com");
    });

    it("surfaces a delivery failure", async () => {
      resetImpl = async () => {
        throw new Error("smtp down");
      };
      await expect(userService.sendPasswordReset(player)).rejects.toBeInstanceOf(InternalServerError);
      resetImpl = async () => ({});
    });

    it("refuses an unknown user", async () => {
      await expect(userService.sendPasswordReset(MISSING)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("activation", () => {
    it("deactivates a user, drops their sessions, then reactivates them", async () => {
      const target = await seed.createUser("Target");
      const off = await userService.deactivateUser(root, target);
      expect(off.deactivatedAt).not.toBeNull();
      const on = await userService.reactivateUser(target);
      expect(on.deactivatedAt).toBeNull();
      await expect(userService.reactivateUser(MISSING)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("refuses to deactivate oneself or the last super admin", async () => {
      await expect(userService.deactivateUser(root, root)).rejects.toBeInstanceOf(ForbiddenError);
      await userService.deactivateUser(root, backup);
      await expect(userService.deactivateUser(player, root)).rejects.toBeInstanceOf(ForbiddenError);
      await userService.reactivateUser(backup);
    });
  });

  describe("deletion and archiving", () => {
    it("deletes an account with no data", async () => {
      const empty = await seed.createUser("Empty");
      await userService.deleteUserPermanently(root, empty);
      expect(await userRepository.getById(empty)).toBeUndefined();
    });

    it("refuses to delete an account that owns or played something", async () => {
      const owner = await seed.createUser("Owner");
      await seed.createTournament(owner);
      await expect(userService.deleteUserPermanently(root, owner)).rejects.toBeInstanceOf(ConflictError);
    });

    it("archives an account, anonymising it, and refuses to archive twice", async () => {
      const leaver = await seed.createUser("Leaver");
      const archived = await userService.archiveUser(root, leaver, { displayName: "Former player", shortName: "FORMER" });
      expect(archived).toMatchObject({ displayName: "Former player", shortName: "FORMER" });
      expect(archived.archivedAt).not.toBeNull();
      await expect(userService.archiveUser(root, leaver)).rejects.toBeInstanceOf(ConflictError);

      const auto = await seed.createUser("Auto");
      expect((await userService.archiveUser(root, auto)).displayName).toMatch(/^Archive \d+$/);
    });

    it("restores an archived profile onto a fresh account", async () => {
      const old = await seed.createUser("Old");
      await userService.archiveUser(root, old);
      const fresh = await seed.createUser("Fresh");

      const restored = await userService.restoreArchivedUser(root, old, { sourceUserId: fresh });
      expect(restored.archivedAt).toBeNull();
      expect(restored.displayName).toBe("Fresh");
      expect(await userRepository.getById(fresh)).toBeUndefined();
    });

    it("refuses invalid restores", async () => {
      const live = await seed.createUser("Live");
      const other = await seed.createUser("Other");
      await expect(userService.restoreArchivedUser(root, MISSING, { sourceUserId: other })).rejects.toBeInstanceOf(NotFoundError);
      await expect(userService.restoreArchivedUser(root, live, { sourceUserId: other })).rejects.toBeInstanceOf(ConflictError);

      const gone = await seed.createUser("Gone");
      await userService.archiveUser(root, gone);
      const busy = await seed.createUser("Busy");
      await seed.createTournament(busy);
      await expect(userService.restoreArchivedUser(root, gone, { sourceUserId: busy })).rejects.toBeInstanceOf(ConflictError);
      await expect(userService.restoreArchivedUser(root, gone, { sourceUserId: gone })).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("organisations", () => {
    it("adds and removes a user through the organisation service", async () => {
      const org = await organizationService.createOrganization(`UserOrg-${Date.now()}`, root);
      const target = await seed.createUser("OrgTarget");
      await userService.addUserToOrganization(target, org.id);
      await expect(userService.addUserToOrganization(MISSING, org.id)).rejects.toBeInstanceOf(NotFoundError);
      await userService.removeUserFromOrganization(target, org.id);
      await expect(userService.removeUserFromOrganization(target, org.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

describe("userService identity helpers (integration)", () => {
  it("looks users up by id and external id", async () => {
    const id = await seed.createUser("Lookup");
    const row = await userRepository.getById(id);
    expect((await userService.getAppUserById(id))?.id).toBe(id);
    expect((await userService.getAppUserByExternalId(row!.externalId!))?.id).toBe(id);
  });

  it("throttles activity recording", async () => {
    const id = await seed.createUser("Active");
    const row = await userRepository.getById(id);
    await userService.recordActivity(row!.externalId!);
    const first = (await userRepository.getById(id))!.lastLoginAt;
    expect(first).toBeInstanceOf(Date);
    await userService.recordActivity(row!.externalId!);
    expect((await userRepository.getById(id))!.lastLoginAt!.getTime()).toBe(first!.getTime());
  });
});

describe("userService.getOrCreateAppUser (integration)", () => {
  async function authIdentity(label: string) {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const [auth] = await testDb
      .insert(authUser)
      .values({ id: `auth-${suffix}`, name: label, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    return auth!.id;
  }

  it("returns the id of an existing profile", async () => {
    const id = await seed.createUser("Known");
    const row = await userRepository.getById(id);
    expect(await userService.getOrCreateAppUser(row!.externalId!, "Known")).toBe(id);
  });

  it("refuses a deactivated account", async () => {
    const id = await seed.createUser("Off", { deactivatedAt: new Date() });
    const row = await userRepository.getById(id);
    await expect(userService.getOrCreateAppUser(row!.externalId!, "Off")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires an invitation before creating a profile", async () => {
    const external = await authIdentity("Uninvited");
    await expect(userService.getOrCreateAppUser(external, "Uninvited")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("creates the profile once an invitation was redeemed and joins its organisation", async () => {
    const admin = await seed.createUser("Inviter");
    const org = await organizationService.createOrganization(`Welcome-${Date.now()}`, admin);
    const code = await invitationRepository.create({ code: `welcome-${Date.now()}`, createdBy: admin, maxUses: 1, organizationId: org.id });
    const external = await authIdentity("Newcomer");
    await invitationRepository.recordUsage({ codeId: code!.id, userId: external, email: "n@x.io", ipAddress: null });

    const id = await userService.getOrCreateAppUser(external, "Newcomer <script>");
    const created = await userRepository.getById(id);
    expect(created).toMatchObject({ role: "player" });
    expect(created!.displayName).not.toContain("<");
    expect(await organizationRepository.isMember(org.id, id)).toBe(true);
  });
});
