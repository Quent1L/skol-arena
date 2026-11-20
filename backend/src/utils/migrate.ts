import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";
import { logger } from "./logger";

/**
 * Bookkeeping written by Drizzle's own migrator. Kept byte-for-byte identical so a
 * database can move between this code and `drizzle-orm/node-postgres/migrator`
 * in either direction: same schema, same table, same columns.
 *
 * Note that Drizzle decides what is pending purely from the highest `created_at`
 * already recorded. `hash` is stored but never compared, so editing an old
 * migration file changes nothing for a database that already ran it.
 */
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";
const MIGRATIONS_TABLE_REF = `"${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`;

/**
 * Session-level advisory lock guarding the whole migration run: 0x736b6f6c6d696772,
 * the ASCII bytes of "skolmigr". Arbitrary but fixed, and namespaced enough not to
 * collide with anything else using advisory locks on the same database.
 *
 * Sent as a string because the value does not fit a JS number; Postgres casts it
 * back to bigint. Session locks survive COMMIT, which is what makes them the right
 * tool here: one lock spans every per-migration transaction. They are also released
 * when the connection drops, so a container killed mid-migration does not wedge the
 * next boot.
 */
const MIGRATION_LOCK_KEY = "8316863648352528242";

/**
 * Run pending database migrations.
 * Should be called before starting the server.
 *
 * **One transaction per migration, not one for the whole batch.** Drizzle's
 * migrator wraps every pending migration in a single transaction. That sounds
 * safer, and it makes one thing impossible: a migration that adds a value to an
 * enum cannot be followed, in that same transaction, by anything using that
 * value. Postgres rejects it outright:
 *
 *   unsafe use of new value "ranked" of enum type tournament_mode
 *
 * An instance that upgrades release by release never hits this, because each
 * release brings a handful of migrations and the enum value was committed by an
 * earlier one. A brand-new deployment replaying the whole history from 0000 hits
 * it on the first boot and never starts.
 *
 * The trade-off is real and deliberate: a failure now leaves the migrations
 * before it applied. See the failure log below, which spells out where the
 * database stopped.
 *
 * The whole run is serialized across instances by an advisory lock, so several
 * replicas booting at once cannot interleave their migrations.
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = process.env.MIGRATIONS_FOLDER ?? "./drizzle";
  logger.info("Checking database migrations...");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // A single connection for the whole run: BEGIN and COMMIT have to land on
    // the same session, which a pool cannot guarantee.
    const client = await pool.connect();
    try {
      await withMigrationLock(client, () => applyPendingMigrations(client, migrationsFolder));
    } finally {
      client.release();
    }
    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.fatal({ err: error }, "Database migration failed!");

    // Exit the process - we don't want to start the server with failed migrations
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Serializes the migration run across instances.
 *
 * Several replicas booting on the same database would otherwise each read the same
 * pending list and race to apply it. The lock has to cover the *read* as well as the
 * writes: taken afterwards, a second instance would already be holding a stale list
 * and would replay migrations the first one just committed.
 */
async function withMigrationLock<T>(client: PoolClient, run: () => Promise<T>): Promise<T> {
  const { rows } = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1) AS acquired", [
    MIGRATION_LOCK_KEY,
  ]);

  if (!rows[0]?.acquired) {
    logger.info("Another instance is migrating, waiting for it to finish...");
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  }

  try {
    return await run();
  } finally {
    // Best-effort: the lock also goes away with the connection, so a failure here
    // must not mask the migration error that is on its way up.
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      .catch((err) => logger.warn({ err }, "Could not release the migration lock"));
  }
}

async function applyPendingMigrations(client: PoolClient, migrationsFolder: string): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder });

  await client.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_REF} (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`,
  );

  const pending = await selectPending(client, migrations);
  if (pending.length === 0) {
    logger.info("No pending migrations");
    return;
  }

  logger.info({ pending: pending.length }, "Applying pending migrations");

  for (const [index, migration] of pending.entries()) {
    await applyOne(client, migration, {
      position: index + 1,
      total: pending.length,
      applied: index,
    });
  }
}

/**
 * Same rule as Drizzle: everything stamped after the most recent applied
 * migration is pending. A gap in the middle is not detected, by design.
 */
async function selectPending(client: PoolClient, migrations: MigrationMeta[]): Promise<MigrationMeta[]> {
  const { rows } = await client.query<{ created_at: string | null }>(
    `SELECT created_at FROM ${MIGRATIONS_TABLE_REF} ORDER BY created_at DESC LIMIT 1`,
  );

  const lastApplied = rows[0]?.created_at;
  if (lastApplied === undefined || lastApplied === null) return migrations;

  const lastAppliedAt = Number(lastApplied);
  return migrations.filter((migration) => lastAppliedAt < migration.folderMillis);
}

async function applyOne(
  client: PoolClient,
  migration: MigrationMeta,
  progress: { position: number; total: number; applied: number },
): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const statement of migration.sql) {
      await client.query(statement);
    }
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE_REF} ("hash", "created_at") VALUES ($1, $2)`, [
      migration.hash,
      migration.folderMillis,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    // The one thing an operator needs at 3am: which migrations are in, which one
    // broke, and the fact that the database is now somewhere in between. Rolling
    // back to the previous release means restoring a backup, since the schema no
    // longer matches the image that was running before.
    logger.fatal(
      {
        err: error,
        failedMigration: migration.hash,
        failedPosition: `${progress.position}/${progress.total}`,
        migrationsApplied: progress.applied,
        databaseState: "partially migrated",
      },
      "Migration failed. The migrations before it are committed and stay applied; " +
        "restoring the previous release requires a database backup.",
    );
    throw error;
  }
}
