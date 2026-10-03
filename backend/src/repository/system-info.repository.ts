import { sql } from "drizzle-orm";
import { db } from "../config/database";
import type { DatabaseInfo } from "@skol-arena/shared";
import { logger } from "../utils/logger";

const TOP_TABLES = 10;

type TableRow = { name: string; size_bytes: string | number; rows: string | number | null };
type MigrationRow = { applied: string | number; latest: string | number | null };

/** Read-only probes of the database server, for the maintenance screen. */
export const systemInfoRepository = {
  async getServerVersion(): Promise<string> {
    const result = await db.execute(sql`SELECT current_setting('server_version') AS version`);
    return String((result.rows[0] as { version: string }).version);
  },

  async getDatabaseSize(): Promise<number> {
    const result = await db.execute(sql`SELECT pg_database_size(current_database()) AS size`);
    return Number((result.rows[0] as { size: string | number }).size);
  },

  /** The heaviest tables, indexes and TOAST included; `rows` is the planner's estimate. */
  async getLargestTables(): Promise<DatabaseInfo["tables"]> {
    const result = await db.execute(sql`
      SELECT relname AS name,
             pg_total_relation_size(relid) AS size_bytes,
             n_live_tup AS rows
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT ${TOP_TABLES}
    `);
    return (result.rows as TableRow[]).map((row) => ({
      name: row.name,
      sizeBytes: Number(row.size_bytes),
      rows: Number(row.rows ?? 0),
    }));
  },

  /** Drizzle's bookkeeping, see utils/migrate.ts. Absent until the first migration ran. */
  async getMigrations(): Promise<DatabaseInfo["migrations"]> {
    try {
      const result = await db.execute(sql`
        SELECT count(*) AS applied, max(created_at) AS latest
        FROM "drizzle"."__drizzle_migrations"
      `);
      const row = result.rows[0] as MigrationRow | undefined;
      const latest = row?.latest == null ? null : new Date(Number(row.latest));
      return { applied: Number(row?.applied ?? 0), latestMigrationAt: latest };
    } catch (err) {
      logger.warn({ err }, "Could not read the migrations table");
      return { applied: 0, latestMigrationAt: null };
    }
  },
};
