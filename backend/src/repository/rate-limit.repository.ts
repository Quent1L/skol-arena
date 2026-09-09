import { lt, sql } from "drizzle-orm";
import { db } from "../config/database";
import { rateLimit } from "../db/schema";

/**
 * Fixed-window counter over the `rateLimit` table Better Auth already owns.
 *
 * Sharing the table rather than adding a second one keeps a single place to look
 * when a caller complains about being throttled, and a single thing to clear.
 * Better Auth writes its own keys there; ours are prefixed by the middleware.
 */
export const rateLimitRepository = {
  /**
   * Records one hit against `key` and answers whether it is allowed.
   *
   * The whole decision is a single statement so that concurrent requests cannot
   * both read a stale count and both conclude they are under the limit: the
   * ON CONFLICT branch decides, from the row as it is being locked, whether the
   * window has rolled over (reset to 1) or is still running (increment).
   */
  async consume(key: string, windowSeconds: number, max: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const [row] = await db
      .insert(rateLimit)
      // `id` exists for Better Auth's adapter, which shares this table; nothing
      // addresses a row by it, so any unique value will do. The conflict is
      // resolved on `key`, which is what actually identifies the window.
      .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`CASE WHEN ${rateLimit.lastRequest} < ${windowStart} THEN 1 ELSE ${rateLimit.count} + 1 END`,
          lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} < ${windowStart} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
        },
      })
      .returning({ count: rateLimit.count });

    return (row?.count ?? 1) <= max;
  },

  /**
   * Drops rows nothing can consult any more. Called opportunistically rather than
   * on a schedule: the table is only ever read by key, so stale rows cost storage
   * and nothing else, and a sweep on every request would be worse than the leak.
   */
  async deleteExpired(before: number): Promise<void> {
    await db.delete(rateLimit).where(lt(rateLimit.lastRequest, before));
  },
};
