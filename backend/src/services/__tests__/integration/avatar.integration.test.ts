import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import {
  appUsers,
  organizations,
  organizationMembers,
  storedBlobs,
  user as betterAuthUser,
} from "../../../db/schema";
import { avatarService } from "../../avatar.service";
import { setAvatarStorage } from "../../../storage";
import { PostgresBlobStorage } from "../../../storage/postgres-blob-storage";
import { FilesystemBlobStorage } from "../../../storage/filesystem-blob-storage";
import avatarFiles from "../../../routes/avatar-files.route";
import { withApiVersion } from "../../../api/dispatch";
import { AppError } from "../../../types/errors";
import { makePng } from "../helpers/image-fixtures";

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

async function createOrganization(ownerId: string, memberIds: string[]) {
  const [org] = await testDb
    .insert(organizations)
    .values({ name: `Org-${Math.random().toString(16).slice(2)}`, createdBy: ownerId })
    .returning();
  await testDb.insert(organizationMembers).values([
    { organizationId: org!.id, userId: ownerId, role: "owner" },
    ...memberIds.map((userId) => ({ organizationId: org!.id, userId, role: "member" as const })),
  ]);
}

async function blobCount(userId: string): Promise<number> {
  const [row] = await testDb
    .select({ n: sql<number>`count(*)::int` })
    .from(storedBlobs)
    .where(sql`starts_with(${storedBlobs.key}, ${`avatars/${userId}/`})`);
  return row!.n;
}

async function errorStatus(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) return err.statusCode;
    throw err;
  }
  throw new Error("expected a rejection");
}

const app = new Hono();
app.route("/api/avatars", avatarFiles);
const fetchAvatar = withApiVersion((req: Request) => app.fetch(req));
const get = (path: string, headers: Record<string, string> = {}) =>
  fetchAvatar(new Request(`http://localhost${path}`, { headers }));

describe("Avatars (integration)", () => {
  beforeAll(() => {
    setAvatarStorage(new PostgresBlobStorage());
  });

  afterAll(async () => {
    setAvatarStorage(null);
    await closeTestDatabase();
  });

  describe("postgres storage", () => {
    it("stores three variants and points the profile at them", async () => {
      const userId = await createUser("Alice");
      const version = await avatarService.setAvatar(userId, makePng(300, 300));

      const [row] = await testDb.select().from(appUsers).where(eq(appUsers.id, userId));
      expect(row!.avatarVersion).toBe(version);
      expect(await blobCount(userId)).toBe(3);
      expect(await avatarService.lookup([userId])).toEqual({ [userId]: version });
    });

    it("replaces the previous version and deletes its objects", async () => {
      const userId = await createUser("Bob");
      const first = await avatarService.setAvatar(userId, makePng(300, 300));
      const second = await avatarService.setAvatar(userId, makePng(310, 300));

      expect(second).not.toBe(first);
      expect(await blobCount(userId)).toBe(3);
      expect(await errorStatus(avatarService.getVariant(userId, first, 64))).toBe(404);
      expect((await avatarService.getVariant(userId, second, 64)).contentType).toBe("image/webp");
    });

    it("leaves no orphan behind when two uploads race", async () => {
      const userId = await createUser("Racer");
      await avatarService.setAvatar(userId, makePng(300, 300));
      const [a, b] = await Promise.all([
        avatarService.setAvatar(userId, makePng(310, 300)),
        avatarService.setAvatar(userId, makePng(320, 300)),
      ]);

      const current = await testDb
        .select({ v: appUsers.avatarVersion })
        .from(appUsers)
        .where(eq(appUsers.id, userId));
      expect([a, b]).toContain(current[0]!.v!);
      expect(await blobCount(userId)).toBe(3);
    });

    it("keeps the previous avatar when the new upload is rejected", async () => {
      const userId = await createUser("Carol");
      const version = await avatarService.setAvatar(userId, makePng(300, 300));

      expect(await errorStatus(avatarService.setAvatar(userId, new Uint8Array([1, 2, 3])))).toBe(415);
      expect(await avatarService.lookup([userId])).toEqual({ [userId]: version });
    });

    it("lookup only lists players who have an avatar", async () => {
      const withAvatar = await createUser("Dan");
      const without = await createUser("Eve");
      const version = await avatarService.setAvatar(withAvatar, makePng(100, 100));

      expect(await avatarService.lookup([withAvatar, without, withAvatar])).toEqual({
        [withAvatar]: version,
      });
    });
  });

  describe("removal permissions", () => {
    it("lets a player remove their own avatar", async () => {
      const userId = await createUser("Finn");
      await avatarService.setAvatar(userId, makePng(100, 100));

      await avatarService.removeAvatar(userId, userId);

      expect(await avatarService.lookup([userId])).toEqual({});
      expect(await blobCount(userId)).toBe(0);
    });

    it("lets an owner of a shared organization and a super admin moderate", async () => {
      const member = await createUser("Gus");
      const owner = await createUser("Hana");
      const superAdmin = await createUser("Ivan", "super_admin");
      await createOrganization(owner, [member]);

      await avatarService.setAvatar(member, makePng(100, 100));
      await avatarService.removeAvatar(owner, member);
      expect(await avatarService.lookup([member])).toEqual({});

      await avatarService.setAvatar(member, makePng(100, 100));
      await avatarService.removeAvatar(superAdmin, member);
      expect(await avatarService.lookup([member])).toEqual({});
    });

    it("refuses anyone else, including a plain member of the same organization", async () => {
      const target = await createUser("Jade");
      const peer = await createUser("Kim");
      const ownerElsewhere = await createUser("Leo");
      const owner = await createUser("Mia");
      await createOrganization(owner, [target, peer]);
      await createOrganization(ownerElsewhere, [peer]);
      await avatarService.setAvatar(target, makePng(100, 100));

      expect(await errorStatus(avatarService.removeAvatar(peer, target))).toBe(403);
      expect(await errorStatus(avatarService.removeAvatar(ownerElsewhere, target))).toBe(403);
      expect(Object.keys(await avatarService.lookup([target]))).toEqual([target]);
    });
  });

  describe("GET /api/avatars", () => {
    it("serves the current version as a WebP cached 30 days, without accept-version", async () => {
      const userId = await createUser("Paul");
      const version = await avatarService.setAvatar(userId, makePng(300, 300));

      const res = await get(`/api/avatars/${userId}/${version}/128.webp`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
      expect(version).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(res.headers.get("cache-control")).toBe("public, max-age=2592000");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("etag")).toBe(`"${version}-128"`);
      const meta = await new Bun.Image(new Uint8Array(await res.arrayBuffer())).metadata();
      expect(meta).toEqual({ width: 128, height: 128, format: "webp" });
    });

    it("answers 304 to a matching If-None-Match", async () => {
      const userId = await createUser("Quinn");
      const version = await avatarService.setAvatar(userId, makePng(100, 100));

      const res = await get(`/api/avatars/${userId}/${version}/64.webp`, {
        "If-None-Match": `"${version}-64"`,
      });
      expect(res.status).toBe(304);
    });

    it("answers 404, not 304, when a removed avatar is revalidated", async () => {
      const userId = await createUser("Quentin");
      const version = await avatarService.setAvatar(userId, makePng(100, 100));
      await avatarService.removeAvatar(userId, userId);

      const res = await get(`/api/avatars/${userId}/${version}/64.webp`, {
        "If-None-Match": `"${version}-64"`,
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("answers an uncacheable 404 to a stale version, a bad size or a malformed path", async () => {
      const userId = await createUser("Rita");
      const old = await avatarService.setAvatar(userId, makePng(100, 100));
      const current = await avatarService.setAvatar(userId, makePng(120, 100));

      for (const path of [
        `/api/avatars/${userId}/${old}/64.webp`,
        `/api/avatars/${userId}/${current}/512.webp`,
        `/api/avatars/${userId}/${current}/64.png`,
        `/api/avatars/not-a-uuid/${current}/64.webp`,
        `/api/avatars/${userId}/..%2F..%2Fetc/64.webp`,
      ]) {
        const res = await get(path);
        expect(res.status).toBe(404);
        expect(res.headers.get("cache-control")).toBe("no-store");
      }
    });
  });

  describe("filesystem storage", () => {
    let root: string;

    afterEach(async () => {
      setAvatarStorage(new PostgresBlobStorage());
      await rm(root, { recursive: true, force: true });
    });

    it("runs the same lifecycle on disk", async () => {
      root = await mkdtemp(join(tmpdir(), "skol-avatars-"));
      const storage = new FilesystemBlobStorage(root);
      await storage.init();
      setAvatarStorage(storage);

      const userId = await createUser("Sam");
      const first = await avatarService.setAvatar(userId, makePng(100, 100));
      expect(await Bun.file(join(root, `avatars/${userId}/${first}/256.webp`)).exists()).toBe(true);

      const second = await avatarService.setAvatar(userId, makePng(110, 100));
      expect(await Bun.file(join(root, `avatars/${userId}/${first}/256.webp`)).exists()).toBe(false);
      expect((await avatarService.getVariant(userId, second, 256)).size).toBeGreaterThan(0);

      await avatarService.removeAvatar(userId, userId);
      expect(await Bun.file(join(root, `avatars/${userId}/${second}/256.webp`)).exists()).toBe(false);
    });
  });
});
