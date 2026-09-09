import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  bigint,
  pgEnum,
  date,
  unique,
  primaryKey,
  jsonb,
  varchar,
  real,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type {
  TierScalingMode,
  TournamentRulesetPayload,
} from "@skol-arena/shared/types/index";
import { newId } from "../utils/uuid";

// ********************************************************************
// [Start] Database schema for Better Auth with Drizzle ORM and PostgreSQL
// ***************************************************************
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Backs `rateLimit: { storage: "database" }` in config/auth.ts, and the middleware
 * that limits the public business endpoints — one mechanism for both.
 *
 * The export name has to stay `rateLimit`: Better Auth resolves its models by key
 * in the schema object it is handed, so renaming this silently disables limiting.
 * `lastRequest` is epoch milliseconds, which is what Better Auth writes and reads.
 */
export const rateLimit = pgTable("rateLimit", {
  // Better Auth's Drizzle adapter puts an `id` into every row it creates and
  // refuses a model that has no such column, so the natural key cannot be the
  // primary key here — it is a unique column instead, which is what both the
  // adapter's lookups and our own upsert address the row by.
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ********************************************************************
// [End] Database schema for Better Auth with Drizzle ORM and PostgreSQL
// ***************************************************************

// ********************************************************************
// [Start] Invitation codes for account registration
// ***************************************************************

export const invitationCodes = pgTable("invitation_codes", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  code: text("code").unique().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => appUsers.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
});

export const invitationUsages = pgTable("invitation_usages", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  codeId: uuid("code_id")
    .notNull()
    .references(() => invitationCodes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  usedAt: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
  email: text("email").notNull(),
  ipAddress: text("ip_address"),
});

// ********************************************************************
// [End] Invitation codes
// ***************************************************************

// ********************************************************************
// [Start] Skol application tables
// ***************************************************************

// Enums
export const userRoleEnum = pgEnum("user_role", [
  "player",
  "tournament_admin",
  "super_admin",
  "kiosk",
]);

export const tournamentModeEnum = pgEnum("tournament_mode", [
  "championship",
  "bracket",
  "ranked",
]);

export const teamModeEnum = pgEnum("team_mode", ["static", "flex"]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "draft",
  "open",
  "ongoing",
  "finished",
]);

export const tournamentAdminRoleEnum = pgEnum("tournament_admin_role", [
  "owner",
  "co_admin",
]);

/**
 * `pending_confirmation` and `confirmed` are deprecated: no code path writes them
 * since the score counter-proposal was removed. The values stay in the enum because
 * PostgreSQL cannot drop an enum member without recreating the type.
 */
export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "reported",
  "pending_confirmation",
  "confirmed",
  "disputed",
  "cancelled",
  "finalized",
]);

export const matchFinalizationReasonEnum = pgEnum("match_finalization_reason", [
  "consensus",
  "auto_validation",
  "admin_override",
  "trust_score",
]);

export const validationModeEnum = pgEnum("validation_mode", ["auto", "strict", "admin", "none"]);

export const teamInteractionModeEnum = pgEnum("team_interaction_mode", ["INDIVIDUAL", "SHARED_RESOURCE", "COLLABORATIVE"]);

export const matchTeamSideEnum = pgEnum("match_team_side", ["A", "B"]);

export const ruleTypeEnum = pgEnum("rule_type", ["message", "badge"]);

export const ruleScopeEnum = pgEnum("rule_scope", ["global", "discipline"]);

/**
 * What the engine did with a rule whose conditions evaluated true.
 * `superseded` is the message rule that matched but lost the single-winner draw,
 * `already_held` the badge rule that matched for a player who already carries it.
 */
export const ruleFiringResultEnum = pgEnum("rule_firing_result", [
  "selected",
  "superseded",
  "awarded",
  "already_held",
]);

/**
 * Where the player was standing when the message finally reached their eyes.
 * `reveal_skipped` still counts as seen — skipping the animation leaves the
 * message on screen — while `recap` does not: MmrRecapCard never renders it.
 */
export const ruleFiringSurfaceEnum = pgEnum("rule_firing_surface", [
  "reveal",
  "reveal_skipped",
  "recap",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "MATCH_CREATED",
  "MATCH_VALIDATION",
  // Deprecated: the score counter-proposal flow was removed.
  "MATCH_SCORE_PROPOSAL",
  "MATCH_POST_DISPUTE",
  "MATCH_DISPUTE_ESCALATED",
  "MATCH_MESSAGE",
  "BADGE_AWARDED",
  "BADGE_REVOKED",
]);

export const matchMessageKindEnum = pgEnum("match_message_kind", [
  "user",
  "system",
]);

export const deviceTypeEnum = pgEnum("device_type", ["WEB", "ANDROID", "IOS"]);

export const entryTypeEnum = pgEnum("entry_type", ["PLAYER", "TEAM"]);

export const participantStatusEnum = pgEnum("participant_status", [
  "active",
  "withdrawn",
  "removed",
]);

export const bracketTypeEnum = pgEnum("bracket_type", [
  "single_elimination",
  "double_elimination",
]);

export const seedingTypeEnum = pgEnum("seeding_type", [
  "random",
  "championship_based",
]);

export const bracketRoundTypeEnum = pgEnum("bracket_round_type", [
  "winners",
  "losers",
  "bronze",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  name: text("name").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => appUsers.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.organizationId, t.userId)],
);

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    // Nullable on purpose: archiving deletes the Better Auth identity (login,
    // sessions, linked SSO accounts) while this row survives, because 15 tables
    // of tournament history cascade from it.
    externalId: text("external_id")
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    shortName: text("short_name").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    // Bootstrap admin waiting for its first login: while true, the startup routine
    // regenerates and re-logs its password on every restart.
    bootstrapPending: boolean("bootstrap_pending").notNull().default(false),
    trustScoreCount: integer("trust_score_count").notNull().default(0),
    // Refreshed by the Better Auth session-create hook, so it survives session expiry.
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // Reversible: the account still exists, it simply cannot sign in.
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedBy: uuid("deactivated_by").references((): AnyPgColumn => appUsers.id, {
      onDelete: "set null",
    }),
    // Terminal: the Better Auth identity is gone and the name is anonymised.
    // Kept as a row so matches, standings and MMR history stay intact.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references((): AnyPgColumn => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("app_users_deactivated_at_idx").on(t.deactivatedAt),
    index("app_users_archived_at_idx").on(t.archivedAt),
  ],
);

export const gameRules = pgTable("game_rules", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => appUsers.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  name: text("name").notNull().unique(),
  description: text("description"),
  mode: tournamentModeEnum("mode").notNull(),
  teamMode: teamModeEnum("team_mode").notNull(),
  minTeamSize: integer("min_team_size").notNull(),
  maxTeamSize: integer("max_team_size").notNull(),
  allowDraw: boolean("allow_draw").default(true),
  scoreEnabled: boolean("score_enabled").notNull().default(true),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: tournamentStatusEnum("status").notNull().default("draft"),
  disciplineId: uuid("discipline_id").references(() => disciplines.id, {
    onDelete: "set null",
  }),
  rulesId: uuid("rules_id").references(() => gameRules.id, {
    onDelete: "set null",
  }),
  minScore: integer("min_score"),
  maxScore: integer("max_score"),
  validationMode: validationModeEnum("validation_mode").notNull().default("strict"),
  validationTimerHours: integer("validation_timer_hours"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => appUsers.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
});

/**
 * Points awarded per result. Applies to every point-scored mode — championship
 * and bracket — but not to ranked, which runs on MMR and has no row here.
 */
export const tournamentScoringConfigs = pgTable("tournament_scoring_configs", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  tournamentId: uuid("tournament_id")
    .notNull()
    .unique()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  pointPerVictory: integer("point_per_victory").notNull().default(3),
  pointPerDraw: integer("point_per_draw").notNull().default(1),
  pointPerLoss: integer("point_per_loss").notNull().default(0),
});

/**
 * Pairing caps of a championship. Only user-created matches go through them, so
 * only championships carry a row: brackets generate their matches and ranked
 * seasons never validate against caps.
 *
 * `maxMatchesPerPlayer` has a second effect in flex mode: past that count a
 * player's matches stop counting for the ranking (match_player_points).
 */
export const championshipConfigs = pgTable("championship_configs", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  tournamentId: uuid("tournament_id")
    .notNull()
    .unique()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  maxMatchesPerPlayer: integer("max_matches_per_player").notNull().default(10),
  maxTimesWithSamePartner: integer("max_times_with_same_partner")
    .notNull()
    .default(2),
  maxTimesWithSameOpponent: integer("max_times_with_same_opponent")
    .notNull()
    .default(2),
});

/**
 * Discipline settings frozen as they stood when the competition opened.
 *
 * Every calculation and every screen reads this rather than the live
 * `disciplines` / `outcome_types` rows, so editing a discipline no longer
 * rewrites the MMR or the standings tiebreakers of a competition that has
 * already been played. While the tournament is still a draft the snapshot
 * tracks the discipline (no match can exist yet); past that only an explicit
 * propagation moves it, and that propagation always recalculates.
 *
 * A ranked season is a `tournaments` row, so seasons are covered by the same table.
 */
export const tournamentRulesets = pgTable(
  "tournament_rulesets",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    tournamentId: uuid("tournament_id")
      .notNull()
      .unique()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<TournamentRulesetPayload>().notNull(),
    version: integer("version").notNull().default(1),
    appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
    // Job-state marker, not cache: set when a propagation queues a recalculation,
    // cleared when it lands.
    recalcPendingAt: timestamp("recalc_pending_at", { withTimezone: true }),
  },
  (t) => [index("tournament_rulesets_recalc_pending_at_idx").on(t.recalcPendingAt)],
);

export const tournamentAdmins = pgTable(
  "tournament_admins",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: tournamentAdminRoleEnum("role").notNull().default("co_admin"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tournamentId, table.userId)],
);

// ********************************************************************
// Tournament Participants - User registration/enrollment in tournaments
// Tracks who CAN play (vs tournamentEntries which tracks who DID play)
// ***************************************************************

export const tournamentParticipants = pgTable(
  "tournament_participants",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    status: participantStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tournamentId, table.userId)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => appUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tournamentId, table.name)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.teamId, table.userId)],
);

// ********************************************************************
// [Start] New generic entry-based tables (replaces tournamentParticipants)
// ***************************************************************

export const tournamentEntries = pgTable("tournament_entries", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  entryType: entryTypeEnum("entry_type").notNull(),
  teamId: uuid("team_id").references(() => teams.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentEntryPlayers = pgTable(
  "tournament_entry_players",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => tournamentEntries.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique().on(table.entryId, table.playerId),
    index("idx_tep_player_id").on(table.playerId),
  ],
);

// ********************************************************************
// [End] New generic entry-based tables
// ***************************************************************

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    confirmationDeadline: timestamp("confirmation_deadline", { withTimezone: true }),
    // "restrict", not "set null": a match that lost its outcome fell back to a
    // hardcoded points: 3 / mmrMultiplier: 1 / "Défaut", which silently rewrote
    // standings tiebreakers and MMR for competitions that were already over.
    // Archive the outcome type instead of deleting it.
    outcomeTypeId: uuid("outcome_type_id").references(() => outcomeTypes.id, {
      onDelete: "restrict",
    }),
    outcomeReasonId: uuid("outcome_reason_id").references(
      () => outcomeReasons.id,
      {
        onDelete: "restrict",
      },
    ),
    winnerSide: varchar("winner_side", { length: 1 }),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_matches_tournament_status_played_at").on(table.tournamentId, table.status, table.playedAt),
  ],
);

// ********************************************************************
// [Start] New match sides and results tables
// ***************************************************************

export const matchSides = pgTable(
  "match_sides",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => tournamentEntries.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    score: integer("score"),
    pointsAwarded: integer("points_awarded").default(0),
  },
  (table) => [unique().on(table.matchId, table.entryId)],
);

export const matchResults = pgTable("match_results", {
  matchId: uuid("match_id")
    .primaryKey()
    .references(() => matches.id, { onDelete: "cascade" }),
  reportedBy: uuid("reported_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  reportProof: text("report_proof"),
  finalizedBy: uuid("finalized_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizationReason: matchFinalizationReasonEnum("finalization_reason"),
});

export const matchPlayerPoints = pgTable(
  "match_player_points",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    pointsAwarded: integer("points_awarded").notNull(),
    countsForRanking: boolean("counts_for_ranking").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);

// ********************************************************************
// [End] New match sides and results tables
// ***************************************************************

export const matchConfirmations = pgTable(
  "match_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    isContested: boolean("is_contested").notNull().default(false),
    contestationReason: text("contestation_reason"),
    sidePosition: integer("side_position"),
    isPostFinalization: boolean("is_post_finalization").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("match_confirmations_match_id_player_id_post_unique").on(table.matchId, table.playerId, table.isPostFinalization)],
);

/**
 * Discussion thread attached to a match. `user` messages hold plain text typed by a
 * participant; `system` messages hold an i18n key in `body` plus its interpolation
 * values in `translationParams`, mirroring how notifications are stored.
 */
export const matchMessages = pgTable(
  "match_messages",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    kind: matchMessageKindEnum("kind").notNull().default("user"),
    body: text("body").notNull(),
    translationParams: jsonb("translation_params"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("match_messages_match_created_idx").on(table.matchId, table.createdAt)],
);

// ********************************************************************
// [Start] Bracket tournament tables
// ***************************************************************

export const bracketConfigs = pgTable("bracket_configs", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  tournamentId: uuid("tournament_id")
    .notNull()
    .unique()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  bracketType: bracketTypeEnum("bracket_type").notNull(),
  seedingType: seedingTypeEnum("seeding_type").notNull(),
  sourceTournamentId: uuid("source_tournament_id").references(
    () => tournaments.id,
    { onDelete: "set null" },
  ),
  totalParticipants: integer("total_participants").notNull(),
  roundsCount: integer("rounds_count").notNull(),
  hasBronzeMatch: boolean("has_bronze_match").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const bracketRounds = pgTable(
  "bracket_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    bracketConfigId: uuid("bracket_config_id")
      .notNull()
      .references(() => bracketConfigs.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    /**
     * Label rendered server-side in the language of the request that generated the
     * bracket. Kept as the fallback for rounds created before `roundNameKey` existed;
     * clients that know the key render from it instead, in their own locale.
     */
    roundName: text("round_name").notNull(),
    roundNameKey: text("round_name_key"),
    translationParams: jsonb("translation_params"),
    bracketType: bracketRoundTypeEnum("bracket_type").notNull(),
    matchesCount: integer("matches_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.bracketConfigId, table.roundNumber, table.bracketType),
  ],
);

export const bracketSeeds = pgTable(
  "bracket_seeds",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    bracketConfigId: uuid("bracket_config_id")
      .notNull()
      .references(() => bracketConfigs.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => tournamentEntries.id, { onDelete: "cascade" }),
    seedNumber: integer("seed_number").notNull(),
    seedingScore: integer("seeding_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.bracketConfigId, table.entryId),
    unique().on(table.bracketConfigId, table.seedNumber),
  ],
);

export const bracketMatchMetadata = pgTable(
  "bracket_match_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    matchId: uuid("match_id")
      .notNull()
      .unique()
      .references(() => matches.id, { onDelete: "cascade" }),
    bracketRoundId: uuid("bracket_round_id")
      .notNull()
      .references(() => bracketRounds.id, { onDelete: "cascade" }),
    matchNumber: integer("match_number").notNull(),
    winnerToMatchId: uuid("winner_to_match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    loserToMatchId: uuid("loser_to_match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    isByeMatch: boolean("is_bye_match").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.bracketRoundId, table.matchNumber)],
);

// ********************************************************************
// [End] Bracket tournament tables
// ***************************************************************

// ********************************************************************
// [Start] Ranked season tables
// ***************************************************************

export const rankedSeasonConfigs = pgTable("ranked_season_configs", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  tournamentId: uuid("tournament_id")
    .notNull()
    .unique()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  baseMmr: integer("base_mmr").notNull().default(1000),
  kFactor: integer("k_factor").notNull().default(32),
  placementMatches: integer("placement_matches").notNull().default(5),
  usePreviousMmr: boolean("use_previous_mmr").notNull().default(false),
  // How much of a player's distance to the previous season's median is kept when
  // seeding the new season. 0 = everyone starts at baseMmr, 1 = no compression.
  softResetFactor: real("soft_reset_factor").notNull().default(0.5),
  allowAsymmetricMatches: boolean("allow_asymmetric_matches")
    .notNull()
    .default(false),
  sourceTierSeasonId: uuid("source_tier_season_id").references(() => tournaments.id, {
    onDelete: "set null",
  }),
  // What to do with the MMR thresholds of a copied ladder: keep them as they are,
  // or rebuild them from the source season's peak-MMR percentiles.
  tierScalingMode: text("tier_scaling_mode")
    .$type<TierScalingMode>()
    .notNull()
    .default("keep"),
  // Season the MMR is carried over from. Null falls back to the last finished
  // season of the discipline.
  sourceMmrSeasonId: uuid("source_mmr_season_id").references(() => tournaments.id, {
    onDelete: "set null",
  }),
});

/**
 * Entry MMR of a player for a season, computed once when the season carries the
 * previous season's ranks over. Kept out of `player_mmr` on purpose: a seed must
 * not put anyone in the leaderboard, in the tier percentiles or in the rewind
 * ranking before they have played. Every recalculation reads it as the starting
 * point instead of `base_mmr`, which is what makes the carry-over survive.
 */
export const seasonMmrSeeds = pgTable(
  "season_mmr_seeds",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    seedMmr: integer("seed_mmr").notNull(),
    sourceSeasonId: uuid("source_season_id").references(() => tournaments.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.seasonId, table.playerId)],
);

export const playerMmr = pgTable(
  "player_mmr",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    currentMmr: integer("current_mmr").notNull(),
    matchesPlayed: integer("matches_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    winStreak: integer("win_streak").notNull().default(0),
    maxWinStreak: integer("max_win_streak").notNull().default(0),
    lossStreak: integer("loss_streak").notNull().default(0),
    maxLossStreak: integer("max_loss_streak").notNull().default(0),
  },
  (table) => [unique().on(table.seasonId, table.playerId)],
);

export const mmrHistory = pgTable(
  "mmr_history",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    mmrBefore: integer("mmr_before").notNull(),
    mmrAfter: integer("mmr_after").notNull(),
    mmrDelta: integer("mmr_delta").notNull(),
    kEffective: real("k_effective").notNull(),
    opponentAvgMmr: integer("opponent_avg_mmr").notNull(),
    isPlacement: boolean("is_placement").notNull().default(false),
    outcome: varchar("outcome", { length: 4 }),
    // Snapshot of the player's state AFTER this match — enables historical
    // replay of badge facts during reconciliation (winStreak/lossStreak/
    // matchCountThisSeason as of this match, not the player's current state).
    winStreakAfter: integer("win_streak_after").notNull().default(0),
    lossStreakAfter: integer("loss_streak_after").notNull().default(0),
    matchesPlayedAfter: integer("matches_played_after").notNull().default(0),
  },
  (table) => [
    unique().on(table.seasonId, table.playerId, table.matchId),
    index("idx_mmr_history_season_player").on(table.seasonId, table.playerId),
    // Career reads walk one player across every season, so the composite index
    // above cannot serve them: its leading column is the season.
    index("idx_mmr_history_player").on(table.playerId),
  ],
);

export const rankTiers = pgTable(
  "rank_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    /**
     * Display name. A tier seeded from the default ladder also carries `nameKey`, and
     * the client renders that key in its own locale; `name` is the server-rendered
     * fallback. Naming a tier by hand clears the key: a custom name is not translatable.
     */
    name: text("name").notNull(),
    nameKey: text("name_key"),
    percentile: real("percentile").notNull(),
    minMmr: integer("min_mmr").notNull(),
    subRanks: integer("sub_ranks").notNull().default(1),
    iconClass: text("icon_class"),
    calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.seasonId, table.level)],
);

export const mmrAnimationEventTypeEnum = pgEnum("mmr_animation_event_type", [
  "provisional",
  "official",
]);

export const mmrAnimationEvents = pgTable(
  "mmr_animation_events",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    eventType: mmrAnimationEventTypeEnum("event_type").notNull(),
    mmrBefore: integer("mmr_before").notNull(),
    mmrAfter: integer("mmr_after").notNull(),
    mmrDelta: integer("mmr_delta").notNull(),
    // Points to display/sum in the recap = mmrDelta - seenDelta. For a new match
    // this equals mmrDelta; for a recalculated/cancelled match it is only the
    // change since the player last saw this match, so the recap never re-shows
    // points already animated. Nullable: legacy rows fall back to mmrDelta.
    displayDelta: integer("display_delta"),
    // Full mmrDelta as of the player's last view of this match (0 = never seen).
    // Baseline for displayDelta; advanced to mmrDelta when the event is viewed.
    seenDelta: integer("seen_delta").default(0),
    tierBeforeLevel: integer("tier_before_level"),
    tierAfterLevel: integer("tier_after_level"),
    tierBeforeName: text("tier_before_name"),
    tierAfterName: text("tier_after_name"),
    rankChanged: boolean("rank_changed").notNull().default(false),
    reason: text("reason").notNull().default("match_finalized"),
    // Rules-engine generated message (overrides default encouragement when set)
    message: text("message"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.playerId, table.seasonId, table.matchId, table.eventType),
  ],
);

// ********************************************************************
// [End] Ranked season tables
// ***************************************************************

export const disciplines = pgTable(
  "disciplines",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    name: text("name").notNull(),
    icon: text("icon"),
    scoreInstructions: text("score_instructions"),
    teamInteractionMode: teamInteractionModeEnum("team_interaction_mode"),
    // Terminal but non-destructive: the discipline leaves every selector while its
    // outcome types stay resolvable, so competitions played under it keep their
    // numbers. Deleting outright is only allowed when nothing references it.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("disciplines_archived_at_idx").on(t.archivedAt)],
);

// ***************************************************************
// [Start] Rules engine tables (contextual messages + badges)
// ***************************************************************

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  triggerEvent: text("trigger_event").notNull(),
  type: ruleTypeEnum("type").notNull(),
  scope: ruleScopeEnum("scope").notNull(),
  disciplineId: uuid("discipline_id").references(() => disciplines.id, { onDelete: "set null" }),
  priority: integer("priority").notNull().default(0),
  name: text("name").notNull(),
  description: text("description"),
  conditions: jsonb("conditions").notNull(),
  action: jsonb("action").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Engine version this rule's conditions/action are expressed in. Rows below the
  // current version are brought up by the startup patch chain (rules-migration.service).
  // Defaults to 1 so pre-versioning rows are picked up; writes set it explicitly.
  engineVersion: integer("engine_version").notNull().default(1),
  // Why the patch chain deactivated this rule. Null unless it did; cleared on save.
  disabledReason: text("disabled_reason"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => appUsers.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * One row per award, not per badge: a seasonal badge (`recurrence = 'per_season'`)
 * won in three seasons is three rows sharing a `ruleId`.
 *
 * Uniqueness is per season, and expressed as two partial indexes because NULL <> NULL
 * in Postgres would let duplicates through on rows whose season is unknown (awards
 * predating 0077 whose match had already been deleted). Lifetime uniqueness
 * (`recurrence = 'once'`) spans every season and cannot be an index at all — it lives
 * in `rulesRepository.awardBadge`.
 */
export const playerBadges = pgTable(
  "player_badges",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id, { onDelete: "cascade" }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    // Recorded rather than inferred from the match: `matchId` is nulled when a match
    // is deleted, which used to take the season down with it.
    seasonId: uuid("season_id").references(() => tournaments.id, { onDelete: "cascade" }),
    // null = not yet shown in the badge reveal animation
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("player_badges_player_rule_season_key")
      .on(table.playerId, table.ruleId, table.seasonId)
      .where(sql`${table.seasonId} IS NOT NULL`),
    uniqueIndex("player_badges_player_rule_legacy_key")
      .on(table.playerId, table.ruleId)
      .where(sql`${table.seasonId} IS NULL`),
    index("player_badges_season_idx").on(table.seasonId),
  ],
);

/**
 * Singleton state driving the nightly badge reconciliation cron.
 * `dirty` is set when a badge rule is created/modified; the cron only runs a
 * full reconciliation when dirty, then clears it. A single row is expected.
 */
export const badgeReconciliationState = pgTable("badge_reconciliation_state", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  dirty: boolean("dirty").notNull().default(false),
  // Set by a migration that changes what the rules mean, so the catch-up pass it
  // triggers does not notify players about badges they earned months ago. Consumed
  // by the run it applies to; every later pass notifies normally.
  silentNextRun: boolean("silent_next_run").notNull().default(false),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * One row per (rule, player, match) where the conditions evaluated true — including
 * the rules that matched and produced nothing, which the engine used to discard.
 *
 * Everything the admin screens report is derived from this log by query; there is no
 * counter to keep in sync. The four states we care about read as:
 *   fired          → the row exists
 *   never delivered → deliveredAt IS NULL (a superseded message, or one dropped
 *                     because no current-match animation event was produced)
 *   seen           → seenSurface IN ('reveal', 'reveal_skipped')
 *   drowned        → seenSurface = 'recap'
 */
export const ruleFirings = pgTable(
  "rule_firings",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id, { onDelete: "cascade" }),
    // Denormalized: a rule's type is editable, and a firing must stay readable as
    // whatever the rule was when it fired.
    ruleType: ruleTypeEnum("rule_type").notNull(),
    engineVersion: integer("engine_version").notNull(),
    triggerEvent: text("trigger_event").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").references(() => tournaments.id, { onDelete: "cascade" }),
    result: ruleFiringResultEnum("result").notNull(),
    // Message rules only: which entry of `action.variants` was drawn. Kept for
    // ordering and debugging — never as a key, since the position shifts when a
    // variant is inserted or removed.
    variantIndex: integer("variant_index"),
    // The variant's raw template, frozen as it stood at firing time. This is what
    // the breakdown groups on: editing a variant must not retroactively move past
    // firings under the new wording. Null on rows written before 0076.
    variantText: text("variant_text"),
    // The text actually rendered, after interpolation. Null unless `result` is 'selected'.
    message: text("message"),
    // The animation event that carried the message. Set together with deliveredAt.
    animationEventId: uuid("animation_event_id").references(() => mmrAnimationEvents.id, {
      onDelete: "set null",
    }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    seenSurface: ruleFiringSurfaceEnum("seen_surface"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A match can be finalized more than once (cancel then resubmit); the unique key
    // turns the re-run into an update instead of a duplicate firing.
    unique("rule_firings_rule_player_match_key").on(table.ruleId, table.playerId, table.matchId),
    index("rule_firings_rule_created_idx").on(table.ruleId, table.createdAt.desc()),
    index("rule_firings_player_created_idx").on(table.playerId, table.createdAt.desc()),
    index("rule_firings_animation_event_idx").on(table.animationEventId),
  ],
);

// ***************************************************************
// [End] Rules engine tables
// ***************************************************************

export const outcomeTypes = pgTable(
  "outcome_types",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),

    // Stays "cascade": an outcome type nothing has played under goes away with its
    // discipline. The restrict on matches.outcome_type_id is what stops that
    // cascade as soon as a match depends on it.
    disciplineId: uuid("discipline_id")
      .notNull()
      .references(() => disciplines.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    scoreCountsForMmr: boolean("score_counts_for_mmr").notNull().default(true),
    points: integer("points").notNull().default(3),
    mmrMultiplier: real("mmr_multiplier").notNull().default(1),
    // Hidden from the creation and match-entry selectors, still resolvable for
    // every match already tagged with it.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("outcome_types_archived_at_idx").on(t.archivedAt)],
);

export const outcomeReasons = pgTable("outcome_reasons", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),

  outcomeTypeId: uuid("outcome_type_id")
    .notNull()
    .references(() => outcomeTypes.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    titleKey: text("title_key").notNull(),
    messageKey: text("message_key").notNull(),
    translationParams: jsonb("translation_params"),
    actionUrl: text("action_url"),
    requiresAction: boolean("requires_action").notNull().default(false),
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    resentCount: integer("resent_count").notNull().default(0),
    nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
  },
  // Drives the paginated feed: one ordered index walk per user, so a LIMIT stops early
  // instead of sorting the whole history. The id breaks ties, which is what makes the
  // keyset cursor stable.
  (t) => [
    index("notifications_user_created_idx").on(
      t.userId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);

export const notificationStatus = pgTable(
  "notification_status",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    read: boolean("read").notNull().default(false),
    actionCompleted: boolean("action_completed").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    actionCompletedAt: timestamp("action_completed_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.notificationId, table.userId),
    // The unique above leads with notification_id, so a per-user filter — the list, the
    // unread badge, the bulk operations — could only be answered by a sequential scan.
    index("notification_status_user_read_idx").on(table.userId, table.read),
  ],
);

export const userPushDevices = pgTable("user_push_devices", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  deviceType: deviceTypeEnum("device_type").notNull(),
  subscriptionEndpoint: text("subscription_endpoint").notNull(),
  subscriptionData: text("subscription_data"), // Storing JSON as text or use jsonb if preferred
  active: boolean("active").notNull().default(true),
  // Captured at registration: push payloads are rendered server-side while the device is offline
  locale: text("locale"),
  timezone: text("timezone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const appUsersRelations = relations(appUsers, ({ one, many }) => ({
  externalUser: one(user, {
    fields: [appUsers.externalId],
    references: [user.id],
  }),
  createdTournaments: many(tournaments),
  tournamentAdmins: many(tournamentAdmins),
  createdTeams: many(teams),
  teamMemberships: many(teamMembers),
  tournamentEntryPlayers: many(tournamentEntryPlayers),
  matchConfirmations: many(matchConfirmations),
  notifications: many(notifications),
  pushDevices: many(userPushDevices),
  reportedMatches: many(matchResults, { relationName: "reportedBy" }),
  finalizedMatches: many(matchResults, { relationName: "finalizedBy" }),
  createdInvitationCodes: many(invitationCodes),
  createdGameRules: many(gameRules),
  playerMmrs: many(playerMmr),
  matchPlayerPoints: many(matchPlayerPoints),
  playerComputedData: many(playerComputedData),
  seasonRewinds: many(playerSeasonRewinds),
  organizationMemberships: many(organizationMembers),
  createdOrganizations: many(organizations),
  mmrAnimationEvents: many(mmrAnimationEvents),
  createdRules: many(rules),
  badges: many(playerBadges),
}));

export const rulesRelations = relations(rules, ({ one, many }) => ({
  creator: one(appUsers, {
    fields: [rules.createdBy],
    references: [appUsers.id],
  }),
  discipline: one(disciplines, {
    fields: [rules.disciplineId],
    references: [disciplines.id],
  }),
  badges: many(playerBadges),
  firings: many(ruleFirings),
}));

export const ruleFiringsRelations = relations(ruleFirings, ({ one }) => ({
  rule: one(rules, {
    fields: [ruleFirings.ruleId],
    references: [rules.id],
  }),
  player: one(appUsers, {
    fields: [ruleFirings.playerId],
    references: [appUsers.id],
  }),
  match: one(matches, {
    fields: [ruleFirings.matchId],
    references: [matches.id],
  }),
}));

export const playerBadgesRelations = relations(playerBadges, ({ one }) => ({
  player: one(appUsers, {
    fields: [playerBadges.playerId],
    references: [appUsers.id],
  }),
  rule: one(rules, {
    fields: [playerBadges.ruleId],
    references: [rules.id],
  }),
  match: one(matches, {
    fields: [playerBadges.matchId],
    references: [matches.id],
  }),
  season: one(tournaments, {
    fields: [playerBadges.seasonId],
    references: [tournaments.id],
  }),
}));

export const gameRulesRelations = relations(gameRules, ({ one, many }) => ({
  creator: one(appUsers, {
    fields: [gameRules.createdBy],
    references: [appUsers.id],
  }),
  tournaments: many(tournaments),
}));

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  creator: one(appUsers, {
    fields: [tournaments.createdBy],
    references: [appUsers.id],
  }),
  discipline: one(disciplines, {
    fields: [tournaments.disciplineId],
    references: [disciplines.id],
  }),
  rules: one(gameRules, {
    fields: [tournaments.rulesId],
    references: [gameRules.id],
  }),
  admins: many(tournamentAdmins),
  participants: many(tournamentParticipants),
  entries: many(tournamentEntries),
  teams: many(teams),
  matches: many(matches),
  scoringConfig: one(tournamentScoringConfigs, {
    fields: [tournaments.id],
    references: [tournamentScoringConfigs.tournamentId],
  }),
  championshipConfig: one(championshipConfigs, {
    fields: [tournaments.id],
    references: [championshipConfigs.tournamentId],
  }),
  ruleset: one(tournamentRulesets, {
    fields: [tournaments.id],
    references: [tournamentRulesets.tournamentId],
  }),
  bracketConfig: one(bracketConfigs, {
    fields: [tournaments.id],
    references: [bracketConfigs.tournamentId],
  }),
  sourcedBrackets: many(bracketConfigs, { relationName: "sourceTournament" }),
  rankedConfig: one(rankedSeasonConfigs, {
    fields: [tournaments.id],
    references: [rankedSeasonConfigs.tournamentId],
  }),
  rankTiers: many(rankTiers),
  playerMmrs: many(playerMmr),
  computedData: many(computedData),
  rewinds: many(seasonRewinds),
  organization: one(organizations, {
    fields: [tournaments.organizationId],
    references: [organizations.id],
  }),
}));

export const tournamentScoringConfigsRelations = relations(
  tournamentScoringConfigs,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentScoringConfigs.tournamentId],
      references: [tournaments.id],
    }),
  }),
);

export const tournamentRulesetsRelations = relations(
  tournamentRulesets,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentRulesets.tournamentId],
      references: [tournaments.id],
    }),
  }),
);

export const championshipConfigsRelations = relations(
  championshipConfigs,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [championshipConfigs.tournamentId],
      references: [tournaments.id],
    }),
  }),
);

export const tournamentAdminsRelations = relations(
  tournamentAdmins,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentAdmins.tournamentId],
      references: [tournaments.id],
    }),
    user: one(appUsers, {
      fields: [tournamentAdmins.userId],
      references: [appUsers.id],
    }),
  }),
);

export const tournamentParticipantsRelations = relations(
  tournamentParticipants,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentParticipants.tournamentId],
      references: [tournaments.id],
    }),
    user: one(appUsers, {
      fields: [tournamentParticipants.userId],
      references: [appUsers.id],
    }),
  }),
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [teams.tournamentId],
    references: [tournaments.id],
  }),
  creator: one(appUsers, {
    fields: [teams.createdBy],
    references: [appUsers.id],
  }),
  entries: many(tournamentEntries),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(appUsers, {
    fields: [teamMembers.userId],
    references: [appUsers.id],
  }),
}));

// ********************************************************************
// [Start] New entry-based relations
// ***************************************************************

export const tournamentEntriesRelations = relations(
  tournamentEntries,
  ({ one, many }) => ({
    tournament: one(tournaments, {
      fields: [tournamentEntries.tournamentId],
      references: [tournaments.id],
    }),
    team: one(teams, {
      fields: [tournamentEntries.teamId],
      references: [teams.id],
    }),
    players: many(tournamentEntryPlayers),
    matchSides: many(matchSides),
  }),
);

export const tournamentEntryPlayersRelations = relations(
  tournamentEntryPlayers,
  ({ one }) => ({
    entry: one(tournamentEntries, {
      fields: [tournamentEntryPlayers.entryId],
      references: [tournamentEntries.id],
    }),
    player: one(appUsers, {
      fields: [tournamentEntryPlayers.playerId],
      references: [appUsers.id],
    }),
  }),
);

// ********************************************************************
// [End] New entry-based relations
// ***************************************************************

export const matchesRelations = relations(matches, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [matches.tournamentId],
    references: [tournaments.id],
  }),
  outcomeType: one(outcomeTypes, {
    fields: [matches.outcomeTypeId],
    references: [outcomeTypes.id],
  }),
  outcomeReason: one(outcomeReasons, {
    fields: [matches.outcomeReasonId],
    references: [outcomeReasons.id],
  }),
  sides: many(matchSides),
  playerPoints: many(matchPlayerPoints),
  result: one(matchResults, {
    fields: [matches.id],
    references: [matchResults.matchId],
  }),
  confirmations: many(matchConfirmations),
  messages: many(matchMessages),
  bracketMetadata: one(bracketMatchMetadata, {
    fields: [matches.id],
    references: [bracketMatchMetadata.matchId],
  }),
  creator: one(appUsers, {
    fields: [matches.createdBy],
    references: [appUsers.id],
  }),
}));

// ********************************************************************
// [Start] New match-related relations
// ***************************************************************

export const matchSidesRelations = relations(matchSides, ({ one }) => ({
  match: one(matches, {
    fields: [matchSides.matchId],
    references: [matches.id],
  }),
  entry: one(tournamentEntries, {
    fields: [matchSides.entryId],
    references: [tournamentEntries.id],
  }),
}));

export const matchResultsRelations = relations(matchResults, ({ one }) => ({
  match: one(matches, {
    fields: [matchResults.matchId],
    references: [matches.id],
  }),
  reporter: one(appUsers, {
    fields: [matchResults.reportedBy],
    references: [appUsers.id],
    relationName: "reportedBy",
  }),
  finalizer: one(appUsers, {
    fields: [matchResults.finalizedBy],
    references: [appUsers.id],
    relationName: "finalizedBy",
  }),
}));

export const matchPlayerPointsRelations = relations(
  matchPlayerPoints,
  ({ one }) => ({
    match: one(matches, {
      fields: [matchPlayerPoints.matchId],
      references: [matches.id],
    }),
    player: one(appUsers, {
      fields: [matchPlayerPoints.playerId],
      references: [appUsers.id],
    }),
  }),
);

// ********************************************************************
// [End] New match-related relations
// ***************************************************************

export const matchConfirmationsRelations = relations(
  matchConfirmations,
  ({ one }) => ({
    match: one(matches, {
      fields: [matchConfirmations.matchId],
      references: [matches.id],
    }),
    player: one(appUsers, {
      fields: [matchConfirmations.playerId],
      references: [appUsers.id],
    }),
  }),
);

export const matchMessagesRelations = relations(matchMessages, ({ one }) => ({
  match: one(matches, {
    fields: [matchMessages.matchId],
    references: [matches.id],
  }),
  author: one(appUsers, {
    fields: [matchMessages.authorId],
    references: [appUsers.id],
  }),
}));

// ********************************************************************
// [Start] Bracket tournament relations
// ***************************************************************

export const bracketConfigsRelations = relations(
  bracketConfigs,
  ({ one, many }) => ({
    tournament: one(tournaments, {
      fields: [bracketConfigs.tournamentId],
      references: [tournaments.id],
    }),
    sourceTournament: one(tournaments, {
      fields: [bracketConfigs.sourceTournamentId],
      references: [tournaments.id],
      relationName: "sourceTournament",
    }),
    rounds: many(bracketRounds),
    seeds: many(bracketSeeds),
  }),
);

export const bracketRoundsRelations = relations(
  bracketRounds,
  ({ one, many }) => ({
    bracketConfig: one(bracketConfigs, {
      fields: [bracketRounds.bracketConfigId],
      references: [bracketConfigs.id],
    }),
    matchMetadata: many(bracketMatchMetadata),
  }),
);

export const bracketSeedsRelations = relations(bracketSeeds, ({ one }) => ({
  bracketConfig: one(bracketConfigs, {
    fields: [bracketSeeds.bracketConfigId],
    references: [bracketConfigs.id],
  }),
  entry: one(tournamentEntries, {
    fields: [bracketSeeds.entryId],
    references: [tournamentEntries.id],
  }),
}));

export const bracketMatchMetadataRelations = relations(
  bracketMatchMetadata,
  ({ one }) => ({
    match: one(matches, {
      fields: [bracketMatchMetadata.matchId],
      references: [matches.id],
    }),
    bracketRound: one(bracketRounds, {
      fields: [bracketMatchMetadata.bracketRoundId],
      references: [bracketRounds.id],
    }),
    winnerToMatch: one(matches, {
      fields: [bracketMatchMetadata.winnerToMatchId],
      references: [matches.id],
      relationName: "winnerToMatch",
    }),
    loserToMatch: one(matches, {
      fields: [bracketMatchMetadata.loserToMatchId],
      references: [matches.id],
      relationName: "loserToMatch",
    }),
  }),
);

// ********************************************************************
// [End] Bracket tournament relations
// ***************************************************************

// ********************************************************************
// [Start] Ranked season relations
// ***************************************************************

export const rankedSeasonConfigsRelations = relations(
  rankedSeasonConfigs,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [rankedSeasonConfigs.tournamentId],
      references: [tournaments.id],
    }),
  }),
);

export const playerMmrRelations = relations(playerMmr, ({ one }) => ({
  season: one(tournaments, {
    fields: [playerMmr.seasonId],
    references: [tournaments.id],
  }),
  player: one(appUsers, {
    fields: [playerMmr.playerId],
    references: [appUsers.id],
  }),
}));

export const mmrHistoryRelations = relations(mmrHistory, ({ one }) => ({
  season: one(tournaments, {
    fields: [mmrHistory.seasonId],
    references: [tournaments.id],
  }),
  player: one(appUsers, {
    fields: [mmrHistory.playerId],
    references: [appUsers.id],
  }),
  match: one(matches, {
    fields: [mmrHistory.matchId],
    references: [matches.id],
  }),
}));

export const seasonMmrSeedsRelations = relations(seasonMmrSeeds, ({ one }) => ({
  season: one(tournaments, {
    fields: [seasonMmrSeeds.seasonId],
    references: [tournaments.id],
  }),
  player: one(appUsers, {
    fields: [seasonMmrSeeds.playerId],
    references: [appUsers.id],
  }),
}));

export const rankTiersRelations = relations(
  rankTiers,
  ({ one }) => ({
    season: one(tournaments, {
      fields: [rankTiers.seasonId],
      references: [tournaments.id],
    }),
  }),
);

// ********************************************************************
// [End] Ranked season relations
// ***************************************************************

export const disciplinesRelations = relations(disciplines, ({ many }) => ({
  outcomeTypes: many(outcomeTypes),
  tournaments: many(tournaments),
}));

export const outcomeTypesRelations = relations(
  outcomeTypes,
  ({ one, many }) => ({
    discipline: one(disciplines, {
      fields: [outcomeTypes.disciplineId],
      references: [disciplines.id],
    }),
    outcomeReasons: many(outcomeReasons),
    matches: many(matches),
  }),
);

export const outcomeReasonsRelations = relations(
  outcomeReasons,
  ({ one, many }) => ({
    outcomeType: one(outcomeTypes, {
      fields: [outcomeReasons.outcomeTypeId],
      references: [outcomeTypes.id],
    }),
    matches: many(matches),
  }),
);

export const notificationsRelations = relations(
  notifications,
  ({ one, many }) => ({
    user: one(appUsers, {
      fields: [notifications.userId],
      references: [appUsers.id],
    }),
    match: one(matches, {
      fields: [notifications.matchId],
      references: [matches.id],
    }),
    statuses: many(notificationStatus),
  }),
);

export const notificationStatusRelations = relations(
  notificationStatus,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationStatus.notificationId],
      references: [notifications.id],
    }),
    user: one(appUsers, {
      fields: [notificationStatus.userId],
      references: [appUsers.id],
    }),
  }),
);

export const userPushDevicesRelations = relations(
  userPushDevices,
  ({ one }) => ({
    user: one(appUsers, {
      fields: [userPushDevices.userId],
      references: [appUsers.id],
    }),
  }),
);

export const invitationCodesRelations = relations(
  invitationCodes,
  ({ one, many }) => ({
    creator: one(appUsers, {
      fields: [invitationCodes.createdBy],
      references: [appUsers.id],
    }),
    usages: many(invitationUsages),
    organization: one(organizations, {
      fields: [invitationCodes.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  creator: one(appUsers, {
    fields: [organizations.createdBy],
    references: [appUsers.id],
  }),
  members: many(organizationMembers),
  tournaments: many(tournaments),
  invitationCodes: many(invitationCodes),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(appUsers, {
    fields: [organizationMembers.userId],
    references: [appUsers.id],
  }),
}));

export const invitationUsagesRelations = relations(
  invitationUsages,
  ({ one }) => ({
    code: one(invitationCodes, {
      fields: [invitationUsages.codeId],
      references: [invitationCodes.id],
    }),
    user: one(user, {
      fields: [invitationUsages.userId],
      references: [user.id],
    }),
  }),
);

export const computedData = pgTable(
  "computed_data",
  {
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    data: jsonb("data").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.key] })],
);

export const computedDataRelations = relations(computedData, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [computedData.tournamentId],
    references: [tournaments.id],
  }),
}));

export const playerComputedData = pgTable(
  "player_computed_data",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    data: jsonb("data").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.key] })],
);

export const mmrAnimationEventsRelations = relations(mmrAnimationEvents, ({ one }) => ({
  player: one(appUsers, {
    fields: [mmrAnimationEvents.playerId],
    references: [appUsers.id],
  }),
  season: one(tournaments, {
    fields: [mmrAnimationEvents.seasonId],
    references: [tournaments.id],
  }),
  match: one(matches, {
    fields: [mmrAnimationEvents.matchId],
    references: [matches.id],
  }),
}));

export const playerComputedDataRelations = relations(playerComputedData, ({ one }) => ({
  player: one(appUsers, {
    fields: [playerComputedData.playerId],
    references: [appUsers.id],
  }),
}));

// ***************************************************************
// [Start] Season rewind tables (end-of-season recap snapshots)
// ***************************************************************

// 'year' is unused for now but declared upfront: adding a value to an enum in a
// live database is a migration we would rather not owe ourselves later.
export const rewindScopeEnum = pgEnum("rewind_scope", ["season", "year"]);

// Immutable snapshot of a finished season, computed once by the rewind worker.
// seasonId is nullable because a future 'year' rewind aggregates several seasons
// and belongs to no single tournament; it is carried by (discipline, periodKey)
// instead. A CHECK constraint in the migration enforces that exclusivity.
export const seasonRewinds = pgTable("season_rewinds", {
  id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
  seasonId: uuid("season_id").references(() => tournaments.id, { onDelete: "cascade" }),
  scope: rewindScopeEnum("scope").notNull().default("season"),
  // null when scope = 'season'; the calendar year ('2026') when scope = 'year'.
  periodKey: text("period_key"),
  disciplineId: uuid("discipline_id").references(() => disciplines.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  version: integer("version").notNull().default(1),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

// One deck per player. Points at the rewind rather than the season so a 'year'
// rewind can carry player payloads without duplicating the scope logic.
export const playerSeasonRewinds = pgTable(
  "player_season_rewinds",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(newId),
    rewindId: uuid("rewind_id")
      .notNull()
      .references(() => seasonRewinds.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    version: integer("version").notNull().default(1),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    // End of the window during which the rewind is promoted on the home page.
    // Frozen on first generation: regenerating must not restart the countdown.
    promotedUntil: timestamp("promoted_until", { withTimezone: true }).notNull(),
    // Set on first open. The season page only auto-opens the rewind while null,
    // so quitting halfway never turns into a rewind ambush on every visit.
    openedAt: timestamp("opened_at", { withTimezone: true }),
    // Set when the deck is watched through to the end — that is what retires
    // the promo card, not merely opening it.
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.rewindId, table.playerId),
    // Partial on purpose, and it must stay that way: the promo lookup only ever
    // asks for decks the player has not watched. Declared exactly as migration
    // 0064 creates it, so a regenerated migration cannot silently widen it.
    index("idx_player_season_rewinds_promoted")
      .on(table.playerId, table.promotedUntil)
      .where(sql`${table.viewedAt} IS NULL`),
  ],
);

export const seasonRewindsRelations = relations(seasonRewinds, ({ one, many }) => ({
  season: one(tournaments, {
    fields: [seasonRewinds.seasonId],
    references: [tournaments.id],
  }),
  discipline: one(disciplines, {
    fields: [seasonRewinds.disciplineId],
    references: [disciplines.id],
  }),
  playerRewinds: many(playerSeasonRewinds),
}));

export const playerSeasonRewindsRelations = relations(playerSeasonRewinds, ({ one }) => ({
  rewind: one(seasonRewinds, {
    fields: [playerSeasonRewinds.rewindId],
    references: [seasonRewinds.id],
  }),
  player: one(appUsers, {
    fields: [playerSeasonRewinds.playerId],
    references: [appUsers.id],
  }),
}));

// ***************************************************************
// [End] Season rewind tables
// ***************************************************************
