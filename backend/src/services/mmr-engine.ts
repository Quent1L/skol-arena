import { averageMmr, calculateExpectedScore, MIN_MMR } from "@skol-arena/shared";
import type { TeamInteractionMode } from "@skol-arena/shared";

// The scalar formulas live in shared so the match wizard can preview a line-up's
// balance with the very same arithmetic. Re-exported here so every existing call
// site keeps importing them from the engine.
export { averageMmr, calculateExpectedScore, MIN_MMR };

/**
 * Pure MMR engine — no DB access, no side effects. Every MMR path (finalization,
 * provisional match preview, provisional leaderboard replay) calls this and this
 * only; they differ solely by the MMR snapshot they feed in.
 *
 * The engine separates three concerns the previous implementation mixed
 * together:
 *
 *   1. How expected the result was  → Elo on side averages → one player delta.
 *   2. How much MMR is at stake     → that delta × the side size, on even sides.
 *   3. Who carries which part of it → teamInteractionMode  → per-player shares.
 *
 * Scaling the pot by the side size is what makes a result worth the same to a
 * player whatever the format: in a 2v2 the pot is twice the Elo delta, each side
 * splits its own, and everyone moves by exactly what they would have moved in a
 * 1v1. It applies only when both sides field the same number of players — the
 * only case where both can scale by the same factor and still cancel out. Uneven
 * sides keep the plain pot of one Elo delta, split within each side, so nobody
 * ever risks more than their 1v1 delta.
 *
 * A match therefore transfers MMR between the two sides instead of creating it.
 * The losing side is settled first and whatever the MMR floor keeps a player from
 * paying is taken off the winners' pot, so the floor cannot mint MMR either. One
 * documented exception to that invariant remains: the per-player placement
 * multiplier.
 */

/**
 * Bumped whenever a change to this file makes previously stored MMR
 * incomparable with what a new match would produce. Seasons still running are
 * replayed at boot to catch up — see `utils/init-mmr-engine.ts`.
 *
 * 1 — per-player ratio applied directly to the delta (non-conservative)
 * 2 — team delta split into normalised shares
 * 3 — pot scaled by the side size on even sides, so a 2v2 moves a player like a
 *     1v1; uneven sides keep the v2 split; the pot a floored player cannot pay
 *     is withheld from the winners instead of being minted
 */
export const MMR_ENGINE_VERSION = 3;

export type MatchResult = 1 | 0 | 0.5;

export interface EnginePlayer {
  id: string;
  mmr: number;
  isPlacement: boolean;
}

export interface EngineSide {
  players: EnginePlayer[];
  score: number | null;
  /** The side's Elo result: 1 win, 0 loss, 0.5 draw. */
  result: MatchResult;
}

export interface MatchMmrInput {
  sides: [EngineSide, EngineSide];
  kFactor: number;
  scoreCountsForMmr: boolean;
  mmrMultiplier: number;
  teamInteractionMode: TeamInteractionMode;
}

export interface PlayerMmrDelta {
  playerId: string;
  mmrDelta: number;
  newMmr: number;
  /** Normalised share of the team delta, before the placement multiplier. */
  share: number;
  /** K of the match, doubled when this player is in placement. */
  kEffective: number;
}

/** Bounds of the relative-level ratio used to weight a player's share. */
export const WEIGHT_CLAMP_MIN = 0.75;
export const WEIGHT_CLAMP_MAX = 1.25;

/**
 * How strongly a player's level modulates their share of the team delta.
 * 0 = strictly equal split. The exponent is negated on a losing side in
 * INDIVIDUAL mode, which is what makes the stronger player pay for the defeat.
 */
export const MODE_ALPHA: Record<TeamInteractionMode, number> = {
  COLLABORATIVE: 0,
  SHARED_RESOURCE: 0.5,
  INDIVIDUAL: 1,
};

export const PLACEMENT_MULTIPLIER = 2;
export const DEFAULT_TEAM_INTERACTION_MODE: TeamInteractionMode = "COLLABORATIVE";

/** A participant's standing just before the match being priced. */
export interface EnginePlayerStanding {
  mmr: number;
  matchesPlayed: number;
}

/**
 * Single definition of the placement rule. Callers differ only in where they
 * read a participant's pre-match standing from — live records, a replay
 * snapshot, a provisional projection — so they supply that as `resolve` and the
 * engine keeps ownership of what "still in placement" means.
 */
export function toEnginePlayers(
  playerIds: string[],
  placementMatches: number,
  resolve: (playerId: string) => EnginePlayerStanding,
): EnginePlayer[] {
  return playerIds.map((playerId) => {
    const { mmr, matchesPlayed } = resolve(playerId);
    return { id: playerId, mmr, isPlacement: matchesPlayed < placementMatches };
  });
}

/**
 * Score amplification, in [1, 2]: a blowout moves twice as much MMR as a match
 * settled by a hair. Driven by the gap, not by who won — both sides share it.
 */
export function calculateScoreMultiplier(scoreA: number, scoreB: number): number {
  const total = scoreA + scoreB;
  if (total <= 0) return 1;
  return 1 + Math.abs(scoreA - scoreB) / total;
}

function sideAvgMmr(side: EngineSide): number {
  return averageMmr(side.players.map((p) => p.mmr));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalised shares of one side, summing to exactly 1 whatever the weights are.
 * A solo side always gets a share of 1, which is why the interaction mode has no
 * effect on a 1v1 — no branch needed for it.
 */
function playerShares(side: EngineSide, oppAvgMmr: number, mode: TeamInteractionMode, teamDelta: number): number[] {
  const alpha = MODE_ALPHA[mode] ?? MODE_ALPHA.COLLABORATIVE;
  const sign = mode === "INDIVIDUAL" && teamDelta < 0 ? -1 : 1;
  const exponent = alpha * sign;

  const weights = side.players.map((p) => {
    const ratio = clamp(oppAvgMmr / Math.max(MIN_MMR, p.mmr), WEIGHT_CLAMP_MIN, WEIGHT_CLAMP_MAX);
    return Math.pow(ratio, exponent);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return side.players.map(() => 1 / side.players.length);
  return weights.map((w) => w / total);
}

/**
 * Splits an integer target across shares with the largest-remainder method, so
 * the parts sum back to the target exactly. Remainder ties break on playerId,
 * never on input order — the deterministic season replay depends on that.
 *
 * `target` must already be an integer: the caller rounds side A's team delta and
 * negates it for side B, because `Math.round` is not symmetric on halves
 * (`round(2.5) = 3` but `round(-2.5) = -2`) and would leak a point per match.
 */
function allocateIntegerDeltas(target: number, shares: number[], playerIds: string[]): number[] {
  const sign = target < 0 ? -1 : 1;
  const magnitude = Math.abs(target);
  const exact = shares.map((share) => magnitude * share);
  const base = exact.map((value) => Math.floor(value));

  let leftover = magnitude - base.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - base[index] }))
    .sort((a, b) => b.remainder - a.remainder || playerIds[a.index].localeCompare(playerIds[b.index]));

  for (const { index } of order) {
    if (leftover <= 0) break;
    base[index] += 1;
    leftover -= 1;
  }

  return base.map((value) => sign * value);
}

interface SideOutcome {
  results: PlayerMmrDelta[];
  /** Share of the pot the MMR floor kept this side from paying. */
  unpaid: number;
}

function zeroDeltas(sides: [EngineSide, EngineSide]): PlayerMmrDelta[] {
  return [...sides[0].players, ...sides[1].players].map((p) => ({
    playerId: p.id,
    mmrDelta: 0,
    newMmr: p.mmr,
    share: 0,
    kEffective: 0,
  }));
}

function buildSideResults(
  side: EngineSide,
  teamDelta: number,
  oppAvgMmr: number,
  mode: TeamInteractionMode,
  kEffective: number,
): SideOutcome {
  const shares = playerShares(side, oppAvgMmr, mode, teamDelta);
  const playerIds = side.players.map((p) => p.id);
  const deltas = allocateIntegerDeltas(teamDelta, shares, playerIds);
  let unpaid = 0;

  const results = side.players.map((player, index) => {
    // Placement is applied after the allocation: a rookie converges twice as
    // fast without doubling what their opponents risk. This is the engine's one
    // deliberate breach of conservation, bounded by placementMatches × K.
    const raw = deltas[index] * (player.isPlacement ? PLACEMENT_MULTIPLIER : 1);
    const newMmr = Math.max(MIN_MMR, player.mmr + raw);

    // What the floor stopped them paying, measured on their share of the pot and
    // not on the doubled placement loss: the extra a rookie pays is burned by
    // design, it was never the opponents' to collect.
    if (deltas[index] < 0) {
      unpaid += Math.max(0, -deltas[index] - (player.mmr - newMmr));
    }

    return {
      playerId: player.id,
      mmrDelta: newMmr - player.mmr,
      newMmr,
      share: shares[index],
      kEffective: kEffective * (player.isPlacement ? PLACEMENT_MULTIPLIER : 1),
    };
  });

  return { results, unpaid };
}

export function calculateMatchMmr(input: MatchMmrInput): PlayerMmrDelta[] {
  const { sides, kFactor, scoreCountsForMmr, mmrMultiplier, teamInteractionMode } = input;
  const [sideA, sideB] = sides;

  if (!scoreCountsForMmr || sideA.players.length === 0 || sideB.players.length === 0) {
    return zeroDeltas(sides);
  }

  const avgA = sideAvgMmr(sideA);
  const avgB = sideAvgMmr(sideB);
  const expectedA = calculateExpectedScore(avgA, avgB);

  const scoreMultiplier = calculateScoreMultiplier(sideA.score ?? 0, sideB.score ?? 0);
  const kEffective = kFactor * scoreMultiplier * mmrMultiplier;

  // Rounded once, then negated: side B's target is posed rather than recomputed,
  // which is what makes the two sides cancel out exactly.
  const playerDeltaA = Math.round(kEffective * (sideA.result - expectedA));

  // On even sides the pot is that 1v1 delta times the side size, so each side
  // splits an equal pot and a player moves by the 1v1 amount whatever the format.
  // Rounding before scaling rather than after keeps that exact: the pot is a
  // multiple of the side size instead of landing one point off it.
  //
  // Uneven sides get no factor at all. Scaling on the larger side would expose
  // the shorter one to size ratio × kEffective: a 1v11 would take everything a
  // player owns in a single match, and the winners would collect whatever
  // fraction of that pot the floor let them actually pay. One Elo delta per side
  // keeps every line-up inside the risk a 1v1 already carries.
  const evenSides = sideA.players.length === sideB.players.length;
  const teamDeltaA = evenSides ? playerDeltaA * sideA.players.length : playerDeltaA;

  // The losing side is settled first. A player at the MMR floor cannot pay their
  // whole share, and that share is withheld from the winners rather than minted:
  // the pot only ever moves MMR that somebody actually paid. Nothing is withheld
  // in the ordinary case, where the floor is nowhere near.
  const aLoses = teamDeltaA < 0;
  const pot = Math.abs(teamDeltaA);
  const lost = buildSideResults(aLoses ? sideA : sideB, -pot, aLoses ? avgB : avgA, teamInteractionMode, kEffective);
  const won = buildSideResults(
    aLoses ? sideB : sideA,
    pot - lost.unpaid,
    aLoses ? avgA : avgB,
    teamInteractionMode,
    kEffective,
  );

  return aLoses ? [...lost.results, ...won.results] : [...won.results, ...lost.results];
}

// ── Matches of three sides or more ───────────────────────────────────────────

/** A side of a match of any size, placed by its rank (1 = first, ties share it). */
export interface RankedEngineSide {
  players: EnginePlayer[];
  score: number | null;
  rank: number;
}

export interface MultiSideMmrInput extends Omit<MatchMmrInput, "sides"> {
  sides: RankedEngineSide[];
}

function duelResult(rank: number, opponentRank: number): MatchResult {
  if (rank < opponentRank) return 1;
  return rank === opponentRank ? 0.5 : 0;
}

type PairTotals = { delta: number; share: number; kEffective: number };

/** Sums what every duel of the match moved, priced on the pre-match MMR. */
function sumPairDeltas(input: MultiSideMmrInput): Map<string, PairTotals> {
  const { sides, ...rest } = input;
  const withoutPlacement = (side: RankedEngineSide) => side.players.map((p) => ({ ...p, isPlacement: false }));
  const totals = new Map<string, PairTotals>();

  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      const [a, b] = [sides[i], sides[j]];
      const results = calculateMatchMmr({
        ...rest,
        sides: [
          { players: withoutPlacement(a), score: a.score, result: duelResult(a.rank, b.rank) },
          { players: withoutPlacement(b), score: b.score, result: duelResult(b.rank, a.rank) },
        ],
      });
      for (const r of results) {
        const t = totals.get(r.playerId) ?? { delta: 0, share: 0, kEffective: 0 };
        totals.set(r.playerId, {
          delta: t.delta + r.mmrDelta,
          share: t.share + r.share,
          kEffective: t.kEffective + r.kEffective,
        });
      }
    }
  }
  return totals;
}

/**
 * MMR of a match of any number of sides. Two sides go through `calculateMatchMmr`
 * untouched, so every duel keeps exactly the deltas it always had.
 *
 * From three sides on, the match is read as every duel it contains: each pair of
 * sides is priced like a match of its own (whoever finished ahead won it, a shared
 * rank is a draw), on the MMR everyone brought into the match. A player's delta is
 * the average over their N−1 duels, so a 1v1v1 risks what a duel risks.
 *
 * The placement multiplier and the MMR floor apply once, on that average. The
 * rounding of the average can leave a point or two unbalanced per match: like the
 * placement multiplier, a bounded breach of conservation.
 */
export function calculateMultiSideMmr(input: MultiSideMmrInput): PlayerMmrDelta[] {
  const { sides } = input;
  if (sides.length === 2) {
    const [a, b] = sides;
    return calculateMatchMmr({
      ...input,
      sides: [
        { players: a.players, score: a.score, result: duelResult(a.rank, b.rank) },
        { players: b.players, score: b.score, result: duelResult(b.rank, a.rank) },
      ],
    });
  }

  const duels = sides.length - 1;
  const totals = duels > 0 ? sumPairDeltas(input) : new Map<string, PairTotals>();
  return sides.flatMap((side) =>
    side.players.map((player) => {
      const t = totals.get(player.id) ?? { delta: 0, share: 0, kEffective: 0 };
      const multiplier = player.isPlacement ? PLACEMENT_MULTIPLIER : 1;
      const average = (value: number) => (duels > 0 ? value / duels : 0);
      const newMmr = Math.max(MIN_MMR, player.mmr + Math.round(average(t.delta)) * multiplier);
      return {
        playerId: player.id,
        mmrDelta: newMmr - player.mmr,
        newMmr,
        share: average(t.share),
        kEffective: average(t.kEffective) * multiplier,
      };
    }),
  );
}
