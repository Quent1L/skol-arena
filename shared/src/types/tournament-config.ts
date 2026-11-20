import { z } from "zod";

// ============================================
// Per-mode tournament configuration
// ============================================

/**
 * Knobs that used to live directly on `tournaments`, split off into two 1:1
 * satellites because each one only means something for a subset of the modes:
 *
 * - scoring (points per result) applies to every point-scored mode, so
 *   championship and bracket, but not ranked which runs on MMR
 * - the championship caps only constrain user-created matches, which is a
 *   championship-only flow
 *
 * A missing config means "this mode has no such setting"; readers fall back to
 * the defaults below rather than to inline literals.
 */

export const SCORING_DEFAULTS = {
  pointPerVictory: 3,
  pointPerDraw: 1,
  pointPerLoss: 0,
} as const;

export const CHAMPIONSHIP_DEFAULTS = {
  maxMatchesPerPlayer: 10,
  maxTimesWithSamePartner: 2,
  maxTimesWithSameOpponent: 2,
} as const;

/** Accepted range of each championship cap, shared by the Zod bounds and the form inputs. */
export const CHAMPIONSHIP_LIMITS = {
  maxMatchesPerPlayer: { min: 1, max: 100 },
  maxTimesWithSamePartner: { min: 1, max: 10 },
  maxTimesWithSameOpponent: { min: 1, max: 10 },
} as const;

// ============================================
// Schemas
// ============================================

const points = () => z.number().int().min(0);

const cap = (limits: { min: number; max: number }) => z.number().int().min(limits.min).max(limits.max);

/** Points awarded per result. Serves as both the response and the input shape. */
export const tournamentScoringConfigSchema = z
  .object({
    pointPerVictory: points(),
    pointPerDraw: points(),
    pointPerLoss: points(),
  })
  .meta({ id: "TournamentScoringConfig" });

export type TournamentScoringConfig = z.infer<typeof tournamentScoringConfigSchema>;

/** Pairing caps enforced when a championship match is created. */
export const championshipConfigSchema = z
  .object({
    maxMatchesPerPlayer: cap(CHAMPIONSHIP_LIMITS.maxMatchesPerPlayer),
    maxTimesWithSamePartner: cap(CHAMPIONSHIP_LIMITS.maxTimesWithSamePartner),
    maxTimesWithSameOpponent: cap(CHAMPIONSHIP_LIMITS.maxTimesWithSameOpponent),
  })
  .meta({ id: "ChampionshipConfig" });

export type ChampionshipConfig = z.infer<typeof championshipConfigSchema>;

/**
 * Input variants: every field optional so a caller can send a partial config.
 * Defaults are applied by the service, not here — a `.default()` inside an
 * `.optional()` object never fires when the object itself is omitted.
 */
export const tournamentScoringConfigInputSchema = tournamentScoringConfigSchema.partial();

export const championshipConfigInputSchema = championshipConfigSchema.partial();

export type TournamentScoringConfigInput = z.infer<typeof tournamentScoringConfigInputSchema>;

export type ChampionshipConfigInput = z.infer<typeof championshipConfigInputSchema>;

// ============================================
// Resolution helpers
// ============================================

/** Scoring config of a tournament, falling back to the defaults when absent. */
export function resolveScoringConfig(config?: Partial<TournamentScoringConfig> | null): TournamentScoringConfig {
  return {
    pointPerVictory: config?.pointPerVictory ?? SCORING_DEFAULTS.pointPerVictory,
    pointPerDraw: config?.pointPerDraw ?? SCORING_DEFAULTS.pointPerDraw,
    pointPerLoss: config?.pointPerLoss ?? SCORING_DEFAULTS.pointPerLoss,
  };
}

/** Championship caps of a tournament, falling back to the defaults when absent. */
export function resolveChampionshipConfig(config?: Partial<ChampionshipConfig> | null): ChampionshipConfig {
  return {
    maxMatchesPerPlayer: config?.maxMatchesPerPlayer ?? CHAMPIONSHIP_DEFAULTS.maxMatchesPerPlayer,
    maxTimesWithSamePartner: config?.maxTimesWithSamePartner ?? CHAMPIONSHIP_DEFAULTS.maxTimesWithSamePartner,
    maxTimesWithSameOpponent: config?.maxTimesWithSameOpponent ?? CHAMPIONSHIP_DEFAULTS.maxTimesWithSameOpponent,
  };
}
