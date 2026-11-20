import { STRONGER_OPPONENT_MMR_GAP } from "@skol-arena/shared/types/index";
import type { MmrChartPoint, MmrHistoryOutcome } from "@skol-arena/shared/types/index";
import type { SeasonHistoryRow, SeasonSideRow } from "../repository/season-rewind.repository";
import { compareCodeUnits } from "../utils/compare";

/**
 * Chronological replay of a finished season.
 *
 * Most rewind figures could be read straight off player_mmr, but three cannot:
 * how long a player stayed in the top 1/3/5, the best rank they ever held, and
 * how often they beat whoever was #1 at the time. All three need the standings
 * as they stood after every single match, which only a replay gives. Since we
 * are walking the season anyway, the per-player counters and the pair tallies
 * ride along in the same pass.
 */

/** A feat still holding raw ids: display names are attached once, by the service. */
export interface FeatDraft {
  matchId: string;
  playedAt: Date;
  opponentId: string | null;
  mmrDelta: number;
  mmrGap: number;
  teamSize: number;
  opponentTeamSize: number;
}

/**
 * What a match looked like from one player's seat: how strong their own side
 * was on average, and how many players stood on each side of it.
 */
export interface SideContext {
  allyAvgMmr: number;
  teamSize: number;
  opponentTeamSize: number;
}

export interface PlayerAggregate {
  playerId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  initialMmr: number;
  finalMmr: number;
  peakMmr: number;
  peakMatchId: string | null;
  peakPlayedAt: Date | null;
  bestRank: number;
  matchesInTop1: number;
  matchesInTop3: number;
  matchesInTop5: number;
  bestWinStreak: number;
  /** MMR banked over that run — a six-win streak can be worth very different sums. */
  bestWinStreakMmr: number;
  bestUnbeatenStreak: number;
  worstLossStreak: number;
  /** MMR dropped over that run, negative. */
  worstLossStreakMmr: number;
  giantKillerWins: number;
  winsVsRank1: number;
  bestMmrGain: FeatDraft | null;
  biggestUpsetGap: FeatDraft | null;
  points: MmrChartPoint[];
  currentWinStreak: number;
  currentWinStreakMmr: number;
  currentUnbeatenStreak: number;
  currentLossStreak: number;
  currentLossStreakMmr: number;
}

/** Head-to-head record of two players, from `aId`'s point of view. */
export interface PairTally {
  aId: string;
  bId: string;
  matches: number;
  aWins: number;
  aLosses: number;
  draws: number;
}

export interface ReplayResult {
  aggregates: Map<string, PlayerAggregate>;
  /** Opponent pairs — feeds the Rivalry and Nemesis awards. */
  rivalries: PairTally[];
  /** Teammate pairs — feeds the Duo and Best partner awards. */
  duos: PairTally[];
  matchCount: number;
  /** Legacy rows whose outcome could not be derived; counted as draws, see `resolveOutcome`. */
  unresolvedOutcomes: number;
}

interface ReplayState {
  aggregates: Map<string, PlayerAggregate>;
  currentMmr: Map<string, number>;
  ranking: string[];
  /** Players past their placement matches — the only ones the standings rank. */
  settled: Set<string>;
  rivalries: Map<string, PairTally>;
  duos: Map<string, PairTally>;
  unresolvedOutcomes: number;
}

/**
 * Legacy history rows predate the outcome column; the delta sign stands in for
 * them. A zero delta is *not* a draw: a decided match between very unequal
 * players can round to zero, and the recalculation floors gains at 1 either way.
 * Those rows are undecidable, so `null` is returned rather than a guess, and the
 * caller counts them so generation can say how many it had to fall back on.
 */
export function resolveOutcome(row: SeasonHistoryRow): MmrHistoryOutcome | null {
  if (row.outcome === "win" || row.outcome === "loss" || row.outcome === "draw") {
    return row.outcome;
  }
  if (row.mmrDelta > 0) return "win";
  if (row.mmrDelta < 0) return "loss";
  return null;
}

function createAggregate(playerId: string, initialMmr: number): PlayerAggregate {
  return {
    playerId,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    initialMmr,
    finalMmr: initialMmr,
    peakMmr: initialMmr,
    peakMatchId: null,
    peakPlayedAt: null,
    bestRank: Number.MAX_SAFE_INTEGER,
    matchesInTop1: 0,
    matchesInTop3: 0,
    matchesInTop5: 0,
    bestWinStreak: 0,
    bestWinStreakMmr: 0,
    bestUnbeatenStreak: 0,
    worstLossStreak: 0,
    worstLossStreakMmr: 0,
    giantKillerWins: 0,
    winsVsRank1: 0,
    bestMmrGain: null,
    biggestUpsetGap: null,
    points: [],
    currentWinStreak: 0,
    currentWinStreakMmr: 0,
    currentUnbeatenStreak: 0,
    currentLossStreak: 0,
    currentLossStreakMmr: 0,
  };
}

/**
 * Streak counters, and what each run was worth in MMR.
 *
 * The length alone undersells a run: six wins over even opposition and six wins
 * over the top of the ladder are the same line with very different rewards. Runs
 * of equal length are separated by that figure — the richest win streak and the
 * costliest losing one are the ones worth telling.
 */
function updateStreaks(agg: PlayerAggregate, outcome: MmrHistoryOutcome, mmrDelta: number): void {
  if (outcome === "win") {
    agg.currentWinStreak++;
    agg.currentWinStreakMmr += mmrDelta;
    agg.currentUnbeatenStreak++;
    agg.currentLossStreak = 0;
    agg.currentLossStreakMmr = 0;
  } else if (outcome === "draw") {
    agg.currentWinStreak = 0;
    agg.currentWinStreakMmr = 0;
    agg.currentUnbeatenStreak++;
    agg.currentLossStreak = 0;
    agg.currentLossStreakMmr = 0;
  } else {
    agg.currentWinStreak = 0;
    agg.currentWinStreakMmr = 0;
    agg.currentUnbeatenStreak = 0;
    agg.currentLossStreak++;
    agg.currentLossStreakMmr += mmrDelta;
  }

  if (
    agg.currentWinStreak > agg.bestWinStreak ||
    (agg.currentWinStreak === agg.bestWinStreak && agg.currentWinStreakMmr > agg.bestWinStreakMmr)
  ) {
    agg.bestWinStreak = agg.currentWinStreak;
    agg.bestWinStreakMmr = agg.currentWinStreakMmr;
  }
  if (
    agg.currentLossStreak > agg.worstLossStreak ||
    (agg.currentLossStreak === agg.worstLossStreak && agg.currentLossStreakMmr < agg.worstLossStreakMmr)
  ) {
    agg.worstLossStreak = agg.currentLossStreak;
    agg.worstLossStreakMmr = agg.currentLossStreakMmr;
  }
  agg.bestUnbeatenStreak = Math.max(agg.bestUnbeatenStreak, agg.currentUnbeatenStreak);
}

function draftFeat(row: SeasonHistoryRow, opponent: string | null, side: SideContext, mmrGap: number): FeatDraft {
  return {
    matchId: row.matchId,
    playedAt: row.playedAt,
    opponentId: opponent,
    mmrDelta: row.mmrDelta,
    mmrGap,
    teamSize: side.teamSize,
    opponentTeamSize: side.opponentTeamSize,
  };
}

/**
 * Records the "beat a stronger side" feats.
 *
 * The gap is measured between the two *side* averages, never between a team and
 * a single rating. Against a player's own MMR, a beginner carried by the best
 * player of the season posts the largest upset of the year for a match they were
 * favourites in — which is the opposite of what the award is for. In 1v1 the
 * side average is that player's own MMR, so duels are unaffected.
 *
 * The counter and the biggest-gap feat part ways on the threshold: a win over an
 * opposition five points above is not giant killing, so it is counted only past
 * STRONGER_OPPONENT_MMR_GAP — the same bar the profile's "win rate by opponent
 * level" uses. The record feat keeps every positive gap: it reports the widest
 * one of the season, so a threshold would only hide the whole line from a player
 * who never faced anyone far above them.
 */
function updateUpsets(agg: PlayerAggregate, row: SeasonHistoryRow, opponent: string | null, side: SideContext): void {
  const gap = row.opponentAvgMmr - side.allyAvgMmr;
  if (gap <= 0) return;

  if (gap > STRONGER_OPPONENT_MMR_GAP) agg.giantKillerWins++;
  if (!agg.biggestUpsetGap || gap > agg.biggestUpsetGap.mmrGap) {
    agg.biggestUpsetGap = draftFeat(row, opponent, side, gap);
  }
}

/**
 * The match that paid the most MMR — a different question from the biggest
 * upset. The gap is only one of the inputs: an outcome type carries its own MMR
 * multiplier, so the best-paying match of a season is often a normal-looking win
 * scored in a way the discipline rewards more.
 */
function updateBestGain(agg: PlayerAggregate, row: SeasonHistoryRow, opponent: string | null, side: SideContext): void {
  if (row.mmrDelta <= 0) return;
  if (agg.bestMmrGain && row.mmrDelta <= agg.bestMmrGain.mmrDelta) return;
  agg.bestMmrGain = draftFeat(row, opponent, side, row.opponentAvgMmr - side.allyAvgMmr);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Tallies are stored once per unordered pair, always from the lexicographically
 * first id. `relation` says how the second player's result follows from the
 * first's: opponents get the mirrored outcome, teammates share it. Getting this
 * wrong is invisible half the time — a duo whose lower id happens to be iterated
 * first still tallies correctly — so the two cases are named rather than
 * inferred.
 */
function addToTally(
  store: Map<string, PairTally>,
  first: string,
  second: string,
  outcomeOfFirst: MmrHistoryOutcome,
  relation: "opposed" | "shared",
): void {
  const [aId, bId] = first < second ? [first, second] : [second, first];
  const flip = relation === "opposed" && aId !== first;
  const key = pairKey(first, second);
  const tally = store.get(key) ?? { aId, bId, matches: 0, aWins: 0, aLosses: 0, draws: 0 };

  tally.matches++;
  if (outcomeOfFirst === "draw") tally.draws++;
  else if ((outcomeOfFirst === "win") !== flip) tally.aWins++;
  else tally.aLosses++;

  store.set(key, tally);
}

function recordTeammates(state: ReplayState, team: string[], outcomes: Map<string, MmrHistoryOutcome>): void {
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      const outcome = outcomes.get(team[i]!);
      if (outcome) addToTally(state.duos, team[i]!, team[j]!, outcome, "shared");
    }
  }
}

function recordPairs(state: ReplayState, sides: Map<number, string[]>, outcomes: Map<string, MmrHistoryOutcome>): void {
  const teamA = sides.get(1) ?? [];
  const teamB = sides.get(2) ?? [];

  recordTeammates(state, teamA, outcomes);
  recordTeammates(state, teamB, outcomes);

  for (const a of teamA) {
    for (const b of teamB) {
      const outcome = outcomes.get(a);
      if (outcome) addToTally(state.rivalries, a, b, outcome, "opposed");
    }
  }
}

/** The slice of a player's season the standings order actually reads. */
export interface StandingRecord {
  wins: number;
  peakMmr: number;
  matchesPlayed: number;
}

/**
 * What the standings order is computed from. Narrower than the replay state on
 * purpose: the comparator reads it directly, without allocating a key per
 * comparison, and a test can hand it an equivalent of its own.
 */
export interface StandingSource {
  currentMmr: Map<string, number>;
  aggregates: Map<string, StandingRecord>;
}

/**
 * The order the standings are kept in. Equal MMR is common — it is the starting
 * value of every player — so the tie runs down what the two actually did with
 * their season before it reaches anything arbitrary:
 *
 *   MMR → wins → peak MMR → fewest matches for it → id
 *
 * "Fewest matches" reads the right way round: at equal MMR and equal wins, the
 * player who needed fewer games lost fewer of them.
 *
 * Every step reads a result, never an identity. Display names are deliberately
 * absent even as a last human-readable step: they are mutable, and a rewind
 * rebuilt after a rename would then hand out a different rank for a season whose
 * matches never changed. The id closes the chain — it decides nothing anyone
 * would call fair, it only guarantees the order is total, so the residency
 * counters never depend on the order rows arrived in.
 */
export function compareStanding(source: StandingSource, aId: string, bId: string): number {
  const aMmr = source.currentMmr.get(aId) ?? 0;
  const bMmr = source.currentMmr.get(bId) ?? 0;
  if (aMmr !== bMmr) return bMmr - aMmr;

  const a = source.aggregates.get(aId);
  const b = source.aggregates.get(bId);
  if (a && b) {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.peakMmr !== b.peakMmr) return b.peakMmr - a.peakMmr;
    if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
  }

  return compareCodeUnits(aId, bId);
}

/**
 * Index at which a player belongs in the sorted standings — and, for one already
 * in them, their current index. Every value the comparison reads is taken from
 * `state`, so this is only correct while the player's own row has not been
 * applied yet (removal) or has been fully applied (insertion), never in between.
 */
function standingIndex(state: ReplayState, playerId: string): number {
  let low = 0;
  let high = state.ranking.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (compareStanding(state, state.ranking[mid]!, playerId) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Pulls the match's players out of the standings *before* their new MMR is
 * applied, while the array is still sorted on the values it was built with.
 * A player who has not entered the standings yet is simply not there.
 */
function removeFromStandings(state: ReplayState, participants: string[]): void {
  for (const playerId of participants) {
    if (!state.currentMmr.has(playerId)) continue;
    const index = standingIndex(state, playerId);
    if (state.ranking[index] === playerId) state.ranking.splice(index, 1);
  }
}

/**
 * Puts them back at their new position and credits the top brackets. Only the
 * players of this match move, so the standings are repaired in place instead of
 * being re-sorted from scratch after every single match of the season.
 *
 * Two rules make the residency figures mean something:
 *
 * - only settled players are ranked, the same population `currentLeader` reads.
 *   A provisional MMR sitting at the top would otherwise push the real leader to
 *   rank 2 in the counters while not being the leader anywhere else.
 * - only the match's participants are credited, so residency reads "of the N
 *   matches you played, you were #1 for M of them". Crediting the whole ladder
 *   would pay an absent player for every match of the season they missed.
 *
 * Residency is counted in matches, not days: a season played over two months and
 * one played over a weekend should reward the same way.
 */
function returnToStandings(state: ReplayState, participants: string[]): void {
  for (const playerId of participants) {
    if (!state.settled.has(playerId)) continue;
    state.ranking.splice(standingIndex(state, playerId), 0, playerId);
  }

  // Ranks are read only once everyone is back in: the players of a match have to
  // see each other in the standings they are being ranked against.
  for (const playerId of participants) {
    const agg = state.aggregates.get(playerId);
    if (!agg || !state.settled.has(playerId)) continue;
    const rank = standingIndex(state, playerId) + 1;
    agg.bestRank = Math.min(agg.bestRank, rank);
    if (rank <= 1) agg.matchesInTop1++;
    if (rank <= 3) agg.matchesInTop3++;
    if (rank <= 5) agg.matchesInTop5++;
  }
}

/**
 * The two rosters seen from one player. A player the side rows do not mention —
 * a match recorded without its sides — falls on the same branch as a side B
 * player, which keeps `opponents` reading team A as it always did.
 */
function sideOf(playerId: string, sides: Map<number, string[]>): { allies: string[]; opponents: string[] } {
  const teamA = sides.get(1) ?? [];
  const teamB = sides.get(2) ?? [];
  return teamA.includes(playerId) ? { allies: teamA, opponents: teamB } : { allies: teamB, opponents: teamA };
}

/**
 * Each participant's side, averaged over the MMR its members brought *into* this
 * match. Teammate ratings come from the match's own history rows, so the average
 * is the pre-match one — the same instant `opponentAvgMmr` was frozen at when
 * the match was rated.
 */
export function buildSideContexts(rows: SeasonHistoryRow[], sides: Map<number, string[]>): Map<string, SideContext> {
  const mmrBefore = new Map(rows.map((row) => [row.playerId, row.mmrBefore]));
  const contexts = new Map<string, SideContext>();

  for (const row of rows) {
    const { allies, opponents } = sideOf(row.playerId, sides);
    // A player absent from the side rows is treated as their own side of one.
    const roster = allies.includes(row.playerId) ? allies : [row.playerId];
    const rated = roster.map((playerId) => mmrBefore.get(playerId)).filter((mmr): mmr is number => mmr !== undefined);
    const pool = rated.length > 0 ? rated : [row.mmrBefore];

    contexts.set(row.playerId, {
      allyAvgMmr: Math.round(pool.reduce((sum, mmr) => sum + mmr, 0) / pool.length),
      teamSize: roster.length,
      opponentTeamSize: Math.max(opponents.length, 1),
    });
  }
  return contexts;
}

function applyRow(
  state: ReplayState,
  row: SeasonHistoryRow,
  sides: Map<number, string[]>,
  side: SideContext,
  leaderId: string | null,
): MmrHistoryOutcome {
  const agg = state.aggregates.get(row.playerId) ?? createAggregate(row.playerId, row.mmrBefore);
  state.aggregates.set(row.playerId, agg);

  const resolved = resolveOutcome(row);
  if (!resolved) state.unresolvedOutcomes++;
  // Undecidable legacy rows still have to land somewhere or matchesPlayed would
  // stop matching wins + losses + draws; a draw is the neutral bucket.
  const outcome = resolved ?? "draw";
  const { opponents } = sideOf(row.playerId, sides);

  agg.matchesPlayed++;
  if (outcome === "win") agg.wins++;
  else if (outcome === "loss") agg.losses++;
  else agg.draws++;

  updateStreaks(agg, outcome, row.mmrDelta);
  // Any match that paid MMR qualifies, decided or not: what the card tells is
  // "the match that earned you the most", not "your best win".
  updateBestGain(agg, row, opponents[0] ?? null, side);
  if (outcome === "win") {
    updateUpsets(agg, row, opponents[0] ?? null, side);
    if (leaderId && leaderId !== row.playerId && opponents.includes(leaderId)) {
      agg.winsVsRank1++;
    }
  }

  if (row.mmrAfter > agg.peakMmr) {
    agg.peakMmr = row.mmrAfter;
    agg.peakMatchId = row.matchId;
    agg.peakPlayedAt = row.playedAt;
  }

  agg.finalMmr = row.mmrAfter;
  agg.points.push({
    mmrBefore: row.mmrBefore,
    mmrAfter: row.mmrAfter,
    mmrDelta: row.mmrDelta,
    outcome,
    playedAt: row.playedAt,
  });

  state.currentMmr.set(row.playerId, row.mmrAfter);
  if (!row.isPlacement) state.settled.add(row.playerId);
  return outcome;
}

/** Rows arrive ordered by (playedAt, matchId), so a match's rows are contiguous. */
function groupByMatch(history: SeasonHistoryRow[]): SeasonHistoryRow[][] {
  const groups: SeasonHistoryRow[][] = [];
  let current: SeasonHistoryRow[] = [];

  for (const row of history) {
    if (current.length > 0 && current[0]!.matchId !== row.matchId) {
      groups.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function buildSideIndex(sides: SeasonSideRow[]): Map<string, Map<number, string[]>> {
  const index = new Map<string, Map<number, string[]>>();
  for (const side of sides) {
    const byPosition = index.get(side.matchId) ?? new Map<number, string[]>();
    const players = byPosition.get(side.position) ?? [];
    players.push(side.playerId);
    byPosition.set(side.position, players);
    index.set(side.matchId, byPosition);
  }
  return index;
}

/**
 * The current #1, read *before* the match is applied — otherwise a player who
 * dethrones the leader would be credited with beating the leader they just
 * became. Players still in placement never enter the standings at all (see
 * `returnToStandings`): the top of an empty ladder is noise, not a title worth
 * hunting.
 */
function currentLeader(state: ReplayState): string | null {
  return state.ranking[0] ?? null;
}

export function replaySeason(history: SeasonHistoryRow[], sides: SeasonSideRow[]): ReplayResult {
  const state: ReplayState = {
    aggregates: new Map(),
    currentMmr: new Map(),
    ranking: [],
    settled: new Set(),
    rivalries: new Map(),
    duos: new Map(),
    unresolvedOutcomes: 0,
  };
  const sideIndex = buildSideIndex(sides);
  const matchGroups = groupByMatch(history);

  for (const rows of matchGroups) {
    const matchSides = sideIndex.get(rows[0]!.matchId) ?? new Map<number, string[]>();
    const leaderId = currentLeader(state);
    const outcomes = new Map<string, MmrHistoryOutcome>();
    const participants = [...new Set(rows.map((row) => row.playerId))];
    // Read before any row is applied: side averages are pre-match figures.
    const sideContexts = buildSideContexts(rows, matchSides);

    // The standings are repaired around the match: the players leave while their
    // old MMR still places them, and come back once it has been rewritten.
    removeFromStandings(state, participants);
    for (const row of rows) {
      const side = sideContexts.get(row.playerId)!;
      outcomes.set(row.playerId, applyRow(state, row, matchSides, side, leaderId));
    }
    recordPairs(state, matchSides, outcomes);
    returnToStandings(state, participants);
  }

  return {
    aggregates: state.aggregates,
    rivalries: [...state.rivalries.values()],
    duos: [...state.duos.values()],
    matchCount: matchGroups.length,
    unresolvedOutcomes: state.unresolvedOutcomes,
  };
}
