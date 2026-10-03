import { AVATAR_MAX_UPLOAD_BYTES_DEFAULT, avatarStorageDriverEnum } from "@skol-arena/shared";
import { logger } from "../utils/logger";

/**
 * Where avatars are kept.
 *
 * - `postgres` (default): in the database itself. Nothing to mount and covered by a
 *   pg_dump, but every avatar weighs on the database and on its backups.
 * - `filesystem`: under AVATAR_STORAGE_DIR, which must be a persistent volume in a
 *   container or every redeploy wipes the avatars.
 */
export const BLOB_STORAGE_DRIVERS = avatarStorageDriverEnum;
export type BlobStorageDriver = (typeof BLOB_STORAGE_DRIVERS)[number];

const DEFAULT_DRIVER: BlobStorageDriver = "postgres";
const DEFAULT_STORAGE_DIR = "./data/avatars";

function isDriver(value: string): value is BlobStorageDriver {
  return (BLOB_STORAGE_DRIVERS as readonly string[]).includes(value);
}

/** Read at call time, not at import time: tests flip it per process. */
export function avatarStorageDriver(): BlobStorageDriver {
  const raw = process.env.AVATAR_STORAGE?.trim().toLowerCase();
  if (!raw) return DEFAULT_DRIVER;
  if (isDriver(raw)) return raw;
  logger.warn(
    "AVATAR_STORAGE=%s is not one of %s, falling back to %s",
    raw,
    BLOB_STORAGE_DRIVERS.join(", "),
    DEFAULT_DRIVER,
  );
  return DEFAULT_DRIVER;
}

export function avatarStorageDir(): string {
  const raw = process.env.AVATAR_STORAGE_DIR?.trim();
  return raw ? raw : DEFAULT_STORAGE_DIR;
}

/** Largest upload accepted, in bytes, before any decoding happens. */
export function avatarMaxUploadBytes(): number {
  const raw = process.env.AVATAR_MAX_UPLOAD_BYTES;
  if (raw == null || raw.trim() === "") return AVATAR_MAX_UPLOAD_BYTES_DEFAULT;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return AVATAR_MAX_UPLOAD_BYTES_DEFAULT;
  return parsed;
}
