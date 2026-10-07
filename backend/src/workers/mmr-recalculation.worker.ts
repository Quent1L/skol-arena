import type { Task } from 'graphile-worker';
import { mmrCalculationService } from '../services/mmr-calculation.service';
import { mmrAnimationEventService } from '../services/mmr-animation-event.service';
import { rankedSeasonRepository } from '../repository/ranked-season.repository';
import { playerMmrRepository } from '../repository/player-mmr.repository';
import { rankedSeasonService } from '../services/ranked-season.service';
import { webSocketService } from '../services/websocket.service';
import { rulesEvaluationService } from '../services/rules-evaluation.service';
import { badgeReconciliationService } from '../services/badge-reconciliation.service';
import { seasonRewindService } from '../services/season-rewind.service';
import { enqueueSeasonRewindGeneration } from '../services/mmr-job-queue.service';
import { tournamentRepository } from '../repository/tournament.repository';
import { matchRepository } from '../repository/match.repository';
import { tournamentRulesetRepository } from '../repository/tournament-ruleset.repository';
import { logger } from '../utils/logger';
import { NotFoundError } from '../types/errors';

interface FinalizeMmrPayload {
  matchId: string;
  tournamentId: string;
}

interface CancelMmrPayload {
  matchId: string;
  tournamentId: string;
  cancelledMatchPlayedAt: string;
}

const finalizeMatchMmr: Task = async (rawPayload) => {
  const { matchId, tournamentId } = rawPayload as FinalizeMmrPayload;
  logger.info({ matchId, tournamentId }, '[Worker] finalize_match_mmr start');

  const mmrChanges = await mmrCalculationService.processMatchFinalization(matchId);

  // Evaluate rules first: produces the message injected into the MMR animation
  // and the badge revealed afterwards.
  const rulesOutputs = await rulesEvaluationService
    .evaluateMatchSubmitted(matchId, tournamentId)
    .catch((err) => {
      logger.error({ err }, '[Worker] rules evaluation failed');
      return new Map();
    });

  await mmrAnimationEventService
    .createOfficialEventsAndBroadcast(matchId, tournamentId, rulesOutputs)
    .catch((err) => logger.error({ err }, '[Worker] official animation event failed'));

  // A backdated finalization can ripple to third parties beyond this match's
  // own 2 participants (already handled above via createOfficialEventsAndBroadcast).
  // Those cascade-only players never got an animation/badge pass for their
  // rebuilt history — sync them the same way the cancellation cascade does.
  const cascadePlayerIds = [...mmrChanges].filter(([, c]) => c.reason === 'cascade').map(([playerId]) => playerId);
  if (cascadePlayerIds.length > 0) {
    await mmrAnimationEventService
      .persistRecalcEvents(tournamentId, cascadePlayerIds)
      .catch((err) => logger.error({ err }, '[Worker] finalization cascade animation event failed'));
    await badgeReconciliationService
      .reconcilePlayers(tournamentId, cascadePlayerIds)
      .catch((err) => logger.error({ err }, '[Worker] finalization cascade badge reconciliation failed'));
  }

  await refreshRankedCaches(tournamentId);

  webSocketService.broadcastToTournament(tournamentId, {
    event: 'leaderboard_updated',
    data: { seasonId: tournamentId },
  });

  logger.info({ matchId, tournamentId }, '[Worker] finalize_match_mmr done');
};

const cancelMatchMmr: Task = async (rawPayload) => {
  const { matchId, tournamentId, cancelledMatchPlayedAt } = rawPayload as CancelMmrPayload;
  logger.info({ matchId, tournamentId }, '[Worker] cancel_match_mmr start');

  const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId);
  if (!rankedConfig) return;

  const mmrChanges = await mmrCalculationService.cascadeRecalculateAfterCancellation(
    matchId,
    tournamentId,
    new Date(cancelledMatchPlayedAt),
  );

  // Persist the cancelled-match summary event + re-sync posterior matches whose
  // delta changed (kills the phantom flood on the next finalization). No
  // per-event broadcast — a single mmr_recap_ready ping below makes clients
  // refetch all pending events as one grouped recap.
  await mmrAnimationEventService
    .persistCancellationEvents(matchId, tournamentId, mmrChanges)
    .catch((err) => logger.error({ err }, '[Worker] cancellation animation event failed'));
  await mmrAnimationEventService
    .persistRecalcEvents(tournamentId, [...mmrChanges.keys()])
    .catch((err) => logger.error({ err }, '[Worker] cascade recalc animation event failed'));

  // MMR history (incl. streak snapshots) is now rebuilt for every affected
  // player — reconcile their badges (revoke now-invalid, award newly-valid).
  await badgeReconciliationService
    .reconcilePlayers(tournamentId, [...mmrChanges.keys()])
    .catch((err) => logger.error({ err }, '[Worker] badge reconciliation failed'));

  await refreshRankedCaches(tournamentId);

  webSocketService.broadcastToTournament(tournamentId, {
    event: 'mmr_recap_ready',
    data: { seasonId: tournamentId, tournamentId },
  });
  webSocketService.broadcastToTournament(tournamentId, {
    event: 'leaderboard_updated',
    data: { seasonId: tournamentId },
  });

  logger.info({ matchId, tournamentId }, '[Worker] cancel_match_mmr done');
};

/**
 * Replays a corrected result. No rules re-evaluation: the message written for the
 * old result is dropped, and badges are reconciled against the new history.
 */
const correctMatchMmr: Task = async (rawPayload) => {
  const { matchId, tournamentId } = rawPayload as FinalizeMmrPayload;
  logger.info({ matchId, tournamentId }, '[Worker] correct_match_mmr start');

  const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId);
  const match = await matchRepository.getByIdSimple(matchId);
  // A match cancelled since its correction is replayed by its cancellation job.
  if (!rankedConfig || match?.status !== 'finalized' || !match.playedAt) return;

  const mmrChanges = await mmrCalculationService.cascadeRecalculateAfterCorrection(
    matchId,
    tournamentId,
    match.playedAt,
  );
  const directPlayerIds = [...mmrChanges].filter(([, c]) => c.reason === 'match_corrected').map(([id]) => id);
  await syncCorrectionAftermath(matchId, tournamentId, [...mmrChanges.keys()], directPlayerIds);

  await refreshRankedCaches(tournamentId);
  broadcastCorrectionRecap(tournamentId, directPlayerIds);
  await regenerateRewindIfFinished(tournamentId);

  logger.info({ matchId, tournamentId }, '[Worker] correct_match_mmr done');
};

/**
 * The match's own players get their event for it rewritten first. Then every player
 * the replay reached — the match's own included, whose later matches moved too —
 * gets the usual per-match differentials, which skip the corrected match since its
 * row is already in step.
 */
async function syncCorrectionAftermath(
  matchId: string,
  tournamentId: string,
  playerIds: string[],
  directPlayerIds: string[],
): Promise<void> {
  await mmrAnimationEventService
    .persistCorrectionEvents(matchId, tournamentId, directPlayerIds)
    .catch((err) => logger.error({ err }, '[Worker] correction animation event failed'));
  await mmrAnimationEventService
    .persistRecalcEvents(tournamentId, playerIds)
    .catch((err) => logger.error({ err }, '[Worker] correction recalc animation event failed'));
  await badgeReconciliationService
    .reconcilePlayers(tournamentId, playerIds)
    .catch((err) => logger.error({ err }, '[Worker] correction badge reconciliation failed'));
}

/**
 * The recap ping goes to the tournament's subscribers and, directly, to the match's
 * own players who are not among them: the match page they are likely looking at
 * does not subscribe, and a subscribed one must not refetch twice.
 */
function broadcastCorrectionRecap(tournamentId: string, directPlayerIds: string[]): void {
  const recap = { event: 'mmr_recap_ready', data: { seasonId: tournamentId, tournamentId } };
  webSocketService.broadcastToTournament(tournamentId, recap);
  for (const playerId of directPlayerIds) {
    if (!webSocketService.isSubscribedToTournament(tournamentId, playerId)) {
      webSocketService.send(playerId, recap);
    }
  }
  webSocketService.broadcastToTournament(tournamentId, {
    event: 'leaderboard_updated',
    data: { seasonId: tournamentId },
  });
}

const reconcilePendingBadges: Task = async (rawPayload) => {
  const { force } = (rawPayload ?? {}) as { force?: boolean };
  logger.info({ force }, '[Worker] reconcile_pending_badges start');
  const result = await badgeReconciliationService.runPendingReconciliation(!!force);
  logger.info({ force, ran: result.ran }, '[Worker] reconcile_pending_badges done');
};

async function refreshRankedCaches(tournamentId: string): Promise<void> {
  await rankedSeasonService
    .computeAndCacheOfficial(tournamentId)
    .catch((err) => logger.error({ err }, '[Worker] official cache refresh failed'));
  await rankedSeasonService
    .computeAndCacheProvisional(tournamentId)
    .catch((err) => logger.error({ err }, '[Worker] provisional cache refresh failed'));
}

const recalculateSeasonMmr: Task = async (rawPayload) => {
  const { tournamentId } = rawPayload as { tournamentId: string };
  logger.info({ tournamentId }, '[Worker] recalculate_season_mmr start');

  const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId);
  if (!rankedConfig) {
    // Nothing to replay, but a propagation may still be waiting on the marker.
    await tournamentRulesetRepository.setRecalcPending(tournamentId, null);
    return;
  }

  try {
    await runSeasonRecalculation(tournamentId);
  } finally {
    // Cleared whatever happened: a marker left behind would keep the
    // "recalculation running" banner up forever.
    await tournamentRulesetRepository
      .setRecalcPending(tournamentId, null)
      .catch((err) => logger.error({ err, tournamentId }, '[Worker] clearing recalc marker failed'));
  }
};

async function runSeasonRecalculation(tournamentId: string): Promise<void> {
  const players = await playerMmrRepository.getAllPlayersBySeasonId(tournamentId);

  await mmrCalculationService.recalculateSeasonMmrDeterministic(tournamentId);

  // History was rebuilt: re-sync animation events for the matches whose MMR
  // actually changed (no need to wait for a new match). Batched, no per-event
  // broadcast — a single mmr_recap_ready ping makes clients refetch as one
  // grouped recap.
  await mmrAnimationEventService
    .persistRecalcEvents(tournamentId, players.map((p) => p.playerId))
    .catch((err) => logger.error({ err }, '[Worker] recalc animation event failed'));

  await refreshRankedCaches(tournamentId);

  webSocketService.broadcastToTournament(tournamentId, {
    event: 'mmr_recap_ready',
    data: { seasonId: tournamentId, tournamentId },
  });
  webSocketService.broadcastToTournament(tournamentId, {
    event: 'leaderboard_updated',
    data: { seasonId: tournamentId },
  });

  // A finished season's rewind was computed from the MMR we just rewrote, so it
  // no longer matches reality. Rebuild it — the upsert keeps every player's
  // promotion window and viewed state.
  await regenerateRewindIfFinished(tournamentId);

  logger.info({ tournamentId, playerCount: players.length }, '[Worker] recalculate_season_mmr done');
}

async function regenerateRewindIfFinished(seasonId: string): Promise<void> {
  const season = await tournamentRepository.getById(seasonId);
  if (season?.status !== 'finished') return;
  await enqueueSeasonRewindGeneration(seasonId);
}

const generateSeasonRewind: Task = async (rawPayload) => {
  const { seasonId } = rawPayload as { seasonId: string };
  logger.info({ seasonId }, '[Worker] generate_season_rewind start');

  await seasonRewindService.generateForSeason(seasonId);

  webSocketService.broadcastToTournament(seasonId, {
    event: 'rewind_ready',
    data: { seasonId },
  });

  logger.info({ seasonId }, '[Worker] generate_season_rewind done');
};

const refreshRewindIdentities: Task = async (rawPayload) => {
  const { playerIds } = rawPayload as { playerIds: string[] };
  logger.info({ players: playerIds.length }, '[Worker] refresh_rewind_identities start');

  await seasonRewindService.refreshPlayerIdentities(playerIds);

  logger.info({ players: playerIds.length }, '[Worker] refresh_rewind_identities done');
};

/**
 * A job names its subject by id, and that subject can be gone by the time the
 * job runs — a season deleted, a database reset under a queue that survived it.
 * Graphile reads every throw as transient and would replay such a job its full
 * 25 attempts, hours of log noise for a failure that was final on the first try.
 * A missing subject ends the job instead; every other error still bubbles up and
 * keeps its retries.
 */
function dropWhenSubjectIsGone(name: string, task: Task): Task {
  return async (payload, helpers) => {
    try {
      await task(payload, helpers);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      logger.warn({ err, payload, task: name }, '[Worker] subject no longer exists, job dropped');
    }
  };
}

const tasks = {
  finalize_match_mmr: finalizeMatchMmr,
  cancel_match_mmr: cancelMatchMmr,
  correct_match_mmr: correctMatchMmr,
  recalculate_season_mmr: recalculateSeasonMmr,
  reconcile_pending_badges: reconcilePendingBadges,
  generate_season_rewind: generateSeasonRewind,
  refresh_rewind_identities: refreshRewindIdentities,
};

export const taskList = Object.fromEntries(
  Object.entries(tasks).map(([name, task]) => [name, dropWhenSubjectIsGone(name, task)]),
) as typeof tasks;
