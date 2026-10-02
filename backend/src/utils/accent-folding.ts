import { ilike, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../config/database";
import { logger } from "./logger";

/**
 * Whether the `unaccent` extension is usable. Migration 0085 tries to create it but
 * tolerates a refusal (missing privilege, contrib not installed), so its presence is
 * only known at runtime. Resolved once at startup: installing the extension later
 * takes effect on the next restart.
 */
let accentFolding = false;

export async function detectAccentFolding(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT to_regprocedure('unaccent(text)') IS NOT NULL AS available`,
    );
    accentFolding = Boolean((result.rows[0] as { available: boolean } | undefined)?.available);
  } catch {
    accentFolding = false;
  }
  if (!accentFolding) {
    logger.warn(
      "PostgreSQL extension 'unaccent' unavailable — player/user search stays case-insensitive but accent-sensitive. " +
        "Run CREATE EXTENSION unaccent; as a privileged role, then restart.",
    );
  }
  return accentFolding;
}

/** Case-insensitive LIKE that also ignores accents when `unaccent` is available. */
export function foldedILike(column: AnyPgColumn, pattern: string): SQL {
  if (!accentFolding) return ilike(column, pattern);
  return sql`unaccent(${column}) ILIKE unaccent(${pattern})`;
}
