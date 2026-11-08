import { db } from "../config/database";
import { appUsers, disciplines, tournaments } from "../db/schema";
import { seedDemoData } from "../demo/demo-seed";
import { DEMO_ADMIN_KEY, DEMO_PASSWORD, demoEmail } from "../demo/demo-dataset";
import { logger } from "./logger";

/** `INIT_DEMO_DATA=true` (or `1`, `yes`) asks for the demo data set on an empty database. */
export function isDemoDataRequested(): boolean {
  const raw = process.env.INIT_DEMO_DATA?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * Anything a person could have created. The demo data is only ever written into a
 * blank instance: mixed into real data it would be impossible to tell apart, and
 * there is no undo.
 */
async function databaseHasData(): Promise<boolean> {
  const probes = await Promise.all([
    db.select({ id: appUsers.id }).from(appUsers).limit(1),
    db.select({ id: tournaments.id }).from(tournaments).limit(1),
    db.select({ id: disciplines.id }).from(disciplines).limit(1),
  ]);
  return probes.some((rows) => rows.length > 0);
}

/**
 * Runs at startup, after migrations and before the bootstrap admin: the demo brings
 * its own super admin, so `initializeAdminIfNeeded` then finds users and steps aside.
 *
 * Never fails the boot. A demo that could not be loaded leaves a working, if partly
 * populated, instance — and says how to start over.
 */
export async function initializeDemoDataIfRequested(): Promise<void> {
  if (!isDemoDataRequested()) return;

  if (await databaseHasData()) {
    logger.info("INIT_DEMO_DATA is set but the database already contains data: demo data not loaded.");
    return;
  }

  logger.info("INIT_DEMO_DATA is set and the database is empty: loading demo data…");
  const started = Date.now();
  try {
    const summary = await seedDemoData();
    logger.info(
      { ...summary, durationMs: Date.now() - started },
      "Demo data loaded",
    );
    logger.info(
      { email: demoEmail(DEMO_ADMIN_KEY), password: DEMO_PASSWORD },
      "DEMO CREDENTIALS — super admin. Every demo player signs in with the same password (<first name>@skol.demo)",
    );
  } catch (err) {
    logger.error(
      { err },
      "Demo data could not be loaded completely. Reset the database (docker compose down -v) and start again.",
    );
  }
}
