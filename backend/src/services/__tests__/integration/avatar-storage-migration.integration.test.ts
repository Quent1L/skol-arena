import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { appUsers, storedBlobs, user as betterAuthUser } from "../../../db/schema";
import { avatarService } from "../../avatar.service";
import { avatarStorageMigrationService } from "../../avatar-storage-migration.service";
import { systemInfoService } from "../../system-info.service";
import { setAvatarStorage, setInactiveAvatarStorages, type BlobStorage } from "../../../storage";
import { PostgresBlobStorage } from "../../../storage/postgres-blob-storage";
import { FilesystemBlobStorage } from "../../../storage/filesystem-blob-storage";
import { AppError } from "../../../types/errors";
import { makePng } from "../helpers/image-fixtures";

async function createUser(name: string) {
  const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [authUser] = await testDb
    .insert(betterAuthUser)
    .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
    .returning();
  const [appUser] = await testDb
    .insert(appUsers)
    .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: authUser!.id })
    .returning();
  return appUser!.id;
}

async function blobCount(): Promise<number> {
  const [row] = await testDb.select({ n: sql<number>`count(*)::int` }).from(storedBlobs);
  return row!.n;
}

/** Uploads into `storage` as if it had been the configured one at the time. */
async function uploadInto(storage: BlobStorage, userId: string): Promise<string> {
  setAvatarStorage(storage);
  try {
    return await avatarService.setAvatar(userId, makePng(120, 120));
  } finally {
    setAvatarStorage(active);
  }
}

let root: string;
let postgres: PostgresBlobStorage;
let filesystem: FilesystemBlobStorage;
let active: BlobStorage;

describe("Avatar storage migration (integration)", () => {
  beforeAll(() => {
    postgres = new PostgresBlobStorage();
  });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "skol-avatar-migration-"));
    filesystem = new FilesystemBlobStorage(root);
    await testDb.delete(storedBlobs);
    await testDb.update(appUsers).set({ avatarVersion: null });
  });

  afterEach(async () => {
    setAvatarStorage(null);
    setInactiveAvatarStorages(null);
    await rm(root, { recursive: true, force: true });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  /** AVATAR_STORAGE now points at `target`, the other store is the stranded one. */
  function configure(target: BlobStorage, other: BlobStorage) {
    active = target;
    setAvatarStorage(target);
    setInactiveAvatarStorages([other]);
  }

  it("reports nothing when every avatar is in the configured store", async () => {
    configure(postgres, filesystem);
    await uploadInto(postgres, await createUser("Alice"));

    expect((await avatarStorageMigrationService.detectMismatch()).avatarStorage.strandedDrivers).toEqual([]);
    const report = await avatarStorageMigrationService.getReport();
    expect(report).toMatchObject({ driver: "postgres", total: 1, inActive: 1, missing: 0 });
    expect(report.stranded).toEqual([{ driver: "filesystem", count: 0 }]);
  });

  it("moves postgres avatars to the filesystem and empties the table", async () => {
    configure(filesystem, postgres);
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const aliceVersion = await uploadInto(postgres, alice);
    await uploadInto(postgres, bob);
    await uploadInto(filesystem, await createUser("Carol"));

    const status = await avatarStorageMigrationService.detectMismatch();
    expect(status.avatarStorage).toEqual({ driver: "filesystem", strandedDrivers: ["postgres"] });
    // Not served yet: reads only ever hit the configured store.
    await expect(avatarService.getVariant(alice, aliceVersion, 64)).rejects.toBeInstanceOf(AppError);

    const result = await avatarStorageMigrationService.migrate();

    expect(result).toMatchObject({ migrated: 2, failed: 0, missing: 0 });
    expect(result.report).toMatchObject({ total: 3, inActive: 3, strandedDrivers: [] });
    expect(await blobCount()).toBe(0);
    expect(avatarStorageMigrationService.getStatus().avatarStorage.strandedDrivers).toEqual([]);
    expect((await avatarService.getVariant(alice, aliceVersion, 256)).contentType).toBe("image/webp");
  });

  it("moves filesystem avatars to postgres and purges orphans", async () => {
    configure(postgres, filesystem);
    const alice = await createUser("Alice");
    await uploadInto(filesystem, alice);
    await filesystem.put("avatars/orphan/old/64.webp", new Uint8Array([1]), "image/webp");

    const result = await avatarStorageMigrationService.migrate();

    expect(result).toMatchObject({ migrated: 1, failed: 0 });
    expect(await blobCount()).toBe(3);
    expect(await filesystem.hasPrefix("avatars/")).toBe(false);
  });

  it("counts avatars found nowhere as missing and leaves them alone", async () => {
    configure(postgres, filesystem);
    const alice = await createUser("Alice");
    await testDb.update(appUsers).set({ avatarVersion: crypto.randomUUID() }).where(eq(appUsers.id, alice));

    const result = await avatarStorageMigrationService.migrate();

    expect(result).toMatchObject({ migrated: 0, failed: 0, missing: 1 });
  });

  it("keeps the source copy of an avatar that failed, and its orphans", async () => {
    configure(postgres, filesystem);
    const alice = await createUser("Alice");
    const version = await uploadInto(filesystem, alice);
    const failing = Object.assign(Object.create(postgres) as PostgresBlobStorage, {
      put: async () => {
        throw new Error("disk full");
      },
    });
    configure(failing, filesystem);

    const result = await avatarStorageMigrationService.migrate();

    expect(result).toMatchObject({ migrated: 0, failed: 1 });
    expect(await filesystem.exists(`avatars/${alice}/${version}/64.webp`)).toBe(true);
    expect(avatarStorageMigrationService.getStatus().avatarStorage.strandedDrivers).toEqual(["filesystem"]);
  });

  it("refuses a second migration while one is running", async () => {
    configure(postgres, filesystem);
    await uploadInto(filesystem, await createUser("Alice"));

    const first = avatarStorageMigrationService.migrate();
    const second = avatarStorageMigrationService.migrate();

    await expect(second).rejects.toMatchObject({ statusCode: 409 });
    await first;
  });

  it("includes the avatar report in the system information", async () => {
    configure(postgres, filesystem);

    const info = await systemInfoService.getSystemInfo();

    expect(info.database.serverVersion).not.toBe("");
    expect(info.database.sizeBytes).toBeGreaterThan(0);
    expect(info.avatarStorage.driver).toBe("postgres");
    expect(info.environment.find((v) => v.name === "DATABASE_URL")?.value).toBeNull();
  });
});
