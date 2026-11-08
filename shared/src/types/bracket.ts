import { z } from "zod";
import {
  type BracketType,
  type SeedingType,
  type BracketRoundType,
  bracketTypeSchema,
  seedingTypeSchema,
  bracketRoundTypeSchema,
} from "./enums";
import { matchSchema } from "./match";
import type { Match, ClientMatchModel } from "./match";
import { tournamentEntryModelSchema } from "./entry";
import type { TournamentEntryModel } from "./entry";

// ============================================
// Base interfaces for brackets
// ============================================

export interface BracketConfig {
  id: string;
  tournamentId: string;
  bracketType: BracketType;
  seedingType: SeedingType;
  sourceTournamentId?: string;
  totalParticipants: number;
  roundsCount: number;
  hasBronzeMatch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BracketRound {
  id: string;
  bracketConfigId: string;
  roundNumber: number;
  /** Server-rendered label; the fallback when `roundNameKey` means nothing to the client. */
  roundName: string;
  /** i18n key the name was rendered from, so the client can re-render it in its own locale. */
  roundNameKey?: string | null;
  translationParams?: Record<string, number> | null;
  bracketType: BracketRoundType;
  matchesCount: number;
  createdAt: string;
}

export interface BracketSeed {
  id: string;
  bracketConfigId: string;
  entryId: string;
  seedNumber: number;
  seedingScore?: number;
  createdAt: string;
  // Relations
  entry?: TournamentEntryModel;
}

export interface BracketMatchMetadata {
  id: string;
  matchId: string;
  bracketRoundId: string;
  matchNumber: number;
  winnerToMatchId?: string;
  loserToMatchId?: string;
  isByeMatch: boolean;
  createdAt: string;
}

export interface BracketMatchWithMetadata {
  match: Match;
  metadata: BracketMatchMetadata;
  round: BracketRound;
}

export interface BracketData {
  config: BracketConfig;
  rounds: BracketRound[];
  seeds: BracketSeed[];
  matches: BracketMatchWithMetadata[];
}

// ============================================
// Types for bracket generation
// ============================================

export interface GenerateBracketInput {
  bracketType: BracketType;
  seedingType: SeedingType;
  sourceTournamentId?: string; // Required if seedingType is 'championship_based'
  hasBronzeMatch?: boolean; // Default: false
}

export interface CanGenerateBracketResponse {
  canGenerate: boolean;
  reason?: string;
  matchCount?: number;
  currentParticipants?: number;
}

// ============================================
// Zod schemas for validation
// ============================================

export const generateBracketSchema = z
  .object({
    bracketType: bracketTypeSchema,
    seedingType: seedingTypeSchema,
    sourceTournamentId: z.uuid().optional(),
    hasBronzeMatch: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      if (data.seedingType === "championship_based" && !data.sourceTournamentId) {
        return false;
      }
      return true;
    },
    {
      message: "sourceTournamentId is required for championship-based seeding",
      path: ["sourceTournamentId"],
    }
  );

export const bracketConfigSchema = z.object({
  // Field list mirrors BracketConfig above; kept as a plain object because it is
  // also used to validate stored bracket payloads.
  id: z.uuid(),
  tournamentId: z.uuid(),
  bracketType: bracketTypeSchema,
  seedingType: seedingTypeSchema,
  sourceTournamentId: z.uuid().optional(),
  totalParticipants: z.number().int().positive(),
  roundsCount: z.number().int().positive(),
  hasBronzeMatch: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const bracketRoundSchema = z.object({
  id: z.uuid(),
  bracketConfigId: z.uuid(),
  roundNumber: z.number().int().min(0),
  roundName: z.string().min(1),
  roundNameKey: z.string().nullish(),
  translationParams: z.record(z.string(), z.number()).nullish(),
  bracketType: bracketRoundTypeSchema,
  matchesCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});

export const bracketSeedSchema = z.object({
  id: z.uuid(),
  bracketConfigId: z.uuid(),
  entryId: z.uuid(),
  seedNumber: z.number().int().positive(),
  seedingScore: z.number().int().optional(),
  createdAt: z.iso.datetime(),
});

export const bracketMatchMetadataSchema = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  bracketRoundId: z.uuid(),
  matchNumber: z.number().int().min(0),
  winnerToMatchId: z.uuid().optional(),
  loserToMatchId: z.uuid().optional(),
  isByeMatch: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const canGenerateBracketResponseSchema = z
  .object({
    canGenerate: z.boolean(),
    reason: z.string().optional(),
    matchCount: z.number().int().optional(),
    currentParticipants: z.number().int().optional(),
  })
  .meta({ id: "CanGenerateBracketResponse" });

// ============================================
// Composite bracket payload
// ============================================

export const bracketSeedWithEntrySchema = bracketSeedSchema
  .extend({ entry: tournamentEntryModelSchema.optional() })
  .meta({ id: "BracketSeed" });

export const bracketMatchWithMetadataSchema = z
  .object({
    match: matchSchema,
    metadata: bracketMatchMetadataSchema,
    round: bracketRoundSchema,
  })
  .meta({ id: "BracketMatchWithMetadata" });

/** Everything GET /tournaments/:id/bracket returns, in one payload. */
export const bracketDataSchema = z
  .object({
    config: bracketConfigSchema,
    rounds: z.array(bracketRoundSchema),
    seeds: z.array(bracketSeedWithEntrySchema),
    matches: z.array(bracketMatchWithMetadataSchema),
  })
  .meta({ id: "BracketData" });

// ============================================
// Types inferred from schemas
// ============================================

export type GenerateBracketRequestData = z.infer<typeof generateBracketSchema>;
export type CanGenerateBracketResponseData = z.infer<typeof canGenerateBracketResponseSchema>;

// ============================================
// Types for the frontend (with Date dates)
// ============================================

/**
 * Type for BracketConfig on the frontend side - dates converted to Date by xior
 */
export interface ClientBracketConfig extends Omit<BracketConfig, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type for BracketRound on the frontend side
 */
export interface ClientBracketRound extends Omit<BracketRound, 'createdAt'> {
  createdAt: Date;
}

/**
 * Type for BracketSeed on the frontend side
 */
export interface ClientBracketSeed extends Omit<BracketSeed, 'createdAt'> {
  createdAt: Date;
}

/**
 * Type for BracketMatchMetadata on the frontend side
 */
export interface ClientBracketMatchMetadata extends Omit<BracketMatchMetadata, 'createdAt'> {
  createdAt: Date;
}

/**
 * Type for BracketMatchWithMetadata on the frontend side
 */
export interface ClientBracketMatchWithMetadata {
  match: ClientMatchModel;
  metadata: ClientBracketMatchMetadata;
  round: ClientBracketRound;
}

/**
 * Type for BracketData on the frontend side
 */
export interface ClientBracketData {
  config: ClientBracketConfig;
  rounds: ClientBracketRound[];
  seeds: ClientBracketSeed[];
  matches: ClientBracketMatchWithMetadata[];
}
