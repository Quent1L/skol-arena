import type { Pool } from "pg";
import { logger } from "../utils/logger";

// Stable namespace for all Skol jobs (avoids collision with advisory locks from other apps)
const JOB_LOCK_NAMESPACE = 9_876_543;

export async function withAdvisoryLock<T>(
  pool: Pool,
  lockKey: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1, $2) AS acquired", [
      JOB_LOCK_NAMESPACE,
      lockKey,
    ]);
    if (!rows[0].acquired) {
      return { ran: false };
    }
    try {
      const result = await fn();
      return { ran: true, result };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [JOB_LOCK_NAMESPACE, lockKey]);
    }
  } catch (err) {
    logger.error({ err }, "[advisory-lock] unexpected error");
    throw err;
  } finally {
    client.release();
  }
}
