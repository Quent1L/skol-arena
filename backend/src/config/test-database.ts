/**
 * In-memory PostgreSQL database for integration tests using PGlite.
 * This allows running tests without a real database connection.
 */
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { setTestDatabase, resetDatabase } from "./database";

let testDbInstance: PgliteDatabase<typeof schema> | null = null;
let pgliteInstance: PGlite | null = null;

/**
 * Creates and initializes an in-memory PostgreSQL database for testing.
 * Runs all migrations to set up the schema.
 * Also sets the database module to use this instance.
 */
export async function createTestDatabase(): Promise<
  PgliteDatabase<typeof schema>
> {
  // Create a new PGlite in-memory database. Contrib extensions are not bundled
  // by default: migration 0085 creates `unaccent`, so it must be loadable here.
  pgliteInstance = new PGlite({ extensions: { unaccent } });

  // Create drizzle instance with the pglite client
  testDbInstance = drizzle(pgliteInstance, { schema });

  // Run migrations
  await runMigrations();

  // Set this as the active database for all code
  setTestDatabase(testDbInstance);

  return testDbInstance;
}

/**
 * Runs all migration SQL files in order.
 */
function parseMigrationStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function execMigrationStatement(statement: string, file: string): Promise<void> {
  if (!pgliteInstance) return;
  try {
    await pgliteInstance.exec(statement);
  } catch (error: unknown) {
    // Ignore errors for IF NOT EXISTS or duplicate constraints
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isSchemaNoise =
      errorMessage.includes("already exists") || errorMessage.includes("duplicate key");
    // Only log significant errors, not schema issues
    if (!isSchemaNoise && process.env.DEBUG_MIGRATIONS) {
      console.warn(`Migration warning in ${file}: ${errorMessage.substring(0, 100)}`);
    }
  }
}

async function runMigrations(): Promise<void> {
  if (!pgliteInstance) return;

  const migrationsPath = join(__dirname, "../../drizzle");
  const files = readdirSync(migrationsPath)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const sql = readFileSync(join(migrationsPath, file), "utf-8");
    for (const statement of parseMigrationStatements(sql)) {
      await execMigrationStatement(statement, file);
    }
  }

  // Fix schema mismatches - columns that exist in schema.ts but were dropped by migrations
  await fixSchemaMismatches();
}

/**
 * Adds columns that exist in schema.ts but are missing from the database.
 * This handles cases where migrations incorrectly dropped columns that are still in use.
 */
async function fixSchemaMismatches(): Promise<void> {
  if (!pgliteInstance) return;

  const schemaPatchStatements = [
    // winner_side was dropped in migration 0012 but is still in schema.ts and used in code
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "winner_side" varchar(1)`,
  ];

  for (const statement of schemaPatchStatements) {
    try {
      await pgliteInstance.exec(statement);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("already exists")) {
        if (process.env.DEBUG_MIGRATIONS) {
          console.warn(
            `Schema patch warning: ${errorMessage.substring(0, 100)}`,
          );
        }
      }
    }
  }
}

/**
 * Gets the current test database instance.
 * Creates one if it doesn't exist.
 */
export async function getTestDatabase(): Promise<
  PgliteDatabase<typeof schema>
> {
  if (!testDbInstance) {
    return createTestDatabase();
  }
  return testDbInstance;
}

/**
 * Resets the test database by clearing all data.
 * Useful between tests.
 */
export async function resetTestDatabase(): Promise<void> {
  if (!pgliteInstance) {
    await createTestDatabase();
    return;
  }

  // Clear all tables in reverse order of dependencies
  const tablesToClear = [
    "match_confirmations",
    "match_results",
    "match_sides",
    "matches",
    "tournament_entry_players",
    "tournament_entries",
    "bracket_seeds",
    "bracket_match_metadata",
    "bracket_rounds",
    "bracket_config",
    "notifications",
    "push_devices",
    "tournament_participants",
    "tournament_admins",
    "teams",
    "championship_configs",
    "tournament_scoring_configs",
    "tournaments",
    "invitation_usages",
    "invitation_codes",
    "stored_blobs",
    "app_users",
    "account",
    "session",
    "verification",
    "user",
  ];

  for (const table of tablesToClear) {
    try {
      await pgliteInstance.exec(`DELETE FROM "${table}"`);
    } catch {
      // Table might not exist, ignore
    }
  }
}

/**
 * Closes the test database connection.
 */
export async function closeTestDatabase(): Promise<void> {
  if (pgliteInstance) {
    await pgliteInstance.close();
  }
  testDbInstance = null;
  pgliteInstance = null;

  // Reset the database module to use real database again
  resetDatabase();
}

/**
 * Returns the raw PGlite database instance for direct SQL execution if needed.
 */
export function getPgliteInstance(): PGlite | null {
  return pgliteInstance;
}
