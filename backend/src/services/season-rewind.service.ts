import {
  REWIND_MAX_CHART_POINTS,
  REWIND_PROMO_DAYS,
  REWIND_VERSION,
  type ClientPlayerBadge,
  type MmrChartPoint,
  type PlayerRelationStat,
  type PlayerRewindPayload,
  type RewindArchiveEntry,
  type RewindBundle,
  type RewindConclusion,
  type RewindFeatMatch,
  type RewindPlayerRef,
  type RewindPromotion,
  type RewindSeasonInfo,
  type RewindTierRef,
  type RuleAction,
  type SeasonRewindPayload,
} from "@skol-arena/shared/types/index";
import { db } from "../config/database";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { participantRepository } from "../repository/participant.repository";
import { partitionInactive } from "../utils/inactive-players";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { rulesRepository } from "../repository/rules.repository";
import {
  REWIND_UPSERT_CHUNK_SIZE,
  seasonRewindRepository,
  type PlayerRewindRow,
} from "../repository/season-rewind.repository";
import { NotFoundError, BadRequestError } from "../types/errors";
import { ErrorCode } from "../types/errors";
import { logger } from "../utils/logger";
import { rankRelationsByWeightedRate } from "./player-stats.service";
import {
  awardsWonBy,
  computeCombatAwards,
  computeCooperationAwards,
  computeEnduranceAwards,
  computePercentiles,
  computePerformanceAwards,
} from "./season-rewind.awards";
import { retagIdentities } from "./season-rewind.identity";
import { replaySeason, type PairTally, type PlayerAggregate } from "./season-rewind.replay";
import type { FeatDraft } from "./season-rewind.replay";

type Directory = Map<string, RewindPlayerRef>;
type BadgeRow = Awaited<ReturnType<typeof rulesRepository.listBadgesBySeason>>[number];

interface SeasonContext {
  info: RewindSeasonInfo;
  disciplineId: string | null;
  directory: Directory;
  finalRanking: string[];
  /** Rank of each player, so a per-player payload never scans the ranking. */
  rankByPlayer: Map<string, number>;
  tierByPlayer: Map<string, RewindTierRef>;
  /** The tier an arbitrary MMR falls in — the peak is not always the final one. */
  tierForMmr: (mmr: number) => RewindTierRef | null;
  averageMmr: number;
}

/**
 * Pair tallies grouped by member. Every player payload needs its own partners
 * and opponents; without this each of them would scan every tally of the season,
 * which is quadratic in the player count and cubic in the worst case.
 */
interface RelationIndex {
  partners: Map<string, PairTally[]>;
  opponents: Map<string, PairTally[]>;
}

function indexTallies(tallies: PairTally[]): Map<string, PairTally[]> {
  const index = new Map<string, PairTally[]>();
  for (const tally of tallies) {
    for (const playerId of [tally.aId, tally.bId]) {
      const list = index.get(playerId);
      if (list) list.push(tally);
      else index.set(playerId, [tally]);
    }
  }
  return index;
}

function groupBadges(badges: BadgeRow[]): Map<string, BadgeRow[]> {
  const index = new Map<string, BadgeRow[]>();
  for (const badge of badges) {
    const list = index.get(badge.playerId);
    if (list) list.push(badge);
    else index.set(badge.playerId, [badge]);
  }
  return index;
}

/**
 * Thins an MMR curve down to what the sparkline can actually show, keeping the
 * first and last points so the line still starts and ends on the figures printed
 * beside it. A season regular can play a thousand ranked matches; storing and
 * shipping a thousand points to draw 160 pixels is pure weight.
 */
export function downsampleJourney(
  points: MmrChartPoint[],
  max: number = REWIND_MAX_CHART_POINTS,
): MmrChartPoint[] {
  if (points.length <= max || max < 2) return points;

  const step = (points.length - 1) / (max - 1);
  const kept: MmrChartPoint[] = [];
  for (let i = 0; i < max; i++) kept.push(points[Math.round(i * step)]!);
  return kept;
}

export class SeasonRewindService {
  /**
   * Builds and stores the whole rewind for a finished season.
   *
   * Everything is computed once here and never recomputed on read: once a season
   * is closed its data is frozen, so paying the cost of a full chronological
   * replay on every page view would be pure waste. Regenerating is safe — the
   * per-player promotion window and viewed state are preserved by the upsert.
   */
  async generateForSeason(seasonId: string): Promise<void> {
    const season = await rankedSeasonRepository.getSeasonWithConfig(seasonId);
    if (!season) throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    if (season.status !== "finished") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }
    if (await this.isFrozen(seasonId)) {
      logger.info(
        { seasonId, currentVersion: REWIND_VERSION },
        "[Rewind] season stored in an older format, left as it was",
      );
      return;
    }

    const [history, sides, rankedPlayers, badges, inactiveIds] = await Promise.all([
      seasonRewindRepository.getSeasonHistoryOrdered(seasonId),
      seasonRewindRepository.getSeasonSides(seasonId),
      playerMmrRepository.getBySeasonOrdered(seasonId),
      rulesRepository.listBadgesBySeason(seasonId),
      participantRepository.findInactivePlayerIds(seasonId),
    ]);
    // Players who left the season finish behind everyone who stayed, as on the leaderboard
    const players = partitionInactive(rankedPlayers, inactiveIds, (row) => row.playerId);

    const replay = replaySeason(history, sides);
    const context = this.buildContext(season, players);
    const aggregates = [...replay.aggregates.values()].filter((agg) =>
      context.directory.has(agg.playerId),
    );

    const seasonPayload = this.buildSeasonPayload(context, aggregates, replay);
    const nextSeason = await this.findNextSeason(context.disciplineId, seasonId);
    const promotedUntil = new Date(Date.now() + REWIND_PROMO_DAYS * 24 * 60 * 60 * 1000);

    const relations: RelationIndex = {
      partners: indexTallies(replay.duos),
      opponents: indexTallies(replay.rivalries),
    };
    const badgesByPlayer = groupBadges(badges);
    const aggregateById = new Map(aggregates.map((agg) => [agg.playerId, agg]));

    await this.persist(
      seasonId,
      context.disciplineId,
      seasonPayload,
      aggregates.map((agg) => agg.playerId),
      (playerId) => ({
        playerId,
        promotedUntil,
        payload: this.buildPlayerPayload(
          aggregateById.get(playerId)!,
          aggregates,
          relations,
          context,
          seasonPayload,
          { badges: badgesByPlayer.get(playerId) ?? [], nextSeason },
        ),
      }),
    );
    if (replay.unresolvedOutcomes > 0) {
      // Pre-outcome-column rows with a zero MMR delta: counted as draws for lack
      // of anything better, which skews the W/L and streaks of those matches.
      logger.warn(
        { seasonId, rows: replay.unresolvedOutcomes },
        "[Rewind] legacy history rows with an undecidable outcome counted as draws",
      );
    }
    logger.info(
      { seasonId, players: aggregates.length, matches: replay.matchCount },
      "[Rewind] season rewind generated",
    );
  }

  /**
   * Whether the season already holds a rewind built by a different version of
   * the format. Those are souvenirs: the deck a player watched is the deck they
   * must find again years later, so this build refuses to rewrite it — including
   * after an MMR recalculation, which is why the check sits in the generator and
   * not only on the admin route.
   */
  private async isFrozen(seasonId: string): Promise<boolean> {
    const stored = await seasonRewindRepository.getStoredVersion(seasonId);
    return stored !== null && stored !== REWIND_VERSION;
  }

  private async persist(
    seasonId: string,
    disciplineId: string | null,
    payload: SeasonRewindPayload,
    playerIds: string[],
    buildRow: (playerId: string) => PlayerRewindRow,
  ): Promise<void> {
    // One transaction so the global payload and the player decks are never
    // visible out of sync — a half-written rewind would render as a broken deck.
    //
    // Decks are built chunk by chunk rather than up front: a season's payloads
    // add up to tens of megabytes and only the chunk on its way to Postgres has
    // any reason to exist at once.
    await db.transaction(async (tx) => {
      const rewindId = await seasonRewindRepository.upsertSeasonRewind(
        seasonId,
        disciplineId,
        payload,
        REWIND_VERSION,
        tx,
      );
      for (let i = 0; i < playerIds.length; i += REWIND_UPSERT_CHUNK_SIZE) {
        const chunk = playerIds.slice(i, i + REWIND_UPSERT_CHUNK_SIZE).map(buildRow);
        await seasonRewindRepository.upsertPlayerRewindsBatch(
          rewindId,
          chunk,
          REWIND_VERSION,
          tx,
        );
      }
      await seasonRewindRepository.deleteStalePlayerRewinds(rewindId, playerIds, tx);
    });
  }

  private buildContext(
    season: Awaited<ReturnType<typeof rankedSeasonRepository.getSeasonWithConfig>>,
    players: Awaited<ReturnType<typeof playerMmrRepository.getBySeasonOrdered>>,
  ): SeasonContext {
    const directory: Directory = new Map();
    const tierByPlayer = new Map<string, RewindTierRef>();
    const tiers = [...(season!.rankTiers ?? [])].sort((a, b) => b.minMmr - a.minMmr);
    const tierForMmr = (mmr: number): RewindTierRef | null => {
      const tier = tiers.find((candidate) => mmr >= candidate.minMmr);
      return tier
        ? {
            name: tier.name,
            nameKey: tier.nameKey,
            level: tier.level,
            iconClass: tier.iconClass ?? null,
          }
        : null;
    };

    for (const entry of players) {
      if (!entry.player) continue;
      directory.set(entry.playerId, {
        playerId: entry.playerId,
        displayName: entry.player.displayName,
        shortName: entry.player.shortName,
      });
      const tier = tierForMmr(entry.currentMmr);
      if (tier) tierByPlayer.set(entry.playerId, tier);
    }

    // Everyone who played is ranked here, placement matches included: the season is
    // over, so there is no unsettled MMR left to protect — and a small season where
    // nobody reached the threshold would otherwise end with no ranking and no
    // awards at all. Players who never played hold no player_mmr row and are
    // therefore already absent.
    const totalMmr = players.reduce((sum, entry) => sum + entry.currentMmr, 0);
    const finalRanking = players.map((entry) => entry.playerId);
    return {
      info: {
        seasonId: season!.id,
        name: season!.name,
        disciplineName: season!.discipline?.name ?? null,
        startDate: new Date(season!.startDate),
        endDate: new Date(season!.endDate),
        allowDraw: season!.allowDraw ?? true,
      },
      disciplineId: season!.disciplineId ?? null,
      directory,
      finalRanking,
      rankByPlayer: new Map(finalRanking.map((playerId, index) => [playerId, index + 1])),
      tierByPlayer,
      tierForMmr,
      averageMmr: players.length > 0 ? Math.round(totalMmr / players.length) : 0,
    };
  }

  private buildSeasonPayload(
    context: SeasonContext,
    aggregates: PlayerAggregate[],
    replay: ReturnType<typeof replaySeason>,
  ): SeasonRewindPayload {
    return {
      version: REWIND_VERSION,
      season: context.info,
      totals: {
        playerCount: context.directory.size,
        matchCount: replay.matchCount,
        averageMmr: context.averageMmr,
      },
      performance: computePerformanceAwards(aggregates, context.directory, context.finalRanking),
      combat: computeCombatAwards(aggregates, context.directory, replay.rivalries),
      endurance: computeEnduranceAwards(aggregates, context.directory),
      cooperation: computeCooperationAwards(aggregates, context.directory, replay.duos),
    };
  }

  private buildPlayerPayload(
    agg: PlayerAggregate,
    aggregates: PlayerAggregate[],
    index: RelationIndex,
    context: SeasonContext,
    seasonPayload: SeasonRewindPayload,
    extras: { badges: BadgeRow[]; nextSeason: RewindConclusion["nextSeason"] },
  ): PlayerRewindPayload {
    const rank = context.rankByPlayer.get(agg.playerId) ?? 0;
    const tier = context.tierByPlayer.get(agg.playerId) ?? null;
    const relations = this.buildRelations(agg.playerId, index, context.directory);

    return {
      version: REWIND_VERSION,
      player: context.directory.get(agg.playerId)!,
      finalRank: {
        rank: rank > 0 ? rank : context.finalRanking.length,
        totalPlayers: context.finalRanking.length,
        mmr: agg.finalMmr,
        tier,
      },
      totals: {
        matchesPlayed: agg.matchesPlayed,
        wins: agg.wins,
        losses: agg.losses,
        draws: agg.draws,
        winRate:
          agg.matchesPlayed > 0 ? Math.round((agg.wins / agg.matchesPlayed) * 100) : 0,
      },
      journey: {
        initialMmr: agg.initialMmr,
        finalMmr: agg.finalMmr,
        netDelta: agg.finalMmr - agg.initialMmr,
        points: downsampleJourney(agg.points),
      },
      bestRank: {
        bestRank: agg.bestRank === Number.MAX_SAFE_INTEGER ? rank : agg.bestRank,
        matchesInTop1: agg.matchesInTop1,
        matchesInTop3: agg.matchesInTop3,
        matchesInTop5: agg.matchesInTop5,
      },
      peak: {
        mmr: agg.peakMmr,
        matchId: agg.peakMatchId,
        playedAt: agg.peakPlayedAt,
        tier: context.tierForMmr(agg.peakMmr),
      },
      streaks: {
        bestWinStreak: agg.bestWinStreak,
        bestWinStreakMmr: agg.bestWinStreakMmr,
        bestUnbeatenStreak: agg.bestUnbeatenStreak,
        worstLossStreak: agg.worstLossStreak,
        worstLossStreakMmr: agg.worstLossStreakMmr,
      },
      feats: {
        bestMmrGain: this.hydrateFeat(agg.bestMmrGain, context.directory),
        biggestUpsetGap: this.hydrateFeat(agg.biggestUpsetGap, context.directory),
        giantKillerWins: agg.giantKillerWins,
        ...relations,
      },
      badges: extras.badges.map(toClientBadge),
      percentiles: computePercentiles(aggregates, agg),
      conclusion: { nextSeason: extras.nextSeason },
      awardsWon: awardsWonBy(agg.playerId, seasonPayload),
    };
  }

  private hydrateFeat(feat: FeatDraft | null, directory: Directory): RewindFeatMatch | null {
    if (!feat) return null;
    return {
      matchId: feat.matchId,
      playedAt: feat.playedAt,
      opponent: feat.opponentId ? (directory.get(feat.opponentId) ?? null) : null,
      mmrDelta: feat.mmrDelta,
      mmrGap: feat.mmrGap,
      format: { teamSize: feat.teamSize, opponentTeamSize: feat.opponentTeamSize },
    };
  }

  /**
   * Best partner, most faced opponent and nemesis, ranked exactly like the
   * player-stats page does it — weighted by sample size so one lucky evening
   * never outranks a season-long record.
   */
  private buildRelations(
    playerId: string,
    index: RelationIndex,
    directory: Directory,
  ): Pick<PlayerRewindPayload["feats"], "bestPartner" | "mostFacedOpponent" | "nemesis"> {
    const partners = toRelationStats(
      playerId,
      index.partners.get(playerId) ?? [],
      directory,
      "shared",
    );
    const opponents = toRelationStats(
      playerId,
      index.opponents.get(playerId) ?? [],
      directory,
      "opposed",
    );

    const mostFaced = [...opponents].sort(
      (a, b) => b.count - a.count || (a.playerId < b.playerId ? -1 : 1),
    );

    return {
      bestPartner: rankRelationsByWeightedRate(partners, (p) => p.wins / p.count)[0] ?? null,
      mostFacedOpponent: mostFaced[0] ?? null,
      nemesis: rankRelationsByWeightedRate(opponents, (o) => o.losses / o.count)[0] ?? null,
    };
  }

  private async findNextSeason(
    disciplineId: string | null,
    currentSeasonId: string,
  ): Promise<RewindConclusion["nextSeason"]> {
    if (!disciplineId) return null;
    const next = await rankedSeasonRepository.getActiveSeasonByDiscipline(disciplineId);
    if (!next || next.id === currentSeasonId) return null;
    return { id: next.id, name: next.name, startDate: new Date(next.startDate) };
  }

  /**
   * Rewrites the names those players left frozen inside every rewind covering a
   * season they played. Renaming a player, and above all archiving one — which
   * anonymises the profile — has to reach the rewinds too, or a name someone
   * asked to have removed keeps being served, including by the public season
   * endpoint.
   *
   * This patches identities inside the stored payloads instead of regenerating
   * them: a rewind frozen at an older format must keep that format, and the
   * generator would rebuild it at the current one.
   */
  async refreshPlayerIdentities(playerIds: string[]): Promise<void> {
    if (playerIds.length === 0) return;

    const [rewindIds, identities] = await Promise.all([
      seasonRewindRepository.listRewindIdsForPlayers(playerIds),
      seasonRewindRepository.getIdentities(playerIds),
    ]);
    if (rewindIds.length === 0 || identities.size === 0) return;

    let patched = 0;
    for (const rewindId of rewindIds) {
      const { season, players } = await seasonRewindRepository.getPayloadsForRewind(rewindId);
      const seasonChanged = season !== null && retagIdentities(season, identities);
      const changedPlayers = players.filter((row) => retagIdentities(row.payload, identities));

      if (!seasonChanged && changedPlayers.length === 0) continue;
      await seasonRewindRepository.rewritePayloads(
        rewindId,
        seasonChanged ? season : null,
        changedPlayers,
      );
      patched++;
    }

    logger.info(
      { players: playerIds.length, rewinds: rewindIds.length, patched },
      "[Rewind] player identities refreshed in stored rewinds",
    );
  }

  // ============================================
  // Read paths
  // ============================================

  async getBundle(seasonId: string, playerId: string | null): Promise<RewindBundle> {
    const rewind = await seasonRewindRepository.getSeasonRewind(seasonId);
    if (!rewind) throw new NotFoundError(ErrorCode.REWIND_NOT_FOUND);

    const player = playerId
      ? await seasonRewindRepository.getPlayerRewind(seasonId, playerId)
      : null;
    if (!player) return { season: rewind.payload, player: null };

    // The one field that legitimately changes after the snapshot is taken: a new
    // season is usually opened *after* the previous one closes, so the stored
    // value would tell every player forever that nothing is coming next.
    const nextSeason = await this.findNextSeason(rewind.disciplineId, seasonId);

    return {
      season: rewind.payload,
      player: { ...player.payload, conclusion: { nextSeason } },
    };
  }

  markOpened(seasonId: string, playerId: string): Promise<void> {
    return seasonRewindRepository.markOpened(seasonId, playerId);
  }

  markViewed(seasonId: string, playerId: string): Promise<void> {
    return seasonRewindRepository.markViewed(seasonId, playerId);
  }

  listArchive(playerId: string): Promise<RewindArchiveEntry[]> {
    return seasonRewindRepository.listForPlayer(playerId);
  }

  getPromoted(playerId: string): Promise<RewindPromotion | null> {
    return seasonRewindRepository.getPromotedForPlayer(playerId);
  }
}

/**
 * Turns the replay's unordered pair tallies into stats seen from one player.
 *
 * `relation` decides whether the record has to be mirrored when the subject is
 * the pair's second id: an opponent's 8-2 is the subject's 2-8, but a duo's 8-2
 * is 8-2 for both of its members. Reading a duo as if it were a duel is what
 * would turn a player's best partner into their worst.
 */
function toRelationStats(
  playerId: string,
  tallies: PairTally[],
  directory: Directory,
  relation: "opposed" | "shared",
): PlayerRelationStat[] {
  const stats: PlayerRelationStat[] = [];

  for (const tally of tallies) {
    if (tally.aId !== playerId && tally.bId !== playerId) continue;
    const isA = tally.aId === playerId;
    const other = directory.get(isA ? tally.bId : tally.aId);
    if (!other) continue;

    const mirrored = relation === "opposed" && !isA;
    const wins = mirrored ? tally.aLosses : tally.aWins;
    const losses = mirrored ? tally.aWins : tally.aLosses;
    stats.push({
      playerId: other.playerId,
      displayName: other.displayName,
      shortName: other.shortName,
      count: tally.matches,
      wins,
      losses,
      winRate: tally.matches > 0 ? Math.round((wins / tally.matches) * 100) : 0,
    });
  }
  return stats;
}

function toClientBadge(row: BadgeRow): ClientPlayerBadge {
  const action = row.rule.action as RuleAction;
  const badge =
    action.type === "badge"
      ? action
      : { icon: "", label: row.rule.name, description: "", recurrence: "per_season" as const };

  return {
    id: row.id,
    playerId: row.playerId,
    ruleId: row.ruleId,
    icon: badge.icon,
    label: badge.label,
    description: badge.description,
    recurrence: badge.recurrence ?? "per_season",
    awardedAt: row.awardedAt,
    matchId: row.matchId,
    seasonId: row.seasonId,
    seasonName: row.season?.name ?? null,
  };
}

export const seasonRewindService = new SeasonRewindService();
