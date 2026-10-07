import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';
import { webSocketService } from './websocket.service';
import { logger } from '../utils/logger';

let _utils: WorkerUtils | null = null;

async function getUtils(): Promise<WorkerUtils> {
  if (!_utils) {
    _utils = await makeWorkerUtils({ connectionString: process.env.DATABASE_URL! });
    await _utils.migrate();
  }
  return _utils;
}

export async function enqueueMmrFinalization(matchId: string, tournamentId: string): Promise<void> {
  try {
    const utils = await getUtils();
    await utils.addJob(
      'finalize_match_mmr',
      { matchId, tournamentId },
      { jobKey: `finalize:${matchId}`, queueName: `mmr:${tournamentId}` },
    );
    webSocketService.broadcastToTournament(tournamentId, {
      event: 'leaderboard_recalculating',
      data: { seasonId: tournamentId },
    });
  } catch (err) {
    logger.error({ err, matchId, tournamentId }, '[MMRQueue] Failed to enqueue finalization');
  }
}

export async function enqueueMmrSeasonRecalculation(tournamentId: string): Promise<void> {
  try {
    const utils = await getUtils();
    await utils.addJob(
      'recalculate_season_mmr',
      { tournamentId },
      { jobKey: `recalculate_season:${tournamentId}`, queueName: `mmr:${tournamentId}` },
    );
    webSocketService.broadcastToTournament(tournamentId, {
      event: 'leaderboard_recalculating',
      data: { seasonId: tournamentId },
    });
  } catch (err) {
    logger.error({ err, tournamentId }, '[MMRQueue] Failed to enqueue season recalculation');
  }
}

/**
 * Queues the end-of-season rewind build. Shares the season's MMR queue so it can
 * never run ahead of a pending recalculation: a rewind computed on stale MMR
 * would freeze the wrong story into an immutable snapshot.
 */
export async function enqueueSeasonRewindGeneration(seasonId: string): Promise<void> {
  try {
    const utils = await getUtils();
    await utils.addJob(
      'generate_season_rewind',
      { seasonId },
      { jobKey: `rewind:${seasonId}`, queueName: `mmr:${seasonId}` },
    );
  } catch (err) {
    logger.error({ err, seasonId }, '[MMRQueue] Failed to enqueue rewind generation');
  }
}

/**
 * Queues the repair of the names a player left frozen inside stored rewinds.
 * Keyed per player so renaming the same person twice collapses into one run,
 * and off the season queues because it spans every season they ever played.
 */
export async function enqueueRewindIdentityRefresh(playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;
  try {
    const utils = await getUtils();
    for (const playerId of playerIds) {
      await utils.addJob(
        'refresh_rewind_identities',
        { playerIds: [playerId] },
        { jobKey: `rewind-identity:${playerId}` },
      );
    }
  } catch (err) {
    logger.error({ err, playerIds }, '[MMRQueue] Failed to enqueue rewind identity refresh');
  }
}

export async function enqueueBadgeReconciliation(force = false): Promise<void> {
  try {
    const utils = await getUtils();
    // Single shared job key: collapses the nightly tick and any manual triggers
    // into one queued run (no overlap with concurrency:1).
    await utils.addJob(
      'reconcile_pending_badges',
      { force },
      { jobKey: 'reconcile_pending_badges' },
    );
  } catch (err) {
    logger.error({ err, force }, '[MMRQueue] Failed to enqueue badge reconciliation');
  }
}

export async function enqueueMmrCascade(
  matchId: string,
  tournamentId: string,
  cancelledMatchPlayedAt: Date,
): Promise<void> {
  try {
    const utils = await getUtils();
    await utils.addJob(
      'cancel_match_mmr',
      { matchId, tournamentId, cancelledMatchPlayedAt: cancelledMatchPlayedAt.toISOString() },
      { jobKey: `cancel:${matchId}`, queueName: `mmr:${tournamentId}` },
    );
    webSocketService.broadcastToTournament(tournamentId, {
      event: 'leaderboard_recalculating',
      data: { seasonId: tournamentId },
    });
  } catch (err) {
    logger.error({ err, matchId, tournamentId }, '[MMRQueue] Failed to enqueue cascade');
  }
}

export async function enqueueMmrCorrection(matchId: string, tournamentId: string): Promise<void> {
  try {
    const utils = await getUtils();
    // Keyed per match: corrections made back to back collapse into one replay, which
    // reads the result as it stands when it runs.
    await utils.addJob(
      'correct_match_mmr',
      { matchId, tournamentId },
      { jobKey: `correct:${matchId}`, queueName: `mmr:${tournamentId}` },
    );
    webSocketService.broadcastToTournament(tournamentId, {
      event: 'leaderboard_recalculating',
      data: { seasonId: tournamentId },
    });
  } catch (err) {
    logger.error({ err, matchId, tournamentId }, '[MMRQueue] Failed to enqueue correction');
  }
}
