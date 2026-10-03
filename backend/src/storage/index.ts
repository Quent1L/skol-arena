import { avatarStorageDir, avatarStorageDriver } from "../config/avatar";
import { logger } from "../utils/logger";
import type { BlobStorage } from "./blob-storage";
import { FilesystemBlobStorage } from "./filesystem-blob-storage";
import { PostgresBlobStorage } from "./postgres-blob-storage";

export type { BlobStorage, StoredBlob } from "./blob-storage";

let avatarStorage: BlobStorage | null = null;

function createAvatarStorage(): BlobStorage {
  const driver = avatarStorageDriver();
  switch (driver) {
    case "filesystem":
      return new FilesystemBlobStorage(avatarStorageDir());
    case "postgres":
      return new PostgresBlobStorage();
  }
}

/** The store avatars are kept in, chosen once per process from AVATAR_STORAGE. */
export function getAvatarStorage(): BlobStorage {
  avatarStorage ??= createAvatarStorage();
  return avatarStorage;
}

/** Tests swap the store for one they control; null goes back to the configured one. */
export function setAvatarStorage(storage: BlobStorage | null): void {
  avatarStorage = storage;
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
