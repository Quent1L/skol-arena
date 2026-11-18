import { voteService } from "../services/vote.service";
import { logger } from "../utils/logger";

/** Freezes the MVP of every match whose 48h vote window closed, for the stats. */
export async function freezeMvpJob() {
  const frozen = await voteService.freezeClosedMatches();
  if (frozen > 0) logger.info({ frozen }, "[Freeze-MVP] MVP frozen");
  return { frozen };
}
