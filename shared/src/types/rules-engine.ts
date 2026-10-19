import { z } from "zod";

// ============================================
// Rules engine — contextual messages & badges
// ============================================

export type RuleType = "message" | "badge";
export type RuleScope = "global" | "discipline";

/**
 * Shape version of a rule's `conditions` / `action`. Rules are data living in our
 * own database, so the engine never interprets more than one shape: rows below this
 * version are rewritten forward by the patch chain
 * (`backend/src/services/rules-migration.service.ts`) at startup, and imported rules
 * go through the very same chain.
 *
 * Bump it in the same commit as the patch that handles the change.
 *
 * - 1: initial shape
 * - 2: `winnerId` / `loserId` (first player of a side) replaced by the full line-ups
 *      `winnerIds` / `loserIds`
 * - 3: badge actions carry a `recurrence`; rules written before it are seasonal
 */
export const RULES_ENGINE_VERSION = 3;

/**
 * Application trigger events. Open for extension, but only
 * `match_submitted` is supported in v1.
 */
export const TRIGGER_EVENTS = ["match_submitted"] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

// ============================================
// Evaluation context per event (the "facts")
// ============================================

/**
 * Context provided for the `match_submitted` event. The engine is called
 * once per player involved (winner then loser).
 */
export interface MatchSubmittedContext {
  // Evaluated player and his match line-up
  playerId: string;
  teammateIds: string[];
  opponentIds: string[];

  // Match result (from the evaluated player's point of view)
  /** Full line-up of each side. Empty on a draw. */
  winnerIds: string[];
  loserIds: string[];
  /** Whether the evaluated player is on the winning side. */
  isWinner: boolean;
  scoreWinner: number;
  scoreLoser: number;
  matchScore: string;

  // Declared outcome, from the discipline's outcome catalog. Empty/false when the
  // match was submitted without one.
  outcomeType: string; // outcome_types.id
  outcomeTypeName: string; // outcome_types.name
  isDefaultOutcome: boolean; // outcome_types.is_default
  outcomeReason: string; // outcome_reasons.id
  outcomeReasonName: string; // outcome_reasons.name

  // MMR delta (Ranked mode)
  mmrDelta: number;
  newMmr: number;
  previousMmr: number;

  // Rank (Ranked mode)
  newRank: string;
  previousRank: string;
  rankChanged: boolean;
  rankUp: boolean;
  rankDown: boolean;

  // Streaks
  winStreak: number;
  lossStreak: number;

  // Player context
  isPlacementMatch: boolean;
  matchCountThisSeason: number;

  // Opponent context
  opponentRank: string;

  // Match date / time (Europe/Paris timezone)
  matchHour: number; // 0-23
  matchMinuteOfDay: number; // 0-1439 (minute of the day, minute precision)
  matchDayOfWeek: number; // 1=Monday … 7=Sunday
  matchDate: string; // 'YYYY-MM-DD'

  // Global context
  discipline: string;
  site: string;
}

// ============================================
// Fact catalog (used by the admin UI + backend validation)
// ============================================

export type FactType = "number" | "boolean" | "string" | "stringList" | "date";

export interface FactDefinition {
  key: string;
  label: string;
  type: FactType;
  sample: number | boolean | string | string[];
  /** Special reference: render a dedicated picker instead of a raw input. */
  ref?: "player" | "time" | "discipline" | "site" | "weekday" | "outcomeType" | "outcomeReason";
}

export const MATCH_SUBMITTED_FACTS: FactDefinition[] = [
  { key: "playerId", label: "Joueur concerné", type: "string", sample: "", ref: "player" },
  { key: "teammateIds", label: "Coéquipiers", type: "stringList", sample: [], ref: "player" },
  { key: "opponentIds", label: "Adversaires", type: "stringList", sample: [], ref: "player" },
  { key: "winnerIds", label: "Camp vainqueur", type: "stringList", sample: [], ref: "player" },
  { key: "loserIds", label: "Camp perdant", type: "stringList", sample: [], ref: "player" },
  { key: "isWinner", label: "Le joueur est vainqueur", type: "boolean", sample: true },
  { key: "scoreWinner", label: "Score du vainqueur", type: "number", sample: 2 },
  { key: "scoreLoser", label: "Score du perdant", type: "number", sample: 1 },
  { key: "matchScore", label: "Score du match", type: "string", sample: "2-1" },
  // Wording follows the rest of the app ("Type de résultat" / "Raison du résultat",
  // cf. the match entry screen and the discipline settings), not the DB naming.
  { key: "outcomeType", label: "Type de résultat", type: "string", sample: "", ref: "outcomeType" },
  { key: "outcomeTypeName", label: "Nom du type de résultat", type: "string", sample: "Forfait" },
  { key: "isDefaultOutcome", label: "Résultat par défaut", type: "boolean", sample: true },
  { key: "outcomeReason", label: "Raison du résultat", type: "string", sample: "", ref: "outcomeReason" },
  { key: "outcomeReasonName", label: "Nom de la raison du résultat", type: "string", sample: "Blessure" },
  { key: "mmrDelta", label: "Variation de MMR", type: "number", sample: 18 },
  { key: "newMmr", label: "Nouveau MMR", type: "number", sample: 1218 },
  { key: "previousMmr", label: "MMR précédent", type: "number", sample: 1200 },
  { key: "newRank", label: "Nouveau rang", type: "string", sample: "gold" },
  { key: "previousRank", label: "Rang précédent", type: "string", sample: "silver" },
  { key: "rankChanged", label: "Rang modifié", type: "boolean", sample: true },
  { key: "rankUp", label: "Montée de rang", type: "boolean", sample: true },
  { key: "rankDown", label: "Descente de rang", type: "boolean", sample: false },
  { key: "winStreak", label: "Série de victoires", type: "number", sample: 3 },
  { key: "lossStreak", label: "Série de défaites", type: "number", sample: 0 },
  { key: "isPlacementMatch", label: "Match de placement", type: "boolean", sample: false },
  { key: "matchCountThisSeason", label: "Matchs cette saison", type: "number", sample: 12 },
  { key: "opponentRank", label: "Rang de l'adversaire", type: "string", sample: "gold" },
  { key: "matchHour", label: "Heure du match (0-23)", type: "number", sample: 21 },
  { key: "matchMinuteOfDay", label: "Horaire du match (précis)", type: "number", sample: 1290, ref: "time" },
  { key: "matchDayOfWeek", label: "Jour de la semaine", type: "number", sample: 6, ref: "weekday" },
  { key: "matchDate", label: "Date du match (AAAA-MM-JJ)", type: "date", sample: "2026-06-12" },
  { key: "discipline", label: "Discipline", type: "string", sample: "", ref: "discipline" },
  { key: "site", label: "Organisation", type: "string", sample: "", ref: "site" },
  { key: "randomRoll", label: "Tirage aléatoire (0-99)", type: "number", sample: 50 },
];

/**
 * Facts that are re-drawn at every evaluation. Forbidden on badge rules: the
 * nightly reconciliation replays past matches and must stay deterministic.
 */
export const NON_DETERMINISTIC_FACTS = ["randomRoll"] as const;

export const EVENT_FACT_CATALOG: Record<TriggerEvent, FactDefinition[]> = {
  match_submitted: MATCH_SUBMITTED_FACTS,
};

/**
 * json-rules-engine operators allowed per fact type. Drives the builder's dropdowns
 * AND the backend validation — a pair the catalog does not allow is rejected on save,
 * so a rule can never be stored in a shape the engine silently evaluates to false.
 *
 * `contains` / `doesNotContain` on a string mean substring; on a list, membership.
 * Both rely on the custom operators registered in `backend/src/services/rules-operators.ts`.
 */
export const OPERATORS_BY_TYPE: Record<FactType, string[]> = {
  number: ["greaterThan", "greaterThanInclusive", "lessThan", "lessThanInclusive", "equal", "notEqual", "in", "notIn"],
  boolean: ["equal", "notEqual"],
  string: ["equal", "notEqual", "in", "notIn", "contains", "doesNotContain"],
  stringList: ["contains", "doesNotContain", "containsAll", "containsAny", "containsNone", "containsExactly"],
  date: ["equal", "notEqual", "greaterThan", "greaterThanInclusive", "lessThan", "lessThanInclusive"],
};

/**
 * Operators whose `value` is a list rather than a scalar. The builder renders a
 * multi-value picker for these, and nothing else.
 */
export const LIST_VALUE_OPERATORS = [
  "in",
  "notIn",
  "containsAll",
  "containsAny",
  "containsNone",
  "containsExactly",
] as const;

// ============================================
// Actions
// ============================================

export interface MessageAction {
  type: "message";
  variants: string[];
}

/**
 * How often a badge can be won.
 *
 * `per_season` — the default — makes the badge a season trophy: it is awarded once
 * per ranked season, so a player can hold several copies of it, one per season.
 * `once` keeps it a lifetime trophy, awarded on the first match that matches and
 * never again.
 */
export const BADGE_RECURRENCES = ["per_season", "once"] as const;
export type BadgeRecurrence = (typeof BADGE_RECURRENCES)[number];

export interface BadgeAction {
  type: "badge";
  icon: string;
  label: string;
  description: string;
  recurrence: BadgeRecurrence;
}

export type RuleAction = MessageAction | BadgeAction;

// ============================================
// Conditions (serialized json-rules-engine tree)
// ============================================

export interface ConditionLeaf {
  fact: string;
  operator: string;
  value: unknown;
}

export interface ConditionGroupAll {
  all: RuleConditions[];
}

export interface ConditionGroupAny {
  any: RuleConditions[];
}

export type RuleConditions = ConditionGroupAll | ConditionGroupAny | ConditionLeaf;

// ============================================
// Rule
// ============================================

// Declared after the condition and action schemas it references — see the "Zod
// schemas" section below. Kept as an explicit type annotation because the condition
// tree is recursive and cannot be inferred.
export const ruleSchema: z.ZodType<Rule> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      triggerEvent: z.enum(TRIGGER_EVENTS),
      type: z.enum(["message", "badge"]),
      scope: z.enum(["global", "discipline"]),
      disciplineId: z.string().nullable(),
      priority: z.number().int(),
      name: z.string(),
      description: z.string().nullable(),
      conditions: ruleConditionsSchema,
      action: ruleActionSchema,
      isActive: z.boolean(),
      engineVersion: z.number().int(),
      disabledReason: z.string().nullable(),
      createdBy: z.string(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    })
    .meta({ id: "Rule" })
);

export const ruleListSchema = z.array(ruleSchema);

export interface Rule {
  id: string;
  triggerEvent: TriggerEvent;
  type: RuleType;
  scope: RuleScope;
  disciplineId: string | null;
  priority: number;
  name: string;
  description: string | null;
  conditions: RuleConditions;
  action: RuleAction;
  isActive: boolean;
  /** Engine version the conditions/action are expressed in. Server-assigned. */
  engineVersion: number;
  /**
   * Why the startup patch chain deactivated this rule, when it could not rewrite it.
   * Null otherwise. Cleared as soon as an admin saves the rule.
   */
  disabledReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientRule extends Omit<Rule, "createdAt" | "updatedAt"> {
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Sortie du moteur
// ============================================

/** Declared from rulesOutputBadgeSchema further down, in the Zod schemas section. */
export type RulesOutputBadge = z.infer<typeof rulesOutputBadgeSchema>;

/** Result of the rules evaluation for a player (internal backend). */
export interface PlayerRulesOutput {
  message?: string;
  /**
   * The `rule_firings` row that recorded the winning message, so whoever attaches
   * the message to an animation event can report back that it was delivered.
   * Absent when the firing could not be persisted.
   */
  messageFiringId?: string;
  /** All badges newly awarded during this evaluation. */
  badges?: (RulesOutputBadge & { badgeId: string })[];
}

// ============================================
// Rule firings — per-trigger statistics
// ============================================

/**
 * What the engine did with a rule whose conditions evaluated true.
 * `superseded` is the message rule that lost the single-winner draw; `already_held`
 * the badge rule that matched for a player who already carries the badge.
 */
export const RULE_FIRING_RESULTS = ["selected", "superseded", "awarded", "already_held"] as const;
export type RuleFiringResult = (typeof RULE_FIRING_RESULTS)[number];

/**
 * Where the player was standing when the message reached them.
 *
 * `reveal_skipped` counts as seen — skipping the animation leaves the message on
 * screen at the end. `recap` does not: the grouped MMR recap renders no message,
 * so a firing read there was provably never read.
 */
export const RULE_FIRING_SURFACES = ["reveal", "reveal_skipped", "recap"] as const;
export type RuleFiringSurface = (typeof RULE_FIRING_SURFACES)[number];

export const ruleFiringSurfaceSchema = z.enum(RULE_FIRING_SURFACES);

// ============================================
// Badge animation (parity with mmr_animation)
// ============================================

export interface BadgeAnimationResponse {
  id: string; // player_badges.id
  matchId: string | null;
  seasonId: string;
  icon: string;
  label: string;
  description: string;
  createdAt: string;
}

export interface BadgeAnimationWsPayload extends BadgeAnimationResponse {
  tournamentId: string;
}

// ============================================
// Zod schemas
// ============================================

const conditionLeafSchema: z.ZodType<ConditionLeaf> = z.object({
  fact: z.string().min(1),
  operator: z.string().min(1),
  value: z.unknown(),
});

export const ruleConditionsSchema: z.ZodType<RuleConditions> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ruleConditionsSchema) }),
    z.object({ any: z.array(ruleConditionsSchema) }),
    conditionLeafSchema,
  ]),
);

export const messageActionSchema = z.object({
  type: z.literal("message"),
  variants: z
    .array(z.string().min(1, "La variante ne peut pas être vide"))
    .min(1, "Au moins une variante est requise")
    .max(10, "10 variantes maximum"),
});

export const badgeActionSchema = z.object({
  type: z.literal("badge"),
  icon: z.string().min(1, "L'icône est requise"),
  label: z.string().min(1, "Le label est requis").max(60),
  description: z.string().min(1, "La description est requise").max(200),
  // Defaulted rather than required: a rule authored before v3 carries no
  // recurrence, and the v2 → v3 patch is what stamps the stored rows.
  recurrence: z.enum(BADGE_RECURRENCES).default("per_season"),
});

export const ruleActionSchema = z.discriminatedUnion("type", [messageActionSchema, badgeActionSchema]);

export const createRuleSchema = z.object({
  triggerEvent: z.enum(TRIGGER_EVENTS),
  type: z.enum(["message", "badge"]),
  scope: z.enum(["global", "discipline"]),
  disciplineId: z.string().uuid().nullable().optional(),
  priority: z.number().int().default(0),
  name: z.string().min(2, "Le nom est requis").max(120),
  description: z.string().max(500).nullable().optional(),
  conditions: ruleConditionsSchema,
  action: ruleActionSchema,
  isActive: z.boolean().default(true),
});

export const updateRuleSchema = createRuleSchema.partial();

/**
 * Rule simulator schema (admin editor "Test" button).
 */
export const testRuleSchema = z.object({
  triggerEvent: z.enum(TRIGGER_EVENTS),
  conditions: ruleConditionsSchema,
  action: ruleActionSchema,
  context: z.record(z.string(), z.unknown()),
});

// ============================================
// Player badges
// ============================================

/**
 * One award, not one badge: a seasonal badge won three times is three entries
 * sharing a `ruleId`. Grouping them into a single tile with a count is the
 * client's job — see `PlayerBadges.vue`.
 */
export const playerBadgeSchema = z
  .object({
    id: z.string(),
    playerId: z.string(),
    ruleId: z.string(),
    icon: z.string(),
    label: z.string(),
    description: z.string(),
    recurrence: z.enum(BADGE_RECURRENCES),
    awardedAt: z.iso.datetime(),
    matchId: z.string().nullable(),
    /** Null on awards whose season could no longer be resolved (deleted match). */
    seasonId: z.string().nullable(),
    seasonName: z.string().nullable(),
  })
  .meta({ id: "PlayerBadge" });

export type PlayerBadge = z.infer<typeof playerBadgeSchema>;

/**
 * Same badge after the frontend interceptor has revived `awardedAt`. Used wherever
 * a payload is described from the client's point of view — the rewind, notably.
 */
export const clientPlayerBadgeSchema = playerBadgeSchema
  .extend({ awardedAt: z.date() })
  .meta({ id: "ClientPlayerBadge" });

export type ClientPlayerBadge = z.infer<typeof clientPlayerBadgeSchema>;

/** A player holding a badge, across every season the viewer can see. */
export const badgeHolderSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    /** Number of awards: one per season for a seasonal badge. */
    count: z.number().int(),
    /** Awarded in the tournament being viewed. */
    earnedHere: z.boolean(),
  })
  .meta({ id: "BadgeHolder" });

export type BadgeHolder = z.infer<typeof badgeHolderSchema>;

/** A badge a player can earn in a tournament (global or discipline-scoped rule). */
export const availableBadgeSchema = z
  .object({
    ruleId: z.string(),
    icon: z.string(),
    label: z.string(),
    description: z.string(),
    recurrence: z.enum(BADGE_RECURRENCES),
    scope: z.enum(["global", "discipline"]),
    /** Only with `withHolders`: this tournament's holders first, then by award count. */
    holders: z.array(badgeHolderSchema).optional(),
  })
  .meta({ id: "AvailableBadge" });

export type AvailableBadge = z.infer<typeof availableBadgeSchema>;

export const availableBadgesQuerySchema = z.object({
  withHolders: z.stringbool().optional(),
});

// ============================================
// Inferred types
// ============================================

export type CreateRuleData = z.infer<typeof createRuleSchema>;
export type UpdateRuleData = z.infer<typeof updateRuleSchema>;
export type TestRuleData = z.infer<typeof testRuleSchema>;

export const rulesOutputBadgeSchema = z
  .object({
    ruleId: z.string(),
    icon: z.string(),
    label: z.string(),
    description: z.string(),
  })
  .meta({ id: "RulesOutputBadge" });

export const testRuleResultSchema = z
  .object({
    matched: z.boolean(),
    output: z
      .union([
        z.object({ type: z.literal("message"), message: z.string() }),
        z.object({ type: z.literal("badge"), badge: rulesOutputBadgeSchema }),
      ])
      .optional(),
  })
  .meta({ id: "TestRuleResult" });

export type TestRuleResult = z.infer<typeof testRuleResultSchema>;

/** Fact the rule editor offers, with the operators that apply to its type. */
export const factCatalogSchema = z
  .object({
    facts: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["number", "boolean", "string", "stringList", "date"]),
        sample: z.union([z.number(), z.boolean(), z.string(), z.array(z.string())]),
        ref: z.enum(["player", "time", "discipline", "site", "weekday", "outcomeType", "outcomeReason"]).optional(),
        operators: z.array(z.string()),
      })
    ),
  })
  .meta({ id: "FactCatalog" });

export const badgeReconciliationStateSchema = z
  .object({
    dirty: z.boolean(),
    lastRunAt: z.date().nullable(),
  })
  .meta({ id: "BadgeReconciliationState" });

// ============================================
// Rule firing statistics (admin)
// ============================================

/**
 * Counters for one rule, all derived from `rule_firings` by query.
 *
 * `neverDelivered` is the honest count of firings the player could not have seen:
 * a message beaten on priority, or one dropped because no animation event carried
 * it. `recap` is the count that was delivered but provably not read.
 */
export const ruleFiringTotalsSchema = z
  .object({
    fired: z.number().int(),
    distinctPlayers: z.number().int(),
    selected: z.number().int(),
    superseded: z.number().int(),
    awarded: z.number().int(),
    delivered: z.number().int(),
    neverDelivered: z.number().int(),
    seen: z.number().int(),
    recap: z.number().int(),
    lastFiredAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "RuleFiringTotals" });

export type RuleFiringTotals = z.infer<typeof ruleFiringTotalsSchema>;

/** One row per rule, including rules that have never fired (all counters at zero). */
export const ruleFiringStatsRowSchema = ruleFiringTotalsSchema
  .extend({
    ruleId: z.string(),
    name: z.string(),
    type: z.enum(["message", "badge"]),
    isActive: z.boolean(),
  })
  .meta({ id: "RuleFiringStatsRow" });

export type RuleFiringStatsRow = z.infer<typeof ruleFiringStatsRowSchema>;

export const ruleFiringStatsListSchema = z
  .object({ rules: z.array(ruleFiringStatsRowSchema) })
  .meta({ id: "RuleFiringStatsList" });

/**
 * One line per distinct wording a rule has sent out, grouped on the template that
 * was frozen at firing time rather than on its position in the rule's array.
 *
 * Editing a variant therefore yields two lines — the retired wording keeps its
 * history, the new one starts its own count — instead of silently merging them.
 */
export const ruleVariantStatSchema = z
  .object({
    /** The variant's template. Null on firings recorded before it was captured. */
    text: z.string().nullable(),
    /** Whether the rule still carries this exact wording, and at which position. */
    current: z.boolean(),
    position: z.number().int().nullable(),
    fired: z.number().int(),
    seen: z.number().int(),
  })
  .meta({ id: "RuleVariantStat" });

export const ruleFiringDayStatSchema = z
  .object({
    day: z.string(),
    fired: z.number().int(),
    seen: z.number().int(),
    recap: z.number().int(),
  })
  .meta({ id: "RuleFiringDayStat" });

export const ruleFiringRecipientSchema = z
  .object({
    id: z.string(),
    playerId: z.string(),
    playerName: z.string(),
    matchId: z.string().nullable(),
    result: z.enum(RULE_FIRING_RESULTS),
    message: z.string().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    seenAt: z.iso.datetime().nullable(),
    seenSurface: ruleFiringSurfaceSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "RuleFiringRecipient" });

export const ruleFiringDetailSchema = z
  .object({
    ruleId: z.string(),
    totals: ruleFiringTotalsSchema,
    variants: z.array(ruleVariantStatSchema),
    timeline: z.array(ruleFiringDayStatSchema),
    recipients: z.array(ruleFiringRecipientSchema),
  })
  .meta({ id: "RuleFiringDetail" });

export type RuleFiringDetail = z.infer<typeof ruleFiringDetailSchema>;
export type RuleFiringRecipient = z.infer<typeof ruleFiringRecipientSchema>;
export type RuleVariantStat = z.infer<typeof ruleVariantStatSchema>;
export type RuleFiringDayStat = z.infer<typeof ruleFiringDayStatSchema>;

/** Same payloads after the frontend interceptor has revived the dates. */
export interface ClientRuleFiringRecipient extends Omit<RuleFiringRecipient, "deliveredAt" | "seenAt" | "createdAt"> {
  deliveredAt: Date | null;
  seenAt: Date | null;
  createdAt: Date;
}

export interface ClientRuleFiringStatsRow extends Omit<RuleFiringStatsRow, "lastFiredAt"> {
  lastFiredAt: Date | null;
}

export interface ClientRuleFiringDetail extends Omit<RuleFiringDetail, "totals" | "recipients"> {
  totals: Omit<RuleFiringTotals, "lastFiredAt"> & { lastFiredAt: Date | null };
  recipients: ClientRuleFiringRecipient[];
}

// ============================================
// Global firing overview + feed (all rules at once)
// ============================================

/** A day of the global timeline, split by the kind of rule that fired. */
export const ruleFiringGlobalDayStatSchema = ruleFiringDayStatSchema
  .extend({
    messages: z.number().int(),
    // Badges actually awarded: a match on a badge the player already holds is left out.
    badges: z.number().int(),
  })
  .meta({ id: "RuleFiringGlobalDayStat" });

export type RuleFiringGlobalDayStat = z.infer<typeof ruleFiringGlobalDayStatSchema>;

/**
 * Everything the global stats screen shows above the feed. `totals` covers all time,
 * `windowTotals` the trailing `days` the timeline spans; `rules` is the per-rule
 * breakdown, rules that never fired included.
 */
export const ruleFiringOverviewSchema = z
  .object({
    days: z.number().int(),
    totals: ruleFiringTotalsSchema,
    windowTotals: ruleFiringTotalsSchema,
    timeline: z.array(ruleFiringGlobalDayStatSchema),
    rules: z.array(ruleFiringStatsRowSchema),
  })
  .meta({ id: "RuleFiringOverview" });

export type RuleFiringOverview = z.infer<typeof ruleFiringOverviewSchema>;

export const ruleFiringFeedItemSchema = ruleFiringRecipientSchema
  .extend({
    ruleId: z.string(),
    ruleName: z.string(),
    /** The rule's type when it fired, not today's. */
    ruleType: z.enum(["message", "badge"]),
  })
  .meta({ id: "RuleFiringFeedItem" });

export type RuleFiringFeedItem = z.infer<typeof ruleFiringFeedItemSchema>;

export const ruleFiringFeedSchema = z
  .object({
    items: z.array(ruleFiringFeedItemSchema),
    /** Opaque keyset cursor for the next page, null on the last one. */
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "RuleFiringFeed" });

export type RuleFiringFeed = z.infer<typeof ruleFiringFeedSchema>;

export const ruleFiringFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  type: z.enum(["message", "badge"]).optional(),
  ruleId: z.uuid().optional(),
  result: z.enum(RULE_FIRING_RESULTS).optional(),
  // A badge rule matching a player who already holds the badge is noise, hidden
  // unless asked for. An explicit `result` filter takes precedence.
  includeHeld: z.stringbool().optional(),
});

export type RuleFiringFeedQuery = z.infer<typeof ruleFiringFeedQuerySchema>;

type ClientRuleFiringTotals = Omit<RuleFiringTotals, "lastFiredAt"> & { lastFiredAt: Date | null };

export interface ClientRuleFiringOverview
  extends Omit<RuleFiringOverview, "totals" | "windowTotals" | "rules" | "timeline"> {
  /** `day` is revived into a local-midnight Date by the frontend interceptor. */
  timeline: (Omit<RuleFiringGlobalDayStat, "day"> & { day: Date })[];
  totals: ClientRuleFiringTotals;
  windowTotals: ClientRuleFiringTotals;
  rules: ClientRuleFiringStatsRow[];
}

export interface ClientRuleFiringFeedItem extends Omit<RuleFiringFeedItem, "deliveredAt" | "seenAt" | "createdAt"> {
  deliveredAt: Date | null;
  seenAt: Date | null;
  createdAt: Date;
}

export interface ClientRuleFiringFeed {
  items: ClientRuleFiringFeedItem[];
  nextCursor: string | null;
}
