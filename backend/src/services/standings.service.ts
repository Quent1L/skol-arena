import { standingsRepository } from "../repository/standings.repository";
import { matchSidesRepository } from "../repository/match-sides.repository";
import { participantRepository } from "../repository/participant.repository";
import { partitionInactive } from "../utils/inactive-players";
import { notifyRankingChanged } from "./ranking-notifier";
import { tournamentService } from "./tournament.service";
import { tournamentRulesetService } from "./tournament-ruleset.service";
import { NotFoundError, ForbiddenError, ErrorCode } from "../types/errors";
import {
  type MatchStatus,
  type StandingsEntry,
  type StandingsResult,
  type VictoryQualityDetail,
  type TournamentScoringConfig,
  type TournamentRulesetPayload,
  type RankOutcome,
  ENTERED_MATCH_STATUSES,
  pairwiseResult,
  resolveRulesetOutcome,
  resolveScoringConfig,
  resolveStoredRanks,
  sideOutcome,
} from "@skol-arena/shared";
import { computeMatchOutcome } from "./match-points";

/** Statuses a match must have to weigh on the provisional table. */
export const PROVISIONAL_MATCH_STATUSES = ENTERED_MATCH_STATUSES;

type FlexMatchRow = Awaited<ReturnType<typeof standingsRepository.getPlayerPointsForStandings>>[number];
type StaticMatchRow = Awaited<ReturnType<typeof standingsRepository.getMatchesWithSides>>[number];

interface OutcomeInfo {
  key: string;
  name: string;
  points: number;
}

type RebuildMatch = { id: string; winnerSide: string | null; playedAt: Date | string };
type RebuildSide = {
  matchId: string;
  entryId: string;
  position: number;
  score: number | null;
  rank: number | null;
  pointsAwarded: number | null;
  entry?: { players: Array<{ playerId: string }> } | null;
};
/** One opposing side as one player or team sees it: who was on it and how the duel went. */
type OpposingSide = { ids: string[]; result: 1 | 0.5 | 0 };

/** The best score among the other sides: what a side "conceded" in a match of any size. */
function bestOpposingScore(sides: { position: number; score: number | null }[], position: number): number {
  let best = 0;
  for (const side of sides) {
    if (side.position !== position) best = Math.max(best, side.score ?? 0);
  }
  return best;
}

/** Every other side of the match, with the duel result against each. */
function opposingSides<T extends { position: number }>(
  sides: T[],
  position: number,
  ranks: Map<number, number>,
  idsOf: (side: T) => string[],
): OpposingSide[] {
  const ownRank = ranks.get(position) ?? 1;
  return sides
    .filter((side) => side.position !== position)
    .map((side) => ({ ids: idsOf(side), result: pairwiseResult(ownRank, ranks.get(side.position) ?? 1) }));
}

type PlayerPointRow = {
  matchId: string;
  playerId: string;
  pointsAwarded: number;
  countsForRanking: boolean;
};

export class StandingsService {
  async getOfficialStandings(tournamentId: string): Promise<StandingsResult> {
    const cached = await standingsRepository.getComputedData(tournamentId, "standings:official");
    if (cached) return this.withInactivePlayersLast(tournamentId, cached);
    const result = await this.calculateStandings(tournamentId, ["finalized"]);
    await standingsRepository.setComputedData(tournamentId, "standings:official", result);
    return this.withInactivePlayersLast(tournamentId, result);
  }

  async getProvisionalStandings(tournamentId: string): Promise<StandingsResult> {
    const cached = await standingsRepository.getComputedData(tournamentId, "standings:provisional");
    if (cached) return this.withInactivePlayersLast(tournamentId, cached);
    // 'disputed' counts too: a contested result keeps its provisional value until it is
    // arbitrated, otherwise a match would drop out of the table and come back later.
    const result = await this.calculateStandings(tournamentId, PROVISIONAL_MATCH_STATUSES);
    await standingsRepository.setComputedData(tournamentId, "standings:provisional", result);
    return this.withInactivePlayersLast(tournamentId, result);
  }

  /**
   * Applied when serving, never cached: leaving or coming back then shows up at once
   * without recomputing anything, and the cached numbers stay those the matches gave.
   * Flex rows are players; static rows are teams, which have no registration of their own
   * and are left in place.
   */
  private async withInactivePlayersLast(tournamentId: string, result: StandingsResult): Promise<StandingsResult> {
    const inactiveIds = await participantRepository.findInactivePlayerIds(tournamentId);
    return { standings: partitionInactive(result.standings, inactiveIds, (row) => row.id) };
  }

  async invalidateCache(tournamentId: string): Promise<void> {
    await standingsRepository.deleteComputedData(tournamentId);
  }

  private async calculateStandings(tournamentId: string, includeStatuses: MatchStatus[]): Promise<StandingsResult> {
    const tournament = await standingsRepository.getTournamentWithScoring(tournamentId);
    if (!tournament) throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);

    const scoreEnabled = tournament.scoreEnabled ?? true;
    const allowDraw = tournament.allowDraw ?? true;

    if (tournament.teamMode === "flex") {
      return this.calculateFlexStandings(tournamentId, includeStatuses, scoreEnabled, allowDraw);
    }
    return this.calculateStaticStandings(
      tournamentId,
      includeStatuses,
      resolveScoringConfig(tournament.scoringConfig),
      allowDraw,
      scoreEnabled,
    );
  }

  // ── Flex standings ───────────────────────────────────────────────────

  private async calculateFlexStandings(
    tournamentId: string,
    includeStatuses: MatchStatus[],
    scoreEnabled: boolean,
    allowDraw: boolean,
  ): Promise<StandingsResult> {
    const standingsMap = await this.initializeFlexStandings(tournamentId);
    const matchRows = await standingsRepository.getPlayerPointsForStandings(tournamentId, includeStatuses);

    // Pass 1: base stats (only countsForRanking matches)
    for (const match of matchRows) {
      this.accumulateFlexBaseStats(match, standingsMap, scoreEnabled);
    }

    // Pass 2: tiebreaker fields, priced with the ruleset this competition ran on
    const ruleset = await tournamentRulesetService.getForTournament(tournamentId);
    this.computeFlexTiebreakers(standingsMap, matchRows, ruleset);

    const standings = Array.from(standingsMap.values());
    this.sortStandings(standings, allowDraw);
    return { standings };
  }

  private accumulateFlexBaseStats(
    match: FlexMatchRow,
    standingsMap: Map<string, StandingsEntry>,
    scoreEnabled: boolean,
  ): void {
    const playerPosition = this.buildFlexPlayerPositions(match.sides);
    const ranks = resolveStoredRanks(match.sides, match.winnerSide);

    for (const pp of match.playerPoints) {
      const entry = standingsMap.get(pp.playerId);
      const pos = playerPosition.get(pp.playerId);
      if (!entry || !pp.countsForRanking || pos === undefined) continue;

      this.applyFlexPlayerStats(entry, pp.pointsAwarded, {
        outcome: sideOutcome(ranks, pos),
        scored: match.sides.find((s) => s.position === pos)?.score ?? 0,
        conceded: bestOpposingScore(match.sides, pos),
        scoreEnabled,
      });
    }
  }

  private buildFlexPlayerPositions(sides: FlexMatchRow["sides"]): Map<string, number> {
    const playerPosition = new Map<string, number>();
    for (const side of sides) {
      for (const ep of side.entry.players) {
        playerPosition.set(ep.playerId, side.position);
      }
    }
    return playerPosition;
  }

  private applyFlexPlayerStats(
    entry: StandingsEntry,
    pointsAwarded: number,
    ctx: { outcome: RankOutcome; scored: number; conceded: number; scoreEnabled: boolean },
  ): void {
    entry.matchesPlayed += 1;
    entry.points += pointsAwarded;

    if (ctx.outcome.isDraw) entry.draws += 1;
    else if (ctx.outcome.isWin) entry.wins += 1;
    else entry.losses += 1;

    if (ctx.scoreEnabled) {
      entry.scored += ctx.scored;
      entry.conceded += ctx.conceded;
      entry.scoreDiff = entry.scored - entry.conceded;
    }
  }

  private computeFlexTiebreakers(
    standingsMap: Map<string, StandingsEntry>,
    matchRows: FlexMatchRow[],
    ruleset: TournamentRulesetPayload,
  ): void {
    this.initRatioFields(standingsMap);

    const breakdownMap = new Map<string, Map<string, VictoryQualityDetail>>();
    for (const match of matchRows) {
      this.processFlexMatch(match, standingsMap, breakdownMap, ruleset);
    }

    this.finalizeBreakdowns(standingsMap, breakdownMap);
  }

  private processFlexMatch(
    match: FlexMatchRow,
    standingsMap: Map<string, StandingsEntry>,
    breakdownMap: Map<string, Map<string, VictoryQualityDetail>>,
    ruleset: TournamentRulesetPayload,
  ): void {
    const outcome = this.outcomeInfo(ruleset, match.outcomeTypeId);
    const ranks = resolveStoredRanks(match.sides, match.winnerSide);
    const playerIdsOf = (side: FlexMatchRow["sides"][number]) => side.entry.players.map((ep) => ep.playerId);

    for (const side of match.sides) {
      const ctx = {
        result: sideOutcome(ranks, side.position),
        opponents: opposingSides(match.sides, side.position, ranks, playerIdsOf),
        match,
        standingsMap,
        breakdownMap,
        outcome,
      };
      for (const pid of playerIdsOf(side)) this.processFlexPlayer(pid, ctx);
    }
  }

  private processFlexPlayer(
    playerId: string,
    ctx: {
      result: RankOutcome;
      opponents: OpposingSide[];
      match: FlexMatchRow;
      standingsMap: Map<string, StandingsEntry>;
      breakdownMap: Map<string, Map<string, VictoryQualityDetail>>;
      outcome: OutcomeInfo;
    },
  ): void {
    const entry = ctx.standingsMap.get(playerId);
    if (!entry) return;

    const pp = ctx.match.playerPoints.find((p) => p.playerId === playerId);
    if (!pp?.countsForRanking) return;

    this.applyVictoryQuality(ctx.breakdownMap, playerId, entry, ctx.outcome, ctx.result.isWin, ctx.result.isLoss);
    this.applyFlexBuchholz(
      entry,
      ctx.opponents.flatMap((o) => o.ids),
      ctx.standingsMap,
    );
    this.applyHeadToHead(entry, ctx.opponents);
  }

  // Buchholz: average opponents' points per match (normalizes 2v2, 3v3, etc.)
  private applyFlexBuchholz(
    entry: StandingsEntry,
    opponentIds: string[],
    standingsMap: Map<string, StandingsEntry>,
  ): void {
    let oppTotal = 0;
    let counted = 0;
    for (const oppId of opponentIds) {
      const opp = standingsMap.get(oppId);
      if (opp) {
        oppTotal += opp.points;
        counted++;
      }
    }
    if (counted > 0) entry.buchholzScore += oppTotal / counted;
  }

  // ── Static standings ─────────────────────────────────────────────────

  private async calculateStaticStandings(
    tournamentId: string,
    includeStatuses: MatchStatus[],
    scoring: TournamentScoringConfig,
    allowDraw: boolean,
    scoreEnabled: boolean,
  ): Promise<StandingsResult> {
    const standingsMap = await this.initializeStaticStandings(tournamentId);

    const matchRows = await standingsRepository.getMatchesWithSides(tournamentId, includeStatuses);

    for (const match of matchRows) {
      this.accumulateStaticBaseStats(match, standingsMap, scoring, scoreEnabled);
    }

    // Pass 2: static tiebreakers, priced with the ruleset this competition ran on
    const ruleset = await tournamentRulesetService.getForTournament(tournamentId);
    this.computeStaticTiebreakers(standingsMap, matchRows, ruleset);

    const standings = Array.from(standingsMap.values());
    this.sortStandings(standings, allowDraw);
    return { standings };
  }

  private accumulateStaticBaseStats(
    match: StaticMatchRow,
    standingsMap: Map<string, StandingsEntry>,
    scoring: TournamentScoringConfig,
    scoreEnabled: boolean,
  ): void {
    const { sides } = match;
    if (sides.length < 2) return;
    // A side whose team is missing would make the match one-sided for the others.
    if (sides.some((side) => !side.entry?.teamId || !standingsMap.has(side.entry.teamId))) return;

    const ranks = resolveStoredRanks(sides, match.winnerSide);
    for (const side of sides) {
      this.updateStandingsForSide(standingsMap.get(side.entry!.teamId!)!, side, scoring, {
        outcome: sideOutcome(ranks, side.position),
        conceded: bestOpposingScore(sides, side.position),
        scoreEnabled,
      });
    }
  }

  private computeStaticTiebreakers(
    standingsMap: Map<string, StandingsEntry>,
    matchRows: StaticMatchRow[],
    ruleset: TournamentRulesetPayload,
  ): void {
    this.initRatioFields(standingsMap);

    const breakdownMap = new Map<string, Map<string, VictoryQualityDetail>>();
    for (const match of matchRows) {
      this.processStaticMatch(match, standingsMap, breakdownMap, ruleset);
    }

    this.finalizeBreakdowns(standingsMap, breakdownMap);
  }

  private processStaticMatch(
    match: StaticMatchRow,
    standingsMap: Map<string, StandingsEntry>,
    breakdownMap: Map<string, Map<string, VictoryQualityDetail>>,
    ruleset: TournamentRulesetPayload,
  ): void {
    const { sides } = match;
    if (sides.length < 2) return;
    if (sides.some((side) => !side.entry?.teamId || !standingsMap.has(side.entry.teamId))) return;

    const outcome = this.outcomeInfo(ruleset, match.outcomeTypeId);
    const ranks = resolveStoredRanks(sides, match.winnerSide);
    for (const side of sides) {
      const teamId = side.entry!.teamId!;
      this.processStaticTeam({
        teamId,
        entry: standingsMap.get(teamId)!,
        opponents: opposingSides(sides, side.position, ranks, (s) => [s.entry!.teamId!]),
        result: sideOutcome(ranks, side.position),
        standingsMap,
        breakdownMap,
        outcome,
      });
    }
  }

  private processStaticTeam(args: {
    teamId: string;
    entry: StandingsEntry;
    opponents: OpposingSide[];
    result: RankOutcome;
    standingsMap: Map<string, StandingsEntry>;
    breakdownMap: Map<string, Map<string, VictoryQualityDetail>>;
    outcome: OutcomeInfo;
  }): void {
    const { teamId, entry, opponents, result, standingsMap, breakdownMap, outcome } = args;
    this.applyVictoryQuality(breakdownMap, teamId, entry, outcome, result.isWin, result.isLoss);
    // Buchholz: the opponents' points, averaged so a 1v1v1 weighs like a duel.
    const oppPoints = opponents.map((o) => standingsMap.get(o.ids[0])?.points ?? 0);
    entry.buchholzScore += oppPoints.reduce((sum, p) => sum + p, 0) / opponents.length;
    this.applyHeadToHead(entry, opponents);
  }

  // ── Tiebreaker shared helpers ─────────────────────────────────────────

  private initRatioFields(standingsMap: Map<string, StandingsEntry>): void {
    for (const entry of standingsMap.values()) {
      entry.winLossRatio = entry.wins / Math.max(1, entry.losses);
      entry.winRate = entry.wins / Math.max(1, entry.matchesPlayed);
    }
  }

  private finalizeBreakdowns(
    standingsMap: Map<string, StandingsEntry>,
    breakdownMap: Map<string, Map<string, VictoryQualityDetail>>,
  ): void {
    for (const [id, breakdown] of breakdownMap) {
      const entry = standingsMap.get(id);
      if (entry) entry.victoryQualityBreakdown = Array.from(breakdown.values());
    }
  }

  /**
   * Outcome as the competition was played under it.
   *
   * Read from the competition's ruleset snapshot, never from the live
   * `outcome_types` row: `victoryQuality` is recomputed on every cache miss, so
   * a live read meant renaming an outcome or changing its points rewrote the
   * tiebreaker history of competitions that were already finished.
   */
  private outcomeInfo(ruleset: TournamentRulesetPayload, outcomeTypeId: string | null): OutcomeInfo {
    const outcome = resolveRulesetOutcome(ruleset, outcomeTypeId);
    return {
      key: outcomeTypeId ?? "default",
      name: outcome.name,
      points: outcome.points,
    };
  }

  private applyVictoryQuality(
    breakdownMap: Map<string, Map<string, VictoryQualityDetail>>,
    id: string,
    entry: StandingsEntry,
    outcome: OutcomeInfo,
    isWin: boolean,
    isLoss: boolean,
  ): void {
    if (!breakdownMap.has(id)) breakdownMap.set(id, new Map());
    const breakdown = breakdownMap.get(id)!;
    if (!breakdown.has(outcome.key)) {
      breakdown.set(outcome.key, {
        outcomeTypeName: outcome.name,
        points: outcome.points,
        wins: 0,
        losses: 0,
        contribution: 0,
      });
    }
    const detail = breakdown.get(outcome.key)!;
    if (isWin) {
      detail.wins++;
      entry.victoryQuality += outcome.points;
    } else if (isLoss) {
      detail.losses++;
      entry.victoryQuality -= outcome.points;
    }
    detail.contribution = (detail.wins - detail.losses) * detail.points;
  }

  /** Head-to-head against every opponent, scored on the duel with their own side. */
  private applyHeadToHead(entry: StandingsEntry, opponents: OpposingSide[]): void {
    for (const { ids, result } of opponents) {
      for (const oppId of ids) {
        if (!entry.headToHead[oppId]) {
          entry.headToHead[oppId] = { wins: 0, draws: 0, losses: 0 };
        }
        const h2h = entry.headToHead[oppId];
        if (result === 0.5) h2h.draws += 1;
        else if (result === 1) h2h.wins += 1;
        else h2h.losses += 1;
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async initializeFlexStandings(tournamentId: string): Promise<Map<string, StandingsEntry>> {
    const standingsMap = new Map<string, StandingsEntry>();
    const entries = await standingsRepository.getTournamentEntries(tournamentId);
    const playersMap = new Map<string, { id: string; name: string; shortName: string }>();

    for (const entry of entries) {
      for (const ep of entry.players) {
        if (!playersMap.has(ep.playerId)) {
          playersMap.set(ep.playerId, {
            id: ep.playerId,
            name: ep.player.displayName,
            shortName: ep.player.shortName,
          });
        }
      }
    }

    for (const player of playersMap.values()) {
      standingsMap.set(player.id, this.emptyEntry(player.id, player.name, player.shortName));
    }

    return standingsMap;
  }

  private async initializeStaticStandings(tournamentId: string): Promise<Map<string, StandingsEntry>> {
    const standingsMap = new Map<string, StandingsEntry>();
    const teams = await standingsRepository.getTournamentTeams(tournamentId);

    for (const team of teams) {
      standingsMap.set(team.id, this.emptyEntry(team.id, team.name, team.name.substring(0, 5).toUpperCase()));
    }

    return standingsMap;
  }

  private emptyEntry(id: string, name: string, shortName: string): StandingsEntry {
    return {
      id,
      name,
      shortName,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      scoreDiff: 0,
      matchesPlayed: 0,
      winLossRatio: 0,
      buchholzScore: 0,
      victoryQuality: 0,
      victoryQualityBreakdown: [],
      winRate: 0,
      headToHead: {},
    };
  }

  private updateStandingsForSide(
    entry: StandingsEntry,
    side: { score: number | null; pointsAwarded: number | null },
    scoring: TournamentScoringConfig,
    ctx: { outcome: RankOutcome; conceded: number; scoreEnabled: boolean },
  ) {
    if (ctx.scoreEnabled) {
      entry.scored += side.score ?? 0;
      entry.conceded += ctx.conceded;
      entry.scoreDiff = entry.scored - entry.conceded;
    }

    const isDraw = ctx.outcome.isDraw;
    const wins = ctx.outcome.isWin;

    if (isDraw) {
      entry.draws += 1;
      entry.points += side.pointsAwarded ?? scoring.pointPerDraw;
    } else if (wins) {
      entry.wins += 1;
      entry.points += side.pointsAwarded ?? scoring.pointPerVictory;
    } else {
      entry.losses += 1;
      entry.points += side.pointsAwarded ?? scoring.pointPerLoss;
    }

    entry.matchesPlayed += 1;
  }

  // ── Sort ─────────────────────────────────────────────────────────────

  private sortStandings(standings: StandingsEntry[], allowDraw: boolean): void {
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (allowDraw && b.winLossRatio !== a.winLossRatio) return b.winLossRatio - a.winLossRatio;
      if (b.buchholzScore !== a.buchholzScore) return b.buchholzScore - a.buchholzScore;
      return a.id.localeCompare(b.id);
    });

    // H2H is criterion #5; victoryQuality and winRate are fallbacks within tied subgroups
    this.applyHeadToHeadSubgroupSort(standings);
  }

  /**
   * For groups tied on points/wins/ratio/buchholz, re-sort within the group
   * using head-to-head records (H2H wins DESC → H2H winRate DESC).
   */
  private applyHeadToHeadSubgroupSort(standings: StandingsEntry[]): void {
    let groupStart = 0;
    while (groupStart < standings.length) {
      let groupEnd = groupStart + 1;
      const ref = standings[groupStart];

      while (
        groupEnd < standings.length &&
        standings[groupEnd].points === ref.points &&
        standings[groupEnd].wins === ref.wins &&
        standings[groupEnd].winLossRatio === ref.winLossRatio &&
        standings[groupEnd].buchholzScore === ref.buchholzScore
      ) {
        groupEnd++;
      }

      if (groupEnd - groupStart > 1) {
        const group = standings.slice(groupStart, groupEnd);
        this.sortGroupByH2H(group);
        for (let i = 0; i < group.length; i++) {
          standings[groupStart + i] = group[i];
        }
      }

      groupStart = groupEnd;
    }
  }

  private sortGroupByH2H(group: StandingsEntry[]): void {
    const ids = new Set(group.map((e) => e.id));

    // Compute H2H stats within the subgroup only
    const h2hWins = new Map<string, number>();
    const h2hPlayed = new Map<string, number>();

    for (const entry of group) {
      let wins = 0;
      let played = 0;
      for (const [oppId, rec] of Object.entries(entry.headToHead)) {
        if (!ids.has(oppId)) continue;
        wins += rec.wins;
        played += rec.wins + rec.draws + rec.losses;
      }
      h2hWins.set(entry.id, wins);
      h2hPlayed.set(entry.id, played);
    }

    group.sort((a, b) => {
      const winsA = h2hWins.get(a.id) ?? 0;
      const winsB = h2hWins.get(b.id) ?? 0;
      if (winsB !== winsA) return winsB - winsA;

      const playedA = h2hPlayed.get(a.id) ?? 0;
      const playedB = h2hPlayed.get(b.id) ?? 0;
      const rateA = winsA / Math.max(1, playedA);
      const rateB = winsB / Math.max(1, playedB);
      if (rateB !== rateA) return rateB - rateA;

      // Fall through to quality/winRate already computed
      if (b.victoryQuality !== a.victoryQuality) return b.victoryQuality - a.victoryQuality;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.id.localeCompare(b.id);
    });
  }

  // ── Cache ─────────────────────────────────────────────────────────────

  async clearCache(tournamentId: string, userId: string): Promise<void> {
    const canManage = await tournamentService.canManageTournament(tournamentId, userId);
    if (!canManage) throw new ForbiddenError(ErrorCode.FORBIDDEN);
    await standingsRepository.deleteComputedData(tournamentId);
    // Open pages would otherwise keep showing what they fetched before the clear
    const tournament = await participantRepository.findTournamentById(tournamentId);
    if (tournament) notifyRankingChanged(tournament);
  }

  // ── Recalculate ──────────────────────────────────────────────────────

  async recalculatePoints(tournamentId: string, userId: string): Promise<{ updatedMatches: number }> {
    const canManage = await tournamentService.canManageTournament(tournamentId, userId);
    if (!canManage) throw new ForbiddenError(ErrorCode.FORBIDDEN);

    return this.recalculatePointsInternal(tournamentId);
  }

  async recalculatePointsInternal(tournamentId: string): Promise<{ updatedMatches: number }> {
    // Invalidate cache so next request recomputes fresh
    await standingsRepository.deleteComputedData(tournamentId);

    const tournament = await standingsRepository.getTournamentWithScoring(tournamentId);
    if (!tournament) throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);

    const scoring = resolveScoringConfig(tournament.scoringConfig);
    const statuses: MatchStatus[] = PROVISIONAL_MATCH_STATUSES;

    const matchList = await standingsRepository.getMatchesForStandings(tournamentId, statuses);
    const allSides = await standingsRepository.getMatchSides(matchList.map((m) => m.id));

    const sidesMap = new Map<string, typeof allSides>();
    for (const side of allSides) {
      if (!sidesMap.has(side.matchId)) sidesMap.set(side.matchId, []);
      sidesMap.get(side.matchId)!.push(side);
    }

    for (const match of matchList) {
      const sides = sidesMap.get(match.id) ?? [];
      if (sides.length < 2) continue;

      const points = this.pointsByPosition(match, sides, scoring);
      for (const side of sides) {
        await matchSidesRepository.updatePointsAwarded(match.id, side.entryId, points.get(side.position) ?? 0);
      }
    }

    if (tournament.teamMode === "flex") {
      await this.rebuildPlayerPoints(tournamentId, matchList, sidesMap, scoring, {
        maxMatchesPerPlayer: tournament.championshipConfig?.maxMatchesPerPlayer,
      });
    }

    return { updatedMatches: matchList.length };
  }

  /** Points of every side under the current scale, from the stored placement. */
  private pointsByPosition(
    match: RebuildMatch,
    sides: RebuildSide[],
    scoring: TournamentScoringConfig,
  ): Map<number, number> {
    const ranks = resolveStoredRanks(sides, match.winnerSide);
    const outcome = computeMatchOutcome(
      sides.map((s) => ({ position: s.position, score: s.score, rank: ranks.get(s.position) ?? 1 })),
      scoring,
    );
    return new Map(outcome.sides.map((r) => [r.position, r.pointsAwarded]));
  }

  private async rebuildPlayerPoints(
    tournamentId: string,
    matchList: RebuildMatch[],
    sidesMap: Map<string, RebuildSide[]>,
    scoring: TournamentScoringConfig,
    caps: { maxMatchesPerPlayer?: number },
  ) {
    const statuses: MatchStatus[] = PROVISIONAL_MATCH_STATUSES;
    await standingsRepository.deletePlayerPointsForTournament(tournamentId, statuses);

    // No championship config means no cap: every match counts for the ranking.
    const maxMatches = caps.maxMatchesPerPlayer ?? Infinity;
    const playerMatchCount = new Map<string, number>();
    const sorted = [...matchList].sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());

    const rows: PlayerPointRow[] = [];
    for (const match of sorted) {
      const sides = sidesMap.get(match.id) ?? [];
      if (sides.length < 2) continue;
      this.collectMatchPlayerPoints(match, sides, scoring, { playerMatchCount, maxMatches, rows });
    }

    await standingsRepository.insertPlayerPoints(rows);
  }

  private collectMatchPlayerPoints(
    match: RebuildMatch,
    sides: RebuildSide[],
    scoring: TournamentScoringConfig,
    acc: { playerMatchCount: Map<string, number>; maxMatches: number; rows: PlayerPointRow[] },
  ): void {
    const points = this.pointsByPosition(match, sides, scoring);

    for (const side of sides) {
      const pts = points.get(side.position) ?? 0;

      for (const { playerId } of side.entry?.players ?? []) {
        const prior = acc.playerMatchCount.get(playerId) ?? 0;
        const countsForRanking = prior < acc.maxMatches;
        acc.rows.push({
          matchId: match.id,
          playerId,
          pointsAwarded: countsForRanking ? pts : 0,
          countsForRanking,
        });
        if (countsForRanking) acc.playerMatchCount.set(playerId, prior + 1);
      }
    }
  }
}

export const standingsService = new StandingsService();
