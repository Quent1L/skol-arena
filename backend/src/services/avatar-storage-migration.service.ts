import {
  AVATAR_SIZES,
  type AvatarMigrationResult,
  type AvatarStorageDriver,
  type AvatarStorageReport,
  type MaintenanceStatus,
} from "@skol-arena/shared";
import { userRepository } from "../repository/user.repository";
import { getAvatarStorage, getInactiveAvatarStorages, type BlobStorage } from "../storage";
import { ConflictError, ErrorCode } from "../types/errors";
import { logger } from "../utils/logger";
import { AVATAR_CONTENT_TYPE, AVATARS_PREFIX, userPrefix, variantKey, versionPrefix } from "./avatar-keys";

type CurrentAvatar = { id: string; avatarVersion: string };
type CopyOutcome = "migrated" | "failed" | "missing" | "skipped";

/**
 * Avatars only end up in the wrong store when AVATAR_STORAGE changes, which takes
 * a restart: checking at startup and after each migration is enough, so the admin
 * screens read this cache instead of probing the stores on every visit.
 */
let strandedDrivers: AvatarStorageDriver[] = [];
let migrating = false;

async function findStrandedDrivers(): Promise<AvatarStorageDriver[]> {
  const found: AvatarStorageDriver[] = [];
  for (const storage of getInactiveAvatarStorages()) {
    try {
      if (await storage.hasPrefix(AVATARS_PREFIX)) found.push(storage.driver);
    } catch (err) {
      logger.warn({ err, driver: storage.driver }, "Could not probe inactive avatar storage");
    }
  }
  return found;
}

/** The first store holding `avatar`, the active one first. Probes the smallest variant only. */
async function locate(avatar: CurrentAvatar, stores: BlobStorage[]): Promise<BlobStorage | null> {
  const key = variantKey(avatar.id, avatar.avatarVersion, AVATAR_SIZES[0]);
  for (const storage of stores) {
    if (await storage.exists(key)) return storage;
  }
  return null;
}

/** Copies every variant, verifies them, then drops the user's objects from the source. */
async function copyAvatar(avatar: CurrentAvatar, source: BlobStorage, target: BlobStorage): Promise<void> {
  for (const size of AVATAR_SIZES) {
    const key = variantKey(avatar.id, avatar.avatarVersion, size);
    const blob = await source.get(key);
    if (!blob) throw new Error(`Variant ${key} vanished from ${source.driver}`);
    await target.put(key, blob.data, AVATAR_CONTENT_TYPE);
    if (!(await target.exists(key))) throw new Error(`Variant ${key} not readable from ${target.driver}`);
  }
  // A new upload during the copy already went to the target: the copy is then an orphan.
  if ((await userRepository.getAvatarVersion(avatar.id)) !== avatar.avatarVersion) {
    await target.deletePrefix(versionPrefix(avatar.id, avatar.avatarVersion));
  }
  await source.deletePrefix(userPrefix(avatar.id));
}

async function migrateOne(avatar: CurrentAvatar, target: BlobStorage, sources: BlobStorage[]): Promise<CopyOutcome> {
  try {
    const location = await locate(avatar, [target, ...sources]);
    if (!location) return "missing";
    if (location === target) return "skipped";
    await copyAvatar(avatar, location, target);
    return "migrated";
  } catch (err) {
    logger.error({ err, userId: avatar.id }, "Avatar migration failed");
    return "failed";
  }
}

/** Removes what is left in the sources: orphaned versions nothing points at any more. */
async function purgeSources(sources: BlobStorage[]): Promise<void> {
  for (const source of sources) {
    try {
      await source.deletePrefix(AVATARS_PREFIX);
    } catch (err) {
      logger.warn({ err, driver: source.driver }, "Could not purge inactive avatar storage");
    }
  }
}

export const avatarStorageMigrationService = {
  /** Refreshes the cached status. Never throws: a probe failure must not block the boot. */
  async detectMismatch(): Promise<MaintenanceStatus> {
    strandedDrivers = await findStrandedDrivers();
    if (strandedDrivers.length > 0) {
      logger.warn(
        "Avatars found in %s while AVATAR_STORAGE=%s: migrate them from Admin > Maintenance",
        strandedDrivers.join(", "),
        getAvatarStorage().driver,
      );
    }
    return this.getStatus();
  },

  getStatus(): MaintenanceStatus {
    return { avatarStorage: { driver: getAvatarStorage().driver, strandedDrivers } };
  },

  async getReport(): Promise<AvatarStorageReport> {
    const active = getAvatarStorage();
    const inactive = getInactiveAvatarStorages();
    const counts = new Map<BlobStorage, number>();
    let missing = 0;
    for (const avatar of await userRepository.listAvatarVersions()) {
      const location = await locate(avatar, [active, ...inactive]);
      if (location) counts.set(location, (counts.get(location) ?? 0) + 1);
      else missing++;
    }
    const total = [...counts.values()].reduce((sum, n) => sum + n, missing);
    return {
      driver: active.driver,
      total,
      inActive: counts.get(active) ?? 0,
      stranded: inactive.map((storage) => ({ driver: storage.driver, count: counts.get(storage) ?? 0 })),
      missing,
      strandedDrivers: await findStrandedDrivers(),
    };
  },

  /**
   * Moves every current avatar into the store AVATAR_STORAGE points at. Idempotent:
   * a failed avatar keeps its source copy and a second run picks it up. The sources
   * are only emptied of orphans once every avatar made it across.
   */
  async migrate(): Promise<AvatarMigrationResult> {
    if (migrating) throw new ConflictError(ErrorCode.AVATAR_MIGRATION_IN_PROGRESS);
    migrating = true;
    try {
      const target = getAvatarStorage();
      const sources = getInactiveAvatarStorages();
      const tally: Record<CopyOutcome, number> = { migrated: 0, failed: 0, missing: 0, skipped: 0 };
      for (const avatar of await userRepository.listAvatarVersions()) {
        tally[await migrateOne(avatar, target, sources)]++;
      }
      if (tally.failed === 0) await purgeSources(sources);
      await this.detectMismatch();
      logger.info({ ...tally, target: target.driver }, "Avatar migration finished");
      return { migrated: tally.migrated, failed: tally.failed, missing: tally.missing, report: await this.getReport() };
    } finally {
      migrating = false;
    }
  },
};
