import { eq, sql } from "drizzle-orm";
import { db } from "../config/database";
import { storedBlobs } from "../db/schema";

export const storedBlobRepository = {
  async upsert(key: string, data: Uint8Array, contentType: string): Promise<void> {
    await db
      .insert(storedBlobs)
      .values({ key, data, contentType, byteSize: data.byteLength })
      .onConflictDoUpdate({
        target: storedBlobs.key,
        set: { data, contentType, byteSize: data.byteLength, createdAt: new Date() },
      });
  },

  async findByKey(key: string) {
    const [row] = await db
      .select({
        data: storedBlobs.data,
        contentType: storedBlobs.contentType,
        byteSize: storedBlobs.byteSize,
      })
      .from(storedBlobs)
      .where(eq(storedBlobs.key, key))
      .limit(1);
    return row ?? null;
  },

  async exists(key: string): Promise<boolean> {
    const [row] = await db
      .select({ key: storedBlobs.key })
      .from(storedBlobs)
      .where(eq(storedBlobs.key, key))
      .limit(1);
    return row != null;
  },

  async hasPrefix(prefix: string): Promise<boolean> {
    const [row] = await db
      .select({ key: storedBlobs.key })
      .from(storedBlobs)
      .where(sql`starts_with(${storedBlobs.key}, ${prefix})`)
      .limit(1);
    return row != null;
  },

  /** starts_with rather than LIKE: `_` is a LIKE wildcard and keys may contain it. */
  async deleteByPrefix(prefix: string): Promise<void> {
    await db.delete(storedBlobs).where(sql`starts_with(${storedBlobs.key}, ${prefix})`);
  },
};
