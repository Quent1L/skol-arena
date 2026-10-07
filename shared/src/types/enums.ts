import { z } from "zod";

// ============================================
// Enums de base
// ============================================

export const userRoleEnum = [
  "player",
  "tournament_admin",
  "super_admin",
  "kiosk",
] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const tournamentModeEnum = ["championship", "bracket", "ranked"] as const;
export type TournamentMode = (typeof tournamentModeEnum)[number];

export const teamModeEnum = ["static", "flex"] as const;
export type TeamMode = (typeof teamModeEnum)[number];

export const tournamentStatusEnum = [
  "draft",
  "open",
  "ongoing",
  "finished",
] as const;
export type TournamentStatus = (typeof tournamentStatusEnum)[number];

/**
 * Where a competition may go from where it is.
 *
 * `open → draft` is the one step back, so a competition opened by mistake can be
 * pulled before anyone joins. Nothing leaves `finished`: its standings are
 * published and its rewinds are frozen.
 */
export const TOURNAMENT_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ["open"],
  open: ["ongoing", "draft"],
  ongoing: ["finished"],
  finished: [],
};

export const tournamentAdminRoleEnum = ["owner", "co_admin"] as const;
export type TournamentAdminRole = (typeof tournamentAdminRoleEnum)[number];

export const matchStatusEnum = [
  "scheduled",
  "reported",
  "pending_confirmation",
  "confirmed",
  "disputed",
  "cancelled",
  "finalized",
] as const;
export type MatchStatus = (typeof matchStatusEnum)[number];

/**
 * A match carrying an actual result, contested or not.
 *
 * Two questions read this: whether a match weighs on the provisional standings,
 * and whether a competition's rules are still free to change. They have to agree
 * — a result that already counts towards a ranking is a result someone is
 * relying on. A contested one stays in: it counted while it was merely reported,
 * and pulling it out would make the standings flicker for the length of the
 * arbitration.
 */
export const ENTERED_MATCH_STATUSES: MatchStatus[] = ["reported", "disputed", "finalized"];

export const matchFinalizationReasonEnum = [
  "consensus",
  "auto_validation",
  "admin_override",
  "trust_score",
] as const;
export type MatchFinalizationReason = (typeof matchFinalizationReasonEnum)[number];

export const validationModeEnum = ["auto", "strict", "admin", "none"] as const;
export type ValidationMode = (typeof validationModeEnum)[number];

export const matchTeamSideEnum = ["A", "B"] as const;
export type MatchTeamSide = (typeof matchTeamSideEnum)[number];

export const outcomeTypeNameEnum = {
  NORMAL: "Normal",
} as const;
export type OutcomeTypeName = (typeof outcomeTypeNameEnum)[keyof typeof outcomeTypeNameEnum];

export const bracketTypeEnum = ["single_elimination", "double_elimination"] as const;
export type BracketType = (typeof bracketTypeEnum)[number];

export const seedingTypeEnum = ["random", "championship_based"] as const;
export type SeedingType = (typeof seedingTypeEnum)[number];

export const bracketRoundTypeEnum = ["winners", "losers", "bronze"] as const;
export type BracketRoundType = (typeof bracketRoundTypeEnum)[number];

// ============================================
// Zod schemas for validation
// ============================================

export const userRoleSchema = z.enum(userRoleEnum);
export const tournamentModeSchema = z.enum(tournamentModeEnum);
export const teamModeSchema = z.enum(teamModeEnum);
export const tournamentStatusSchema = z.enum(tournamentStatusEnum);
export const tournamentAdminRoleSchema = z.enum(tournamentAdminRoleEnum);
export const matchStatusSchema = z.enum(matchStatusEnum);
export const matchFinalizationReasonSchema = z.enum(matchFinalizationReasonEnum);
export const validationModeSchema = z.enum(validationModeEnum);
export const matchTeamSideSchema = z.enum(matchTeamSideEnum);
export const bracketTypeSchema = z.enum(bracketTypeEnum);
export const seedingTypeSchema = z.enum(seedingTypeEnum);
export const bracketRoundTypeSchema = z.enum(bracketRoundTypeEnum);
