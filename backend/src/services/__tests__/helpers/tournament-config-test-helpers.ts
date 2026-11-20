/**
 * Helpers for the integration tests that insert tournaments straight into the
 * database rather than going through the service.
 *
 * The scoring and championship knobs live in their own satellites now, so a raw
 * `insert(tournaments)` no longer carries them and the match rule validator sees
 * an uncapped tournament. These helpers add the rows the service would have
 * created, and change them the way the tests used to change the columns.
 */
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../../../db/schema";
import { championshipConfigs, tournamentScoringConfigs } from "../../../db/schema";
import {
  CHAMPIONSHIP_DEFAULTS,
  SCORING_DEFAULTS,
  type ChampionshipConfig,
  type TournamentScoringConfig,
} from "@skol-arena/shared";

type TestDb = PgliteDatabase<typeof schema>;

/** Creates both config rows for a championship inserted directly in the DB. */
export async function insertTournamentConfigs(
  db: TestDb,
  tournamentId: string,
  overrides?: {
    championship?: Partial<ChampionshipConfig>;
    scoring?: Partial<TournamentScoringConfig>;
  },
): Promise<void> {
  await db.insert(tournamentScoringConfigs).values({
    tournamentId,
    ...SCORING_DEFAULTS,
    ...overrides?.scoring,
  });
  await db.insert(championshipConfigs).values({
    tournamentId,
    ...CHAMPIONSHIP_DEFAULTS,
    ...overrides?.championship,
  });
}

/** Replacement for the old `update(tournaments).set({ maxTimesWith... })`. */
export async function setChampionshipCaps(
  db: TestDb,
  tournamentId: string,
  caps: Partial<ChampionshipConfig>,
): Promise<void> {
  await db.update(championshipConfigs).set(caps).where(eq(championshipConfigs.tournamentId, tournamentId));
}

/** Replacement for the old `update(tournaments).set({ pointPer... })`. */
export async function setScoringConfig(
  db: TestDb,
  tournamentId: string,
  scoring: Partial<TournamentScoringConfig>,
): Promise<void> {
  await db.update(tournamentScoringConfigs).set(scoring).where(eq(tournamentScoringConfigs.tournamentId, tournamentId));
}
