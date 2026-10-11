// ============================================
// Types for a player's profile and statistics
// ============================================

import { z } from "zod";
import { tournamentModeSchema } from "./enums";

export const playerProfileSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    shortName: z.string(),
  })
  .meta({ id: "PlayerProfile" });

export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export const playerRelationStatSchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    count: z.number(),
    wins: z.number(),
    losses: z.number(),
    /** Player's win rate in this relation, in percent (0-100), already rounded */
    winRate: z.number(),
    chemistryDelta: z.number().optional(),
  })
  .meta({ id: "PlayerRelationStat" });

export type PlayerRelationStat = z.infer<typeof playerRelationStatSchema>;

export const playerOutcomeTypeStatSchema = z
  .object({
    outcomeTypeId: z.string(),
    outcomeTypeName: z.string(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    matchesPlayed: z.number(),
    winRate: z.number(),
  })
  .meta({ id: "PlayerOutcomeTypeStat" });

export type PlayerOutcomeTypeStat = z.infer<typeof playerOutcomeTypeStatSchema>;

/** A player's record in one match format, read from their side: 2v1 is two of them against one. */
export const playerFormatStatSchema = z
  .object({
    teamSize: z.number(),
    opponentSize: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    matchesPlayed: z.number(),
    winRate: z.number(),
  })
  .meta({ id: "PlayerFormatStat" });

export type PlayerFormatStat = z.infer<typeof playerFormatStatSchema>;

export const playerH2HStatSchema = z
  .object({
    opponentId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    matchesPlayed: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    winRate: z.number(),
  })
  .meta({ id: "PlayerH2HStat" });

export type PlayerH2HStat = z.infer<typeof playerH2HStatSchema>;

export const playerTournamentEntrySchema = z
  .object({
    tournamentId: z.string(),
    tournamentName: z.string(),
    mode: z.string(),
    disciplineName: z.string().optional(),
    matchesPlayed: z.number(),
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
    points: z.number().optional(),
    rank: z.number().optional(),
  })
  .meta({ id: "PlayerTournamentEntry" });

export type PlayerTournamentEntry = z.infer<typeof playerTournamentEntrySchema>;

export const playerDetailStatsSchema = z
  .object({
    totalMatches: z.number(),
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
    winRate: z.number(),
    averageScore: z.number(),
    tournamentsParticipated: z.number(),
    /** V = win, D = loss, N = draw, most recent first. */
    recentForm: z.array(z.enum(["V", "D", "N"])),
    mostFrequentPartners: z.array(playerRelationStatSchema),
    bestPartners: z.array(playerRelationStatSchema),
    nemeses: z.array(playerRelationStatSchema),
    outcomeTypeStats: z.array(playerOutcomeTypeStatSchema),
    formatStats: z.array(playerFormatStatSchema),
    h2hStats: z.array(playerH2HStatSchema),
    tournamentHistory: z.array(playerTournamentEntrySchema),
  })
  .meta({ id: "PlayerDetailStats" });

export type PlayerDetailStats = z.infer<typeof playerDetailStatsSchema>;

export const playerStatsFiltersResponseSchema = z
  .object({
    tournamentId: z.string().optional(),
    disciplineId: z.string().optional(),
    tournamentMode: z.string().optional(),
    teamMode: z.string().optional(),
  })
  .meta({ id: "PlayerStatsFilters" });

export type PlayerStatsFilters = z.infer<typeof playerStatsFiltersResponseSchema>;

export const playerStatsResponseSchema = z
  .object({
    player: playerProfileSchema,
    stats: playerDetailStatsSchema,
    filters: playerStatsFiltersResponseSchema,
  })
  .meta({ id: "PlayerStatsResponse" });

export type PlayerStatsResponse = z.infer<typeof playerStatsResponseSchema>;

export const playerTournamentOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    mode: z.string(),
    teamMode: z.string().optional(),
    disciplineId: z.string().optional(),
    disciplineName: z.string().optional(),
  })
  .meta({ id: "PlayerTournamentOption" });

export type PlayerTournamentOption = z.infer<typeof playerTournamentOptionSchema>;

// ============================================
// Player comparison (player vs player)
// ============================================

export const h2hSubRecordSchema = z
  .object({
    matchesPlayed: z.number(),
    playerAWins: z.number(),
    playerBWins: z.number(),
    draws: z.number(),
    playerAWinRate: z.number(),
  })
  .meta({ id: "H2HSubRecord" });

export type H2HSubRecord = z.infer<typeof h2hSubRecordSchema>;

export const playerHeadToHeadRecordSchema = h2hSubRecordSchema
  .extend({
    solo: h2hSubRecordSchema,
    team: h2hSubRecordSchema,
  })
  .meta({ id: "PlayerHeadToHeadRecord" });

export type PlayerHeadToHeadRecord = z.infer<typeof playerHeadToHeadRecordSchema>;

export const playerTeamupRecordSchema = z
  .object({
    matchesPlayed: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    /** 0-100, record of the pair when they play on the same side. */
    winRate: z.number(),
  })
  .meta({ id: "PlayerTeamupRecord" });

export type PlayerTeamupRecord = z.infer<typeof playerTeamupRecordSchema>;

export const playerComparisonResponseSchema = z
  .object({
    playerA: playerStatsResponseSchema,
    playerB: playerStatsResponseSchema,
    headToHead: playerHeadToHeadRecordSchema,
    together: playerTeamupRecordSchema,
    filters: playerStatsFiltersResponseSchema,
  })
  .meta({ id: "PlayerComparisonResponse" });

export type PlayerComparisonResponse = z.infer<typeof playerComparisonResponseSchema>;

export const playerStatsFiltersSchema = z.object({
  tournamentId: z.uuid().optional(),
  disciplineId: z.uuid().optional(),
  tournamentMode: tournamentModeSchema.optional(),
  teamMode: z.string().optional(),
});

export type PlayerStatsFiltersQuery = z.infer<typeof playerStatsFiltersSchema>;

export const userSearchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type UserSearchQuery = z.infer<typeof userSearchSchema>;

export const playerComparisonSchema = playerStatsFiltersSchema.extend({
  playerA: z.uuid(),
  playerB: z.uuid(),
});

export type PlayerComparisonQuery = z.infer<typeof playerComparisonSchema>;
