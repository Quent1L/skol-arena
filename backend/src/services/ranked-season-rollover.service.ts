import {
  renderSeasonName,
  type CreateRankedSeasonInput,
} from "@skol-arena/shared/types/index";
import {
  rankedSeasonAutomationRepository,
  type DueAutomation,
  type RankedSeasonAutomationRow,
} from "../repository/ranked-season-automation.repository";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { participantRepository } from "../repository/participant.repository";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { rankedSeasonService, seasonTerm } from "./ranked-season.service";
import { webSocketService } from "./websocket.service";
import { BadRequestError, NotFoundError, ErrorCode } from "../types/errors";
import { logger } from "../utils/logger";

/** Guard on the ` (2)`, ` (3)`… disambiguation, so a pathological template cannot spin. */
const MAX_NAME_ATTEMPTS = 50;

export interface RolloverOutcome {
  seasonId: string;
  nextSeasonId: string;
  carriedParticipants: number;
}

export interface RolloverReport {
  rolledOver: RolloverOutcome[];
  failed: { seasonId: string; error: string }[];
}

/**
 * Chains one ranked season into the next without an admin in the loop.
 *
 * The order below is forced by two existing rules, not by preference:
 * `runCreateSeason` refuses while the discipline still has an open/ongoing season, and the MMR
 * seeds may only be drawn from a source that is already `finished`. So the old season must close
 * first, which leaves the discipline with no active season for the few seconds the rollover
 * takes — matches cannot be created in that window. Every step past the close is replayable, and
 * `nextSeasonId` records completion, so a crash mid-rollover is resumed on the next tick.
 */
export class RankedSeasonRolloverService {
  /** Every chain whose term has passed. One failure never stops the others. */
  async rolloverDue(now: Date = new Date()): Promise<RolloverReport> {
    const due = await rankedSeasonAutomationRepository.listDue(now);
    const report: RolloverReport = { rolledOver: [], failed: [] };

    for (const entry of due) {
      try {
        report.rolledOver.push(await this.rolloverOne(entry));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ err, seasonId: entry.season.id }, "[SeasonRollover] failed");
        await rankedSeasonAutomationRepository.recordError(entry.season.id, error);
        report.failed.push({ seasonId: entry.season.id, error });
      }
    }
    return report;
  }

  /**
   * The admin's "chain it now" button. Same path as the scheduled run, so an early rollover and
   * a due one cannot drift apart; only the permission gate and the "is there a chain at all"
   * check are extra.
   */
  async rolloverNow(seasonId: string, userId: string) {
    await rankedSeasonService.assertCanManage(userId);

    const season = await rankedSeasonRepository.getSeasonWithConfig(seasonId);
    if (!season) throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);

    const automation =
      await rankedSeasonAutomationRepository.getByTournamentId(seasonId);
    if (!automation) {
      throw new NotFoundError(ErrorCode.SEASON_AUTOMATION_NOT_FOUND);
    }
    // Already chained, or never started: neither has a successor to produce. A draft in
    // particular would slip past the "one active season per discipline" guard and leave the
    // discipline with two.
    if (automation.nextSeasonId || season.status !== "ongoing") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }

    const { nextSeasonId } = await this.rolloverOne({ automation, season });
    return await rankedSeasonRepository.getSeasonWithConfig(nextSeasonId);
  }

  async rolloverOne({ automation, season }: DueAutomation): Promise<RolloverOutcome> {
    if (season.status === "ongoing") {
      await rankedSeasonService.runEndSeason(season.id);
    }

    // Every ranked season is created with one, but the column is nullable and the whole
    // carry-over (ladder source, MMR source, "one active season") is scoped by discipline.
    if (!season.disciplineId) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }

    const input = await this.buildNextInput(season, automation);
    const created = await rankedSeasonService.runCreateSeason(input, season.createdBy);
    const nextSeasonId = created.tournament.id;

    // Claimed before the rest so a second scheduler racing this chain cannot create a
    // duplicate successor; whoever loses the claim leaves the season it just made behind
    // rather than compounding the mistake.
    const claimed = await rankedSeasonAutomationRepository.markRolledOver(
      season.id,
      nextSeasonId,
    );
    if (!claimed) {
      throw new BadRequestError(ErrorCode.SEASON_ALREADY_ACTIVE);
    }

    // Before the start, deliberately. Should starting fail, the successor still carries the
    // chain, so the admin pressing Start on the leftover draft resumes it — `runStartSeason`
    // reads the automation to set the term. The other order kills the chain silently.
    await rankedSeasonAutomationRepository.createForSuccessor(nextSeasonId, automation);

    // Sets the successor's end date and schedules the next rollover from the automation above.
    await rankedSeasonService.runStartSeason(nextSeasonId);

    const carriedParticipants = automation.carryParticipants
      ? await this.carryParticipants(season.id, nextSeasonId, automation)
      : 0;

    webSocketService.broadcastToTournament(season.id, {
      event: "season_rolled_over",
      data: { seasonId: season.id, nextSeasonId },
    });
    logger.info(
      { seasonId: season.id, nextSeasonId, carriedParticipants },
      "[SeasonRollover] season chained",
    );

    return { seasonId: season.id, nextSeasonId, carriedParticipants };
  }

  /**
   * The successor's settings: the closing season cloned, then the carry-over switches applied.
   * The two "source" ids point at the season that just closed, which is what makes the existing
   * ladder copy and MMR soft reset do their work — no new mechanism is introduced here.
   */
  private async buildNextInput(
    season: DueAutomation["season"],
    automation: RankedSeasonAutomationRow,
  ): Promise<CreateRankedSeasonInput> {
    const config = await rankedSeasonRepository.getConfigByTournamentId(season.id);
    const startDate = new Date().toISOString().slice(0, 10);
    const { endDate } = seasonTerm(startDate, automation.durationDays);

    return {
      name: await this.resolveUniqueName(
        automation.nameTemplate,
        automation.seasonNumber + 1,
      ),
      ...(season.description && { description: season.description }),
      disciplineId: season.disciplineId as string,
      startDate,
      endDate,
      minTeamSize: season.minTeamSize,
      maxTeamSize: season.maxTeamSize,
      rulesId: season.rulesId,
      organizationId: season.organizationId,
      scoreEnabled: season.scoreEnabled,
      minScore: season.minScore,
      maxScore: season.maxScore,
      allowDraw: season.allowDraw ?? true,
      validationMode: season.validationMode,
      validationTimerHours: season.validationTimerHours,
      baseMmr: config?.baseMmr ?? 1000,
      kFactor: config?.kFactor ?? 32,
      placementMatches: config?.placementMatches ?? 5,
      allowAsymmetricMatches: config?.allowAsymmetricMatches ?? false,
      usePreviousMmr: automation.carryMmr,
      softResetFactor: automation.softResetFactor,
      sourceMmrSeasonId: automation.carryMmr ? season.id : null,
      sourceTierSeasonId: automation.carryTiers ? season.id : null,
      tierScalingMode: automation.tierScalingMode,
    };
  }

  /** `tournaments.name` is UNIQUE, so the rendered template has to be probed before use. */
  private async resolveUniqueName(
    template: string,
    seasonNumber: number,
  ): Promise<string> {
    const base = renderSeasonName(template, seasonNumber);
    for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt++) {
      const candidate = attempt === 1 ? base : `${base} (${attempt})`;
      if (!(await rankedSeasonRepository.existsByName(candidate))) return candidate;
    }
    throw new BadRequestError(ErrorCode.SEASON_NAME_COLLISION);
  }

  /**
   * Re-registers last season's players into the new one.
   *
   * This is the whole point of the feature from a player's perspective: the match creation form
   * builds its player picker from `tournament_participants`, so without this a brand-new season
   * starts with an empty picker and nobody can create the first match.
   *
   * No `player_mmr` row is created — a seeded player must stay out of the leaderboard, the tier
   * percentiles and the rewind until they have actually played.
   */
  private async carryParticipants(
    fromSeasonId: string,
    toSeasonId: string,
    automation: RankedSeasonAutomationRow,
  ): Promise<number> {
    const eligible = await this.eligibleParticipantIds(fromSeasonId, automation);
    let carried = 0;

    for (const playerId of eligible) {
      try {
        await participantRepository.createParticipation(playerId, toSeasonId);
        carried++;
      } catch (err) {
        // One player failing to carry over is not worth losing the rollover: they can still
        // join, and their first match would register them anyway.
        logger.error({ err, playerId, toSeasonId }, "[SeasonRollover] carry-over failed");
      }
    }
    return carried;
  }

  private async eligibleParticipantIds(
    fromSeasonId: string,
    automation: RankedSeasonAutomationRow,
  ): Promise<string[]> {
    const participants =
      await participantRepository.findTournamentParticipants(fromSeasonId);
    const ids = participants.map((row) => row.userId);
    if (automation.participantsMinMatches <= 0) return ids;

    const played = await playerMmrRepository.getAllPlayersBySeasonId(fromSeasonId);
    const active = new Set(
      played
        .filter((row) => row.matchesPlayed >= automation.participantsMinMatches)
        .map((row) => row.playerId),
    );
    return ids.filter((id) => active.has(id));
  }
}

export const rankedSeasonRolloverService = new RankedSeasonRolloverService();
