import type { BlobStorageDriver } from "../config/avatar";

export type { BlobStorageDriver };

export interface StoredBlob {
  data: Uint8Array;
  contentType: string;
  size: number;
}

/**
 * A flat key/value object store. Keys are slash-separated paths
 * (`avatars/<user>/<hash>/64.webp`) so that a prefix groups related objects, the
 * way an S3 bucket would. Nothing here knows about avatars: a new driver (S3, …)
 * only has to implement these operations.
 */
export interface BlobStorage {
  readonly driver: BlobStorageDriver;
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBlob | null>;
  exists(key: string): Promise<boolean>;
  /** True when at least one object key starts with `prefix`, which must end with `/`. */
  hasPrefix(prefix: string): Promise<boolean>;
  /** Deletes every object whose key starts with `prefix`, which must end with `/`. */
  deletePrefix(prefix: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*$/;
const SAFE_PREFIX = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*\/$/;

/**
 * Every driver runs its keys through here, whatever its caller already checked.
 * Keys end up in file paths, so `..`, absolute paths, backslashes and empty
 * segments are refused outright rather than normalised.
 */
export function assertSafeKey(key: string): void {
  if (key.length > 512 || !SAFE_KEY.test(key) || key.split("/").includes("..")) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}

export function assertSafePrefix(prefix: string): void {
  if (prefix.length > 512 || !SAFE_PREFIX.test(prefix) || prefix.split("/").includes("..")) {
    throw new Error(`Unsafe storage prefix: ${JSON.stringify(prefix)}`);
  }
}
