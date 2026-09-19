import { rankedSeasonRolloverService } from "../services/ranked-season-rollover.service";
import { logger } from "../utils/logger";

/**
 * Closes every ranked season whose term has passed and opens its successor.
 *
 * Run hourly by the scheduler. Also picks up chains left half-rolled by an interrupted run,
 * so a restart repairs itself rather than stalling.
 */
export async function rolloverRankedSeasonsJob() {
  try {
    logger.info("[SeasonRollover] Starting rollover job...");

    const result = await rankedSeasonRolloverService.rolloverDue();

    logger.info(
      { rolledOver: result.rolledOver.length, failed: result.failed.length },
      "[SeasonRollover] Job completed:",
    );

    return result;
  } catch (error) {
    logger.error({ err: error }, "[SeasonRollover] Error during rollover:");
    throw error;
  }
}

/**
 * Run the job immediately (for testing or manual trigger)
 */
if (import.meta.main) {
  logger.info("Running ranked season rollover job manually...");
  rolloverRankedSeasonsJob()
    .then((result) => {
      logger.info({ result }, "Job completed successfully:");
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, "Job failed:");
      process.exit(1);
    });
}
