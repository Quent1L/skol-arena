import { tournamentRulesetRepository } from "../repository/tournament-ruleset.repository";
import { standingsService, PROVISIONAL_MATCH_STATUSES } from "./standings.service";
import { playerStatsService } from "./player-stats.service";
import { enqueueMmrSeasonRecalculation } from "./mmr-job-queue.service";
import { logger } from "../utils/logger";
import { BadRequestError, ErrorCode } from "../types/errors";
import { rulesetsEqual } from "@skol-arena/shared/types/index";
import type {
  ImpactedCompetition,
  PropagationResult,
} from "@skol-arena/shared/types/index";

/**
 * Pushing a discipline edit onto competitions that are still running.
 *
 * Editing a discipline changes nothing on its own any more — every competition
 * reads its own snapshot. This is the one path that moves a snapshot after the
 * competition opened, and it always recalculates in the same breath, so a
 * competition is never left half under the old ruleset and half under the new.
 *
 * Finished competitions are never targets: their ruleset is history.
 */
export class RulesetPropagationService {
  /**
   * Non-finished competitions using this discipline, each with how many results
   * have already been entered and whether its snapshot has actually drifted from
   * the live discipline.
   */
  async listImpactedCompetitions(disciplineId: string): Promise<ImpactedCompetition[]> {
    const targets = await tournamentRulesetRepository.listPropagationTargets(
      disciplineId,
      PROVISIONAL_MATCH_STATUSES,
    );

    return await Promise.all(
      targets.map(async (target) => {
        const fresh = await tournamentRulesetRepository.buildPayloadForTournament(
          target.id,
          disciplineId,
        );
        return {
          id: target.id,
          name: target.name,
          mode: target.mode,
          status: target.status,
          matchCount: target.matchCount,
          hasDrift: !target.payload || !rulesetsEqual(target.payload, fresh),
        };
      }),
    );
  }

  /**
   * Applies the current discipline to the chosen competitions and recalculates
   * each. One failing target must not abort the rest, so results are reported
   * per competition rather than thrown.
   */
  async propagate(disciplineId: string, tournamentIds: string[]): Promise<PropagationResult[]> {
    const results: PropagationResult[] = [];

    for (const tournamentId of tournamentIds) {
      results.push(await this.propagateOne(tournamentId, disciplineId));
    }

    return results;
  }

  private async propagateOne(
    tournamentId: string,
    disciplineId: string,
  ): Promise<PropagationResult> {
    try {
      // Re-checked server-side: the dialog the ids came from may have been open
      // while the competition finished or changed discipline.
      const context = await tournamentRulesetRepository.getSnapshotContext(tournamentId);
      if (context?.disciplineId !== disciplineId) {
        throw new BadRequestError(ErrorCode.DISCIPLINE_MISMATCH);
      }
      if (context.status === "finished") {
        throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
      }

      const payload = await tournamentRulesetRepository.buildPayloadForTournament(
        tournamentId,
        disciplineId,
      );
      await tournamentRulesetRepository.upsert(tournamentId, payload);
      await tournamentRulesetRepository.setRecalcPending(tournamentId, new Date());

      if (context.mode === "ranked") {
        // Async: the worker clears the pending marker when the replay lands.
        await enqueueMmrSeasonRecalculation(tournamentId);
        return { tournamentId, status: "recalculating" };
      }

      // Points and stats recompute synchronously, so the marker can go straight away.
      await standingsService.recalculatePointsInternal(tournamentId);
      await playerStatsService.invalidateCacheForTournament(tournamentId);
      await tournamentRulesetRepository.setRecalcPending(tournamentId, null);
      return { tournamentId, status: "recalculated" };
    } catch (err) {
      logger.error({ err, tournamentId, disciplineId }, "[Ruleset] propagation failed");
      await tournamentRulesetRepository
        .setRecalcPending(tournamentId, null)
        .catch(() => undefined);
      return {
        tournamentId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const rulesetPropagationService = new RulesetPropagationService();
