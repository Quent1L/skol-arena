import { tournamentStatsRepository } from "../repository/tournament-stats.repository";
import { tournamentRulesetService } from "./tournament-ruleset.service";
import { NotFoundError, ErrorCode } from "../types/errors";
import {
  resolveRulesetOutcome,
  type TournamentRulesetPayload,
} from "@skol-arena/shared/types/index";
import {
  assignCompetitionRanks,
  cutWholeRankGroups,
  isFlatRanking,
  MAX_DISTINCT_RANKS,
  MAX_HONOUR_ROLL,
  MAX_LEADER_ROWS,
  MIN_WEIGHTED_RATE_MATCHES,
  omittedTiedWithLast,
  rankByWeightedRate,
  rankByWeightedRateOrFallback,
  weightedRateTie,
  weightedScore,
  type RankedEntry,
} from "./stats-ranking";
import type {
  TournamentStats,
  OutcomeTypeCount,
  BestPlayersBoard,
  BestTeamsBoard,
  WinStreakEntry,
  BestDuoEntry,
  StatPlayerRef,
  CompetitionRank,
  OutcomeTypeFunStat,
  OutcomeTypeLeader,
  OutcomeTypeLeaderboard,
} from "@skol-arena/shared";
import { winRatePercent } from "../utils/win-rate";

/** How many names an "and N others" tooltip carries before the count speaks alone. */
const MAX_OMITTED_NAMES = 20;

/** Best-player cards show five places; ties may push the list a little past that. */
const MAX_BEST_PLAYER_ROWS = 8;

/** A card a mode never produces still has to answer the same shape as one that does. */
const EMPTY_TEAMS_BOARD: BestTeamsBoard = { entries: [], isLowSample: false };
const EMPTY_PLAYERS_BOARD: BestPlayersBoard = { entries: [], isLowSample: false };

/** A payload entry before it is ranked — ranks are assigned once the list is sorted. */
type Unranked<T extends CompetitionRank> = Omit<T, keyof CompetitionRank>;

function withRanks<T>(ranked: RankedEntry<T>[]): (T & CompetitionRank)[] {
  return ranked.map(({ item, rank, tiedCount }) => ({ ...item, rank, tiedCount }));
}

type MatchData = Awaited<
  ReturnType<typeof tournamentStatsRepository.getMatchesWithSidesAndPlayers>
>[number];

function isWinner(side: MatchData["sides"][number], winnerSide: string | null): boolean {
  if (!winnerSide) return false;
  return (side.position === 1 && winnerSide === "A") || (side.position === 2 && winnerSide === "B");
}

function isLoser(side: MatchData["sides"][number], winnerSide: string | null): boolean {
  if (!winnerSide) return false;
  return (side.position === 1 && winnerSide === "B") || (side.position === 2 && winnerSide === "A");
}

type PlayerWLStats = {
  displayName: string;
  shortName: string;
  wins: number;
  losses: number;
  played: number;
};

type PlayerRef = { id: string; displayName: string; shortName: string };

function recordPlayerResult(
  stats: Map<string, PlayerWLStats>,
  player: PlayerRef,
  won: boolean,
  lost: boolean,
): void {
  const { id, displayName, shortName } = player;
  if (!stats.has(id)) {
    stats.set(id, { displayName, shortName, wins: 0, losses: 0, played: 0 });
  }
  const s = stats.get(id)!;
  s.played++;
  if (won) s.wins++;
  if (lost) s.losses++;
}

/** How many players a "best players in this format" card shows. */
const TOP_BEST_PLAYERS = 5;

/**
 * Separates two records the weighted rate and the sample size cannot: the raw
 * wins first, then the uuid — which decides nothing, it only makes the order
 * total. Display names stay out of it: a card must not reshuffle because a
 * player renamed themselves.
 */
function compareBestPlayers(a: Unranked<BestDuoEntry>, b: Unranked<BestDuoEntry>): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

/**
 * Ranked on win rate weighted by sample size, like every other rate leaderboard
 * of the app: a 2-0 evening must not outrank a 30-match season. Two matches used
 * to be enough to top this card, which is exactly the reading it now avoids.
 */
function rankBestPlayers(stats: Map<string, PlayerWLStats>): BestPlayersBoard {
  const entries = Array.from(stats.entries()).map(([playerId, s]) => ({
    playerId,
    displayName: s.displayName,
    shortName: s.shortName,
    wins: s.wins,
    losses: s.losses,
    matchesPlayed: s.played,
    winRate: winRatePercent(s.wins, s.played),
    score: weightedScore(s.played > 0 ? s.wins / s.played : 0, s.played),
  }));

  const rate = (entry: (typeof entries)[number]) =>
    entry.matchesPlayed > 0 ? entry.wins / entry.matchesPlayed : 0;
  const played = (entry: (typeof entries)[number]) => entry.matchesPlayed;

  // Rank the whole list before cutting: a tie straddling the cut is invisible otherwise.
  const sorted = rankByWeightedRateOrFallback(
    entries,
    rate,
    played,
    compareBestPlayers,
    Number.POSITIVE_INFINITY,
  );
  const ranked = assignCompetitionRanks(sorted, weightedRateTie(rate, played));
  return {
    entries: withRanks(cutWholeRankGroups(ranked, TOP_BEST_PLAYERS, MAX_BEST_PLAYER_ROWS).shown),
    isLowSample: isBelowThreshold(entries, played),
  };
}

/**
 * True when the ranking had to drop its own threshold to show anything: every candidate
 * is below it, so the board is a small sample and says so rather than passing for a
 * settled hierarchy.
 */
function isBelowThreshold<T>(candidates: T[], countOf: (item: T) => number): boolean {
  return (
    candidates.length > 0 &&
    !candidates.some((candidate) => countOf(candidate) >= MIN_WEIGHTED_RATE_MATCHES)
  );
}

function accumulateSides(
  sides: MatchData["sides"],
  winnerSide: string | null,
  stats: Map<string, PlayerWLStats>,
): void {
  for (const side of sides) {
    const won = isWinner(side, winnerSide);
    const lost = isLoser(side, winnerSide);
    for (const ep of side.entry.players) {
      if (ep.player) recordPlayerResult(stats, ep.player, won, lost);
    }
  }
}

type ResultCollector<T> = {
  displayName: string;
  shortName: string;
  results: T[];
};

function collectPlayerResults<T>(
  matchesData: MatchData[],
  makeResult: (match: MatchData, side: MatchData["sides"][number]) => T,
): Map<string, ResultCollector<T>> {
  const map = new Map<string, ResultCollector<T>>();
  for (const match of matchesData) {
    for (const side of match.sides) {
      for (const ep of side.entry.players) {
        if (!ep.player) continue;
        const { id, displayName, shortName } = ep.player;
        if (!map.has(id)) map.set(id, { displayName, shortName, results: [] });
        map.get(id)!.results.push(makeResult(match, side));
      }
    }
  }
  return map;
}

/**
 * A match with no winner is a draw only where draws are allowed; elsewhere it still
 * counts as played, like on every other stat screen (see `winRatePercent`).
 */
export function computeBestTeams(matchesData: MatchData[], allowDraw = true): BestTeamsBoard {
  const entryStats = new Map<
    string,
    {
      displayName: string;
      players: StatPlayerRef[];
      played: number;
      wins: number;
      losses: number;
      draws: number;
      playerCount: number;
    }
  >();

  for (const match of matchesData) {
    for (const side of match.sides) {
      const entryId = side.entry.id;
      const playerNames = side.entry.players.map((p) => p.player?.displayName ?? "?");
      const displayName = playerNames.join(" / ");

      if (!entryStats.has(entryId)) {
        entryStats.set(entryId, {
          displayName,
          // A roster the card can draw: an avatar and a link per player, not one joined label.
          players: side.entry.players.flatMap((p) =>
            p.player
              ? [
                  {
                    playerId: p.player.id,
                    displayName: p.player.displayName,
                    shortName: p.player.shortName,
                  },
                ]
              : [],
          ),
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          playerCount: side.entry.players.length,
        });
      }
      const stats = entryStats.get(entryId)!;

      stats.played++;
      if (!match.winnerSide) {
        if (allowDraw) stats.draws++;
      } else if (isWinner(side, match.winnerSide)) {
        stats.wins++;
      } else {
        stats.losses++;
      }
    }
  }

  const teams = Array.from(entryStats.entries())
    .filter(([, s]) => s.playerCount > 1)
    .map(([entryId, s]) => {
      const matchesPlayed = s.played;
      return {
        entryId,
        displayName: s.displayName,
        players: s.players,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        matchesPlayed,
        winRate: winRatePercent(s.wins, matchesPlayed),
        score: weightedScore(matchesPlayed > 0 ? s.wins / matchesPlayed : 0, matchesPlayed),
      };
    });

  const rate = (team: (typeof teams)[number]) =>
    team.matchesPlayed > 0 ? team.wins / team.matchesPlayed : 0;
  const played = (team: (typeof teams)[number]) => team.matchesPlayed;

  // Same weighting as the player cards: a team that played once and won is not
  // the best team of the tournament.
  const sorted = rankByWeightedRateOrFallback(
    teams,
    rate,
    played,
    (a, b) => b.wins - a.wins || (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0),
    Number.POSITIVE_INFINITY,
  );
  const ranked = assignCompetitionRanks(sorted, weightedRateTie(rate, played));
  return {
    entries: withRanks(cutWholeRankGroups(ranked, MAX_DISTINCT_RANKS, MAX_LEADER_ROWS).shown),
    isLowSample: isBelowThreshold(teams, played),
  };
}

function computeWinStreaks(matchesData: MatchData[]): WinStreakEntry[] {
  const playerMatches = collectPlayerResults(matchesData, (match, side) => ({
    playedAt: new Date(match.playedAt),
    won: isWinner(side, match.winnerSide),
  }));

  const streaks: WinStreakEntry[] = [];
  for (const [playerId, data] of playerMatches) {
    const sorted = [...data.results].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
    let streak = 0;
    for (const r of sorted) {
      if (!r.won) break;
      streak++;
    }
    if (streak >= 2) {
      streaks.push({ playerId, displayName: data.displayName, shortName: data.shortName, currentStreak: streak });
    }
  }

  return streaks.sort((a, b) => b.currentStreak - a.currentStreak);
}

function computeLossStreaks(matchesData: MatchData[]): WinStreakEntry[] {
  const playerMatches = collectPlayerResults(matchesData, (match, side) => ({
    playedAt: new Date(match.playedAt),
    lost: isLoser(side, match.winnerSide),
  }));

  const streaks: WinStreakEntry[] = [];
  for (const [playerId, data] of playerMatches) {
    const sorted = [...data.results].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
    let streak = 0;
    for (const r of sorted) {
      if (!r.lost) break;
      streak++;
    }
    if (streak >= 2) {
      streaks.push({ playerId, displayName: data.displayName, shortName: data.shortName, currentStreak: streak });
    }
  }

  return streaks.sort((a, b) => b.currentStreak - a.currentStreak);
}

function computeSymmetricPlayers(matchesData: MatchData[], teamSize: number): BestPlayersBoard {
  const playerStats = new Map<string, PlayerWLStats>();

  for (const match of matchesData) {
    const sideA = match.sides.find((s) => s.position === 1);
    const sideB = match.sides.find((s) => s.position === 2);
    if (!sideA || !sideB) continue;
    if (sideA.entry.players.length !== teamSize || sideB.entry.players.length !== teamSize) continue;

    accumulateSides([sideA, sideB], match.winnerSide, playerStats);
  }

  return rankBestPlayers(playerStats);
}

export function computeBestDuoPlayers(matchesData: MatchData[]): BestPlayersBoard {
  return computeSymmetricPlayers(matchesData, 2);
}

function computeBestSoloPlayers(matchesData: MatchData[]): BestPlayersBoard {
  return computeSymmetricPlayers(matchesData, 1);
}

function computeBestAsymmetricSoloPlayers(matchesData: MatchData[]): BestPlayersBoard {
  const playerStats = new Map<string, PlayerWLStats>();

  for (const match of matchesData) {
    const sideA = match.sides.find((s) => s.position === 1);
    const sideB = match.sides.find((s) => s.position === 2);
    if (!sideA || !sideB) continue;
    if (sideA.entry.players.length === sideB.entry.players.length) continue;

    for (const side of [sideA, sideB]) {
      if (side.entry.players.length !== 1) continue;
      const ep = side.entry.players[0];
      if (!ep.player) continue;
      recordPlayerResult(
        playerStats,
        ep.player,
        isWinner(side, match.winnerSide),
        isLoser(side, match.winnerSide),
      );
    }
  }

  return rankBestPlayers(playerStats);
}

function computeBestInvincibleStreak(matchesData: MatchData[]): WinStreakEntry[] {
  const playerMatches = collectPlayerResults(matchesData, (match, side) => ({
    playedAt: new Date(match.playedAt),
    notLost: !isLoser(side, match.winnerSide),
  }));

  const streaks: WinStreakEntry[] = [];
  for (const [playerId, data] of playerMatches) {
    const sorted = [...data.results].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
    let best = 0, current = 0;
    for (const r of sorted) {
      if (r.notLost) { current++; best = Math.max(best, current); }
      else current = 0;
    }
    if (best >= 3) streaks.push({ playerId, displayName: data.displayName, shortName: data.shortName, currentStreak: best });
  }

  return streaks.sort((a, b) => b.currentStreak - a.currentStreak);
}

type OutcomeTypePlayerAcc = {
  displayName: string;
  shortName: string;
  wins: number;
  losses: number;
  played: number;
};

type OutcomeTypeAcc = {
  name: string;
  totalMatches: number;
  players: Map<string, OutcomeTypePlayerAcc>;
};

function recordOutcomeTypeResult(
  players: Map<string, OutcomeTypePlayerAcc>,
  player: PlayerRef,
  won: boolean,
  lost: boolean,
): void {
  const { id, displayName, shortName } = player;
  if (!players.has(id)) {
    players.set(id, { displayName, shortName, wins: 0, losses: 0, played: 0 });
  }
  const acc = players.get(id)!;
  // Draws count as played but neither won nor lost: they belong in the rate denominator.
  acc.played++;
  if (won) acc.wins++;
  if (lost) acc.losses++;
}

function countOutcomePlayers(match: MatchData, entry: OutcomeTypeAcc): void {
  for (const side of match.sides) {
    const won = isWinner(side, match.winnerSide);
    const lost = isLoser(side, match.winnerSide);
    for (const ep of side.entry.players) {
      if (ep.player) recordOutcomeTypeResult(entry.players, ep.player, won, lost);
    }
  }
}

/** A player's record for one outcome type, viewed from either the win or the loss angle. */
type LeaderCandidate = Unranked<OutcomeTypeLeader> & { rate: number };

function toCandidates(
  players: Map<string, OutcomeTypePlayerAcc>,
  metricOf: (p: OutcomeTypePlayerAcc) => number,
): LeaderCandidate[] {
  const total = Array.from(players.values()).reduce((sum, p) => sum + metricOf(p), 0);

  return Array.from(players.entries())
    .filter(([, p]) => metricOf(p) > 0)
    .map(([playerId, p]) => {
      const count = metricOf(p);
      const rate = p.played > 0 ? count / p.played : 0;
      return {
        playerId,
        displayName: p.displayName,
        shortName: p.shortName,
        count,
        matchesPlayed: p.played,
        ratePct: Math.round(rate * 100),
        sharePct: total > 0 ? Math.round((count / total) * 100) : 0,
        rate,
      };
    });
}

function stripRate(candidates: (LeaderCandidate & CompetitionRank)[]): OutcomeTypeLeader[] {
  return candidates.map(({ rate: _rate, ...leader }) => leader);
}

/**
 * Turns a ranked candidate list into the payload the card renders. A flat ranking — one
 * everybody shares rank 1 in, which is what a rare outcome type produces — is not cut to
 * a podium: the UI lists the names instead, so it gets more of them.
 */
function toLeaderboard(
  ranked: RankedEntry<LeaderCandidate>[],
  isLowSample: boolean,
): OutcomeTypeLeaderboard {
  const isFlat = isFlatRanking(ranked);
  const { shown, omitted } = cutWholeRankGroups(
    ranked,
    MAX_DISTINCT_RANKS,
    isFlat ? MAX_HONOUR_ROLL : MAX_LEADER_ROWS,
  );
  // Only players the cut separated from their own rank are ex aequo. The rest of the
  // ranking is simply below the podium, and announcing it as tied would be a lie.
  const tied = omittedTiedWithLast(shown, omitted);

  return {
    leaders: stripRate(withRanks(shown)),
    omittedNames: tied.slice(0, MAX_OMITTED_NAMES).map((c) => c.displayName),
    omittedCount: tied.length,
    isFlat,
    isLowSample,
  };
}

/**
 * The volume column ranks on the raw count and nothing else: 63 wins are 63 wins. The
 * rate still orders the tied group so the list is stable, but separating ranks on it
 * would answer a question this column is not asking — that is the rate column's job.
 */
function volumeTie(a: LeaderCandidate, b: LeaderCandidate): boolean {
  return a.count === b.count;
}

function rankByVolume(candidates: LeaderCandidate[]): OutcomeTypeLeaderboard {
  const sorted = [...candidates].sort(
    (a, b) => b.count - a.count || b.ratePct - a.ratePct || compareLeaders(a, b),
  );
  return toLeaderboard(assignCompetitionRanks(sorted, volumeTie), false);
}

/**
 * Ranks by weighted rate, falling back to an unfiltered ranking when the match threshold
 * leaves nobody. Rare outcome types (fanny, win on foul…) would otherwise show an empty
 * column; the flag lets the UI label the result as a small sample instead of hiding it.
 */
function rankByRate(candidates: LeaderCandidate[]): OutcomeTypeLeaderboard {
  const rate = (c: LeaderCandidate) => c.rate;
  const played = (c: LeaderCandidate) => c.matchesPlayed;
  const tie = weightedRateTie(rate, played);
  const rankAll = (minMatches: number) =>
    rankByWeightedRate(
      candidates,
      rate,
      played,
      minMatches,
      compareLeaders,
      Number.POSITIVE_INFINITY,
    );

  const filtered = rankAll(MIN_WEIGHTED_RATE_MATCHES);
  if (filtered.length > 0) return toLeaderboard(assignCompetitionRanks(filtered, tie), false);

  const fallback = rankAll(0);
  return toLeaderboard(assignCompetitionRanks(fallback, tie), fallback.length > 0);
}

/**
 * Separates two leaders the rate and the sample size cannot: the raw count
 * first, and only then the uuid — which decides nothing, it only guarantees the
 * order is total. Display names stay out of it: a leaderboard must not reshuffle
 * because a player renamed themselves.
 */
function compareLeaders(a: LeaderCandidate, b: LeaderCandidate): number {
  if (a.count !== b.count) return b.count - a.count;
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

export function computeOutcomeTypeFunStats(
  matchesData: MatchData[],
  ruleset: TournamentRulesetPayload,
): OutcomeTypeFunStat[] {
  const typeMap = new Map<string, OutcomeTypeAcc>();

  for (const match of matchesData) {
    if (!match.outcomeTypeId) continue;

    const typeId = match.outcomeTypeId;
    if (!typeMap.has(typeId)) {
      const name = resolveRulesetOutcome(ruleset, typeId).name;
      typeMap.set(typeId, { name, totalMatches: 0, players: new Map() });
    }
    const entry = typeMap.get(typeId)!;
    entry.totalMatches++;
    countOutcomePlayers(match, entry);
  }

  return Array.from(typeMap.entries())
    .map(([outcomeTypeId, data]) => {
      const winners = toCandidates(data.players, (p) => p.wins);
      const losers = toCandidates(data.players, (p) => p.losses);

      return {
        outcomeTypeId,
        outcomeTypeName: data.name,
        totalMatches: data.totalMatches,
        topWinnersByVolume: rankByVolume(winners),
        topWinnersByRate: rankByRate(winners),
        topLosersByVolume: rankByVolume(losers),
        topLosersByRate: rankByRate(losers),
      };
    })
    .sort((a, b) => b.totalMatches - a.totalMatches || a.outcomeTypeName.localeCompare(b.outcomeTypeName));
}

function fillMomentumDays(
  raw: { date: string; matchCount: number }[],
  startDate: string,
  endDate: string,
): { date: string; matchCount: number }[] {
  const countByDay = new Map(raw.map((r) => [r.date, r.matchCount]));
  const result: { date: string; matchCount: number }[] = [];

  const today = new Date().toISOString().slice(0, 10);
  const lastDay = endDate <= today ? endDate : today;

  const cursor = new Date(startDate);
  const end = new Date(lastDay);

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, matchCount: countByDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

class TournamentStatsService {
  async getStats(tournamentId: string): Promise<TournamentStats> {
    const cached = await tournamentStatsRepository.getComputedStats(tournamentId);
    if (cached) return cached;

    const result = await this.computeStats(tournamentId);
    await tournamentStatsRepository.setComputedStats(tournamentId, result);
    return result;
  }

  private async computeStats(tournamentId: string): Promise<TournamentStats> {
    const tournamentInfo = await tournamentStatsRepository.getTournamentMode(tournamentId);
    if (!tournamentInfo) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }

    const [distributionRaw, matchesData, momentumRaw, ruleset] = await Promise.all([
      tournamentStatsRepository.getOutcomeDistribution(tournamentId),
      tournamentStatsRepository.getMatchesWithSidesAndPlayers(tournamentId),
      tournamentStatsRepository.getMomentum(tournamentId),
      tournamentRulesetService.getForTournament(tournamentId),
    ]);

    const momentum = fillMomentumDays(momentumRaw, tournamentInfo.startDate, tournamentInfo.endDate);

    // Labels come from the snapshot: what the outcome was called while this
    // competition ran, not what it happens to be called now.
    const outcomeDistribution: OutcomeTypeCount[] = distributionRaw.map((row) => {
      const outcome = resolveRulesetOutcome(ruleset, row.outcomeTypeId);
      return {
        outcomeTypeId: row.outcomeTypeId,
        outcomeTypeName: row.outcomeTypeId ? outcome.name : null,
        isDefault: row.outcomeTypeId ? outcome.isDefault : true,
        count: row.count,
      };
    });

    const totalFinalized = matchesData.length;
    const totalMatches = totalFinalized;

    const bestTeams: BestTeamsBoard =
      tournamentInfo.teamMode === "flex"
        ? computeBestTeams(matchesData, tournamentInfo.allowDraw ?? true)
        : EMPTY_TEAMS_BOARD;

    const winStreaks: WinStreakEntry[] = computeWinStreaks(matchesData);
    const lossStreaks: WinStreakEntry[] = computeLossStreaks(matchesData);
    const invincibleStreaks: WinStreakEntry[] = computeBestInvincibleStreak(matchesData);

    const bestDuoPlayers: BestPlayersBoard =
      tournamentInfo.teamMode === "flex"
        ? computeBestDuoPlayers(matchesData)
        : EMPTY_PLAYERS_BOARD;

    const bestSoloPlayers: BestPlayersBoard = computeBestSoloPlayers(matchesData);

    const bestAsymmetricSoloPlayers: BestPlayersBoard =
      tournamentInfo.rankedConfig?.allowAsymmetricMatches
        ? computeBestAsymmetricSoloPlayers(matchesData)
        : EMPTY_PLAYERS_BOARD;

    const outcomeTypeFunStats: OutcomeTypeFunStat[] = computeOutcomeTypeFunStats(
      matchesData,
      ruleset,
    );

    return {
      totalMatches,
      totalFinalized,
      outcomeDistribution,
      bestTeams,
      momentum,
      winStreaks,
      lossStreaks,
      invincibleStreaks,
      bestDuoPlayers,
      bestSoloPlayers,
      bestAsymmetricSoloPlayers,
      outcomeTypeFunStats,
    };
  }
}

export const tournamentStatsService = new TournamentStatsService();
