import { describe, it, expect, beforeEach, afterAll, afterEach, spyOn } from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
  getPgliteInstance,
} from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { count, eq, isNotNull } from "drizzle-orm";
import { initializeDemoDataIfRequested, isDemoDataRequested } from "../../../utils/init-demo-data";
import { initializeAdminIfNeeded } from "../../../utils/init-admin";
import { DEMO_PEOPLE, POOL_OUTCOMES } from "../../../demo/demo-dataset";
import { appUsers, disciplines, matches, outcomeTypes, playerMmr, tournaments, user } from "../../../db/schema";

const ORIGINAL = process.env.INIT_DEMO_DATA;

/**
 * PGlite has a single connection, and bracket generation issues some of its reads on
 * `db` while its transaction holds it: on PGlite that waits forever (Postgres serves
 * them from the pool). Running transactions inline keeps the real code path.
 */
type Transaction = typeof testDb.transaction;
spyOn(testDb, "transaction").mockImplementation(
  ((run: (tx: typeof testDb) => Promise<unknown>) => run(testDb)) as unknown as Transaction,
);

/**
 * resetTestDatabase() keeps disciplines, rankings and the rest of what this seed
 * writes, and the guard would then (rightly) refuse to load: start from nothing.
 */
async function emptyDatabase() {
  await getPgliteInstance()!.exec(`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
      END LOOP;
    END $$;`);
}

async function countOf(table: typeof appUsers | typeof tournaments | typeof matches) {
  const [row] = await testDb.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

describe("initializeDemoDataIfRequested", () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.INIT_DEMO_DATA;
    else process.env.INIT_DEMO_DATA = ORIGINAL;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("reads the flag leniently and treats anything else as off", () => {
    for (const value of ["true", "TRUE", "1", " yes "]) {
      process.env.INIT_DEMO_DATA = value;
      expect(isDemoDataRequested()).toBe(true);
    }
    for (const value of ["", "false", "0", "no"]) {
      process.env.INIT_DEMO_DATA = value;
      expect(isDemoDataRequested()).toBe(false);
    }
    delete process.env.INIT_DEMO_DATA;
    expect(isDemoDataRequested()).toBe(false);
  });

  it("does nothing when the flag is not set", async () => {
    delete process.env.INIT_DEMO_DATA;
    await initializeDemoDataIfRequested();
    expect(await countOf(appUsers)).toBe(0);
  });

  it("leaves a database that already has a discipline untouched", async () => {
    await testDb.insert(disciplines).values({ name: "Chess" });
    process.env.INIT_DEMO_DATA = "true";

    await initializeDemoDataIfRequested();

    expect(await countOf(appUsers)).toBe(0);
  });

  it("leaves a database that already has users untouched", async () => {
    await initializeAdminIfNeeded();
    process.env.INIT_DEMO_DATA = "true";

    await initializeDemoDataIfRequested();

    expect(await countOf(appUsers)).toBe(1);
    expect(await countOf(tournaments)).toBe(0);
  });

  it("populates an empty database with every kind of competition", async () => {
    process.env.INIT_DEMO_DATA = "true";
    await initializeDemoDataIfRequested();

    expect(await countOf(appUsers)).toBe(DEMO_PEOPLE.length);
    const rows = await testDb.select().from(tournaments);
    const kinds = rows.map((t) => `${t.mode}/${t.teamMode}/${t.status}`).sort();
    expect(kinds).toEqual([
      "bracket/flex/ongoing",
      "championship/flex/finished",
      "championship/flex/ongoing",
      "championship/flex/open",
      "championship/static/ongoing",
      "ranked/flex/ongoing",
    ]);

    // Something for the visitor to confirm, and a dispute.
    const statuses = await testDb.select({ status: matches.status }).from(matches);
    expect(statuses.some((m) => m.status === "reported")).toBe(true);
    expect(statuses.some((m) => m.status === "disputed")).toBe(true);

    // Every way a pool match can end is actually used.
    const usedOutcomes = await testDb
      .selectDistinct({ name: outcomeTypes.name })
      .from(matches)
      .innerJoin(outcomeTypes, eq(outcomeTypes.id, matches.outcomeTypeId));
    for (const name of Object.values(POOL_OUTCOMES)) {
      expect(usedOutcomes.map((o) => o.name)).toContain(name);
    }
    const withReason = await testDb.select({ n: count() }).from(matches).where(isNotNull(matches.outcomeReasonId));
    expect(withReason[0]!.n).toBeGreaterThan(0);

    // The ladder was computed by the engine, not left at the base rating.
    const ranked = rows.find((t) => t.mode === "ranked")!;
    const ladder = await testDb.select().from(playerMmr).where(eq(playerMmr.seasonId, ranked.id));
    expect(ladder.length).toBe(DEMO_PEOPLE.length);
    expect(new Set(ladder.map((p) => p.currentMmr)).size).toBeGreaterThan(1);
  }, 120_000);

  it("makes the bootstrap admin step aside once the demo is loaded", async () => {
    process.env.INIT_DEMO_DATA = "true";
    await initializeDemoDataIfRequested();
    await initializeAdminIfNeeded();

    const pending = await testDb.select().from(appUsers).where(eq(appUsers.bootstrapPending, true));
    expect(pending).toHaveLength(0);
    const [admin] = await testDb.select().from(user).where(eq(user.email, "alex@skol.demo"));
    expect(admin).toBeDefined();
  }, 120_000);
});
