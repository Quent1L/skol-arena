import { z } from "zod";
import type { TeamMode, TournamentMode, TournamentStatus } from "./enums";

// ============================================
// What may still be edited, and at what cost
// ============================================

/**
 * A competition is not simply "editable" or "locked" once it leaves draft.
 *
 * Its title and its dates never weigh on a result and stay open forever. Its
 * scoring semantics can still be corrected as long as nobody has entered
 * anything. Its points scale can be corrected even later, at the price of
 * recomputing what has already been awarded. And its structure — mode, team
 * mode, discipline — is what every entered match was built on and cannot move at
 * all.
 *
 * This table is the single source of truth for that. The backend enforces it and
 * the frontend disables and explains from the same data, which is what stops the
 * two from drifting: there used to be three copies of the list and they
 * disagreed, so fields were rendered disabled that the API actually accepted.
 */
export const FIELD_EDITABILITY = [
  /** No bearing on any result. Editable at any point. */
  "always",
  /** Editable until the first result is entered, then locked with the count shown. */
  "untilMatches",
  /** Editable even with results in, but recomputes what was already awarded. */
  "recalculates",
  /** Everything entered so far was built on it. Frozen once out of draft. */
  "locked",
] as const;

export type FieldEditability = (typeof FIELD_EDITABILITY)[number];

export interface EditabilityContext {
  status: TournamentStatus;
  mode: TournamentMode;
  teamMode: TeamMode;
  /** Results already entered — reported, disputed or finalized. */
  enteredMatchCount: number;
}

interface FieldPolicy {
  tier: FieldEditability;
  /** Narrows the tier to these team modes; anything else is locked. */
  onlyTeamModes?: TeamMode[];
  /** Narrows the tier to these modes; anything else is locked. */
  onlyModes?: TournamentMode[];
}

/**
 * Keys are the fields of `updateTournamentSchema`. A field absent from this table
 * is treated as `locked`, so adding one to the schema without deciding its policy
 * fails closed rather than silently becoming editable.
 */
export const TOURNAMENT_FIELD_POLICY: Record<string, FieldPolicy> = {
  // ── Metadata: never weighs on a result ────────────────────────────────
  name: { tier: "always" },
  description: { tier: "always" },
  startDate: { tier: "always" },
  endDate: { tier: "always" },
  // Transition-validated separately; the tier only says it may appear in a PATCH.
  status: { tier: "always" },
  organizationId: { tier: "always" },
  rulesId: { tier: "always" },
  validationMode: { tier: "always" },
  validationTimerHours: { tier: "always" },
  // Fair-play / MVP votes never weigh on a result or on the MMR.
  voteConfig: { tier: "always" },

  // ── Scoring semantics: changing them invalidates entered scores ───────
  scoreEnabled: { tier: "untilMatches" },
  minScore: { tier: "untilMatches" },
  maxScore: { tier: "untilMatches" },
  allowDraw: { tier: "untilMatches" },

  // ── The points scale: rewritable, at the price of a recalculation ─────
  // `recalculatePointsInternal` already rewrites every match_sides.pointsAwarded
  // from the current config, so this is the one knob the machinery was built for.
  scoringConfig: { tier: "recalculates", onlyModes: ["championship", "bracket"] },
  // Re-cuts which matches count for the flex per-player ranking.
  championshipConfig: { tier: "recalculates", onlyModes: ["championship"] },

  // ── Team sizes: safe to widen in flex, baked into the teams in static ─
  // A flex entry is resolved per match from the player list, and the size check
  // runs at match creation, so a new range only affects future matches. In static
  // the sizes are already materialised as `teams` rows.
  minTeamSize: { tier: "always", onlyTeamModes: ["flex"] },
  maxTeamSize: { tier: "always", onlyTeamModes: ["flex"] },

  // ── Sides per match: only bounds the matches created from now on ───────
  // A stored match keeps the sides it was played with, so lowering the cap never
  // invalidates one. Brackets are generated duels and never read it.
  maxSidesPerMatch: { tier: "always", onlyModes: ["championship", "ranked"] },

  // ── Structural ───────────────────────────────────────────────────────
  mode: { tier: "locked" },
  teamMode: { tier: "locked" },
  disciplineId: { tier: "locked" },
};

/**
 * The tournament form keeps the per-mode config knobs flat and folds them into
 * `scoringConfig` / `championshipConfig` on submit (`nestTournamentConfigs`).
 * The policy is expressed on the nested names — the ones the API actually
 * receives — so a form field resolves through here first.
 */
const FLAT_FIELD_TO_POLICY: Record<string, string> = {
  pointPerVictory: "scoringConfig",
  pointPerDraw: "scoringConfig",
  pointPerLoss: "scoringConfig",
  pointsSource: "scoringConfig",
  rankPoints: "scoringConfig",
  maxMatchesPerPlayer: "championshipConfig",
  maxTimesWithSamePartner: "championshipConfig",
  maxTimesWithSameOpponent: "championshipConfig",
};

/** Policy key a field name maps to, flat form names included. */
export function policyFieldFor(field: string): string {
  return FLAT_FIELD_TO_POLICY[field] ?? field;
}

// ============================================
// Resolution
// ============================================

export function resolveFieldEditability(field: string, ctx: EditabilityContext): FieldEditability {
  // A draft has no results and no participants to surprise.
  if (ctx.status === "draft") return "always";

  const policy = TOURNAMENT_FIELD_POLICY[policyFieldFor(field)];
  if (!policy) return "locked";

  if (policy.onlyTeamModes && !policy.onlyTeamModes.includes(ctx.teamMode)) return "locked";
  if (policy.onlyModes && !policy.onlyModes.includes(ctx.mode)) return "locked";

  if (policy.tier === "untilMatches") {
    return ctx.enteredMatchCount > 0 ? "locked" : "always";
  }

  return policy.tier;
}

export interface ResolvedEditability {
  /** Fields the API will accept. */
  editable: string[];
  /** Subset of `editable` whose change triggers a recalculation — worth warning about. */
  recalculating: string[];
  /** Fields the API will refuse, so the UI can say why rather than just greying out. */
  locked: string[];
}

export function resolveEditableFields(ctx: EditabilityContext): ResolvedEditability {
  const editable: string[] = [];
  const recalculating: string[] = [];
  const locked: string[] = [];

  // Flat form names are listed alongside the nested ones so a form can filter its
  // own values against `editable` without knowing about the folding.
  const fields = [...Object.keys(TOURNAMENT_FIELD_POLICY), ...Object.keys(FLAT_FIELD_TO_POLICY)];

  for (const field of fields) {
    const tier = resolveFieldEditability(field, ctx);
    if (tier === "locked") {
      locked.push(field);
      continue;
    }
    editable.push(field);
    if (tier === "recalculates") recalculating.push(field);
  }

  return { editable, recalculating, locked };
}

/** True when the update touches something whose change has to be recomputed. */
export function updateTriggersRecalculation(fields: string[], ctx: EditabilityContext): boolean {
  return fields.some((field) => resolveFieldEditability(field, ctx) === "recalculates");
}

// ============================================
// Wire shape
// ============================================

/** Served alongside a tournament so the form can disable and explain in one pass. */
export const tournamentEditabilitySchema = z
  .object({
    editable: z.array(z.string()),
    recalculating: z.array(z.string()),
    locked: z.array(z.string()),
    enteredMatchCount: z.number().int(),
  })
  .meta({ id: "TournamentEditability" });

export type TournamentEditability = z.infer<typeof tournamentEditabilitySchema>;
