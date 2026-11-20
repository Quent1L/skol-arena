import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../config/database";
import { user, account, appUsers } from "../db/schema";
import { hashPassword } from "better-auth/crypto";
import { logger } from "./logger";
import { newId } from "./uuid";

const CREDENTIALS_MESSAGE = "INITIAL ADMIN CREDENTIALS";

function getAdminEmail(): string {
  return process.env.INITIAL_ADMIN_EMAIL ?? "admin@skol-arena.local";
}

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

function logCredentials(email: string, password: string, hint: string): void {
  logger.info({ email, password }, `${CREDENTIALS_MESSAGE} — ${hint}`);
}

/**
 * Creates (or reuses) the Better Auth `user` row for the bootstrap admin.
 * A half-failed previous run can leave a `user` row without its `app_users`
 * counterpart, so we look the email up instead of inserting blindly.
 */
async function ensureAuthUser(email: string): Promise<string> {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);

  if (existing) return existing.id;

  const userId = newId();
  await db.insert(user).values({
    id: userId,
    name: "Admin",
    email,
    emailVerified: true,
  });

  return userId;
}

/** Writes the password hash on the credential account, creating it if missing. */
async function setCredentialPassword(userId: string, email: string, password: string): Promise<void> {
  const hashedPassword = await hashPassword(password);
  const updated = await db
    .update(account)
    .set({ password: hashedPassword })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });

  if (updated.length > 0) return;

  await db.insert(account).values({
    id: newId(),
    providerId: "credential",
    accountId: email,
    userId,
    password: hashedPassword,
  });
}

async function createBootstrapAdmin(): Promise<void> {
  const email = getAdminEmail();
  const password = generatePassword();
  const userId = await ensureAuthUser(email);

  await setCredentialPassword(userId, email, password);

  await db.insert(appUsers).values({
    externalId: userId,
    displayName: "Admin",
    shortName: "ADMIN",
    role: "super_admin",
    bootstrapPending: true,
  });

  logCredentials(
    email,
    password,
    "super-admin account created automatically. A new password will be generated on every startup until this account signs in via /login?native=true",
  );
}

async function rotateBootstrapPassword(externalId: string): Promise<void> {
  const email = getAdminEmail();
  const password = generatePassword();

  await setCredentialPassword(externalId, email, password);

  logCredentials(
    email,
    password,
    "password regenerated because the super-admin account has never signed in. The previous password is no longer valid",
  );
}

/**
 * Runs at startup, before the HTTP server accepts traffic.
 * - empty `app_users`   -> create the super-admin and log its password
 * - admin still pending -> rotate the password and log it again
 * - otherwise           -> no-op
 */
export async function initializeAdminIfNeeded(): Promise<void> {
  const [pendingAdmin] = await db
    .select({ externalId: appUsers.externalId })
    .from(appUsers)
    .where(eq(appUsers.bootstrapPending, true))
    .limit(1);

  // externalId is null only for archived users, which are never bootstrapPending.
  if (pendingAdmin?.externalId) {
    await rotateBootstrapPassword(pendingAdmin.externalId);
    return;
  }

  const existingUsers = await db.select({ id: appUsers.id }).from(appUsers).limit(1);
  if (existingUsers.length > 0) {
    logger.info("Users already exist, skipping initial admin creation.");
    return;
  }

  await createBootstrapAdmin();
}

/**
 * Stops the startup password rotation: called once the bootstrap admin has
 * actually signed in (or changed its password).
 */
export async function clearBootstrapPending(externalId: string): Promise<void> {
  const cleared = await db
    .update(appUsers)
    .set({ bootstrapPending: false })
    .where(and(eq(appUsers.externalId, externalId), eq(appUsers.bootstrapPending, true)))
    .returning({ id: appUsers.id });

  if (cleared.length > 0) {
    logger.info({ externalId }, "Initial admin signed in for the first time: startup password rotation disabled.");
  }
}
