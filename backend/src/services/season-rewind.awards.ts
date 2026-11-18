import {
  REWIND_MIN_MATCHES_DUO,
  REWIND_MIN_MATCHES_NEMESIS,
  REWIND_MIN_MATCHES_PERCENTILE,
  REWIND_MIN_MATCHES_RIVALRY,
  REWIND_MIN_MATCHES_SNIPER,
  type RewindAward,
  type RewindAwardKey,
  type RewindCombatAwards,
  type RewindCooperationAwards,
  type RewindVoteAwards,
  type RewindDatedAward,
  type RewindDuoAward,
  type RewindEnduranceAwards,
  type RewindPairAward,
  type RewindPercentileEntry,
  type RewindPercentiles,
  type RewindPerformanceAwards,
  type RewindPlayerRef,
} from "@skol-arena/shared/types/index";
import { logger } from "../utils/logger";
import { SCORE_EPSILON } from "./stats-ranking";
import type { PairTally, PlayerAggregate } from "./season-rewind.replay";

/**
 * Every award ranks on a single metric, and every tie runs down the same chain:
 * the season a player actually had — more matches, more wins, higher final MMR,
 * higher peak — and only then their id.
 *
 * Nothing in that chain reads an identity. Display names in particular are kept
 * out: they can be edited, and an award that moved because someone renamed
 * themselves would contradict the whole point of a snapshot. The id is a uuid
 * and settles nothing a player could recognise as fair; it sits at the very end,
 * present only to guarantee the order is total, since a chain that can still
 * return "equal" hands the award to iteration order. Determinism is not cosmetic
 * here — a rewind can be regenerated after an MMR recalculation, and the same
 * data must always crown the same player.
 */
type Directory = Map<string, RewindPlayerRef>;

interface Candidate {
  aggregate: PlayerAggregate;
  value: number;
}

function winRateOf(agg: PlayerAggregate): number {
  if (agg.matchesPlayed === 0) return 0;
  return Math.round((agg.wins / agg.matchesPlayed) * 100);
}

function bestCandidate(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (candidate.value <= 0) continue;
    if (!best || outranks(candidate, best)) best = candidate;
  }
  return best;
}

function outranks(candidate: Candidate, best: Candidate): boolean {
  const a = candidate.aggregate;
  const b = best.aggregate;
  if (candidate.value !== best.value) return candidate.value > best.value;
  if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed > b.matchesPlayed;
  if (a.wins !== b.wins) return a.wins > b.wins;
  if (a.finalMmr !== b.finalMmr) return a.finalMmr > b.finalMmr;
  if (a.peakMmr !== b.peakMmr) return a.peakMmr > b.peakMmr;
  return a.playerId < b.playerId;
}

function toAward(
  candidate: Candidate | null,
  directory: Directory,
  detail?: (agg: PlayerAggregate) => number,
): RewindAward | null {
  if (!candidate) return null;
  const player = directory.get(candidate.aggregate.playerId);
  if (!player) return null;
  return {
    player,
    value: candidate.value,
    detail: detail ? detail(candidate.aggregate) : candidate.aggregate.matchesPlayed,
  };
}

/** Ranks players on `valueOf`, keeping only those over `minMatches`. */
function award(
  aggregates: PlayerAggregate[],
  directory: Directory,
  valueOf: (agg: PlayerAggregate) => number,
  options: { minMatches?: number; detail?: (agg: PlayerAggregate) => number } = {},
): RewindAward | null {
  const minMatches = options.minMatches ?? 0;
  const candidates = aggregates
    .filter((agg) => agg.matchesPlayed >= minMatches)
    .map((agg) => ({ aggregate: agg, value: valueOf(agg) }));
  return toAward(bestCandidate(candidates), directory, options.detail);
}

// ============================================
// Performance
// ============================================

function peakAward(aggregates: PlayerAggregate[], directory: Directory): RewindDatedAward | null {
  // Only peaks actually reached through a match qualify: a player who never
  // climbed above their starting MMR has no peak to tell a story about.
  const withMatch = aggregates.filter((agg) => agg.peakMatchId !== null);
  const best = bestCandidate(withMatch.map((agg) => ({ aggregate: agg, value: agg.peakMmr })));
  const base = toAward(best, directory);
  if (!base || !best) return null;
  return {
    ...base,
    matchId: best.aggregate.peakMatchId!,
    playedAt: best.aggregate.peakPlayedAt!,
  };
}

/**
 * The highest-ranked player who actually played. The final ranking comes from
 * player_mmr, which also holds players auto-registered by a match they were
 * later removed from and players who never played: in a small season those sit
 * at the starting MMR and can top a ladder where everyone else finished below
 * it. Falling through to the next entry keeps the card from silently rendering
 * no king at all while the leaderboard beside it shows one.
 */
function findKing(aggregates: PlayerAggregate[], finalRanking: string[]): PlayerAggregate | null {
  const byId = new Map(aggregates.map((agg) => [agg.playerId, agg]));
  for (const playerId of finalRanking) {
    const agg = byId.get(playerId);
    if (agg && agg.matchesPlayed > 0) {
      if (playerId !== finalRanking[0]) {
        logger.warn(
          { rankedFirst: finalRanking[0], king: playerId },
          "[Rewind] ladder leader has no match in the season, king falls to the next player",
        );
      }
      return agg;
    }
  }
  return null;
}

export function computePerformanceAwards(
  aggregates: PlayerAggregate[],
  directory: Directory,
  finalRanking: string[],
): RewindPerformanceAwards {
  const kingAgg = findKing(aggregates, finalRanking);

  return {
    king:
      kingAgg && directory.has(kingAgg.playerId)
        ? { player: directory.get(kingAgg.playerId)!, value: kingAgg.finalMmr, detail: kingAgg.matchesPlayed }
        : null,
    peakMmr: peakAward(aggregates, directory),
    progression: award(aggregates, directory, (agg) => agg.finalMmr - agg.initialMmr),
    sniper: award(aggregates, directory, winRateOf, {
      minMatches: REWIND_MIN_MATCHES_SNIPER,
    }),
  };
}

// ============================================
// Combat
// ============================================

function upsetAward(aggregates: PlayerAggregate[], directory: Directory): RewindDatedAward | null {
  const withUpset = aggregates.filter((agg) => agg.biggestUpsetGap !== null);
  const best = bestCandidate(
    withUpset.map((agg) => ({ aggregate: agg, value: agg.biggestUpsetGap!.mmrGap })),
  );
  const base = toAward(best, directory);
  if (!base || !best) return null;

  const feat = best.aggregate.biggestUpsetGap!;
  return {
    ...base,
    matchId: feat.matchId,
    playedAt: feat.playedAt,
    opponent: feat.opponentId ? (directory.get(feat.opponentId) ?? null) : null,
    format: { teamSize: feat.teamSize, opponentTeamSize: feat.opponentTeamSize },
  };
}

interface PairCandidate {
  tally: PairTally;
  score: number;
}

/**
 * Total order over pairs: score, sample size, wins, then the more decisive
 * record, and the two ids only once none of that separates them.
 */
function pairOutranks(candidate: PairCandidate, best: PairCandidate): boolean {
  const a = candidate.tally;
  const b = best.tally;
  if (Math.abs(candidate.score - best.score) > SCORE_EPSILON) {
    return candidate.score > best.score;
  }
  if (a.matches !== b.matches) return a.matches > b.matches;
  if (a.aWins !== b.aWins) return a.aWins > b.aWins;
  if (a.aLosses !== b.aLosses) return a.aLosses < b.aLosses;
  if (a.aId !== b.aId) return a.aId < b.aId;
  return a.bId < b.bId;
}

function bestPair(
  tallies: PairTally[],
  minMatches: number,
  scoreOf: (tally: PairTally) => number,
): PairTally | null {
  let best: PairCandidate | null = null;
  for (const tally of tallies) {
    if (tally.matches < minMatches) continue;
    const candidate = { tally, score: scoreOf(tally) };
    if (!best || pairOutranks(candidate, best)) best = candidate;
  }
  return best?.tally ?? null;
}

/** The most played duel of the season, whoever won it. */
export function computeRivalry(
  rivalries: PairTally[],
  directory: Directory,
): RewindPairAward | null {
  const best = bestPair(rivalries, REWIND_MIN_MATCHES_RIVALRY, (tally) => tally.matches);
  if (!best) return null;

  const a = directory.get(best.aId);
  const b = directory.get(best.bId);
  if (!a || !b) return null;
  return {
    players: [a, b],
    matchesPlayed: best.matches,
    wins: best.aWins,
    losses: best.aLosses,
    draws: best.draws,
  };
}

/**
 * Counts, for each player, how many opponents hold a losing record against
 * them. This measures reach rather than raw strength: being everyone's problem
 * is a different achievement from beating one person a lot.
 */
export function countNemesisVictims(rivalries: PairTally[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const tally of rivalries) {
    if (tally.matches < REWIND_MIN_MATCHES_NEMESIS) continue;
    if (tally.aWins < tally.aLosses) bump(scores, tally.bId);
    else if (tally.aLosses < tally.aWins) bump(scores, tally.aId);
  }
  return scores;
}

/** Mirror of the nemesis count: with whom do the most players win? */
export function countPartnerFans(duos: PairTally[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const tally of duos) {
    if (tally.matches < REWIND_MIN_MATCHES_DUO) continue;
    if (tally.aWins > tally.aLosses) {
      bump(scores, tally.aId);
      bump(scores, tally.bId);
    }
  }
  return scores;
}

function bump(scores: Map<string, number>, playerId: string): void {
  scores.set(playerId, (scores.get(playerId) ?? 0) + 1);
}

export function computeCombatAwards(
  aggregates: PlayerAggregate[],
  directory: Directory,
  rivalries: PairTally[],
): RewindCombatAwards {
  const nemesisScores = countNemesisVictims(rivalries);

  return {
    biggestUpset: upsetAward(aggregates, directory),
    giantKiller: award(aggregates, directory, (agg) => agg.giantKillerWins),
    leaderHunter: award(aggregates, directory, (agg) => agg.winsVsRank1),
    rivalry: computeRivalry(rivalries, directory),
    nemesis: award(aggregates, directory, (agg) => nemesisScores.get(agg.playerId) ?? 0),
  };
}

// ============================================
// Endurance
// ============================================

export function computeEnduranceAwards(
  aggregates: PlayerAggregate[],
  directory: Directory,
): RewindEnduranceAwards {
  return {
    marathon: award(aggregates, directory, (agg) => agg.matchesPlayed),
    topOneKing: award(aggregates, directory, (agg) => agg.matchesInTop1),
    topThreeKing: award(aggregates, directory, (agg) => agg.matchesInTop3),
    topFiveKing: award(aggregates, directory, (agg) => agg.matchesInTop5),
    longestStreak: award(aggregates, directory, (agg) => agg.bestWinStreak),
  };
}

// ============================================
// Cooperation
// ============================================

/**
 * Best pair by win rate weighted by sample size (rate × √matches), the same
 * shape the player-stats relations already use, so a 10/10 duo does not edge
 * out a 40-match partnership on a technicality.
 */
export function computeDuoAward(duos: PairTally[], directory: Directory): RewindDuoAward | null {
  const best = bestPair(
    duos,
    REWIND_MIN_MATCHES_DUO,
    (tally) => (tally.aWins / tally.matches) * Math.sqrt(tally.matches),
  );
  if (!best) return null;

  const a = directory.get(best.aId);
  const b = directory.get(best.bId);
  if (!a || !b) return null;
  return {
    players: [a, b],
    matchesTogether: best.matches,
    wins: best.aWins,
    winRate: Math.round((best.aWins / best.matches) * 100),
  };
}

export function computeCooperationAwards(
  aggregates: PlayerAggregate[],
  directory: Directory,
  duos: PairTally[],
): RewindCooperationAwards {
  const partnerScores = countPartnerFans(duos);
  return {
    duo: computeDuoAward(duos, directory),
    bestPartner: award(aggregates, directory, (agg) => partnerScores.get(agg.playerId) ?? 0),
  };
}

// ============================================
// Percentiles
// ============================================

/**
 * Where a value sits on a metric where higher is better: the absolute position,
 * the population it was taken among, and the "top X %" that follows from both.
 * Rank 1 of 100 yields 1 %, the last player yields 100 %. Ties share the best
 * position, so two players with the same win rate are told the same thing.
 *
 * The position travels with the percentage because a percentage alone is
 * unreadable in a small league: "top 25 %" of eight players is second place.
 */
export function percentileEntry(values: number[], value: number): RewindPercentileEntry {
  if (values.length === 0) return { topPercent: 100, rank: 1, poolSize: 0 };
  const rank = values.filter((other) => other > value).length + 1;
  return {
    topPercent: Math.max(1, Math.round((rank / values.length) * 100)),
    rank,
    poolSize: values.length,
  };
}

/**
 * Who a rate percentile is measured against. Players below the threshold are
 * dropped — one 1-0 player sits at a 100% win rate and pushes every season
 * regular down a band — but the target always stays in, otherwise the population
 * it is being ranked within would not contain it. If the threshold leaves too
 * few players to compare against, the whole field is used: a distorted
 * percentile still beats one computed against nobody.
 */
export function percentilePool(
  aggregates: PlayerAggregate[],
  target: PlayerAggregate,
): PlayerAggregate[] {
  const eligible = aggregates.filter(
    (agg) => agg.matchesPlayed >= REWIND_MIN_MATCHES_PERCENTILE,
  );
  if (eligible.length < 2) return aggregates;
  if (eligible.some((agg) => agg.playerId === target.playerId)) return eligible;
  return [...eligible, target];
}

export function computePercentiles(
  aggregates: PlayerAggregate[],
  target: PlayerAggregate,
): RewindPercentiles {
  const progression = (agg: PlayerAggregate) => agg.finalMmr - agg.initialMmr;
  // Activity is not a rate: a player with one match genuinely is last on matches
  // played, so that percentile keeps the whole field.
  const rated = percentilePool(aggregates, target);
  return {
    matchesPlayed: percentileEntry(
      aggregates.map((agg) => agg.matchesPlayed),
      target.matchesPlayed,
    ),
    winRate: percentileEntry(rated.map(winRateOf), winRateOf(target)),
    progression: percentileEntry(rated.map(progression), progression(target)),
    winStreak: percentileEntry(
      rated.map((agg) => agg.bestWinStreak),
      target.bestWinStreak,
    ),
  };
}

// ============================================
// Award ownership
// ============================================

type AwardGroups = {
  performance: RewindPerformanceAwards;
  combat: RewindCombatAwards;
  endurance: RewindEnduranceAwards;
  cooperation: RewindCooperationAwards;
  votes?: RewindVoteAwards;
};

/** Which awards a given player holds — drives the highlight on the award cards. */
export function awardsWonBy(playerId: string, groups: AwardGroups): RewindAwardKey[] {
  const single: [RewindAwardKey, RewindAward | RewindDatedAward | null][] = [
    ["king", groups.performance.king],
    ["peakMmr", groups.performance.peakMmr],
    ["progression", groups.performance.progression],
    ["sniper", groups.performance.sniper],
    ["biggestUpset", groups.combat.biggestUpset],
    ["giantKiller", groups.combat.giantKiller],
    ["leaderHunter", groups.combat.leaderHunter],
    ["nemesis", groups.combat.nemesis],
    ["marathon", groups.endurance.marathon],
    ["topOneKing", groups.endurance.topOneKing],
    ["topThreeKing", groups.endurance.topThreeKing],
    ["topFiveKing", groups.endurance.topFiveKing],
    ["longestStreak", groups.endurance.longestStreak],
    ["bestPartner", groups.cooperation.bestPartner],
    ["fairPlayPrize", groups.votes?.fairPlayPrize ?? null],
    ["teamCarrier", groups.votes?.teamCarrier ?? null],
    ["mostInvolved", groups.votes?.mostInvolved ?? null],
    ["kindest", groups.votes?.kindest ?? null],
    ["strictestJudge", groups.votes?.strictestJudge ?? null],
    ["topSupporter", groups.votes?.topSupporter ?? null],
    ["fairPlayWorst", groups.votes?.fairPlayWorst ?? null],
  ];

  const won = single
    .filter(([, value]) => value?.player.playerId === playerId)
    .map(([key]) => key);

  const holdsPair = (award: { players: [RewindPlayerRef, RewindPlayerRef] } | null) =>
    award?.players.some((player) => player.playerId === playerId) ?? false;

  if (holdsPair(groups.combat.rivalry)) won.push("rivalry");
  if (holdsPair(groups.cooperation.duo)) won.push("duo");
  return won;
}
