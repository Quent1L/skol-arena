import { playerStatsRepository } from "../repository/player-stats.repository";
import { matchSidesRepository } from "../repository/match-sides.repository";
import { playerComputedDataRepository } from "../repository/player-computed-data.repository";
import { NotFoundError, ErrorCode } from "../types/errors";
import { MIN_WEIGHTED_RATE_MATCHES, rankByWeightedRate, TOP_WEIGHTED_RATE } from "./stats-ranking";
import type {
  PlayerProfile,
  PlayerDetailStats,
  PlayerRelationStat,
  PlayerStatsResponse,
  PlayerStatsFilters,
  PlayerTournamentOption,
  PlayerTournamentEntry,
  PlayerMatchHistoryQuery,
  ClientMatchHistoryEntry,
  HistoryMatchSide,
  HistoryMatchSidePlayer,
  PlayerOutcomeTypeStat,
  PlayerH2HStat,
  H2HSubRecord,
  PlayerHeadToHeadRecord,
  PlayerTeamupRecord,
  PlayerComparisonResponse,
} from "@skol-arena/shared";
import { visibleOrganizationIdsFor } from "./visibility";
import { winRatePercent } from "../utils/win-rate";

type ExtendedFilters = PlayerStatsFilters & { allowedModes?: string[] };

type MatchResult = {
  matchId: string;
  entryId: string;
  ownScore: number | null;
  ownPosition: number;
  winnerSide: string | null;
  oppEntryId: string;
  oppScore: number | null;
  allowDraw: boolean | null;
  pointsAwarded: number | null;
  outcomeTypeId: string | null;
};

type SideOutcome = { ownPosition: number; winnerSide: string | null };

function isWinResult(r: SideOutcome): boolean {
  return (r.ownPosition === 1 && r.winnerSide === "A") || (r.ownPosition === 2 && r.winnerSide === "B");
}

function isLossResult(r: SideOutcome): boolean {
  return (r.ownPosition === 1 && r.winnerSide === "B") || (r.ownPosition === 2 && r.winnerSide === "A");
}

type EntryPlayer = { playerId: string; displayName: string; shortName: string };

function groupPlayersByEntry(
  rows: Array<{ entryId: string; playerId: string; displayName: string; shortName: string }>,
): Map<string, EntryPlayer[]> {
  const map = new Map<string, EntryPlayer[]>();
  for (const p of rows) {
    if (!map.has(p.entryId)) map.set(p.entryId, []);
    map.get(p.entryId)!.push({ playerId: p.playerId, displayName: p.displayName, shortName: p.shortName });
  }
  return map;
}

type H2HAcc = { played: number; playerAWins: number; playerBWins: number; draws: number };

function tabulateH2HMatch(
  r: MatchResult,
  playerCounts: Map<string, number>,
  soloAcc: H2HAcc,
  teamAcc: H2HAcc,
) {
  const aCount = playerCounts.get(r.entryId) ?? 1;
  const bCount = playerCounts.get(r.oppEntryId) ?? 1;
  const acc = aCount === 1 && bCount === 1 ? soloAcc : teamAcc;
  acc.played++;
  if (isWinResult(r)) acc.playerAWins++;
  else if (isLossResult(r)) acc.playerBWins++;
  else if (r.winnerSide === null && r.allowDraw) acc.draws++;
}

function buildH2HSubRecord(acc: H2HAcc): H2HSubRecord {
  return {
    matchesPlayed: acc.played,
    playerAWins: acc.playerAWins,
    playerBWins: acc.playerBWins,
    draws: acc.draws,
    playerAWinRate: winRatePercent(acc.playerAWins, acc.played),
  };
}

type RelationAcc = {
  displayName: string;
  shortName: string;
  wins: number;
  losses: number;
  draws: number;
  count: number;
};

function accumulatePlayer(
  acc: Map<string, RelationAcc>,
  p: EntryPlayer,
  win: boolean,
  loss: boolean,
  draw: boolean,
) {
  if (!acc.has(p.playerId)) {
    acc.set(p.playerId, { displayName: p.displayName, shortName: p.shortName, wins: 0, losses: 0, draws: 0, count: 0 });
  }
  const s = acc.get(p.playerId)!;
  s.count++;
  if (win) s.wins++;
  else if (loss) s.losses++;
  else if (draw) s.draws++;
}

function tallyRelations(
  matchResults: MatchResult[],
  entryToPlayers: Map<string, EntryPlayer[]>,
  pickEntryId: (r: MatchResult) => string,
  excludePlayerId?: string,
): Map<string, RelationAcc> {
  const acc = new Map<string, RelationAcc>();
  const seenMatches = new Set<string>();

  for (const r of matchResults) {
    if (seenMatches.has(r.matchId)) continue;
    seenMatches.add(r.matchId);
    const win = isWinResult(r);
    const loss = isLossResult(r);
    const draw = r.winnerSide === null && (r.allowDraw ?? false);

    for (const p of entryToPlayers.get(pickEntryId(r)) ?? []) {
      if (excludePlayerId && p.playerId === excludePlayerId) continue;
      accumulatePlayer(acc, p, win, loss, draw);
    }
  }
  return acc;
}

const TOP_RELATIONS = TOP_WEIGHTED_RATE;

/**
 * Separates two relations the weighted rate and the sample size cannot: the more
 * decisive record first, and only then the player id.
 *
 * Display names are not part of the chain even though they would read better
 * than a uuid: they are editable, and a ranking that reshuffles because someone
 * changed their name is a ranking nobody can trust. The id carries no meaning
 * whatsoever, which is exactly why it belongs at the very end — it guarantees a
 * total order rather than acting as a criterion.
 */
export function compareRelations(a: PlayerRelationStat, b: PlayerRelationStat): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

/**
 * Ranks relations by success rate weighted by sample size (rate × √matches), so a
 * single lucky match never outranks a long, consistently good record. Relations below
 * MIN_WEIGHTED_RATE_MATCHES are dropped entirely: an empty list hides the card
 * client-side rather than advertising a statistic nobody should trust.
 */
export function rankRelationsByWeightedRate(
  relations: PlayerRelationStat[],
  rateOf: (r: PlayerRelationStat) => number,
): PlayerRelationStat[] {
  return rankByWeightedRate(
    relations,
    rateOf,
    (r) => r.count,
    MIN_WEIGHTED_RATE_MATCHES,
    compareRelations,
  );
}

function accumulateTournamentMatches(
  base: PlayerTournamentEntry,
  entryIds: string[],
  matchesByEntry: Map<string, MatchResult[]>,
): number {
  const seenMatches = new Set<string>();
  let totalPoints = 0;

  for (const entryId of entryIds) {
    for (const r of matchesByEntry.get(entryId) ?? []) {
      if (seenMatches.has(r.matchId)) continue;
      seenMatches.add(r.matchId);
      base.matchesPlayed++;
      totalPoints += r.pointsAwarded ?? 0;
      if (isWinResult(r)) base.wins++;
      else if (isLossResult(r)) base.losses++;
      else if (r.winnerSide === null && r.allowDraw) base.draws++;
    }
  }
  return totalPoints;
}

export class PlayerStatsService {
  async getPlayerProfile(playerId: string): Promise<PlayerProfile> {
    const user = await playerStatsRepository.getPlayerProfile(playerId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    return { id: user.id, displayName: user.displayName, shortName: user.shortName };
  }

  async getPlayerTournaments(playerId: string, viewerId: string | null): Promise<PlayerTournamentOption[]> {
    const visibleOrganizationIds = await visibleOrganizationIdsFor(viewerId);
    const rows = await playerStatsRepository.getPlayerTournaments(playerId, visibleOrganizationIds);
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .map((r) => ({
        id: r.id,
        name: r.name,
        mode: r.mode,
        teamMode: r.teamMode ?? undefined,
        disciplineId: r.disciplineId ?? undefined,
        disciplineName: r.disciplineName ?? undefined,
      }));
  }

  /**
   * Returns the cache key for these filters, or null when the result is not cacheable.
   * The global view depends on which organizations the viewer may see, so it is keyed
   * by that scope: a member's cached page must never be served to an outsider.
   */
  private statsCacheKey(filters: ExtendedFilters, visibleOrganizationIds: string[] | null): string | null {
    const isNarrowed = !!(filters.disciplineId || filters.tournamentMode || filters.teamMode || filters.allowedModes?.length);
    if (isNarrowed) return null;
    if (filters.tournamentId) return `stats:tournament:${filters.tournamentId}`;

    const scope = visibleOrganizationIds === null
      ? "all"
      : Bun.hash([...visibleOrganizationIds].sort().join(",")).toString(36);
    return `stats:global:${scope}`;
  }

  async getPlayerStats(
    playerId: string,
    filters: PlayerStatsFilters,
    viewerId: string | null,
  ): Promise<PlayerStatsResponse> {
    const visibleOrganizationIds = await visibleOrganizationIdsFor(viewerId);
    return await this.computePlayerStats(playerId, filters, visibleOrganizationIds);
  }

  private async computePlayerStats(
    playerId: string,
    filters: ExtendedFilters,
    visibleOrganizationIds: string[] | null,
  ): Promise<PlayerStatsResponse> {
    const cacheKey = this.statsCacheKey(filters, visibleOrganizationIds);

    if (cacheKey) {
      const cached = await playerComputedDataRepository.get(playerId, cacheKey);
      if (cached) {
        const player = await this.getPlayerProfile(playerId);
        return { player, stats: cached, filters };
      }
    }

    const player = await this.getPlayerProfile(playerId);
    const entries = await playerStatsRepository.getPlayerEntries(playerId, filters, visibleOrganizationIds);

    if (entries.length === 0) {
      return this.buildEmptyResponse(player, filters);
    }

    const playerEntryIds = entries.map((e) => e.entryId);
    const matchResults = await playerStatsRepository.getPlayerMatchResults(playerEntryIds, playerId);

    if (matchResults.length === 0) {
      return this.buildEmptyResponse(player, filters);
    }

    const baseStats = this.aggregateBaseStats(matchResults);
    const partnerStats = await this.computePartnerStats(matchResults, playerEntryIds, playerId, baseStats.winRate);
    const nemesisStats = await this.computeNemesisStats(matchResults, playerEntryIds, playerId);
    const h2hStats = await this.computeH2HStats(matchResults, playerId);
    const outcomeTypeStats = await this.computeOutcomeTypeStats(matchResults);
    const tournamentHistory = await this.buildTournamentHistory(entries, matchResults);
    const recentForm = await this.computeRecentForm(playerId, filters.tournamentId, visibleOrganizationIds);

    const stats: PlayerDetailStats = {
      ...baseStats,
      tournamentsParticipated: new Set(entries.map((e) => e.tournamentId)).size,
      recentForm,
      mostFrequentPartners: partnerStats.frequent,
      bestPartners: partnerStats.best,
      nemeses: nemesisStats,
      outcomeTypeStats,
      h2hStats,
      tournamentHistory,
    };

    if (cacheKey) {
      await playerComputedDataRepository.set(playerId, cacheKey, stats);
    }

    return { player, stats, filters };
  }

  async getComparison(
    playerAId: string,
    playerBId: string,
    userFilters: PlayerStatsFilters,
    viewerId: string | null,
  ): Promise<PlayerComparisonResponse> {
    const visibleOrganizationIds = await visibleOrganizationIdsFor(viewerId);
    const validModes = ['championship', 'ranked'] as const;
    const mode = validModes.includes(userFilters.tournamentMode as typeof validModes[number])
      ? userFilters.tournamentMode
      : undefined;

    const filters: ExtendedFilters = {
      disciplineId: userFilters.disciplineId,
      tournamentId: userFilters.tournamentId,
      teamMode: 'flex',
      ...(mode ? { tournamentMode: mode } : { allowedModes: [...validModes] }),
    };

    const [playerA, playerB, headToHead, together] = await Promise.all([
      this.computePlayerStats(playerAId, filters, visibleOrganizationIds),
      this.computePlayerStats(playerBId, filters, visibleOrganizationIds),
      this.computeDirectH2H(playerAId, playerBId, filters, visibleOrganizationIds),
      this.computeTogether(playerAId, playerBId, filters, visibleOrganizationIds),
    ]);

    return { playerA, playerB, headToHead, together, filters };
  }

  /** Record of player A and B when they played on the same side (teammates) */
  private async computeTogether(
    playerAId: string,
    playerBId: string,
    filters: ExtendedFilters,
    visibleOrganizationIds: string[] | null,
  ): Promise<PlayerTeamupRecord> {
    const empty: PlayerTeamupRecord = { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };

    const entries = await playerStatsRepository.getPlayerEntries(playerAId, filters, visibleOrganizationIds);
    if (entries.length === 0) return empty;

    const playerEntryIds = entries.map((e) => e.entryId);
    const matchResults = await playerStatsRepository.getPlayerMatchResults(playerEntryIds, playerAId);
    if (matchResults.length === 0) return empty;

    const playersInOwnEntries = await playerStatsRepository.getPlayersInEntries(playerEntryIds);
    const entryToPlayers = groupPlayersByEntry(playersInOwnEntries);

    const ownEntriesWithB = new Set(
      [...entryToPlayers.entries()]
        .filter(([, players]) => players.some((p) => p.playerId === playerBId))
        .map(([entryId]) => entryId),
    );

    const seenMatches = new Set<string>();
    let wins = 0, losses = 0, draws = 0;

    for (const r of matchResults) {
      if (seenMatches.has(r.matchId)) continue;
      if (!ownEntriesWithB.has(r.entryId)) continue;
      seenMatches.add(r.matchId);
      if (isWinResult(r)) wins++;
      else if (isLossResult(r)) losses++;
      else if (r.winnerSide === null && r.allowDraw) draws++;
    }

    const matchesPlayed = seenMatches.size;
    return {
      matchesPlayed,
      wins,
      losses,
      draws,
      winRate: winRatePercent(wins, matchesPlayed),
    };
  }

  /** Direct head-to-head record from player A's perspective vs player B */
  private async computeDirectH2H(
    playerAId: string,
    playerBId: string,
    filters: ExtendedFilters,
    visibleOrganizationIds: string[] | null,
  ): Promise<PlayerHeadToHeadRecord> {
    const emptySubRecord: H2HSubRecord = { matchesPlayed: 0, playerAWins: 0, playerBWins: 0, draws: 0, playerAWinRate: 0 };
    const empty: PlayerHeadToHeadRecord = { ...emptySubRecord, solo: { ...emptySubRecord }, team: { ...emptySubRecord } };

    const entries = await playerStatsRepository.getPlayerEntries(playerAId, filters, visibleOrganizationIds);
    if (entries.length === 0) return empty;

    const playerAEntryIds = entries.map((e) => e.entryId);
    const matchResults = await playerStatsRepository.getPlayerMatchResults(playerAEntryIds, playerAId);
    if (matchResults.length === 0) return empty;

    const oppEntryIds = [...new Set(matchResults.map((r) => r.oppEntryId))];
    const playersInOppEntries = await playerStatsRepository.getPlayersInEntries(oppEntryIds);
    const entryToPlayers = groupPlayersByEntry(playersInOppEntries);

    const oppEntriesWithB = new Set(
      [...entryToPlayers.entries()]
        .filter(([, players]) => players.some((p) => p.playerId === playerBId))
        .map(([entryId]) => entryId),
    );

    const relevantOwnEntryIds = [...new Set(
      matchResults
        .filter((r) => oppEntriesWithB.has(r.oppEntryId))
        .map((r) => r.entryId),
    )];
    const relevantOppEntryIds = [...oppEntriesWithB];
    const playerCounts = await playerStatsRepository.getEntryPlayerCounts([...relevantOwnEntryIds, ...relevantOppEntryIds]);

    const seenMatches = new Set<string>();
    const soloAcc: H2HAcc = { played: 0, playerAWins: 0, playerBWins: 0, draws: 0 };
    const teamAcc: H2HAcc = { played: 0, playerAWins: 0, playerBWins: 0, draws: 0 };

    for (const r of matchResults) {
      if (seenMatches.has(r.matchId)) continue;
      if (!oppEntriesWithB.has(r.oppEntryId)) continue;
      seenMatches.add(r.matchId);
      tabulateH2HMatch(r, playerCounts, soloAcc, teamAcc);
    }

    const solo = buildH2HSubRecord(soloAcc);
    const team = buildH2HSubRecord(teamAcc);
    const totalWins = solo.playerAWins + team.playerAWins;
    const totalLosses = solo.playerBWins + team.playerBWins;
    const totalDraws = solo.draws + team.draws;
    const matchesPlayed = solo.matchesPlayed + team.matchesPlayed;

    return {
      matchesPlayed,
      playerAWins: totalWins,
      playerBWins: totalLosses,
      draws: totalDraws,
      playerAWinRate: winRatePercent(totalWins, matchesPlayed),
      solo,
      team,
    };
  }

  async invalidateCache(playerId: string): Promise<void> {
    await playerComputedDataRepository.deleteMany([playerId]);
  }

  async invalidateCacheForTournament(tournamentId: string): Promise<void> {
    const playerIds = await playerStatsRepository.getPlayerIdsByTournament(tournamentId);
    if (playerIds.length > 0) {
      await playerComputedDataRepository.deleteMany(playerIds);
    }
  }

  private aggregateBaseStats(matchResults: MatchResult[]) {
    const seen = new Set<string>();
    let wins = 0, draws = 0, losses = 0, totalScore = 0;

    for (const r of matchResults) {
      if (seen.has(r.matchId)) continue;
      seen.add(r.matchId);
      totalScore += r.ownScore ?? 0;
      if (isWinResult(r)) wins++;
      else if (isLossResult(r)) losses++;
      else if (r.winnerSide === null && r.allowDraw) draws++;
    }

    const totalMatches = seen.size;
    return {
      totalMatches,
      wins,
      draws,
      losses,
      winRate: winRatePercent(wins, totalMatches),
      averageScore: totalMatches > 0 ? Math.round((totalScore / totalMatches) * 10) / 10 : 0,
    };
  }

  private async computeRecentForm(
    playerId: string,
    tournamentId: string | undefined,
    visibleOrganizationIds: string[] | null,
  ): Promise<Array<'V' | 'D' | 'N'>> {
    const rows = await playerStatsRepository.getPlayerRecentForm(playerId, 10, tournamentId, visibleOrganizationIds);
    // Reverse so index 0 = oldest, last = most recent (left→right = old→recent)
    return [...rows].reverse().map((r) => {
      if (isWinResult(r)) return 'V';
      if (isLossResult(r)) return 'D';
      return 'N';
    });
  }

  private async computeOutcomeTypeStats(matchResults: MatchResult[]): Promise<PlayerOutcomeTypeStat[]> {
    const seen = new Set<string>();
    const byType = new Map<string, { played: number; wins: number; losses: number; draws: number }>();

    for (const r of matchResults) {
      if (seen.has(r.matchId)) continue;
      seen.add(r.matchId);
      if (!r.outcomeTypeId) continue;
      if (!byType.has(r.outcomeTypeId)) byType.set(r.outcomeTypeId, { played: 0, wins: 0, losses: 0, draws: 0 });
      const s = byType.get(r.outcomeTypeId)!;
      s.played++;
      if (isWinResult(r)) s.wins++;
      else if (isLossResult(r)) s.losses++;
      else if (r.winnerSide === null && r.allowDraw) s.draws++;
    }

    if (byType.size === 0) return [];
    const names = await playerStatsRepository.getOutcomeTypeNames([...byType.keys()]);
    const nameMap = new Map(names.map((n) => [n.id, n.name]));

    return [...byType.entries()]
      .map(([id, s]) => {
        const matchesPlayed = s.played;
        return {
          outcomeTypeId: id,
          outcomeTypeName: nameMap.get(id) ?? id,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          matchesPlayed,
          winRate: winRatePercent(s.wins, matchesPlayed),
        };
      })
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
  }

  private async computeH2HStats(
    matchResults: MatchResult[],
    playerId: string,
  ): Promise<PlayerH2HStat[]> {
    const oppEntryIds = [...new Set(matchResults.map((r) => r.oppEntryId))];
    const playersInOppEntries = await playerStatsRepository.getPlayersInEntries(oppEntryIds);
    const entryToPlayers = groupPlayersByEntry(playersInOppEntries);

    const h2h = tallyRelations(matchResults, entryToPlayers, (r) => r.oppEntryId, playerId);

    return [...h2h.entries()]
      .map(([id, s]) => {
        const matchesPlayed = s.count;
        return {
          opponentId: id,
          displayName: s.displayName,
          shortName: s.shortName,
          matchesPlayed,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          winRate: winRatePercent(s.wins, matchesPlayed),
        };
      })
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
      .slice(0, 10);
  }

  private async computePartnerStats(
    matchResults: MatchResult[],
    playerEntryIds: string[],
    playerId: string,
    globalWinRate: number,
  ): Promise<{ frequent: PlayerRelationStat[]; best: PlayerRelationStat[] }> {
    const partnerEntryIds = [...new Set(playerEntryIds)];
    const playersInEntries = await playerStatsRepository.getPlayersInEntries(partnerEntryIds);
    const entryToPlayers = groupPlayersByEntry(playersInEntries);

    const partnerStats = tallyRelations(matchResults, entryToPlayers, (r) => r.entryId, playerId);

    const allPartners = Array.from(partnerStats.entries()).map(([id, s]): PlayerRelationStat => {
      const winRate = winRatePercent(s.wins, s.count);
      return {
        playerId: id,
        displayName: s.displayName,
        shortName: s.shortName,
        count: s.count,
        wins: s.wins,
        losses: s.losses,
        winRate,
        chemistryDelta: winRate - globalWinRate,
      };
    });
    const frequent = [...allPartners].sort((a, b) => b.count - a.count).slice(0, TOP_RELATIONS);
    const best = rankRelationsByWeightedRate(allPartners, (p) => p.wins / p.count);

    return { frequent, best };
  }

  private async computeNemesisStats(
    matchResults: MatchResult[],
    _playerEntryIds: string[],
    _playerId: string
  ): Promise<PlayerRelationStat[]> {
    const oppEntryIds = [...new Set(matchResults.map((r) => r.oppEntryId))];
    const playersInOppEntries = await playerStatsRepository.getPlayersInEntries(oppEntryIds);
    const entryToPlayers = groupPlayersByEntry(playersInOppEntries);

    const nemesisStats = tallyRelations(matchResults, entryToPlayers, (r) => r.oppEntryId);

    // wins/losses are counted from the subject player's point of view, so a nemesis is an
    // opponent with a high loss rate — not merely the one met most often.
    const allOpponents = Array.from(nemesisStats.entries()).map(([id, s]): PlayerRelationStat => ({
      playerId: id,
      displayName: s.displayName,
      shortName: s.shortName,
      count: s.count,
      wins: s.wins,
      losses: s.losses,
      winRate: winRatePercent(s.wins, s.count),
    }));

    return rankRelationsByWeightedRate(allOpponents, (o) => o.losses / o.count);
  }

  private async buildTournamentHistory(
    entries: Array<{ entryId: string; tournamentId: string; tournamentName: string; tournamentMode: string; disciplineName: string | null }>,
    matchResults: MatchResult[]
  ): Promise<PlayerTournamentEntry[]> {
    const matchesByEntry = new Map<string, MatchResult[]>();
    for (const r of matchResults) {
      if (!matchesByEntry.has(r.entryId)) matchesByEntry.set(r.entryId, []);
      matchesByEntry.get(r.entryId)!.push(r);
    }

    const entryIdsByTournament = new Map<string, string[]>();
    for (const entry of entries) {
      if (!entryIdsByTournament.has(entry.tournamentId))
        entryIdsByTournament.set(entry.tournamentId, []);
      entryIdsByTournament.get(entry.tournamentId)!.push(entry.entryId);
    }

    const seen = new Map<string, PlayerTournamentEntry>();

    for (const entry of entries) {
      if (seen.has(entry.tournamentId)) continue;

      const base: PlayerTournamentEntry = {
        tournamentId: entry.tournamentId,
        tournamentName: entry.tournamentName,
        mode: entry.tournamentMode,
        disciplineName: entry.disciplineName ?? undefined,
        matchesPlayed: 0, wins: 0, draws: 0, losses: 0,
      };

      const entryIds = entryIdsByTournament.get(entry.tournamentId) ?? [];
      const totalPoints = accumulateTournamentMatches(base, entryIds, matchesByEntry);

      if (entry.tournamentMode === "championship" && totalPoints > 0)
        base.points = totalPoints;

      seen.set(entry.tournamentId, base);
    }

    return Array.from(seen.values());
  }

  async getPlayerMatchHistory(
    playerId: string,
    filters: PlayerMatchHistoryQuery,
  ): Promise<ClientMatchHistoryEntry[]> {
    const rows = await playerStatsRepository.getPlayerMatchHistory(playerId, filters);
    if (rows.length === 0) return [];

    const matchIds = rows.map((r) => r.matchId);
    const sidesData = await matchSidesRepository.getByMatchIds(matchIds);

    const sidesByMatch = new Map<string, typeof sidesData>();
    for (const side of sidesData) {
      if (!sidesByMatch.has(side.matchId)) sidesByMatch.set(side.matchId, []);
      sidesByMatch.get(side.matchId)!.push(side);
    }

    return rows.map((row) => {
      const sides: HistoryMatchSide[] = (sidesByMatch.get(row.matchId) ?? []).map((s) => ({
        position: s.position,
        players: s.entry.players.map((p): HistoryMatchSidePlayer => ({
          id: p.player.id,
          displayName: p.player.displayName,
          shortName: p.player.shortName,
        })),
      }));

      return {
        id: `${playerId}-${row.matchId}`,
        matchId: row.matchId,
        playerId,
        tournament: { id: row.tournamentId, name: row.tournamentName, mode: row.tournamentMode, scoreEnabled: row.tournamentScoreEnabled },
        playedAt: row.playedAt ?? new Date(),
        status: row.status ?? "finalized",
        scoreA: row.scoreA,
        scoreB: row.scoreB,
        winnerSide: (row.winnerSide as "A" | "B" | null) ?? null,
        teamSizeA: row.teamSizeA,
        teamSizeB: row.teamSizeB,
        sides,
        mmrDelta: row.mmrDelta ?? null,
        outcomeType: row.outcomeTypeId
          ? { id: row.outcomeTypeId, name: row.outcomeTypeName ?? '' }
          : null,
      };
    });
  }

  private buildEmptyResponse(player: PlayerProfile, filters: PlayerStatsFilters): PlayerStatsResponse {
    return {
      player,
      filters,
      stats: {
        totalMatches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: 0,
        averageScore: 0,
        tournamentsParticipated: 0,
        recentForm: [],
        mostFrequentPartners: [],
        bestPartners: [],
        nemeses: [],
        outcomeTypeStats: [],
        h2hStats: [],
        tournamentHistory: [],
      },
    };
  }
}

export const playerStatsService = new PlayerStatsService();
