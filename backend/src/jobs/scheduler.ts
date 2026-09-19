import { withAdvisoryLock } from './advisory-lock';
import { autoFinalizeMatchesJob } from './auto-finalize-matches.job';
import { pruneNotificationsJob } from './prune-notifications.job';
import { rolloverRankedSeasonsJob } from './rollover-ranked-seasons.job';
import { getPool } from '../config/database';
import { enqueueBadgeReconciliation } from '../services/mmr-job-queue.service';
import { logger } from '../utils/logger';

const LOCK_KEYS = {
  AUTO_FINALIZE: 1,
  PRUNE_NOTIFICATIONS: 2,
  ROLLOVER_SEASONS: 3,
} as const;

export function startJobScheduler(): { stop(): void } {
  const job = Bun.cron('0 * * * *', async () => {
    try {
      const lockResult = await withAdvisoryLock(
        getPool(),
        LOCK_KEYS.AUTO_FINALIZE,
        () => autoFinalizeMatchesJob()
      );
      if (!lockResult.ran) {
        logger.info('[Scheduler] auto-finalize skipped — lock held by another instance');
      }
    } catch (err) {
      logger.error({ err }, '[Scheduler] auto-finalize error');
    } finally {
      Bun.gc(true);
    }
  });

  // Chained ranked seasons, on the half hour rather than on the hour: the auto-finalize above
  // has to settle the pending matches of a season before its rollover freezes the standings.
  const rolloverJob = Bun.cron('30 * * * *', async () => {
    try {
      const lockResult = await withAdvisoryLock(
        getPool(),
        LOCK_KEYS.ROLLOVER_SEASONS,
        () => rolloverRankedSeasonsJob()
      );
      if (!lockResult.ran) {
        logger.info('[Scheduler] season rollover skipped — lock held by another instance');
      }
    } catch (err) {
      logger.error({ err }, '[Scheduler] season rollover error');
    }
  });

  // Nightly badge reconciliation: enqueue a worker job (deduped by job key).
  // The worker only runs a full recompute if a badge rule changed (dirty flag).
  const badgeJob = Bun.cron('0 3 * * *', async () => {
    try {
      await enqueueBadgeReconciliation(false);
      logger.info('[Scheduler] nightly badge reconciliation enqueued');
    } catch (err) {
      logger.error({ err }, '[Scheduler] badge reconciliation enqueue error');
    }
  });

  // Nightly retention sweep: a feed nobody ever clears would otherwise grow without end.
  const pruneJob = Bun.cron('30 3 * * *', async () => {
    try {
      const lockResult = await withAdvisoryLock(
        getPool(),
        LOCK_KEYS.PRUNE_NOTIFICATIONS,
        () => pruneNotificationsJob()
      );
      if (!lockResult.ran) {
        logger.info('[Scheduler] notification prune skipped — lock held by another instance');
      }
    } catch (err) {
      logger.error({ err }, '[Scheduler] notification prune error');
    }
  });

  logger.info(
    '[Scheduler] Bun.cron started (auto-finalize hourly, ranked season rollover hourly at :30, badge reconciliation nightly at 03:00, notification prune at 03:30)'
  );
  return {
    stop() {
      job.stop();
      rolloverJob.stop();
      badgeJob.stop();
      pruneJob.stop();
    },
  };
}
