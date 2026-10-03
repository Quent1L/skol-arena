import { storedBlobRepository } from "../repository/stored-blob.repository";
import { assertSafeKey, assertSafePrefix, type BlobStorage, type StoredBlob } from "./blob-storage";

/** Objects live in the `stored_blobs` table, next to the rest of the data. */
export class PostgresBlobStorage implements BlobStorage {
  readonly driver = "postgres" as const;

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    await storedBlobRepository.upsert(key, data, contentType);
  }

  async get(key: string): Promise<StoredBlob | null> {
    assertSafeKey(key);
    const row = await storedBlobRepository.findByKey(key);
    if (!row) return null;
    return { data: row.data, contentType: row.contentType, size: row.byteSize };
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return storedBlobRepository.exists(key);
  }

  async hasPrefix(prefix: string): Promise<boolean> {
    assertSafePrefix(prefix);
    return storedBlobRepository.hasPrefix(prefix);
  }

  async deleteMany(keys: string[]): Promise<void> {
    keys.forEach(assertSafeKey);
    await storedBlobRepository.deleteByKeys(keys);
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertSafePrefix(prefix);
    await storedBlobRepository.deleteByPrefix(prefix);
  }
}
