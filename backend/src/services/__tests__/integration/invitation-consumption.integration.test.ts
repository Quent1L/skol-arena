import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { appUsers, invitationCodes, organizations, user as betterAuthUser } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { invitationService } from "../../invitation.service";
import { userService } from "../../user.service";
import { organizationRepository } from "../../../repository/organization.repository";

describe("Invitation consumption (integration)", () => {
  let adminId: string;
  let organizationId: string;

  async function createAuthUser(name: string) {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    return authUser!;
  }

  async function createCode(maxUses: number | null, orgId: string | null = null) {
    const code = `code-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await testDb.insert(invitationCodes).values({ code, createdBy: adminId, maxUses, organizationId: orgId });
    return code;
  }

  beforeAll(async () => {
    const admin = await createAuthUser("Admin");
    const [appUser] = await testDb
      .insert(appUsers)
      .values({ displayName: "Admin", shortName: "ADM", externalId: admin.id, role: "super_admin" })
      .returning();
    adminId = appUser!.id;
    const [org] = await testDb
      .insert(organizations)
      .values({ name: `Org-${Date.now()}`, createdBy: adminId })
      .returning();
    organizationId = org!.id;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lets a single-use code be redeemed once, even by parallel requests", async () => {
    const code = await createCode(1);
    const users = await Promise.all([1, 2, 3, 4, 5].map((i) => createAuthUser(`P${i}`)));

    const outcomes = await Promise.allSettled(users.map((u) => invitationService.consumeCode(code, u.id, u.email)));

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const row = await testDb.query.invitationCodes.findFirst({ where: eq(invitationCodes.code, code) });
    expect(row!.usedCount).toBe(1);
  });

  it("never runs out of uses when maxUses is null", async () => {
    const code = await createCode(null);
    const users = await Promise.all([1, 2, 3].map((i) => createAuthUser(`U${i}`)));

    for (const u of users) await invitationService.consumeCode(code, u.id, u.email);

    const row = await testDb.query.invitationCodes.findFirst({ where: eq(invitationCodes.code, code) });
    expect(row!.usedCount).toBe(3);
    expect((await invitationService.validateCode(code)).remainingUses).toBeNull();
  });

  it("stores a custom code lowercase, matches it whatever the case, and refuses a duplicate", async () => {
    const custom = `Club-${Date.now()}`;
    const created = await invitationService.generateCode({ createdBy: adminId, code: custom, maxUses: null });

    expect(created!.code).toBe(custom.toLowerCase());
    expect(created!.maxUses).toBeNull();
    expect((await invitationService.validateCode(` ${custom.toUpperCase()} `)).valid).toBe(true);
    await expect(invitationService.generateCode({ createdBy: adminId, code: custom })).rejects.toMatchObject({
      code: "INVITATION_CODE_TAKEN",
    });
  });

  it("requires a code to create a profile, unless sign-up is open", async () => {
    const authUser = await createAuthUser("Open");
    await expect(userService.getOrCreateAppUser(authUser.id, authUser.name)).rejects.toMatchObject({
      code: "INVITATION_CODE_REQUIRED",
    });

    process.env.REQUIRE_INVITATION_CODE = "false";
    try {
      expect(await userService.getOrCreateAppUser(authUser.id, authUser.name)).toBeString();
    } finally {
      delete process.env.REQUIRE_INVITATION_CODE;
    }
  });

  it("joins the code's organization when the profile is created after a cookie sign-up", async () => {
    const code = await createCode(5, organizationId);
    const authUser = await createAuthUser("Cookie");

    // What the sign-up hook does: consume the code against the Better Auth identity.
    await invitationService.consumeCode(code, authUser.id, authUser.email);
    const appUserId = await userService.getOrCreateAppUser(authUser.id, authUser.name);

    expect(await organizationRepository.isMember(organizationId, appUserId)).toBe(true);
  });

  it("stores a display name that follows the profile rules", async () => {
    const code = await createCode(5);
    const authUser = await createAuthUser("Markup");

    await invitationService.consumeCode(code, authUser.id, authUser.email);
    const appUserId = await userService.getOrCreateAppUser(authUser.id, '<img src=x onerror="alert(1)">');

    const appUser = await testDb.query.appUsers.findFirst({ where: eq(appUsers.id, appUserId) });
    expect(appUser!.displayName).not.toMatch(/[<>"=]/);
  });
});
