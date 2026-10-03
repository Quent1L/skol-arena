import { avatarStorageDir, avatarStorageDriver, BLOB_STORAGE_DRIVERS } from "../config/avatar";
import { logger } from "../utils/logger";
import type { BlobStorage, BlobStorageDriver } from "./blob-storage";
import { FilesystemBlobStorage } from "./filesystem-blob-storage";
import { PostgresBlobStorage } from "./postgres-blob-storage";

export type { BlobStorage, StoredBlob } from "./blob-storage";

let avatarStorage: BlobStorage | null = null;
let inactiveAvatarStorages: BlobStorage[] | null = null;

/** Builds a store for `driver` without initialising it: nothing is created on disk. */
export function createBlobStorage(driver: BlobStorageDriver): BlobStorage {
  switch (driver) {
    case "filesystem":
      return new FilesystemBlobStorage(avatarStorageDir());
    case "postgres":
      return new PostgresBlobStorage();
  }
}

/** The store avatars are kept in, chosen once per process from AVATAR_STORAGE. */
export function getAvatarStorage(): BlobStorage {
  avatarStorage ??= createBlobStorage(avatarStorageDriver());
  return avatarStorage;
}

/** Tests swap the store for one they control; null goes back to the configured one. */
export function setAvatarStorage(storage: BlobStorage | null): void {
  avatarStorage = storage;
}

/**
 * Every store AVATAR_STORAGE does not point at: where avatars are left behind when
 * the driver is switched. The filesystem one reads AVATAR_STORAGE_DIR, which must
 * therefore stay mounted until they have been migrated.
 */
export function getInactiveAvatarStorages(): BlobStorage[] {
  if (inactiveAvatarStorages) return inactiveAvatarStorages;
  const active = getAvatarStorage().driver;
  return BLOB_STORAGE_DRIVERS.filter((driver) => driver !== active).map(createBlobStorage);
}

/** Tests swap the inactive stores too; null goes back to the derived ones. */
export function setInactiveAvatarStorages(storages: BlobStorage[] | null): void {
  inactiveAvatarStorages = storages;
}

/**
 * Called at startup. A filesystem store that cannot be written to should stop the
 * server now, not surface as a failed upload days later.
 */
export async function initAvatarStorage(): Promise<void> {
  const storage = getAvatarStorage();
  if (storage instanceof FilesystemBlobStorage) {
    await storage.init();
    logger.info("Avatar storage: filesystem (%s)", avatarStorageDir());
    return;
  }
  logger.info("Avatar storage: %s", storage.driver);
}
