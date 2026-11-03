import { z } from "zod";
import { vmsg } from "./validation-messages";

// ============================================
// Types for tournament entries (entry-based system)
// ============================================

/**
 * Entry type enum - determines how the entry is composed
 */
export type EntryType = "PLAYER" | "TEAM";

export const entryTypeSchema = z.enum(["PLAYER", "TEAM"]);

/**
 * Tournament Entry - represents a participant entity in a tournament
 * Can be either a TEAM (static mode) or individual PLAYER(S) (flex mode)
 */
export const tournamentEntrySchema = z
  .object({
    id: z.string(),
    tournamentId: z.string(),
    entryType: entryTypeSchema,
    teamId: z.string().optional(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "TournamentEntry" });

export type TournamentEntry = z.infer<typeof tournamentEntrySchema>;

/** Reference to a player, as embedded in entry and match payloads. */
const playerRefSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  shortName: z.string(),
});

/**
 * Tournament Entry with relations
 */
export const tournamentEntryModelSchema = tournamentEntrySchema
  .extend({
    team: z.object({ id: z.string(), name: z.string() }).optional(),
    players: z.array(
      z.object({
        playerId: z.string(),
        player: playerRefSchema,
      })
    ),
  })
  .meta({ id: "TournamentEntryModel" });

export type TournamentEntryModel = z.infer<typeof tournamentEntryModelSchema>;

/**
 * Match Side - represents one participant side in a match
 */
export const matchSideSchema = z
  .object({
    id: z.string(),
    matchId: z.string(),
    entryId: z.string(),
    /** 1, 2, 3… (supports N-way matches in future) */
    position: z.number().int(),
    score: z.number(),
    pointsAwarded: z.number(),
  })
  .meta({ id: "MatchSide" });

export type MatchSide = z.infer<typeof matchSideSchema>;

/**
 * Match Side with entry relations
 */
export const matchSideModelSchema = matchSideSchema
  .extend({ entry: tournamentEntryModelSchema.optional() })
  .meta({ id: "MatchSideModel" });

export type MatchSideModel = z.infer<typeof matchSideModelSchema>;

/**
 * Match Result - stores reporting and finalization metadata
 */
export const matchResultSchema = z
  .object({
    matchId: z.string(),
    reportedBy: z.string().optional(),
    reportedAt: z.iso.datetime().optional(),
    reportProof: z.string().optional(),
    finalizedBy: z.string().optional(),
    finalizedAt: z.iso.datetime().optional(),
    finalizationReason: z
      .enum(["consensus", "auto_validation", "admin_override"])
      .optional(),
  })
  .meta({ id: "MatchResult" });

export type MatchResult = z.infer<typeof matchResultSchema>;

/** Reference to a user, as embedded in match payloads. */
const userRefSchema = z.object({ id: z.string(), displayName: z.string() });

/**
 * Match Result with relations
 */
export const matchResultModelSchema = matchResultSchema
  .extend({
    reporter: userRefSchema.optional(),
    finalizer: userRefSchema.optional(),
  })
  .meta({ id: "MatchResultModel" });

export type MatchResultModel = z.infer<typeof matchResultModelSchema>;

// ============================================
// Client types (with Date objects instead of strings)
// ============================================

/**
 * Client-side Tournament Entry (dates as Date objects)
 */
export interface ClientTournamentEntry extends Omit<TournamentEntry, 'createdAt'> {
  createdAt: Date;
}

/**
 * Client-side Tournament Entry Model (dates as Date objects)
 */
export interface ClientTournamentEntryModel extends Omit<TournamentEntryModel, 'createdAt'> {
  createdAt: Date;
}

/**
 * Client-side Match Result (dates as Date objects)
 */
export interface ClientMatchResult extends Omit<MatchResult, 'reportedAt' | 'finalizedAt'> {
  reportedAt?: Date;
  finalizedAt?: Date;
}

/**
 * Client-side Match Result Model (dates as Date objects)
 */
export interface ClientMatchResultModel extends Omit<MatchResultModel, 'reportedAt' | 'finalizedAt'> {
  reportedAt?: Date;
  finalizedAt?: Date;
}

// ============================================
// Zod schemas for validation
// ============================================

export const createTournamentEntrySchema = z.object({
  tournamentId: z.string().uuid(vmsg("validation.invalidTournamentId")),
  entryType: entryTypeSchema,
  teamId: z.string().uuid(vmsg("validation.invalidTeamId")).optional(),
  playerIds: z.array(z.string().uuid(vmsg("validation.invalidPlayerId"))).min(1),
});

export type CreateTournamentEntryData = z.infer<typeof createTournamentEntrySchema>;
