import { eq, and, inArray } from "drizzle-orm";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { mmrSeedRepository } from "../repository/mmr-seed.repository";
import type {
  SeasonMmrStatsRow,
  PlayerCareerMmrStatsRow,
} from "../repository/player-mmr.repository";
import { tournamentRepository } from "../repository/tournament.repository";
import { userRepository } from "../repository/user.repository";
import { rankedCacheRepository } from "../repository/ranked-cache.repository";
import { seasonRewindRepository } from "../repository/season-rewind.repository";
import {
  calculateMatchMmr,
  toEnginePlayers,
  type EnginePlayer,
} from "./mmr-engine";
import {
  enqueueMmrSeasonRecalculation,
  enqueueSeasonRewindGeneration,
} from "./mmr-job-queue.service";
import { tournamentRulesetService } from "./tournament-ruleset.service";
import { tournamentRulesetRepository } from "../repository/tournament-ruleset.repository";
import { matchRepository } from "../repository/match.repository";
import { logger } from "../utils/logger";
import { db } from "../config/database";
import { matches, appUsers } from "../db/schema";
import {
  indexRulesetOutcomes,
  resolveRulesetInteractionMode,
  REWIND_VERSION,
  RULESET_OUTCOME_DEFAULTS,
} from "@skol-arena/shared/types/index";
import type {
  CreateRankedSeasonInput,
  UpdateRankedSeasonInput,
  CreateRankTierInput,
  UpdateRankTierInput,
  ClientPlayerMmr,
  ClientRankTier,
  ClientSeasonMmrPlayer,
  PlayerCareerSeason,
  TournamentStatus,
  WeeklyMmrLeader,
  WeeklyMmrLeaders,
  TierScalingMode,
  TeamInteractionMode,
  RulesetOutcomeType,
} from "@skol-arena/shared/types/index";
import {
  ErrorCode,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} from "../types/errors";

type ProvisionalOutcome = "win" | "loss" | "draw";
type MatchResult = 1 | 0 | 0.5;
type SeasonPlayers = Awaited<ReturnType<typeof playerMmrRepository.getBySeasonOrdered>>;

interface ProvisionalReplayCtx {
  baseMmr: number;
  kFactor: number;
  placementMatches: number;
  /** Carried-over entry MMR: the starting point of a player with no match yet. */
  entryMmr: Map<string, number>;
  provisionalMmr: Map<string, number>;
  provisionalResults: Map<string, { outcome: ProvisionalOutcome }[]>;
  /** Matches played so far, advanced during the replay so placement stays right. */
  matchesPlayed: Map<string, number>;
  /** Season ruleset, resolved once: the replay must price matches like finalization does. */
  outcomes: Map<string, RulesetOutcomeType>;
  interactionMode: TeamInteractionMode;
}

function entryMmrOf(playerId: string, ctx: ProvisionalReplayCtx): number {
  return ctx.entryMmr.get(playerId) ?? ctx.baseMmr;
}

function toReplayPlayers(ids: string[], ctx: ProvisionalReplayCtx): EnginePlayer[] {
  return toEnginePlayers(ids, ctx.placementMatches, (id) => ({
    mmr: ctx.provisionalMmr.get(id) ?? entryMmrOf(id, ctx),
    matchesPlayed: ctx.matchesPlayed.get(id) ?? 0,
  }));
}

export const TOP_WEEKLY_GAINERS = 3;
export const TOP_WEEKLY_LOSERS = 3;

// Splits per-player net MMR variations into the best climbers and the biggest
// drops. Players who broke even over the window belong to neither list.
export function splitWeeklyMmrLeaders(
  rows: WeeklyMmrLeader[],
  topGainers = TOP_WEEKLY_GAINERS,
  topLosers = TOP_WEEKLY_LOSERS,
): { gainers: WeeklyMmrLeader[]; losers: WeeklyMmrLeader[] } {
  const gainers = rows
    .filter((r) => r.mmrGained > 0)
    .sort((a, b) => b.mmrGained - a.mmrGained)
    .slice(0, topGainers);
  const losers = rows
    .filter((r) => r.mmrGained < 0)
    .sort((a, b) => a.mmrGained - b.mmrGained)
    .slice(0, topLosers);
  return { gainers, losers };
}

// Joins the season MMR aggregates onto the leaderboard rows, which already carry the
// player relation. Players missing from `stats` are dropped: they sit under the
// placement threshold, or have no history row at all. Left unsorted on purpose — the
// ranking metric depends on the view the client is showing.
export function mergeSeasonMmrStats(
  players: ClientPlayerMmr[],
  stats: SeasonMmrStatsRow[],
): ClientSeasonMmrPlayer[] {
  const byPlayer = new Map(stats.map((s) => [s.playerId, s]));
  return players.flatMap((player) => {
    const stat = byPlayer.get(player.playerId);
    if (!stat) return [];
    return [{ ...player, peakMmr: stat.peakMmr, avgMmr: stat.avgMmr }];
  });
}

/** The season metadata a career row is assembled from, as read in batch. */
export interface CareerSeasonRef {
  id: string;
  name: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  discipline: { id: string; name: string; icon: string | null } | null;
}

export interface CareerPlayerMmrRef {
  seasonId: string;
  currentMmr: number;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Joins the per-season MMR aggregates onto the season metadata, the season's own
 * ladder and the player's closing record.
 *
 * Driven by `stats`, not by `seasons`: a season only belongs to a career once the
 * player has a rated match in it. A season the aggregates cover but the batch reads
 * did not return is dropped — it was deleted between the two queries.
 *
 * Seasons under the placement threshold are kept and flagged rather than filtered,
 * unlike the season leaderboard: they are still part of the player's history.
 */
export function buildPlayerCareer(
  stats: PlayerCareerMmrStatsRow[],
  seasons: CareerSeasonRef[],
  tiers: ClientRankTier[],
  mmrRows: CareerPlayerMmrRef[],
  placementBySeason: Map<string, number>,
): PlayerCareerSeason[] {
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const mmrBySeason = new Map(mmrRows.map((row) => [row.seasonId, row]));
  const tiersBySeason = new Map<string, ClientRankTier[]>();
  for (const tier of tiers) {
    const list = tiersBySeason.get(tier.seasonId) ?? [];
    list.push(tier);
    tiersBySeason.set(tier.seasonId, list);
  }

  return stats.flatMap((stat) => {
    const season = seasonById.get(stat.seasonId);
    if (!season) return [];
    const record = mmrBySeason.get(stat.seasonId);
    const placementMatches = placementBySeason.get(stat.seasonId) ?? 0;

    return [
      {
        seasonId: season.id,
        seasonName: season.name,
        seasonStatus: season.status,
        startDate: season.startDate,
        endDate: season.endDate,
        discipline: season.discipline,
        peakMmr: stat.peakMmr,
        avgMmr: stat.avgMmr,
        entryMmr: stat.entryMmr,
        // A player with history but no player_mmr row cannot happen through the
        // normal path — both are written by the same replay — but a half-applied
        // recalculation should degrade to the entry MMR, not to zero.
        finalMmr: record?.currentMmr ?? stat.entryMmr,
        matchesPlayed: stat.matchesPlayed,
        wins: record?.wins ?? 0,
        losses: record?.losses ?? 0,
        draws: record?.draws ?? 0,
        placementMatches,
        placementsComplete: stat.matchesPlayed >= placementMatches,
        tiers: tiersBySeason.get(season.id) ?? [],
      } as PlayerCareerSeason,
    ];
  });
}

// Median MMR of a season, the anchor a soft reset compresses towards. The median
// rather than the mean because a handful of runaway players must not drag the
// whole ladder's reset point up with them. Null for an empty season.
export function medianMmr(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Soft reset: keep `factor` of the player's distance to the previous season's
// median, re-centred on the new season's baseMmr. Anchoring on the source
// distribution instead of baseMmr is what makes the reset meaningful — tiers are
// percentiles, so absolute MMR values drift from one season to the next and the
// same absolute formula would push everyone up or down depending on how far the
// previous ladder had spread.
export function computeSoftResetMmr(input: {
  mmr: number;
  anchor: number;
  baseMmr: number;
  factor: number;
}): number {
  const { mmr, anchor, baseMmr, factor } = input;
  return Math.max(1, Math.round(baseMmr + (mmr - anchor) * factor));
}

/**
 * Rebuilds the MMR thresholds of a ladder from a distribution of the source
 * season, then maps them onto the new season's scale with `transform` — the same
 * transform the player seeds go through, so a player who ended N-1 in the top
 * `1 - percentile` starts the new season in that very tier.
 *
 * `percentile` 0 marks the bottom tier: it is a floor, not a cut. It lands under
 * the weakest player of the distribution *and* under `floorBase` — pass the
 * lowest MMR anyone can enter the season with, so nobody starts outside the
 * ladder.
 */
export function computePercentileLadder<T extends { level: number; percentile: number }>(
  tiers: T[],
  values: number[],
  floorBase: number,
  transform: (mmr: number) => number,
): Map<number, number> {
  const result = new Map<number, number>();
  if (values.length === 0) return result;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const floor = Math.min(floorBase, transform(sorted[0]));

  for (const tier of tiers) {
    if (tier.percentile === 0) {
      result.set(tier.level, floor);
      continue;
    }
    const cut = sorted[Math.floor(n * tier.percentile)] ?? sorted[n - 1];
    result.set(tier.level, Math.max(floor, transform(cut)));
  }
  return result;
}

// Monday 00:00 UTC of the week containing `now`. Only a fallback: clients send
// their own local week boundary so the profile tile and this ranking agree.
export function startOfWeekUtc(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function countLeadingWins(results: { outcome: string }[]): number {
  let n = 0
  for (const r of results) { if (r.outcome === 'win') n++; else break }
  return n
}

function loadUnfinalizedMatches(seasonId: string) {
  return db.query.matches.findMany({
    where: and(
      eq(matches.tournamentId, seasonId),
      inArray(matches.status, ["reported", "disputed"]),
    ),
    // outcomeTypeId only: what it is worth comes from the season snapshot.
    columns: { id: true, winnerSide: true, playedAt: true, outcomeTypeId: true },
    with: {
      sides: {
        orderBy: (s, { asc }) => [asc(s.position)],
        columns: { position: true, score: true },
        with: {
          entry: {
            columns: { id: true },
            with: { players: { columns: { playerId: true } } },
          },
        },
      },
    },
    orderBy: (m, { asc }) => [asc(m.playedAt)],
  });
}

type UnfinalizedMatch = Awaited<ReturnType<typeof loadUnfinalizedMatches>>[number];

function sideResult(winnerSide: string | null, side: "A" | "B"): MatchResult {
  if (winnerSide === "A") return side === "A" ? 1 : 0;
  if (winnerSide === "B") return side === "B" ? 1 : 0;
  return 0.5;
}

function resultToOutcome(result: MatchResult): ProvisionalOutcome {
  if (result === 1) return "win";
  if (result === 0) return "loss";
  return "draw";
}

/** Today as `YYYY-MM-DD`, the shape the season date columns are stored in. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Latest of two `YYYY-MM-DD` days — that format orders correctly as a string. */
function laterIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * Frozen the moment the season starts.
 *
 * The tier source and its scaling mode are read exactly once, by `startSeason`,
 * to lay down the ladder's thresholds — changing them later would say nothing.
 * The discipline and the team sizes are what every entered match was built on.
 */
const SEASON_LOCKED_FIELDS = new Set([
  "disciplineId",
  "minTeamSize",
  "maxTeamSize",
  "sourceTierSeasonId",
  "tierScalingMode",
]);

/** Scoring semantics: correctable until a result exists, meaningless to change after. */
const SEASON_SCORE_FIELDS = new Set(["scoreEnabled", "minScore", "maxScore", "allowDraw"]);

/** Knobs that change what every past match of the season was worth. */
const SEASON_MMR_FIELDS = [
  "baseMmr",
  "kFactor",
  "placementMatches",
  "usePreviousMmr",
  "softResetFactor",
  "sourceMmrSeasonId",
] as const;

type SeasonWithConfig = NonNullable<
  Awaited<ReturnType<typeof rankedSeasonRepository.getSeasonWithConfig>>
>;

/** The value a locked field currently holds, wherever it is stored. */
function currentSeasonValue(season: SeasonWithConfig, field: string): unknown {
  switch (field) {
    case "disciplineId":
      return season.disciplineId;
    case "minTeamSize":
      return season.minTeamSize;
    case "maxTeamSize":
      return season.maxTeamSize;
    case "scoreEnabled":
      return season.scoreEnabled;
    case "minScore":
      return season.minScore;
    case "maxScore":
      return season.maxScore;
    case "allowDraw":
      return season.allowDraw;
    case "sourceTierSeasonId":
      return season.rankedConfig?.sourceTierSeasonId;
    case "tierScalingMode":
      return season.rankedConfig?.tierScalingMode;
    default:
      return undefined;
  }
}

/** `null` and `undefined` both mean "not set" across the form, the API and the row. */
function isSameSeasonValue(submitted: unknown, current: unknown): boolean {
  if (submitted == null && current == null) return true;
  return submitted === current;
}

export class RankedSeasonService {
  async createSeason(input: CreateRankedSeasonInput, createdBy: string) {
    await this.assertCanManage(createdBy);

    const existing = await rankedSeasonRepository.getActiveSeasonByDiscipline(
      input.disciplineId,
    );
    if (existing) {
      throw new ConflictError(ErrorCode.SEASON_ALREADY_ACTIVE);
    }

    const result = await rankedSeasonRepository.create(
      {
        name: input.name,
        description: input.description,
        disciplineId: input.disciplineId,
        startDate: input.startDate,
        endDate: input.endDate,
        minTeamSize: input.minTeamSize,
        maxTeamSize: input.maxTeamSize,
        rulesId: input.rulesId,
        organizationId: input.organizationId,
        scoreEnabled: input.scoreEnabled ?? true,
        minScore: input.minScore ?? null,
        maxScore: input.maxScore ?? null,
        allowDraw: input.allowDraw ?? true,
        validationMode: input.validationMode,
        validationTimerHours: input.validationTimerHours,
        createdBy,
      },
      {
        baseMmr: input.baseMmr ?? 1000,
        kFactor: input.kFactor ?? 32,
        placementMatches: input.placementMatches ?? 5,
        usePreviousMmr: input.usePreviousMmr ?? false,
        softResetFactor: input.softResetFactor ?? 0.5,
        allowAsymmetricMatches: input.allowAsymmetricMatches ?? false,
        sourceTierSeasonId: input.sourceTierSeasonId ?? null,
        tierScalingMode: input.tierScalingMode ?? "keep",
        sourceMmrSeasonId: input.sourceMmrSeasonId ?? null,
      },
    );

    await tournamentRulesetService.seed(result.tournament.id, input.disciplineId);

    if (input.usePreviousMmr) {
      await this.syncMmrSeeds(result.tournament.id);
    }

    return result;
  }

  async startSeason(id: string, userId: string) {
    await this.assertCanManage(userId);
    const season = await this.getSeasonOrThrow(id);

    if (season.status !== "draft") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }

    const config = await rankedSeasonRepository.getConfigByTournamentId(id);
    const baseMmr = config?.baseMmr ?? 1000;

    // Last chance to pick up a source season that only finished after this one
    // was drafted.
    await this.syncMmrSeeds(id);

    // A season goes straight from draft to ongoing, so this is where its ruleset
    // stops following the discipline: from here, only an explicit propagation
    // moves it, and that propagation recalculates the season.
    await tournamentRulesetService.freeze(id);

    // The dates entered on the draft are a forecast; the season really begins
    // when the admin presses start. Realigning it here keeps the window that
    // everything else reads (momentum chart, rewind, "days played") from
    // counting days the season spent as a draft.
    await tournamentRepository.update(id, {
      status: "ongoing",
      startDate: todayIsoDate(),
    });
    const copied = config?.sourceTierSeasonId
      ? await this.copyTiersFromSeason(id, config.sourceTierSeasonId, config)
      : false;
    if (!copied) {
      await rankedSeasonRepository.initDefaultTiers(id, baseMmr);
    }

    return await rankedSeasonRepository.getSeasonWithConfig(id);
  }

  /**
   * Reuses another season's ladder: same names, percentiles, sub-ranks and icons.
   *
   * The MMR thresholds follow `tierScalingMode`:
   * - `keep` (default) copies them verbatim. Nothing rewrites a ladder the admin
   *   set up, and the admin recalculation stays a manual action.
   * - `percentile` rebuilds them from the source season's peak-MMR distribution,
   *   mapped onto the new scale by the same transform as the player seeds.
   *
   * Returns false when the source has no ladder to copy, so the caller can fall
   * back to the default tiers instead of leaving the season with none.
   */
  private async copyTiersFromSeason(
    seasonId: string,
    sourceTierSeasonId: string,
    config: {
      baseMmr: number;
      softResetFactor: number;
      usePreviousMmr: boolean;
      tierScalingMode: TierScalingMode;
    },
  ): Promise<boolean> {
    const sourceTiers = await rankedSeasonRepository.getRankTiers(sourceTierSeasonId);
    if (sourceTiers.length === 0) return false;

    const thresholds =
      config.tierScalingMode === "percentile"
        ? await this.percentileThresholdsFrom(seasonId, sourceTierSeasonId, sourceTiers, config)
        : new Map<number, number>();

    await rankedSeasonRepository.insertTiers(
      seasonId,
      sourceTiers.map((tier) => ({
        level: tier.level,
        name: tier.name,
        nameKey: tier.nameKey,
        percentile: tier.percentile,
        subRanks: tier.subRanks,
        iconClass: tier.iconClass,
        minMmr: thresholds.get(tier.level) ?? tier.minMmr,
      })),
    );
    return true;
  }

  /**
   * Thresholds derived from the peak MMR the source season's settled players
   * reached — a steadier measure of level than the closing snapshot, which only
   * captures where a player happened to end. Empty when the source season has no
   * eligible player, which leaves the copied thresholds untouched.
   */
  private async percentileThresholdsFrom(
    seasonId: string,
    sourceSeasonId: string,
    tiers: { level: number; percentile: number }[],
    config: { baseMmr: number; softResetFactor: number; usePreviousMmr: boolean },
  ): Promise<Map<number, number>> {
    const minMatches = await this.getCarryOverMinMatches(sourceSeasonId);
    const stats = await playerMmrRepository.getSeasonMmrStats(sourceSeasonId, minMatches);
    const peaks = stats.map((row) => row.peakMmr);
    const anchor = medianMmr(peaks);
    if (anchor === null) return new Map();

    // The seeds come from the closing MMR, the thresholds from the peaks: someone
    // who ended far below their peak would otherwise start under the bottom tier.
    // Their seed is what the ladder has to reach down to.
    const seeds = await mmrSeedRepository.getMapBySeason(seasonId);
    const floorBase = Math.min(config.baseMmr, ...seeds.values());

    // Without carry-over everyone restarts at baseMmr and will spread out from
    // there with last season's amplitude: the ladder is shifted, not squeezed.
    const factor = config.usePreviousMmr ? config.softResetFactor : 1;
    return computePercentileLadder(tiers, peaks, floorBase, (mmr) =>
      computeSoftResetMmr({ mmr, anchor, baseMmr: config.baseMmr, factor }),
    );
  }

  async endSeason(id: string, userId: string) {
    await this.assertCanManage(userId);
    const season = await this.getSeasonOrThrow(id);

    if (season.status !== "ongoing") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }

    // Same for the end: a season stopped before its planned term must not keep
    // advertising an end date in the future. Clamped to the start date so a
    // season opened and closed the same day never ends before it began.
    await tournamentRepository.update(id, {
      status: "finished",
      endDate: laterIsoDate(todayIsoDate(), season.startDate),
    });

    // Warm the official leaderboard first: the rewind reads the final standings,
    // and the peak/average views only unlock once the season is finished.
    await this.computeAndCacheOfficial(id).catch((err) =>
      logger.error({ err, id }, "[RankedSeason] final leaderboard cache failed"),
    );
    await enqueueSeasonRewindGeneration(id);

    return await rankedSeasonRepository.getSeasonWithConfig(id);
  }

  /**
   * Queues a rewind rebuild for an already finished season. Safe to call at
   * will: the upsert preserves every player's promotion window and viewed state.
   */
  async regenerateRewind(id: string, userId: string) {
    await this.assertCanManage(userId);
    const season = await this.getSeasonOrThrow(id);

    if (season.status !== "finished") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }
    // The generator would skip a rewind frozen at an older format anyway; failing
    // here instead tells the admin why nothing happened rather than queueing a
    // job that quietly does nothing.
    const storedVersion = await seasonRewindRepository.getStoredVersion(id);
    if (storedVersion !== null && storedVersion !== REWIND_VERSION) {
      throw new BadRequestError(ErrorCode.REWIND_VERSION_FROZEN);
    }
    await enqueueSeasonRewindGeneration(id);
  }

  /**
   * A running season used to be entirely frozen, which meant a typo in its
   * description could not be fixed without ending it. Only the fields that would
   * make the ladder inconsistent are locked now; the MMR knobs stay editable but
   * replay the season so the standings never disagree with the configuration.
   */
  async updateSeason(
    id: string,
    input: UpdateRankedSeasonInput,
    userId: string,
  ) {
    await this.assertCanManage(userId);
    const season = await this.getSeasonOrThrow(id);

    const enteredMatchCount =
      season.status === "draft" ? 0 : await matchRepository.countEnteredMatches(id);
    this.assertSeasonFieldsEditable(season, enteredMatchCount, input);

    await this.applyTournamentUpdate(id, input);
    const affectsMmr = await this.applyConfigUpdate(id, input);

    // Every match of the season was priced with the old settings.
    if (affectsMmr && season.status !== "draft") {
      await tournamentRulesetRepository.setRecalcPending(id, new Date());
      await enqueueMmrSeasonRecalculation(id);
    }

    return await rankedSeasonRepository.getSeasonWithConfig(id);
  }

  /**
   * Ranked has its own policy rather than the tournament one: its rules live in
   * `ranked_season_configs`, and two of them — the tier source and its scaling —
   * are consumed once by `startSeason` and mean nothing afterwards.
   */
  private assertSeasonFieldsEditable(
    season: SeasonWithConfig,
    enteredMatchCount: number,
    input: UpdateRankedSeasonInput,
  ): void {
    if (season.status === "draft") return;

    // A field that is being resent with the value it already holds changes
    // nothing, so it is not an attempt to edit it. Without this an editor that
    // submits its whole form — as the season form does — could not touch a
    // single free field once the season had started.
    const attempted = Object.keys(input).filter((field) => {
      const value = input[field as keyof UpdateRankedSeasonInput];
      if (value === undefined) return false;
      return !isSameSeasonValue(value, currentSeasonValue(season, field));
    });

    const structural = attempted.filter((field) => SEASON_LOCKED_FIELDS.has(field));
    if (structural.length > 0) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_FIELD_UPDATE_FORBIDDEN, {
        fields: structural,
      });
    }

    if (enteredMatchCount === 0) return;

    const blocked = attempted.filter((field) => SEASON_SCORE_FIELDS.has(field));
    if (blocked.length > 0) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_FIELD_LOCKED_BY_MATCHES, {
        fields: blocked,
        matchCount: enteredMatchCount,
      });
    }
  }

  private async applyTournamentUpdate(
    id: string,
    input: UpdateRankedSeasonInput,
  ): Promise<void> {
    const hasTournamentUpdate =
      input.name ||
      input.description ||
      input.startDate ||
      input.endDate ||
      input.rulesId !== undefined ||
      input.scoreEnabled !== undefined ||
      input.minScore !== undefined ||
      input.maxScore !== undefined ||
      input.allowDraw !== undefined ||
      input.validationMode !== undefined ||
      input.validationTimerHours !== undefined;

    if (!hasTournamentUpdate) return;

    await tournamentRepository.update(id, {
      name: input.name,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      rulesId: input.rulesId,
      ...(input.scoreEnabled !== undefined && { scoreEnabled: input.scoreEnabled }),
      ...(input.minScore !== undefined && { minScore: input.minScore }),
      ...(input.maxScore !== undefined && { maxScore: input.maxScore }),
      ...(input.allowDraw !== undefined && { allowDraw: input.allowDraw }),
      ...(input.validationMode !== undefined && { validationMode: input.validationMode }),
      ...(input.validationTimerHours !== undefined && {
        validationTimerHours: input.validationTimerHours,
      }),
    });
  }

  /** @returns whether the change alters what past matches were worth. */
  private async applyConfigUpdate(
    id: string,
    input: UpdateRankedSeasonInput,
  ): Promise<boolean> {
    const configUpdate: Record<string, unknown> = {};
    if (input.baseMmr !== undefined) configUpdate.baseMmr = input.baseMmr;
    if (input.kFactor !== undefined) configUpdate.kFactor = input.kFactor;
    if (input.placementMatches !== undefined)
      configUpdate.placementMatches = input.placementMatches;
    if (input.usePreviousMmr !== undefined)
      configUpdate.usePreviousMmr = input.usePreviousMmr;
    if (input.softResetFactor !== undefined)
      configUpdate.softResetFactor = input.softResetFactor;
    if (input.allowAsymmetricMatches !== undefined)
      configUpdate.allowAsymmetricMatches = input.allowAsymmetricMatches;
    if (input.sourceTierSeasonId !== undefined)
      configUpdate.sourceTierSeasonId = input.sourceTierSeasonId;
    if (input.tierScalingMode !== undefined)
      configUpdate.tierScalingMode = input.tierScalingMode;
    if (input.sourceMmrSeasonId !== undefined)
      configUpdate.sourceMmrSeasonId = input.sourceMmrSeasonId;

    if (Object.keys(configUpdate).length === 0) return false;

    await rankedSeasonRepository.updateConfig(id, configUpdate);

    // The seeds depend on the carry-over flag, its source season, the reset
    // factor and baseMmr. Recomputing on any config change also makes the toggle
    // reversible, which the create-only import never was.
    const affectsSeeds =
      input.usePreviousMmr !== undefined ||
      input.softResetFactor !== undefined ||
      input.sourceMmrSeasonId !== undefined ||
      input.baseMmr !== undefined;
    if (affectsSeeds) {
      await this.syncMmrSeeds(id);
    }

    return affectsSeeds || SEASON_MMR_FIELDS.some((field) => input[field] !== undefined);
  }

  async getSeasonDetails(id: string) {
    return this.getSeasonOrThrow(id);
  }

  async listSeasons(filters?: {
    disciplineId?: string;
    status?: TournamentStatus;
    viewerId?: string;
  }) {
    return await rankedSeasonRepository.listSeasons(filters);
  }

  /**
   * Tier administration.
   *
   * These four wrap the repository rather than letting a route reach it directly:
   * rewriting the ladder reclassifies every player in the season, so it belongs to
   * whoever may manage the season — the same bar as starting or ending it.
   */
  async createTier(seasonId: string, data: CreateRankTierInput, userId: string) {
    await this.assertCanManage(userId);
    return await rankedSeasonRepository.insertTier(seasonId, data);
  }

  async updateTier(
    seasonId: string,
    level: number,
    data: UpdateRankTierInput,
    userId: string,
  ) {
    await this.assertCanManage(userId);
    const tier = await rankedSeasonRepository.updateTier(seasonId, level, data);
    if (!tier) {
      throw new NotFoundError(ErrorCode.RANK_TIER_NOT_FOUND);
    }
    return tier;
  }

  async deleteTier(seasonId: string, level: number, userId: string) {
    await this.assertCanManage(userId);
    return await rankedSeasonRepository.deleteTier(seasonId, level);
  }

  /**
   * Re-derives every threshold from the season's current distribution and hands
   * back the resulting ladder. Wraps recalculateTierMinMmr, whose signature stays
   * as it is: it is also called from paths that have no caller to authorise.
   */
  async recalculateTiers(seasonId: string, userId: string) {
    await this.assertCanManage(userId);

    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    if (!config) {
      throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);
    }

    await this.recalculateTierMinMmr(seasonId, config.baseMmr);
    return await rankedSeasonRepository.getRankTiers(seasonId);
  }

  /**
   * Recalculate tier min_mmr based on percentiles of MMR distribution.
   * legend = top 10%, master = top 30%, strategist = top 60%, challenger = rest
   */
  async recalculateTierMinMmr(seasonId: string, baseMmr: number) {
    const tiers = await rankedSeasonRepository.getRankTiers(seasonId);
    if (tiers.length === 0) return;

    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    const placementMatches = config?.placementMatches ?? 0;
    const allPlayers =
      await playerMmrRepository.getAllPlayersBySeasonId(seasonId);
    // Players still in placement are not ranked, so they must not shape the
    // percentile boundaries either: their MMR is by definition unsettled.
    const sorted = allPlayers
      .filter((p) => p.matchesPlayed >= placementMatches)
      .map((p) => p.currentMmr)
      .sort((a, b) => a - b);
    const n = sorted.length;

    // Nobody settled yet: percentiles of an empty distribution say nothing, and
    // writing baseMmr everywhere would flatten a perfectly good ladder into a
    // single tier. The existing thresholds are left alone until someone is ranked.
    if (n === 0) return;

    for (const tier of tiers) {
      // The bottom tier is a floor, not a percentile: it has to catch the weakest
      // player, who may well sit below baseMmr.
      const minMmr =
        tier.percentile === 0
          ? Math.min(baseMmr, sorted[0])
          : (sorted[Math.floor(n * tier.percentile)] ?? baseMmr);
      await rankedSeasonRepository.upsertRankTier(seasonId, tier.level, {
        minMmr,
      });
    }
  }

  /**
   * (Re)computes the entry MMR of every player carried over from the source
   * season. Writes to `season_mmr_seeds` only: a seed must not create a
   * `player_mmr` row, or a player who never plays this season would show up in
   * the leaderboard, in the tier percentiles and in the rewind ranking.
   *
   * Idempotent — the source season is finished, so its MMR is frozen. Safe to
   * call again on every config change, and reversible: unchecking the carry-over
   * drops the seeds.
   */
  async syncMmrSeeds(seasonId: string): Promise<void> {
    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    if (!config?.usePreviousMmr) {
      await mmrSeedRepository.deleteBySeason(seasonId);
      return;
    }

    const source = await this.resolveMmrSourceSeasonId(seasonId, config.sourceMmrSeasonId);
    if (!source) {
      await mmrSeedRepository.deleteBySeason(seasonId);
      return;
    }

    const eligible = await this.getCarryOverEligiblePlayers(source);
    const anchor = medianMmr(eligible.map((p) => p.currentMmr));
    if (anchor === null) {
      await mmrSeedRepository.deleteBySeason(seasonId);
      return;
    }

    await mmrSeedRepository.replaceForSeason(
      seasonId,
      source,
      eligible.map((player) => ({
        playerId: player.playerId,
        seedMmr: computeSoftResetMmr({
          mmr: player.currentMmr,
          anchor,
          baseMmr: config.baseMmr,
          factor: config.softResetFactor,
        }),
      })),
    );
  }

  private async resolveMmrSourceSeasonId(
    seasonId: string,
    configuredSourceId: string | null,
  ): Promise<string | null> {
    if (configuredSourceId) return configuredSourceId;
    const season = await rankedSeasonRepository.getSeasonWithConfig(seasonId);
    if (!season?.disciplineId) return null;
    const lastSeason = await rankedSeasonRepository.getLastFinishedSeason(
      season.disciplineId,
    );
    return lastSeason?.id ?? null;
  }

  // Only players who completed their placement in the source season carry their
  // MMR over: below that threshold the value says more about who they happened to
  // meet than about their level, so they are better off starting at baseMmr.
  private async getCarryOverEligiblePlayers(sourceSeasonId: string) {
    const minMatches = await this.getCarryOverMinMatches(sourceSeasonId);
    const players = await playerMmrRepository.getAllPlayersBySeasonId(sourceSeasonId);
    return players.filter((p) => p.matchesPlayed >= minMatches);
  }

  private async getCarryOverMinMatches(sourceSeasonId: string): Promise<number> {
    const sourceConfig =
      await rankedSeasonRepository.getConfigByTournamentId(sourceSeasonId);
    return Math.max(1, sourceConfig?.placementMatches ?? 1);
  }

  // Deliberately uncached: the computed_data cache is only invalidated on match
  // finalization, so it would keep serving last week's ranking after a rollover.
  async getWeeklyMmrLeaders(seasonId: string, from: Date): Promise<WeeklyMmrLeaders> {
    const rows = await playerMmrRepository.getMmrDeltasSince(seasonId, from);
    return { weekStart: from, ...splitWeeklyMmrLeaders(rows) };
  }

  // Peak and average MMR over the whole season. Restricted to finished seasons: the
  // metrics only make sense once the history is complete. Uncached on purpose — a
  // finished season's mmr_history is frozen, so the query is cheap and always right.
  async getSeasonMmrLeaderboard(seasonId: string): Promise<ClientSeasonMmrPlayer[]> {
    const season = await rankedSeasonRepository.getSeasonWithConfig(seasonId);
    if (!season) {
      throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);
    }
    if (season.status !== "finished") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }

    const [players, stats] = await Promise.all([
      playerMmrRepository.getBySeasonOrdered(seasonId),
      playerMmrRepository.getSeasonMmrStats(seasonId, season.rankedConfig?.placementMatches ?? 0),
    ]);
    return mergeSeasonMmrStats(players as ClientPlayerMmr[], stats);
  }

  // The season leaderboard transposed: one player, every season they have a rated
  // match in, newest first. Unlike getSeasonMmrLeaderboard this is NOT restricted to
  // finished seasons — the point of the career view is that the record in progress
  // counts, so the running season shows up alongside the closed ones.
  //
  // Uncached for the same reason as the leaderboard, plus one of its own: a season
  // recalculation wipes and rebuilds mmr_history wholesale, so any cache derived
  // from it would have to be invalidated by the recalculation worker.
  async getPlayerCareer(playerId: string): Promise<PlayerCareerSeason[]> {
    const stats = await playerMmrRepository.getPlayerCareerMmrStats(playerId);
    if (stats.length === 0) return [];

    const seasonIds = stats.map((stat) => stat.seasonId);
    const [seasons, tiers, configs, mmrRows] = await Promise.all([
      rankedSeasonRepository.getSeasonsByIds(seasonIds),
      rankedSeasonRepository.getRankTiersForSeasons(seasonIds),
      rankedSeasonRepository.getConfigsByTournamentIds(seasonIds),
      playerMmrRepository.getByPlayerAcrossSeasons(playerId),
    ]);

    const placementBySeason = new Map(
      configs.map((config) => [config.tournamentId, config.placementMatches]),
    );
    const career = buildPlayerCareer(
      stats,
      seasons as CareerSeasonRef[],
      tiers as ClientRankTier[],
      mmrRows,
      placementBySeason,
    );
    return career.sort(
      (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
    );
  }

  async computeAndCacheOfficial(seasonId: string): Promise<void> {
    const [players, tiers] = await Promise.all([
      playerMmrRepository.getBySeasonOrdered(seasonId),
      rankedSeasonRepository.getRankTiers(seasonId),
    ]);
    await rankedCacheRepository.upsertOfficial(seasonId, { players: players as ClientPlayerMmr[], tiers });
  }

  async computeAndCacheProvisional(seasonId: string): Promise<void> {
    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    if (!config) return;

    const [players, tiers] = await Promise.all([
      playerMmrRepository.getBySeasonOrdered(seasonId),
      rankedSeasonRepository.getRankTiers(seasonId),
    ]);

    const unfinalizedMatches = await loadUnfinalizedMatches(seasonId);

    if (unfinalizedMatches.length === 0) {
      await rankedCacheRepository.upsertProvisional(seasonId, { players: players as ClientPlayerMmr[], tiers });
      return;
    }

    const ruleset = await tournamentRulesetService.getForTournament(seasonId);

    const ctx: ProvisionalReplayCtx = {
      baseMmr: config.baseMmr,
      kFactor: config.kFactor,
      placementMatches: config.placementMatches,
      entryMmr: await mmrSeedRepository.getMapBySeason(seasonId),
      provisionalMmr: new Map(players.map((p) => [p.playerId, p.currentMmr])),
      provisionalResults: new Map(
        players.map((p) => [p.playerId, [...((p as ClientPlayerMmr).recentResults ?? [])].reverse()]),
      ),
      matchesPlayed: new Map(players.map((p) => [p.playerId, p.matchesPlayed])),
      outcomes: indexRulesetOutcomes(ruleset),
      interactionMode: resolveRulesetInteractionMode(ruleset),
    };

    const touchedPlayerIds = new Set<string>();
    for (const match of unfinalizedMatches) {
      this.replayMatch(match, ctx, touchedPlayerIds);
    }

    const provisionalOnlyPlayers = await this.collectProvisionalOnlyPlayers(
      unfinalizedMatches,
      players,
      seasonId,
      ctx,
    );
    const provisionalPlayers = this.buildProvisionalPlayers(
      players,
      provisionalOnlyPlayers,
      ctx,
      touchedPlayerIds,
    );

    await rankedCacheRepository.upsertProvisional(seasonId, {
      players: provisionalPlayers,
      tiers,
    });
  }

  private replayMatch(match: UnfinalizedMatch, ctx: ProvisionalReplayCtx, touched: Set<string>): void {
    const sideA = match.sides[0];
    const sideB = match.sides[1];
    if (!sideA || !sideB) return;

    const idsA = sideA.entry?.players.map((p) => p.playerId) ?? [];
    const idsB = sideB.entry?.players.map((p) => p.playerId) ?? [];
    if (!idsA.length || !idsB.length) return;

    for (const id of [...idsA, ...idsB]) touched.add(id);

    const resultA = sideResult(match.winnerSide, "A");
    const matchOutcome =
      (match.outcomeTypeId ? ctx.outcomes.get(match.outcomeTypeId) : undefined) ??
      RULESET_OUTCOME_DEFAULTS;
    const deltas = calculateMatchMmr({
      sides: [
        { players: toReplayPlayers(idsA, ctx), score: sideA.score ?? 0, result: resultA },
        {
          players: toReplayPlayers(idsB, ctx),
          score: sideB.score ?? 0,
          result: sideResult(match.winnerSide, "B"),
        },
      ],
      kFactor: ctx.kFactor,
      scoreCountsForMmr: matchOutcome.scoreCountsForMmr,
      mmrMultiplier: matchOutcome.mmrMultiplier,
      teamInteractionMode: ctx.interactionMode,
    });

    for (const delta of deltas) {
      const outcome = resultToOutcome(idsA.includes(delta.playerId) ? resultA : sideResult(match.winnerSide, "B"));
      ctx.provisionalMmr.set(delta.playerId, delta.newMmr);
      ctx.matchesPlayed.set(delta.playerId, (ctx.matchesPlayed.get(delta.playerId) ?? 0) + 1);
      const prev = ctx.provisionalResults.get(delta.playerId) ?? [];
      ctx.provisionalResults.set(delta.playerId, [{ outcome }, ...prev].slice(0, 5));
    }
  }

  private findProvisionalOnlyPlayerIds(
    unfinalizedMatches: UnfinalizedMatch[],
    players: SeasonPlayers,
  ): string[] {
    const allUnfinalizedPlayerIds = new Set<string>();
    for (const match of unfinalizedMatches) {
      for (const p of match.sides[0]?.entry?.players ?? []) allUnfinalizedPlayerIds.add(p.playerId);
      for (const p of match.sides[1]?.entry?.players ?? []) allUnfinalizedPlayerIds.add(p.playerId);
    }
    const officialPlayerIds = new Set(players.map((p) => p.playerId));
    return [...allUnfinalizedPlayerIds].filter((id) => !officialPlayerIds.has(id));
  }

  // Players who only appear in unfinalized matches have no player_mmr row yet
  private async collectProvisionalOnlyPlayers(
    unfinalizedMatches: UnfinalizedMatch[],
    players: SeasonPlayers,
    seasonId: string,
    ctx: ProvisionalReplayCtx,
  ): Promise<ClientPlayerMmr[]> {
    const newPlayerIds = this.findProvisionalOnlyPlayerIds(unfinalizedMatches, players);
    if (newPlayerIds.length === 0) return [];

    const users = await db.query.appUsers.findMany({
      where: inArray(appUsers.id, newPlayerIds),
      columns: { id: true, displayName: true, shortName: true },
    });

    return users.map((user) => ({
      id: `provisional-${user.id}`,
      seasonId,
      playerId: user.id,
      currentMmr: ctx.provisionalMmr.get(user.id) ?? entryMmrOf(user.id, ctx),
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winStreak: 0,
      maxWinStreak: 0,
      lossStreak: 0,
      maxLossStreak: 0,
      player: { id: user.id, displayName: user.displayName, shortName: user.shortName },
      recentResults: [...(ctx.provisionalResults.get(user.id) ?? [])].reverse(),
    }));
  }

  private buildProvisionalPlayers(
    players: SeasonPlayers,
    provisionalOnlyPlayers: ClientPlayerMmr[],
    ctx: ProvisionalReplayCtx,
    touchedPlayerIds: Set<string>,
  ): ClientPlayerMmr[] {
    return [
      ...players.map((p) => {
        if (!touchedPlayerIds.has(p.playerId)) return p as ClientPlayerMmr;
        const provisionalResults = ctx.provisionalResults.get(p.playerId) ?? [];
        return {
          ...(p as ClientPlayerMmr),
          currentMmr: ctx.provisionalMmr.get(p.playerId) ?? p.currentMmr,
          recentResults: [...provisionalResults].reverse(),
          winStreak: countLeadingWins(provisionalResults),
        };
      }),
      ...provisionalOnlyPlayers,
    ].sort((a, b) => b.currentMmr - a.currentMmr);
  }

  private async getSeasonOrThrow(id: string) {
    const season = await rankedSeasonRepository.getSeasonWithConfig(id);
    if (!season) {
      throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);
    }
    return season;
  }

  private async assertCanManage(userId: string) {
    const user = await userRepository.getById(userId);
    if (!user) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN);
    }
    if (user.role !== "super_admin" && user.role !== "tournament_admin") {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }
  }
}

export const rankedSeasonService = new RankedSeasonService();
