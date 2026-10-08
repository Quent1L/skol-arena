import { and, eq, ne } from "drizzle-orm";
import { db } from "../config/database";
import { computedData, tournaments } from "../db/schema";
import { tournamentRulesetRepository } from "../repository/tournament-ruleset.repository";
import { MMR_ENGINE_VERSION } from "../services/mmr-engine";
import { enqueueMmrSeasonRecalculation } from "../services/mmr-job-queue.service";
import { logger } from "./logger";

/** How long a recalculation marker may stand before it is considered abandoned. */
const STALE_RECALC_MS = 2 * 60 * 60 * 1000;

/** Per-season stamp of the engine version its MMR history was computed with. */
const ENGINE_VERSION_KEY = "mmr:engine-version";

type EngineVersionData = { version: number };

/**
 * Replays every unfinished ranked season whose MMR was computed by an older
 * engine version.
 *
 * A formula change makes stored MMR incomparable with what new matches produce,
 * so the ladder has to be rebuilt before play resumes. Doing it at boot means a
 * deploy carries its own data migration instead of relying on someone
 * remembering to run a script.
 *
 * Finished seasons are deliberately left alone: their standings are published,
 * their rewinds are frozen by version, and the carry-over seeds derived from
 * them are already stored. They keep — and keep advertising — the version they
 * were computed with.
 *
 * Idempotent and safe to run concurrently: the stamp is written per season, and
 * the job's `jobKey` collapses duplicates queued by several instances.
 */
export async function recalculateOutdatedRankedSeasons(): Promise<void> {
  const seasons = await db
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .where(and(eq(tournaments.mode, "ranked"), ne(tournaments.status, "finished")));

  if (seasons.length === 0) return;

  let queued = 0;
  for (const season of seasons) {
    if (await isUpToDate(season.id)) continue;

    await enqueueMmrSeasonRecalculation(season.id);
    await stampEngineVersion(season.id);
    queued += 1;
    logger.info(
      { seasonId: season.id, name: season.name, version: MMR_ENGINE_VERSION },
      "[MMREngine] season queued for replay on the new engine",
    );
  }

  if (queued > 0) {
    logger.info(
      { queued, version: MMR_ENGINE_VERSION },
      "[MMREngine] MMR engine upgrade — seasons queued for recalculation",
    );
  }
}

/**
 * Drops recalculation markers no worker is going to clear.
 *
 * A propagation marks the competition before enqueuing the replay; a worker that
 * dies mid-job never clears it, and the "recalculation running" banner would then
 * stand forever. Boot is the natural place to notice.
 */
export async function clearStaleRecalcMarkers(): Promise<void> {
  const cleared = await tournamentRulesetRepository.clearStalePending(
    new Date(Date.now() - STALE_RECALC_MS),
  );
  if (cleared > 0) {
    logger.warn({ cleared }, "[Ruleset] cleared abandoned recalculation markers");
  }
}

async function isUpToDate(seasonId: string): Promise<boolean> {
  const row = await db.query.computedData.findFirst({
    where: and(eq(computedData.tournamentId, seasonId), eq(computedData.key, ENGINE_VERSION_KEY)),
  });
  const stored = (row?.data as EngineVersionData | undefined)?.version ?? 0;
  return stored >= MMR_ENGINE_VERSION;
}

/**
 * Stamped before the job runs rather than after: a replay that fails is retried
 * by the worker itself, whereas a stamp that never lands would re-queue the
 * whole ladder on every single boot.
 *
 * Exported for fixtures that write a ladder by hand: unstamped, it would be
 * replayed from its matches at the next boot and lose the values it was given.
 */
export async function stampEngineVersion(seasonId: string): Promise<void> {
  const data: EngineVersionData = { version: MMR_ENGINE_VERSION };
  await db
    .insert(computedData)
    .values({ tournamentId: seasonId, key: ENGINE_VERSION_KEY, data, computedAt: new Date() })
    .onConflictDoUpdate({
      target: [computedData.tournamentId, computedData.key],
      set: { data, computedAt: new Date() },
    });
}
