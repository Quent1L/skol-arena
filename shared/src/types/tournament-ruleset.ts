import { z } from "zod";
import { TEAM_INTERACTION_MODES } from "./discipline";
import { tournamentModeSchema, tournamentStatusSchema } from "./enums";

// ============================================
// Ruleset snapshot of a competition
// ============================================

/**
 * The discipline settings a competition was actually played under, frozen on the
 * competition itself.
 *
 * These values used to be read live at compute *and* display time — the
 * interaction mode straight off `disciplines`, the multipliers and points off
 * `outcome_types`. Editing a discipline therefore rewrote the MMR and the
 * standings tiebreakers of competitions that were already finished, silently,
 * and only surfaced once some unrelated event flushed the standings cache.
 *
 * With the snapshot, the live rows serve exactly two purposes: seeding a new
 * competition, and feeding the explicit propagation action. Everything else —
 * every calculation and every screen — reads what is stored here.
 */

/** Outcome of a match whose type cannot be resolved: neutral, and MMR still counts. */
export const RULESET_OUTCOME_DEFAULTS = {
  name: "Défaut",
  points: 3,
  mmrMultiplier: 1,
  scoreCountsForMmr: true,
  isDefault: false,
} as const;

/** Applied when the discipline carries no explicit mode. Mirrors the engine's own default. */
export const RULESET_DEFAULT_INTERACTION_MODE = "COLLABORATIVE" as const;

// ============================================
// Schemas
// ============================================

export const rulesetOutcomeReasonSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .meta({ id: "RulesetOutcomeReason" });

export type RulesetOutcomeReason = z.infer<typeof rulesetOutcomeReasonSchema>;

export const rulesetOutcomeTypeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    points: z.number().int(),
    mmrMultiplier: z.number(),
    scoreCountsForMmr: z.boolean(),
    isDefault: z.boolean(),
    /**
     * Archived types stay in the payload so an already-entered match keeps
     * resolving, but they are no longer offered at match entry.
     */
    archivedAt: z.iso.datetime().nullish(),
    reasons: z.array(rulesetOutcomeReasonSchema),
  })
  .meta({ id: "RulesetOutcomeType" });

export type RulesetOutcomeType = z.infer<typeof rulesetOutcomeTypeSchema>;

/** Null when the competition was created without a discipline — the column is nullable. */
export const rulesetDisciplineSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    teamInteractionMode: z.enum(TEAM_INTERACTION_MODES).nullish(),
  })
  .meta({ id: "RulesetDiscipline" });

export type RulesetDiscipline = z.infer<typeof rulesetDisciplineSchema>;

export const tournamentRulesetPayloadSchema = z
  .object({
    discipline: rulesetDisciplineSchema.nullable(),
    outcomeTypes: z.array(rulesetOutcomeTypeSchema),
  })
  .meta({ id: "TournamentRuleset" });

export type TournamentRulesetPayload = z.infer<typeof tournamentRulesetPayloadSchema>;

/** What the competition endpoints return: the payload plus when it was last applied. */
export const tournamentRulesetSchema = z
  .object({
    payload: tournamentRulesetPayloadSchema,
    version: z.number().int(),
    appliedAt: z.iso.datetime(),
    /** Set while a propagation's recalculation is still running. */
    recalcPendingAt: z.iso.datetime().nullish(),
  })
  .meta({ id: "TournamentRulesetResponse" });

export type TournamentRulesetResponse = z.infer<typeof tournamentRulesetSchema>;

// ============================================
// Propagation
// ============================================

/**
 * A competition a discipline edit can still legitimately reach. Finished ones
 * never appear here — their ruleset is history and must not move.
 */
export const impactedCompetitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    mode: tournamentModeSchema,
    status: tournamentStatusSchema,
    /** Results already entered, so the admin sees what a recalculation would touch. */
    matchCount: z.number().int(),
    /** False when the snapshot already matches the live discipline. */
    hasDrift: z.boolean(),
  })
  .meta({ id: "ImpactedCompetition" });

export type ImpactedCompetition = z.infer<typeof impactedCompetitionSchema>;

export const propagateRulesetSchema = z.object({
  tournamentIds: z.array(z.uuid()).min(1),
});

export type PropagateRulesetInput = z.infer<typeof propagateRulesetSchema>;

export const propagationResultSchema = z
  .object({
    tournamentId: z.string(),
    /** `recalculating` is the ranked path: the replay runs in a worker. */
    status: z.enum(["recalculated", "recalculating", "failed"]),
    error: z.string().optional(),
  })
  .meta({ id: "PropagationResult" });

export type PropagationResult = z.infer<typeof propagationResultSchema>;

export const propagationResultListSchema = z.array(propagationResultSchema);

// ============================================
// Resolution helpers
// ============================================

const EMPTY_RULESET: TournamentRulesetPayload = { discipline: null, outcomeTypes: [] };

/** Ruleset of a competition, falling back to an empty one when absent. */
export function resolveRuleset(
  payload?: TournamentRulesetPayload | null,
): TournamentRulesetPayload {
  return payload ?? EMPTY_RULESET;
}

/**
 * Interaction mode in force. Drives the intra-team split of the MMR delta, so it
 * must resolve to the same value the engine would have defaulted to.
 */
export function resolveRulesetInteractionMode(
  payload?: TournamentRulesetPayload | null,
): (typeof TEAM_INTERACTION_MODES)[number] {
  return payload?.discipline?.teamInteractionMode ?? RULESET_DEFAULT_INTERACTION_MODE;
}

/**
 * Outcome type by id. A null or unknown id yields the defaults, which is the one
 * surviving fallback: matches orphaned before the restrict foreign keys landed
 * still carry a NULL `outcome_type_id`.
 */
export function resolveRulesetOutcome(
  payload: TournamentRulesetPayload | null | undefined,
  outcomeTypeId: string | null | undefined,
): RulesetOutcomeType {
  const found = outcomeTypeId
    ? payload?.outcomeTypes.find((outcome) => outcome.id === outcomeTypeId)
    : undefined;

  return found ?? { id: outcomeTypeId ?? "default", reasons: [], ...RULESET_OUTCOME_DEFAULTS };
}

/** Index for repeated lookups inside a replay loop, where a linear scan per match would show. */
export function indexRulesetOutcomes(
  payload?: TournamentRulesetPayload | null,
): Map<string, RulesetOutcomeType> {
  return new Map((payload?.outcomeTypes ?? []).map((outcome) => [outcome.id, outcome]));
}

/**
 * Whether two rulesets say the same thing.
 *
 * Deliberately not `JSON.stringify(a) === JSON.stringify(b)`: a payload that has
 * been through a jsonb column comes back with its keys reordered — Postgres
 * stores object keys sorted, not as written — so a plain text comparison reports
 * a difference between a snapshot and the identical payload rebuilt in memory.
 */
export function rulesetsEqual(
  a: TournamentRulesetPayload | null | undefined,
  b: TournamentRulesetPayload | null | undefined,
): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` and an absent key mean the same thing here; jsonb drops both.
    .filter(([, v]) => v !== undefined)
    .sort(([l], [r]) => compareKeys(l, r));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function compareKeys(l: string, r: string): number {
  if (l < r) return -1;
  return l > r ? 1 : 0;
}

/** Outcome types offered at match entry: archived ones resolve but are not selectable. */
export function selectableRulesetOutcomes(
  payload?: TournamentRulesetPayload | null,
): RulesetOutcomeType[] {
  return (payload?.outcomeTypes ?? []).filter((outcome) => !outcome.archivedAt);
}
