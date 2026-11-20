import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let _db: AppDatabase | null = null;
let _pool: Pool | null = null;

function getDb(): AppDatabase {
  if (!_db) {
    _pool ??= new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: process.env.DATABASE_POOL_MAX ? Number.parseInt(process.env.DATABASE_POOL_MAX, 10) : 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export function getPool(): Pool {
  getDb(); // ensure pool is initialized
  return _pool!;
}

/**
 * Set the database instance. Used for testing with in-memory databases.
 * @param testDb The test database instance to use
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTestDatabase(testDb: any): void {
  _db = testDb;
}

/**
 * Reset the database instance to null. Used after tests to restore default behavior.
 */
export function resetDatabase(): void {
  _db = null;
}

// Export a Proxy that always delegates to getDb()
// This ensures that even after setTestDatabase() is called, all code using `db` gets the updated instance
export const db = new Proxy({} as AppDatabase, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
