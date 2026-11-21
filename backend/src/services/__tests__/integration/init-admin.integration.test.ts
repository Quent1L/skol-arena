import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase, resetTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { initializeAdminIfNeeded, clearBootstrapPending } from "../../../utils/init-admin";
import { appUsers, account, user } from "../../../db/schema";
import { eq } from "drizzle-orm";

async function getAdmin() {
  const [admin] = await testDb.select().from(appUsers).where(eq(appUsers.role, "super_admin")).limit(1);
  // externalId is nullable since archiving, but a bootstrap admin always has one.
  // Returned as-is so the "no admin" case still yields undefined.
  return admin as typeof admin & { externalId: string };
}

async function getPasswordHash(externalId: string): Promise<string | null> {
  const [row] = await testDb
    .select({ password: account.password })
    .from(account)
    .where(eq(account.userId, externalId))
    .limit(1);
  return row?.password ?? null;
}

describe("initializeAdminIfNeeded", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("creates the bootstrap admin when app_users is empty", async () => {
    await initializeAdminIfNeeded();

    const admin = await getAdmin();
    expect(admin).toBeDefined();
    expect(admin.role).toBe("super_admin");
    expect(admin.bootstrapPending).toBe(true);
    expect(await getPasswordHash(admin.externalId)).toBeTruthy();
  });

  it("keys the password account on the user id, as Better Auth's sign-in looks it up", async () => {
    await initializeAdminIfNeeded();

    const admin = await getAdmin();
    const [credential] = await testDb.select().from(account).where(eq(account.userId, admin.externalId));
    expect(credential).toMatchObject({ providerId: "credential", accountId: admin.externalId });
  });

  it("rotates the password on every run while the admin is pending", async () => {
    await initializeAdminIfNeeded();
    const admin = await getAdmin();
    const firstHash = await getPasswordHash(admin.externalId);

    await initializeAdminIfNeeded();

    const secondHash = await getPasswordHash(admin.externalId);
    expect(secondHash).toBeTruthy();
    expect(secondHash).not.toBe(firstHash);

    // No duplicate rows created by the rotation
    expect(await testDb.select().from(appUsers)).toHaveLength(1);
    expect(await testDb.select().from(user)).toHaveLength(1);
    expect(await testDb.select().from(account)).toHaveLength(1);
  });

  it("stops rotating once the flag is cleared", async () => {
    await initializeAdminIfNeeded();
    const admin = await getAdmin();

    await clearBootstrapPending(admin.externalId);
    const hashAfterLogin = await getPasswordHash(admin.externalId);

    await initializeAdminIfNeeded();

    expect(await getPasswordHash(admin.externalId)).toBe(hashAfterLogin);
    const refreshed = await getAdmin();
    expect(refreshed.bootstrapPending).toBe(false);
  });

  it("does nothing when users exist and no admin is pending", async () => {
    await testDb.insert(user).values({
      id: "existing-user-id",
      name: "Someone",
      email: "someone@example.com",
      emailVerified: true,
    });
    await testDb.insert(appUsers).values({
      externalId: "existing-user-id",
      displayName: "Someone",
      shortName: "SOME",
      role: "player",
    });

    await initializeAdminIfNeeded();

    expect(await testDb.select().from(appUsers)).toHaveLength(1);
    expect(await getAdmin()).toBeUndefined();
  });

  it("reuses an orphaned auth user instead of failing on the unique email", async () => {
    const email = process.env.INITIAL_ADMIN_EMAIL ?? "admin@skol-arena.local";
    await testDb.insert(user).values({
      id: "orphan-admin-id",
      name: "Admin",
      email,
      emailVerified: true,
    });

    await initializeAdminIfNeeded();

    const admin = await getAdmin();
    expect(admin.externalId).toBe("orphan-admin-id");
    expect(await testDb.select().from(user)).toHaveLength(1);
    expect(await getPasswordHash("orphan-admin-id")).toBeTruthy();
  });
});
