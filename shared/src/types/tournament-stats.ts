import { z } from "zod";

/**
 * Minimum sample size before a success rate is considered trustworthy enough to rank.
 * Shared so the backend ranking and the cards explaining it never drift apart.
 */
export const MIN_WEIGHTED_RATE_MATCHES = 3;

/** A player as a leaderboard row identifies them: enough to draw an avatar and link out. */
export const statPlayerRefSchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
  })
  .meta({ id: "StatPlayerRef" });

export type StatPlayerRef = z.infer<typeof statPlayerRefSchema>;

export const outcomeTypeCountSchema = z
  .object({
    outcomeTypeId: z.string().nullable(),
    outcomeTypeName: z.string().nullable(),
    isDefault: z.boolean(),
    count: z.number(),
  })
  .meta({ id: "OutcomeTypeCount" });

export type OutcomeTypeCount = z.infer<typeof outcomeTypeCountSchema>;

/** Competition ranking (1,1,1,4): entries no criterion separates share a rank. */
export const competitionRankSchema = z
  .object({
    rank: z.number(),
    /** How many entries share this rank, this one included. */
    tiedCount: z.number(),
  })
  .meta({ id: "CompetitionRank" });

export type CompetitionRank = z.infer<typeof competitionRankSchema>;

export const bestTeamEntrySchema = competitionRankSchema
  .extend({
    entryId: z.string(),
    /** The roster joined into one label — the team itself has no name of its own */
    displayName: z.string(),
    players: z.array(statPlayerRefSchema),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    matchesPlayed: z.number(),
    winRate: z.number(),
    /** The value the ranking actually sorts on: win rate weighted by sample size */
    score: z.number(),
  })
  .meta({ id: "BestTeamEntry" });

export type BestTeamEntry = z.infer<typeof bestTeamEntrySchema>;

export const momentumDaySchema = z
  .object({
    date: z.string(),
    matchCount: z.number(),
  })
  .meta({ id: "MomentumDay" });

export type MomentumDay = z.infer<typeof momentumDaySchema>;

export const winStreakEntrySchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    currentStreak: z.number(),
  })
  .meta({ id: "WinStreakEntry" });

export type WinStreakEntry = z.infer<typeof winStreakEntrySchema>;

export const bestDuoEntrySchema = competitionRankSchema
  .extend({
    playerId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    wins: z.number(),
    losses: z.number(),
    matchesPlayed: z.number(),
    winRate: z.number(),
    /** The value the ranking actually sorts on: win rate weighted by sample size */
    score: z.number(),
  })
  .meta({ id: "BestDuoEntry" });

export type BestDuoEntry = z.infer<typeof bestDuoEntrySchema>;

/** Rate boards only: nobody reached the match threshold, so the board is unfiltered. */
const lowSampleShape = { isLowSample: z.boolean() };

export const bestTeamsBoardSchema = z
  .object({ entries: z.array(bestTeamEntrySchema), ...lowSampleShape })
  .meta({ id: "BestTeamsBoard" });

export type BestTeamsBoard = z.infer<typeof bestTeamsBoardSchema>;

export const bestPlayersBoardSchema = z
  .object({ entries: z.array(bestDuoEntrySchema), ...lowSampleShape })
  .meta({ id: "BestPlayersBoard" });

export type BestPlayersBoard = z.infer<typeof bestPlayersBoardSchema>;

export const outcomeTypeLeaderSchema = competitionRankSchema
  .extend({
    playerId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    /** Wins — or losses, depending on which list this entry belongs to */
    count: z.number(),
    /** Matches of this outcome type the player took part in, draws included */
    matchesPlayed: z.number(),
    /** count / matchesPlayed, in percent (0-100), already rounded */
    ratePct: z.number(),
    /** Share of all wins (resp. losses) recorded in this outcome type, in percent, rounded */
    sharePct: z.number(),
  })
  .meta({ id: "OutcomeTypeLeader" });

export type OutcomeTypeLeader = z.infer<typeof outcomeTypeLeaderSchema>;

export const outcomeTypeLeaderboardSchema = z
  .object({
    leaders: z.array(outcomeTypeLeaderSchema),
    /** Names of the players tied with the last shown rank but cut for space */
    omittedNames: z.array(z.string()),
    /** Total cut for space — omittedNames is capped, this is not */
    omittedCount: z.number(),
    /** True when every candidate shares rank 1: no podium, an honour roll instead */
    isFlat: z.boolean(),
    /** Rate boards only: no player reached the match threshold, so the board is unfiltered */
    isLowSample: z.boolean(),
  })
  .meta({ id: "OutcomeTypeLeaderboard" });

export type OutcomeTypeLeaderboard = z.infer<typeof outcomeTypeLeaderboardSchema>;

export const outcomeTypeFunStatSchema = z
  .object({
    outcomeTypeId: z.string(),
    outcomeTypeName: z.string(),
    /** Finalized matches settled with this outcome type */
    totalMatches: z.number(),
    topWinnersByVolume: outcomeTypeLeaderboardSchema,
    topWinnersByRate: outcomeTypeLeaderboardSchema,
    topLosersByVolume: outcomeTypeLeaderboardSchema,
    topLosersByRate: outcomeTypeLeaderboardSchema,
  })
  .meta({ id: "OutcomeTypeFunStat" });

export type OutcomeTypeFunStat = z.infer<typeof outcomeTypeFunStatSchema>;

export const tournamentStatsSchema = z
  .object({
    /** "team" for fixed teams: every board then ranks teams, and its ids are team ids. */
    subject: z.enum(["player", "team"]),
    totalMatches: z.number(),
    totalFinalized: z.number(),
    outcomeDistribution: z.array(outcomeTypeCountSchema),
    bestTeams: bestTeamsBoardSchema,
    momentum: z.array(momentumDaySchema),
    winStreaks: z.array(winStreakEntrySchema),
    lossStreaks: z.array(winStreakEntrySchema),
    invincibleStreaks: z.array(winStreakEntrySchema),
    bestDuoPlayers: bestPlayersBoardSchema,
    bestSoloPlayers: bestPlayersBoardSchema,
    bestAsymmetricSoloPlayers: bestPlayersBoardSchema,
    outcomeTypeFunStats: z.array(outcomeTypeFunStatSchema),
  })
  .meta({ id: "TournamentStats" });

export type TournamentStats = z.infer<typeof tournamentStatsSchema>;
