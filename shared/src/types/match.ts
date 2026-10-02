import { z } from "zod";
import {
  type MatchStatus,
  type MatchFinalizationReason,
  type TournamentStatus,
  matchStatusSchema,
  matchFinalizationReasonSchema,
  matchTeamSideSchema,
} from "./enums";
import { matchSideModelSchema, matchResultModelSchema } from "./entry";
import type { HistoryMatchSide } from "./ranked";

// ============================================
// Types and interfaces for matches
// ============================================

const outcomeTypeRefSchema = z.object({
  id: z.string(),
  disciplineId: z.string(),
  name: z.string(),
  discipline: z.object({ id: z.string(), name: z.string() }).optional(),
});

export const matchSchema = z
  .object({
    id: z.string(),
    tournamentId: z.string(),
    round: z.number().int().optional(),
    teamAId: z.string().optional(),
    teamBId: z.string().optional(),
    scoreA: z.number(),
    scoreB: z.number(),
    winnerId: z.string().optional(),
    winnerSide: matchTeamSideSchema.optional(),
    status: matchStatusSchema,
    reportedBy: z.string().optional(),
    reportedAt: z.iso.datetime().optional(),
    reportProof: z.string().optional(),
    confirmationDeadline: z.iso.datetime().optional(),
    finalizedAt: z.iso.datetime().optional(),
    finalizedBy: z.string().optional(),
    finalizationReason: matchFinalizationReasonSchema.optional(),
    outcomeTypeId: z.string().optional(),
    outcomeReasonId: z.string().optional(),
    outcomeType: outcomeTypeRefSchema.optional(),
    outcomeReason: z
      .object({
        id: z.string(),
        outcomeTypeId: z.string(),
        name: z.string(),
        outcomeType: outcomeTypeRefSchema.optional(),
      })
      .optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    playedAt: z.iso.datetime(),
  })
  .meta({ id: "Match" });

export type Match = z.infer<typeof matchSchema>;

/** One side of the legacy team-based representation, kept alongside `sides`. */
const legacyTeamSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  participants: z
    .array(
      z.object({
        user: z.object({ id: z.string(), displayName: z.string() }).optional(),
        effectivePointsAwarded: z.number().nullish(),
        exceededMatchLimit: z.boolean().optional(),
      })
    )
    .optional(),
});

export const matchConfirmationSchema = z
  .object({
    id: z.string(),
    matchId: z.string(),
    playerId: z.string(),
    isConfirmed: z.boolean(),
    isContested: z.boolean(),
    contestationReason: z.string().optional(),
    sidePosition: z.number().int().nullable().optional(),
    isPostFinalization: z.boolean().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    player: z.object({ id: z.string(), displayName: z.string() }).optional(),
  })
  .meta({ id: "MatchConfirmation" });

export type MatchConfirmation = z.infer<typeof matchConfirmationSchema>;

/**
 * Match with relations - returned by list/getById endpoints
 */
export const matchModelSchema = matchSchema
  .extend({
    tournament: z
      .object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        teamMode: z.string(),
        mode: z.string(),
        scoreEnabled: z.boolean().optional(),
        validationMode: z.string().optional(),
        validationTimerHours: z.number().int().nullish(),
      })
      .optional(),
    teamA: legacyTeamSchema.optional(),
    teamB: legacyTeamSchema.optional(),
    winner: z.object({ id: z.string(), name: z.string().optional() }).optional(),
    reporter: z.object({ id: z.string(), displayName: z.string() }).optional(),
    finalizer: z.object({ id: z.string(), displayName: z.string() }).optional(),
    participations: z
      .array(
        z.object({
          id: z.string(),
          matchId: z.string(),
          playerId: z.string(),
          teamSide: matchTeamSideSchema,
          player: z.object({ id: z.string(), displayName: z.string() }).optional(),
        })
      )
      .optional(),
    confirmations: z.array(matchConfirmationSchema).optional(),

    // New entry-based fields (optional for backward compatibility)
    sides: z.array(matchSideModelSchema).optional(),
    result: matchResultModelSchema.optional(),
  })
  .meta({ id: "MatchModel" });

export type MatchModel = z.infer<typeof matchModelSchema>;

export const matchModelListSchema = z.array(matchModelSchema);

export const matchParticipationSchema = z
  .object({
    id: z.string(),
    matchId: z.string(),
    playerId: z.string(),
    teamSide: matchTeamSideSchema,
  })
  .meta({ id: "MatchParticipation" });

export type MatchParticipation = z.infer<typeof matchParticipationSchema>;

export interface MatchSideInput {
  position: number;
  playerIds?: string[];
  teamId?: string;
}

export interface CreateMatchInput {
  tournamentId: string;
  round?: number;
  sides?: MatchSideInput[];
  status?: WritableMatchStatus;
  scoreA?: number | null;
  scoreB?: number | null;
  reportProof?: string;
  outcomeTypeId?: string;
  outcomeReasonId?: string;
  winnerPosition?: number | null;
}

export interface UpdateMatchInput {
  round?: number;
  scoreA?: number | null;
  scoreB?: number | null;
  status?: WritableMatchStatus;
  reportProof?: string;
  outcomeTypeId?: string;
  outcomeReasonId?: string;
  winnerPosition?: number | null;
}

export interface ReportMatchResultInput {
  scoreA: number;
  scoreB: number;
  reportProof?: string;
  winnerPosition?: number | null;
  outcomeTypeId?: string;
  outcomeReasonId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ConfirmMatchInput {
  // Empty - just confirms the match result
}

export interface ContestMatchInput {
  contestationReason?: string;
}

export interface FinalizeMatchInput {
  finalizationReason: MatchFinalizationReason;
}

// ============================================
// Zod schemas for validation
// ============================================

export const matchSideInputSchema = z.object({
  position: z.number().int().min(1).max(2),
  playerIds: z.array(z.string().uuid()).optional(),
  teamId: z.string().uuid().optional(),
});

/**
 * A match has exactly one side A (position 1) and one side B (position 2): every
 * stat, standing and point computation reads those two positions and nothing else.
 */
const matchSidesSchema = z
  .array(matchSideInputSchema)
  .length(2)
  .refine((sides) => sides[0].position !== sides[1].position, {
    message: "Les camps doivent occuper les positions 1 et 2",
  });

/**
 * The only statuses a client may write. Every later status (confirmed, disputed,
 * finalized, cancelled) is reached through its dedicated endpoint, which runs the
 * confirmation, finalization and MMR side effects a raw write would skip.
 */
export const writableMatchStatusSchema = z.enum(["scheduled", "reported"]);
export type WritableMatchStatus = z.infer<typeof writableMatchStatusSchema>;

const winnerPositionSchema = z.number().int().min(1).max(2).nullable().optional();

export const createMatchSchema = z.object({
  tournamentId: z.string().uuid("ID de tournoi invalide"),
  round: z.number().int().min(1).optional(),
  sides: matchSidesSchema.optional(),
  status: writableMatchStatusSchema.optional(),
  scoreA: z.number().int().min(0).nullable().optional(),
  scoreB: z.number().int().min(0).nullable().optional(),
  reportProof: z.string().optional(),
  outcomeTypeId: z.string().uuid("ID de type de résultat invalide").optional(),
  outcomeReasonId: z
    .string()
    .uuid("ID de raison de résultat invalide")
    .optional(),
  winnerPosition: winnerPositionSchema,
  playedAt: z.string().datetime().optional(),
});

export const updateMatchSchema = z.object({
  round: z.number().int().min(1).optional(),
  scoreA: z.number().int().min(0).nullable().optional(),
  scoreB: z.number().int().min(0).nullable().optional(),
  status: writableMatchStatusSchema.optional(),
  reportProof: z.string().optional(),
  playedAt: z.string().datetime(),
  outcomeTypeId: z.string().uuid("ID de type de résultat invalide").optional(),
  outcomeReasonId: z
    .string()
    .uuid("ID de raison de résultat invalide")
    .optional(),
  winnerPosition: winnerPositionSchema,
});

export const reportMatchResultSchema = z.object({
  scoreA: z.number().int().min(0, "Le score doit être positif"),
  scoreB: z.number().int().min(0, "Le score doit être positif"),
  reportProof: z.string().optional(),
  winnerPosition: winnerPositionSchema,
  outcomeTypeId: z.string().uuid("ID de type de résultat invalide").optional(),
  outcomeReasonId: z
    .string()
    .uuid("ID de raison de résultat invalide")
    .optional(),
});

export const confirmMatchSchema = z.object({
  // Empty - just confirms the match result
});

export const contestMatchSchema = z.object({
  contestationReason: z.string().max(500).optional(),
});

export const respondToMatchSchema = z.object({
  type: z.enum(["agree", "dispute"]),
  reason: z.string().max(500).optional(),
});

export type RespondToMatchInput = z.infer<typeof respondToMatchSchema>;

export const finalizeMatchSchema = z.object({
  finalizationReason: matchFinalizationReasonSchema,
});

export const listMatchesQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  status: matchStatusSchema.optional(),
  round: z.number().int().min(1).optional(),
  playerId: z.string().uuid().optional(),
});

/**
 * How long a finalized result stays contestable, in days. The same window keeps the
 * match thread open, so a player can always explain a dispute they may still file.
 */
export const POST_FINALIZATION_DISPUTE_DAYS = 7;

export const MATCH_MESSAGE_MAX_LENGTH = 1000;

export const postMatchMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Le message ne peut pas être vide")
    .max(MATCH_MESSAGE_MAX_LENGTH),
});

export type PostMatchMessageRequestData = z.infer<typeof postMatchMessageSchema>;

/**
 * A `user` message carries plain text in `body`. A `system` message carries an i18n
 * key in `body` plus its interpolation values in `translationParams`, so it renders
 * in the reader's language — same convention as notifications.
 */
export const clientMatchMessageSchema = z
  .object({
    id: z.string(),
    matchId: z.string(),
    kind: z.enum(["user", "system"]),
    body: z.string(),
    translationParams: z
      .record(z.string(), z.union([z.string(), z.number(), z.null()]))
      .nullable(),
    createdAt: z.date(),
    author: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  })
  .meta({ id: "MatchMessage" });

export type ClientMatchMessage = z.infer<typeof clientMatchMessageSchema>;

export const clientMatchMessageListSchema = z.array(clientMatchMessageSchema);

export const validateMatchSchema = z.object({
  tournamentId: z.string().uuid("ID de tournoi invalide"),
  round: z.number().int().min(1).optional(),
  sides: z.array(matchSideInputSchema).min(1).optional(),
  allPlayerIds: z.array(z.string().uuid()).optional(),
  matchId: z.string().uuid("ID de match invalide").optional(),
  playedAt: z.string().datetime().optional(),
});

export type ValidateMatchRequestData = z.infer<typeof validateMatchSchema>;

/**
 * Outcome of the dry run. `valid` false is a normal 200 answer, not a failure: the
 * caller renders `errors` and `warnings` in the match creation form.
 */
export const validateMatchResponseSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    tournament: z
      .object({
        id: z.string(),
        name: z.string(),
        teamMode: z.string(),
        status: z.string(),
      })
      .optional(),
  })
  .meta({ id: "ValidateMatchResponse" });

export type ValidateMatchResponse = z.infer<typeof validateMatchResponseSchema>;

export const autoFinalizeResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    /** Ids of the matches that were finalized. */
    finalized: z.array(z.string()),
    /** Ids of the matches held back because they are contested. */
    disputed: z.array(z.string()),
    total: z.number().int(),
  })
  .meta({ id: "AutoFinalizeResponse" });

// ============================================
// Types inferred from schemas
// ============================================

export type CreateMatchRequestData = z.infer<typeof createMatchSchema>;
export type UpdateMatchRequestData = z.infer<typeof updateMatchSchema>;
export type ReportMatchResultRequestData = z.infer<
  typeof reportMatchResultSchema
>;
export type ConfirmMatchRequestData = z.infer<typeof confirmMatchSchema>;
export type ContestMatchRequestData = z.infer<typeof contestMatchSchema>;
export type FinalizeMatchRequestData = z.infer<typeof finalizeMatchSchema>;
export type RespondToMatchRequestData = z.infer<typeof respondToMatchSchema>;
export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;

export const playerMatchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  tournamentId: z.string().uuid().optional(),
});

export type PlayerMatchHistoryQuery = z.infer<typeof playerMatchHistoryQuerySchema>;

// ============================================
// Types for the frontend (with Date dates instead of string)
// ============================================

/**
 * Type for Match on the frontend side - string dates are automatically
 * converted to Date objects by the xior interceptor
 */
export interface ClientMatch extends Omit<
  Match,
  | "createdAt"
  | "updatedAt"
  | "playedAt"
  | "reportedAt"
  | "confirmationDeadline"
  | "finalizedAt"
> {
  createdAt: Date;
  updatedAt: Date;
  playedAt: Date;
  reportedAt?: Date;
  confirmationDeadline?: Date;
  finalizedAt?: Date;
}

/**
 * Type for MatchModel on the frontend side - string dates are automatically
 * converted to Date objects by the xior interceptor
 */
export interface ClientMatchModel extends Omit<
  MatchModel,
  | "createdAt"
  | "updatedAt"
  | "playedAt"
  | "reportedAt"
  | "confirmationDeadline"
  | "finalizedAt"
  | "confirmations"
  | "result"
> {
  createdAt: Date;
  updatedAt: Date;
  playedAt: Date;
  reportedAt?: Date;
  confirmationDeadline?: Date;
  finalizedAt?: Date;
  confirmations?: ClientMatchConfirmation[];
  result?: {
    matchId: string;
    reportedBy?: string;
    reportedAt?: Date;
    reportProof?: string;
    finalizedBy?: string;
    finalizedAt?: Date;
    finalizationReason?: "consensus" | "auto_validation" | "admin_override";
    reporter?: {
      id: string;
      displayName: string;
    };
    finalizer?: {
      id: string;
      displayName: string;
    };
  };
}

/**
 * Type for MatchConfirmation on the frontend side - string dates are automatically
 * converted to Date objects by the xior interceptor
 */
export interface ClientMatchConfirmation extends Omit<
  MatchConfirmation,
  "createdAt" | "updatedAt"
> {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type for CreateMatchRequestData on the frontend side
 * Dates can be Date objects (will be serialized to strings by JSON.stringify)
 */
export interface ClientCreateMatchRequest extends Omit<
  CreateMatchRequestData,
  "playedAt"
> {
  playedAt?: Date | string;
  sides?: MatchSideInput[];
}

/**
 * Type for UpdateMatchRequestData on the frontend side
 * Dates can be Date objects (will be serialized to strings by JSON.stringify)
 */
export interface ClientUpdateMatchRequest extends Omit<
  UpdateMatchRequestData,
  "playedAt"
> {
  playedAt?: Date | string;
}

/**
 * Type for ValidateMatchRequestData on the frontend side
 * Dates can be Date objects (will be serialized to strings by JSON.stringify)
 */
export interface ClientValidateMatchRequest extends Omit<
  ValidateMatchRequestData,
  "playedAt"
> {
  playedAt?: Date | string;
  sides?: MatchSideInput[];
}

/**
 * Unified match history entry for all tournament modes (ranked, championship, bracket).
 * For ranked matches, mmrDelta is populated. For other modes, it is null.
 * Dates are automatically converted to Date objects by the xior interceptor.
 */
export interface ClientMatchHistoryEntry {
  id: string;
  matchId: string;
  playerId: string;
  tournament: { id: string; name: string; mode: string; scoreEnabled: boolean };
  playedAt: Date;
  status: string;
  scoreA: number | null;
  scoreB: number | null;
  winnerSide: "A" | "B" | null;
  teamSizeA: number;
  teamSizeB: number;
  sides: HistoryMatchSide[];
  mmrDelta: number | null;
  outcomeType?: { id: string; name: string } | null;
}

/**
 * Lean match card type for the unified GET /matches endpoint.
 * Scores and team sizes are derivable from sides (side.score, side.players.length).
 * winnerSide is represented as side.isWinner to avoid redundancy.
 */
export const matchCardSideSchema = z
  .object({
    position: z.number().int(),
    score: z.number().nullable(),
    isWinner: z.boolean(),
    players: z.array(
      z.object({ id: z.string(), displayName: z.string(), shortName: z.string() })
    ),
  })
  .meta({ id: "MatchCardSide" });

export type MatchCardSide = z.infer<typeof matchCardSideSchema>;

export const clientMatchCardSchema = z
  .object({
    id: z.string(),
    playedAt: z.date(),
    status: z.string(),
    tournament: z.object({
      id: z.string(),
      name: z.string(),
      mode: z.string(),
      scoreEnabled: z.boolean(),
    }),
    sides: z.array(matchCardSideSchema),
    outcomeType: z.object({ id: z.string(), name: z.string() }).nullable(),
    playerId: z.string().optional(),
    mmrDelta: z.number().nullish(),
    pointsDelta: z.number().nullish(),
  })
  .meta({ id: "MatchCard" });

export type ClientMatchCard = z.infer<typeof clientMatchCardSchema>;

export const paginatedMatchCardsSchema = z
  .object({
    data: z.array(clientMatchCardSchema),
    total: z.number().int(),
    hasMore: z.boolean(),
  })
  .meta({ id: "PaginatedMatchCards" });

export type PaginatedMatchCards = z.infer<typeof paginatedMatchCardsSchema>;

export interface MatchDetailPlayer {
  id: string;
  displayName: string;
  shortName: string;
  effectivePointsAwarded?: number;
  exceededMatchLimit?: boolean;
  mmrDelta?: number | null;
}

export interface MatchDetailSide {
  position: number;
  score: number | null;
  pointsAwarded: number;
  isWinner: boolean;
  entryId: string;
  entryName: string | null;
  teamId: string | null;
  players: MatchDetailPlayer[];
}

export interface MatchDetailConfirmation {
  id: string;
  matchId: string;
  playerId: string;
  isConfirmed: boolean;
  isContested: boolean;
  contestationReason: string | null;
  sidePosition: number | null;
  isPostFinalization: boolean;
  createdAt: Date;
  updatedAt: Date;
  player: { id: string; displayName: string } | null;
}

export interface ClientMatchDetail {
  id: string;
  tournamentId: string;
  status: MatchStatus;
  playedAt: Date;
  confirmationDeadline?: Date;
  createdAt: Date;
  createdBy?: string;
  creator?: { id: string; displayName: string };
  outcomeTypeId?: string;
  outcomeReasonId?: string | null;
  tournament?: {
    id: string;
    name: string;
    mode: string;
    teamMode: string;
    scoreEnabled: boolean;
    allowDraw: boolean;
    validationMode?: string;
    validationTimerHours?: number | null;
    status: TournamentStatus;
  };
  outcomeType?: { id: string; name: string } | null;
  outcomeReason?: { id: string; name: string } | null;
  confirmations?: MatchDetailConfirmation[];
  sides: MatchDetailSide[];
  result?: {
    reportedBy?: string;
    reportedAt?: Date;
    reportProof?: string;
    finalizedBy?: string;
    finalizedAt?: Date;
    finalizationReason?: MatchFinalizationReason;
    reporter?: { id: string; displayName: string };
  };
}

export const listMatchCardsQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  playerIds: z.string().optional(),
  status: matchStatusSchema.optional(),
  bracketMode: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListMatchCardsQuery = z.infer<typeof listMatchCardsQuerySchema>;
