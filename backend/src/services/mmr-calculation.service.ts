import { db } from "../config/database";
import { eq, and, inArray, notInArray, gt, gte } from "drizzle-orm";
import { matches, matchSides, tournamentEntries, tournamentEntryPlayers } from "../db/schema";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import type { CreateMmrHistoryData } from "../repository/player-mmr.repository";
import { mmrSeedRepository } from "../repository/mmr-seed.repository";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import type { MmrAnimationEventReason, MmrHistoryOutcome } from "@skol-arena/shared";
import {
  indexRulesetOutcomes,
  resolveRulesetInteractionMode,
  RULESET_OUTCOME_DEFAULTS,
  type RulesetOutcomeType,
  type TeamInteractionMode,
} from "@skol-arena/shared/types/index";
import { tournamentRulesetService } from "./tournament-ruleset.service";
import { BadRequestError, ErrorCode, NotFoundError } from "../types/errors";
import {
  calculateMatchMmr,
  toEnginePlayers,
  type EnginePlayer,
  type EnginePlayerStanding,
  type MatchResult,
} from "./mmr-engine";

interface MatchSideData {
  opponentPlayerIds: string[];
  sameTeamPlayerIds: string[];
  scoreForPlayer: number;
  scoreForOpponent: number;
  playerWon: boolean | null;
}

interface CheckpointState {
  mmr: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  maxWinStreak: number;
  lossStreak: number;
  maxLossStreak: number;
}

interface MmrLookups {
  sidesMap: Map<string, MatchSideData>;
  historiesMap: Map<string, number>;
  currentMmrMap: Map<string, number>;
  /** Carried-over entry MMR per player, when the season inherits ranks. */
  entryMmrMap: Map<string, number>;
  /** Season ruleset, resolved once per replay rather than joined per match. */
  ruleset: SeasonRuleset;
}

/** The snapshot values this service needs, flattened for the replay loops. */
interface SeasonRuleset {
  outcomes: Map<string, RulesetOutcomeType>;
  interactionMode: TeamInteractionMode;
}

type ResolvableSide = {
  score: number | null;
  entry?: { players: { playerId: string }[] } | null;
};

function outcomeFromWin(playerWon: boolean | null): MmrHistoryOutcome {
  if (playerWon === true) return "win";
  if (playerWon === false) return "loss";
  return "draw";
}

function resultFromWin(playerWon: boolean | null): MatchResult {
  if (playerWon === true) return 1;
  if (playerWon === false) return 0;
  return 0.5;
}

/**
 * Season ruleset as the replay loops want it.
 *
 * Read once per replay from the competition's own snapshot, never joined off the
 * live discipline: editing a discipline must not change what an already-played
 * match was worth.
 */
async function loadSeasonRuleset(seasonId: string): Promise<SeasonRuleset> {
  const payload = await tournamentRulesetService.getForTournament(seasonId);
  return {
    outcomes: indexRulesetOutcomes(payload),
    interactionMode: resolveRulesetInteractionMode(payload),
  };
}

/**
 * Outcome a match was played under. An id the snapshot does not know — a match
 * orphaned before the restrict foreign keys landed — falls back to the neutral
 * defaults, which is exactly what the old inline fallback did.
 */
function outcomeOf(ruleset: SeasonRuleset, outcomeTypeId: string | null): {
  scoreCountsForMmr: boolean;
  mmrMultiplier: number;
} {
  return (outcomeTypeId ? ruleset.outcomes.get(outcomeTypeId) : undefined) ?? RULESET_OUTCOME_DEFAULTS;
}

function averageMmr(players: EnginePlayer[], fallback: number): number {
  if (players.length === 0) return fallback;
  return Math.round(players.reduce((sum, p) => sum + p.mmr, 0) / players.length);
}

/** A participant's standing at a past instant, as served to the match wizard. */
export interface MmrSnapshotEntry {
  playerId: string;
  mmr: number;
  isPlacement: boolean;
}

/** Ceiling on a snapshot request: one lookup per player, so it must stay bounded. */
const MMR_SNAPSHOT_MAX_PLAYERS = 32;

export class MmrCalculationService {
  /**
   * Each player's standing as it was just before `at`, without touching the
   * live records. Backs the match wizard's balance preview: a match can be
   * entered days late, so the line-up must be priced with the MMR the players
   * held on the day they played, not the MMR they hold now.
   *
   * A player with no earlier match in the season falls back to the same entry
   * MMR a replay would use — the carry-over seed, then the season's base.
   */
  async getMmrSnapshotAt(
    seasonId: string,
    playerIds: string[],
    at: Date,
  ): Promise<MmrSnapshotEntry[]> {
    const uniqueIds = [...new Set(playerIds)];
    if (uniqueIds.length === 0) return [];
    if (uniqueIds.length > MMR_SNAPSHOT_MAX_PLAYERS) {
      throw new BadRequestError(ErrorCode.VALIDATION_ERROR);
    }

    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    if (!config) throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);

    const seedMap = await mmrSeedRepository.getMapBySeason(seasonId);

    return await Promise.all(
      uniqueIds.map(async (playerId) => {
        const checkpoint = await playerMmrRepository.getCheckpointState(seasonId, playerId, at);
        const entryMmr = seedMap.get(playerId) ?? config.baseMmr;
        const matchesPlayed = checkpoint
          ? checkpoint.wins + checkpoint.losses + checkpoint.draws
          : 0;
        return {
          playerId,
          mmr: checkpoint?.mmr ?? entryMmr,
          isPlacement: matchesPlayed < config.placementMatches,
        };
      }),
    );
  }

  async recalculatePlayerMmr(seasonId: string, playerId: string, fromPlayedAt?: Date): Promise<void> {
    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    if (!config) return;

    // A season that carries the previous ranks over starts its players at their
    // seeded MMR, not at baseMmr. Reading it here is what makes the carry-over
    // survive every recalculation instead of being flattened by the first match.
    const entryMmrMap = await mmrSeedRepository.getMapBySeason(seasonId);
    const entryMmr = entryMmrMap.get(playerId) ?? config.baseMmr;

    let checkpoint: CheckpointState | null = null;
    let state: CheckpointState;
    if (fromPlayedAt) {
      checkpoint = await playerMmrRepository.getCheckpointState(seasonId, playerId, fromPlayedAt);
      state = checkpoint ?? { mmr: entryMmr, wins: 0, losses: 0, draws: 0, winStreak: 0, maxWinStreak: 0, lossStreak: 0, maxLossStreak: 0 };
    } else {
      state = { mmr: entryMmr, wins: 0, losses: 0, draws: 0, winStreak: 0, maxWinStreak: 0, lossStreak: 0, maxLossStreak: 0 };
    }

    await playerMmrRepository.deleteMmrHistoryForPlayer(seasonId, playerId, fromPlayedAt);

    const playerMatches = await this.getPlayerMatchesForSeason(seasonId, playerId, fromPlayedAt);

    if (playerMatches.length > 0) {
      const matchIds = playerMatches.map((m) => m.id);
      const sidesMap = await this.preloadMatchSides(matchIds, playerId);
      const allOtherPlayerIds = [...new Set([...sidesMap.values()].flatMap((s) => [...s.opponentPlayerIds, ...(s.sameTeamPlayerIds ?? [])]))];
      const historiesMap = await playerMmrRepository.preloadOpponentHistories(seasonId, matchIds, allOtherPlayerIds);
      const currentMmrMap = await playerMmrRepository.getPlayerCurrentMmrs(seasonId, allOtherPlayerIds);
      const ruleset = await loadSeasonRuleset(seasonId);

      for (const match of playerMatches) {
        state = await this.processOneMatch(match, playerId, seasonId, config, state, {
          sidesMap,
          historiesMap,
          currentMmrMap,
          entryMmrMap,
          ruleset,
        });
      }
    }

    if (playerMatches.length === 0 && checkpoint === null) {
      await playerMmrRepository.deleteBySeasonAndPlayer(seasonId, playerId);
      return;
    }

    await playerMmrRepository.upsert({
      seasonId,
      playerId,
      currentMmr: state.mmr,
      matchesPlayed: state.wins + state.losses + state.draws,
      wins: state.wins,
      losses: state.losses,
      draws: state.draws,
      winStreak: state.winStreak,
      maxWinStreak: state.maxWinStreak,
      lossStreak: state.lossStreak,
      maxLossStreak: state.maxLossStreak,
    });
  }

  private async processOneMatch(
    match: Awaited<ReturnType<typeof this.getPlayerMatchesForSeason>>[number],
    playerId: string,
    seasonId: string,
    config: { baseMmr: number; kFactor: number; placementMatches: number },
    state: CheckpointState,
    lookups: MmrLookups,
  ): Promise<CheckpointState> {
    const { sidesMap, historiesMap, currentMmrMap, entryMmrMap, ruleset } = lookups;
    const isPlacement = state.wins + state.losses + state.draws < config.placementMatches;
    const raw = sidesMap.get(match.id) ?? { opponentPlayerIds: [], sameTeamPlayerIds: [], scoreForPlayer: 0, scoreForOpponent: 0, playerWon: null };
    const { opponentPlayerIds, playerWon } = raw;
    const sameTeamPlayerIds = raw.sameTeamPlayerIds ?? [];

    const getOtherPlayerMmr = (id: string) =>
      historiesMap.get(`${id}:${match.id}`) ??
      currentMmrMap.get(id) ??
      entryMmrMap.get(id) ??
      config.baseMmr;

    // Only this player's placement status is known here — the teammates' deltas
    // are discarded anyway, and placement is applied per player after the split,
    // so leaving them at false cannot alter the value we persist.
    const mySidePlayers: EnginePlayer[] = [
      { id: playerId, mmr: state.mmr, isPlacement },
      ...sameTeamPlayerIds.map((id) => ({ id, mmr: getOtherPlayerMmr(id), isPlacement: false })),
    ];
    const oppSidePlayers: EnginePlayer[] = opponentPlayerIds.map((id) => ({
      id,
      mmr: getOtherPlayerMmr(id),
      isPlacement: false,
    }));

    const outcomeType = outcomeOf(ruleset, match.outcomeTypeId);

    const calcResults = calculateMatchMmr({
      sides: [
        { players: mySidePlayers, score: raw.scoreForPlayer, result: resultFromWin(playerWon) },
        {
          players: oppSidePlayers,
          score: raw.scoreForOpponent,
          result: resultFromWin(playerWon === null ? null : !playerWon),
        },
      ],
      kFactor: config.kFactor,
      scoreCountsForMmr: outcomeType.scoreCountsForMmr,
      mmrMultiplier: outcomeType.mmrMultiplier,
      teamInteractionMode: ruleset.interactionMode,
    });

    const playerResult = calcResults.find((r) => r.playerId === playerId);
    const delta = playerResult?.mmrDelta ?? 0;
    const mmrBefore = state.mmr;
    const mmrAfter = playerResult?.newMmr ?? Math.max(1, state.mmr + delta);
    const opponentAvgMmr = averageMmr(oppSidePlayers, config.baseMmr);
    const kEffective = playerResult?.kEffective ?? 0;

    const newState = this.advanceState(state, playerWon, mmrAfter);

    await playerMmrRepository.createMmrHistory({
      seasonId,
      playerId,
      matchId: match.id,
      mmrBefore,
      mmrAfter,
      mmrDelta: delta,
      kEffective,
      opponentAvgMmr,
      isPlacement,
      outcome: outcomeFromWin(playerWon),
      winStreakAfter: newState.winStreak,
      lossStreakAfter: newState.lossStreak,
      matchesPlayedAfter: newState.wins + newState.losses + newState.draws,
    });

    return newState;
  }

  private advanceState(
    state: CheckpointState,
    playerWon: boolean | null,
    mmrAfter: number,
  ): CheckpointState {
    const newState: CheckpointState = { ...state, mmr: mmrAfter };
    if (playerWon === true) {
      newState.wins = state.wins + 1;
      newState.winStreak = state.winStreak + 1;
      newState.maxWinStreak = Math.max(state.maxWinStreak, newState.winStreak);
      newState.lossStreak = 0;
    } else if (playerWon === false) {
      newState.losses = state.losses + 1;
      newState.winStreak = 0;
      newState.lossStreak = state.lossStreak + 1;
      newState.maxLossStreak = Math.max(state.maxLossStreak, newState.lossStreak);
    } else {
      newState.draws = state.draws + 1;
    }
    return newState;
  }

  async processMatchFinalization(
    matchId: string,
  ): Promise<Map<string, { mmrBefore: number; mmrAfter: number; reason: MmrAnimationEventReason }>> {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      with: {
        tournament: {
          with: {
            rankedConfig: true,
          },
        },
      },
    });

    if (!match || match.tournament?.mode !== "ranked") return new Map();

    const seasonId = match.tournamentId;
    const playerIds = await this.getMatchPlayerIds(matchId);

    for (const playerId of playerIds) {
      await this.ensurePlayerMmrExists(seasonId, match.tournament.rankedConfig?.baseMmr ?? 1000, playerId);
    }

    return this.cascadeRecalculateFromMatch(matchId, seasonId, match.playedAt, "match_finalized");
  }

  async cascadeRecalculateAfterCancellation(
    matchId: string,
    seasonId: string,
    cancelledMatchPlayedAt: Date,
  ): Promise<Map<string, { mmrBefore: number; mmrAfter: number; reason: MmrAnimationEventReason }>> {
    return this.cascadeRecalculateFromMatch(matchId, seasonId, cancelledMatchPlayedAt, "match_cancelled");
  }

  async cascadeRecalculateAfterCorrection(
    matchId: string,
    seasonId: string,
    playedAt: Date,
  ): Promise<Map<string, { mmrBefore: number; mmrAfter: number; reason: MmrAnimationEventReason }>> {
    return this.cascadeRecalculateFromMatch(matchId, seasonId, playedAt, "match_corrected");
  }

  /**
   * Generic wave-propagation recalc: recomputes the match's direct participants
   * from fromPlayedAt forward, then repeatedly finds third parties who share
   * later match history with anyone whose MMR just changed and recalculates
   * them too, until nothing changes anymore. Used both for cancellation (undo
   * a match) and normal finalization (a backdated match can change history for
   * players other than its own two direct participants) — the only difference
   * is the reason tag attached to the direct-participant wave.
   */
  private async cascadeRecalculateFromMatch(
    matchId: string,
    seasonId: string,
    fromPlayedAt: Date,
    initialReason: MmrAnimationEventReason,
  ): Promise<Map<string, { mmrBefore: number; mmrAfter: number; reason: MmrAnimationEventReason }>> {
    const result = new Map<string, { mmrBefore: number; mmrAfter: number; reason: MmrAnimationEventReason }>();
    const directPlayerIds = await this.getMatchPlayerIds(matchId);
    const processedIds = new Set<string>(directPlayerIds);

    let changedIds = await this.recalcWaveAndCollectChanges(
      seasonId,
      directPlayerIds,
      fromPlayedAt,
      initialReason,
      result,
    );

    while (changedIds.length > 0) {
      const nextWave = await this.findAffectedPlayers(seasonId, changedIds, fromPlayedAt, [...processedIds]);
      if (nextWave.length === 0) break;

      for (const playerId of nextWave) processedIds.add(playerId);

      changedIds = await this.recalcWaveAndCollectChanges(
        seasonId,
        nextWave,
        fromPlayedAt,
        "cascade",
        result,
      );
    }

    return result;
  }

  private async recalcWaveAndCollectChanges(
    seasonId: string,
    playerIds: string[],
    playedAt: Date,
    reason: MmrAnimationEventReason,
    result: Map<string, { mmrBefore: number; mmrAfter: number; reason: MmrAnimationEventReason }>,
  ): Promise<string[]> {
    const snapshots = new Map<string, number>();
    for (const playerId of playerIds) {
      const record = await playerMmrRepository.getBySeasonAndPlayer(seasonId, playerId);
      snapshots.set(playerId, record?.currentMmr ?? 0);
    }

    for (const playerId of playerIds) {
      await this.recalculatePlayerMmr(seasonId, playerId, playedAt);
    }

    const changedIds: string[] = [];
    for (const playerId of playerIds) {
      const record = await playerMmrRepository.getBySeasonAndPlayer(seasonId, playerId);
      const mmrAfter = record?.currentMmr ?? 0;
      const mmrBefore = snapshots.get(playerId) ?? 0;
      result.set(playerId, { mmrBefore, mmrAfter, reason });
      if (mmrAfter !== mmrBefore) changedIds.push(playerId);
    }
    return changedIds;
  }

  private async findAffectedPlayers(
    seasonId: string,
    changedPlayerIds: string[],
    afterPlayedAt: Date,
    excludePlayerIds: string[],
  ): Promise<string[]> {
    const matchRows = await db
      .selectDistinct({ matchId: matchSides.matchId })
      .from(matchSides)
      .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
      .innerJoin(matches, eq(matchSides.matchId, matches.id))
      .where(
        and(
          eq(matches.tournamentId, seasonId),
          eq(matches.status, "finalized"),
          gt(matches.playedAt, afterPlayedAt),
          inArray(tournamentEntryPlayers.playerId, changedPlayerIds),
        ),
      );

    if (matchRows.length === 0) return [];

    const matchIds = matchRows.map((r) => r.matchId);
    const conditions = [inArray(matchSides.matchId, matchIds)];
    if (excludePlayerIds.length > 0) {
      conditions.push(notInArray(tournamentEntryPlayers.playerId, excludePlayerIds));
    }

    const playerRows = await db
      .selectDistinct({ playerId: tournamentEntryPlayers.playerId })
      .from(matchSides)
      .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
      .where(and(...conditions));

    return playerRows.map((r) => r.playerId);
  }

  /**
   * Deterministic full-season MMR recalculation. Unlike the old per-player loop
   * (which read opponent MMR from tables the same loop was concurrently
   * rewriting, making the result depend on arbitrary player iteration order),
   * this replays every finalized match exactly once in a single global
   * chronological pass (playedAt asc, id asc tiebreak), keeping only one
   * in-memory CheckpointState per player. Matches are streamed page by page
   * (keyset pagination) so memory stays bounded by page size + player count,
   * not total match count.
   */
  async recalculateSeasonMmrDeterministic(seasonId: string, pageSize = 500): Promise<void> {
    const config = await rankedSeasonRepository.getConfigByTournamentId(seasonId);
    if (!config) return;

    const existingPlayers = await playerMmrRepository.getAllPlayersBySeasonId(seasonId);
    const existingPlayerIds = new Set(existingPlayers.map((p) => p.playerId));
    // One read for the whole replay: every player's starting MMR, carried over
    // from the previous season when the season inherits ranks.
    const entryMmrMap = await mmrSeedRepository.getMapBySeason(seasonId);
    // One read for the whole replay: the ruleset the season is played under.
    const ruleset = await loadSeasonRuleset(seasonId);

    await playerMmrRepository.deleteAllMmrHistoryForSeason(seasonId);

    const stateMap = new Map<string, CheckpointState>();
    let cursor: { playedAt: Date; id: string } | undefined;

    for (;;) {
      const page = await playerMmrRepository.getFinalizedMatchesPageForSeason(seasonId, cursor, pageSize);
      if (page.length === 0) break;

      const historyBatch: CreateMmrHistoryData[] = [];
      for (const match of page) {
        this.processMatchGlobal(match, seasonId, config, stateMap, historyBatch, entryMmrMap, ruleset);
      }
      await playerMmrRepository.createMmrHistoryBatch(historyBatch);

      const last = page[page.length - 1];
      cursor = { playedAt: last.playedAt, id: last.id };

      if (page.length < pageSize) break;
    }

    for (const playerId of existingPlayerIds) {
      if (!stateMap.has(playerId)) {
        await playerMmrRepository.deleteBySeasonAndPlayer(seasonId, playerId);
      }
    }

    for (const [playerId, state] of stateMap) {
      await playerMmrRepository.upsert({
        seasonId,
        playerId,
        currentMmr: state.mmr,
        matchesPlayed: state.wins + state.losses + state.draws,
        wins: state.wins,
        losses: state.losses,
        draws: state.draws,
        winStreak: state.winStreak,
        maxWinStreak: state.maxWinStreak,
        lossStreak: state.lossStreak,
        maxLossStreak: state.maxLossStreak,
      });
    }
  }

  /**
   * Same per-player math as processOneMatch (calculateMatchMmrBySides/distributeToPlayer
   * are unchanged), but sources every participant's currentMmr from a single
   * shared in-memory map instead of live DB reads — this is what removes the
   * order-dependency. All reads for a match use the pre-match snapshot; the
   * map is only written once every participant's delta for this match has
   * been computed.
   */
  private processMatchGlobal(
    match: Awaited<ReturnType<typeof playerMmrRepository.getFinalizedMatchesPageForSeason>>[number],
    seasonId: string,
    config: { baseMmr: number; kFactor: number; placementMatches: number },
    stateMap: Map<string, CheckpointState>,
    historyBatch: CreateMmrHistoryData[],
    entryMmrMap: Map<string, number>,
    ruleset: SeasonRuleset,
  ): void {
    const sides = match.sides;
    if (!sides || sides.length < 2) return;
    const [sideA, sideB] = sides;
    const sideAIds = sideA.entry?.players.map((p) => p.playerId) ?? [];
    const sideBIds = sideB.entry?.players.map((p) => p.playerId) ?? [];
    const participantIds = [...new Set([...sideAIds, ...sideBIds])];
    if (participantIds.length === 0) return;

    const preState = this.buildPreState(participantIds, stateMap, entryMmrMap, config.baseMmr);
    const outcomeType = outcomeOf(ruleset, match.outcomeTypeId);

    const standingOf = (playerId: string): EnginePlayerStanding => {
      const s = preState.get(playerId)!;
      return { mmr: s.mmr, matchesPlayed: s.wins + s.losses + s.draws };
    };

    const playersA = toEnginePlayers(sideAIds, config.placementMatches, standingOf);
    const playersB = toEnginePlayers(sideBIds, config.placementMatches, standingOf);
    const resultA = resultFromWin(match.winnerSide === null ? null : match.winnerSide === "A");

    // One engine call for the whole match: every participant is priced against
    // the same pre-match snapshot, which is what keeps the replay deterministic.
    const results = calculateMatchMmr({
      sides: [
        { players: playersA, score: sideA.score ?? 0, result: resultA },
        { players: playersB, score: sideB.score ?? 0, result: (1 - resultA) as MatchResult },
      ],
      kFactor: config.kFactor,
      scoreCountsForMmr: outcomeType.scoreCountsForMmr,
      mmrMultiplier: outcomeType.mmrMultiplier,
      teamInteractionMode: ruleset.interactionMode,
    });

    const avgA = averageMmr(playersA, config.baseMmr);
    const avgB = averageMmr(playersB, config.baseMmr);

    for (const result of results) {
      const inSideA = sideAIds.includes(result.playerId);
      const playerWon = match.winnerSide === null ? null : (match.winnerSide === "A") === inSideA;
      const playerState = preState.get(result.playerId)!;
      const newState = this.advanceState(playerState, playerWon, result.newMmr);

      historyBatch.push({
        seasonId,
        playerId: result.playerId,
        matchId: match.id,
        mmrBefore: playerState.mmr,
        mmrAfter: result.newMmr,
        mmrDelta: result.mmrDelta,
        kEffective: result.kEffective,
        opponentAvgMmr: inSideA ? avgB : avgA,
        isPlacement: playerState.wins + playerState.losses + playerState.draws < config.placementMatches,
        outcome: outcomeFromWin(playerWon),
        winStreakAfter: newState.winStreak,
        lossStreakAfter: newState.lossStreak,
        matchesPlayedAfter: newState.wins + newState.losses + newState.draws,
      });

      stateMap.set(result.playerId, newState);
    }
  }

  private buildPreState(
    participantIds: string[],
    stateMap: Map<string, CheckpointState>,
    entryMmrMap: Map<string, number>,
    baseMmr: number,
  ): Map<string, CheckpointState> {
    const preState = new Map<string, CheckpointState>();
    for (const id of participantIds) {
      preState.set(
        id,
        stateMap.get(id) ?? {
          mmr: entryMmrMap.get(id) ?? baseMmr,
          wins: 0,
          losses: 0,
          draws: 0,
          winStreak: 0,
          maxWinStreak: 0,
          lossStreak: 0,
          maxLossStreak: 0,
        },
      );
    }
    return preState;
  }

  private async getPlayerMatchesForSeason(seasonId: string, playerId: string, fromPlayedAt?: Date) {
    const playerMatchIds = await db
      .select({ matchId: matchSides.matchId })
      .from(matchSides)
      .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
      .where(eq(tournamentEntryPlayers.playerId, playerId));

    const ids = playerMatchIds.map((r) => r.matchId);
    if (ids.length === 0) return [];

    return await db.query.matches.findMany({
      where: and(
        eq(matches.tournamentId, seasonId),
        eq(matches.status, "finalized"),
        inArray(matches.id, ids),
        fromPlayedAt ? gte(matches.playedAt, fromPlayedAt) : undefined,
      ),
      // Only the id is needed: what the outcome was worth comes from the season
      // snapshot, not from a join onto the live outcome_types row.
      columns: { id: true, playedAt: true, winnerSide: true, outcomeTypeId: true },
      orderBy: (m, { asc }) => [asc(m.playedAt)],
    });
  }

  private async preloadMatchSides(matchIds: string[], playerId: string): Promise<Map<string, MatchSideData>> {
    if (matchIds.length === 0) return new Map();

    const allSides = await db.query.matchSides.findMany({
      where: inArray(matchSides.matchId, matchIds),
      orderBy: (s, { asc }) => [asc(s.position)],
      with: {
        entry: {
          with: {
            players: true,
          },
        },
      },
    });

    const matchRows = await db.query.matches.findMany({
      where: inArray(matches.id, matchIds),
      columns: { id: true, winnerSide: true },
    });
    const winnerSideMap = new Map(matchRows.map((m) => [m.id, m.winnerSide]));

    const sidesByMatch = new Map<string, typeof allSides>();
    for (const side of allSides) {
      const list = sidesByMatch.get(side.matchId) ?? [];
      list.push(side);
      sidesByMatch.set(side.matchId, list);
    }

    const result = new Map<string, MatchSideData>();
    for (const matchId of matchIds) {
      const sides = sidesByMatch.get(matchId);
      if (!sides || sides.length < 2) {
        result.set(matchId, { opponentPlayerIds: [], sameTeamPlayerIds: [], scoreForPlayer: 0, scoreForOpponent: 0, playerWon: null });
        continue;
      }

      const winnerSide = winnerSideMap.get(matchId) ?? null;
      result.set(matchId, this.resolveSideData(sides[0], sides[1], playerId, winnerSide));
    }

    return result;
  }

  private resolveSideData(
    sideA: ResolvableSide,
    sideB: ResolvableSide,
    playerId: string,
    winnerSide: string | null,
  ): MatchSideData {
    const playerIdsA = sideA.entry?.players.map((p) => p.playerId) ?? [];
    const playerIdsB = sideB.entry?.players.map((p) => p.playerId) ?? [];
    const playerInSideA = playerIdsA.includes(playerId);
    const mySide = playerInSideA ? sideA : sideB;
    const oppSide = playerInSideA ? sideB : sideA;

    let playerWon: boolean | null = null;
    if (winnerSide === "A") playerWon = playerInSideA;
    else if (winnerSide === "B") playerWon = !playerInSideA;

    const myIds = playerInSideA ? playerIdsA : playerIdsB;
    const oppIds = playerInSideA ? playerIdsB : playerIdsA;
    return {
      opponentPlayerIds: oppIds,
      sameTeamPlayerIds: myIds.filter((id) => id !== playerId),
      scoreForPlayer: mySide.score ?? 0,
      scoreForOpponent: oppSide.score ?? 0,
      playerWon,
    };
  }

  private async extractMatchSidesForPlayer(
    matchId: string,
    playerId: string,
  ): Promise<{
    opponentPlayerIds: string[];
    scoreForPlayer: number;
    scoreForOpponent: number;
    playerWon: boolean | null;
  }> {
    const sides = await db.query.matchSides.findMany({
      where: eq(matchSides.matchId, matchId),
      orderBy: (s, { asc }) => [asc(s.position)],
      with: {
        entry: {
          with: {
            players: {
              with: {
                player: true,
              },
            },
          },
        },
      },
    });

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });

    if (!match || sides.length < 2) {
      return { opponentPlayerIds: [], scoreForPlayer: 0, scoreForOpponent: 0, playerWon: null };
    }

    return this.resolveSideData(sides[0], sides[1], playerId, match.winnerSide);
  }

  private async getMatchPlayerIds(matchId: string): Promise<string[]> {
    const rows = await db
      .select({ playerId: tournamentEntryPlayers.playerId })
      .from(matchSides)
      .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
      .where(eq(matchSides.matchId, matchId));

    return [...new Set(rows.map((r) => r.playerId))];
  }

  private async ensurePlayerMmrExists(
    seasonId: string,
    baseMmr: number,
    playerId: string,
  ): Promise<void> {
    const existing = await playerMmrRepository.getBySeasonAndPlayer(seasonId, playerId);
    if (!existing) {
      // A carried-over player enters the season at their seeded MMR: this is the
      // row the cascade recalculation starts from.
      const seedMmr = await mmrSeedRepository.getSeedMmr(seasonId, playerId);
      await playerMmrRepository.upsert({
        seasonId,
        playerId,
        currentMmr: seedMmr ?? baseMmr,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        winStreak: 0,
        maxWinStreak: 0,
        lossStreak: 0,
        maxLossStreak: 0,
      });
    }
  }

}

export const mmrCalculationService = new MmrCalculationService();
