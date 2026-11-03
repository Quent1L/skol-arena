import { z } from "zod";
import { victoryQualityDetailSchema } from "./outcome-type";

// ============================================
// Types and interfaces for standings
// ============================================

export const headToHeadRecordSchema = z
  .object({
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
  })
  .meta({ id: "HeadToHeadRecord" });

export type HeadToHeadRecord = z.infer<typeof headToHeadRecordSchema>;

export const standingsEntrySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    shortName: z.string(),
    points: z.number(),
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
    scored: z.number(),
    conceded: z.number(),
    scoreDiff: z.number(),
    matchesPlayed: z.number(),
    // Tiebreaker fields
    winLossRatio: z.number(),
    buchholzScore: z.number(),
    victoryQuality: z.number(),
    victoryQualityBreakdown: z.array(victoryQualityDetailSchema),
    winRate: z.number(),
    /** Keyed by opponent id. */
    headToHead: z.record(z.string(), headToHeadRecordSchema),
    /**
     * The player left the competition. Their row keeps every number it earned but is
     * listed after the active ones and takes no rank.
     */
    inactive: z.boolean().optional(),
  })
  .meta({ id: "StandingsEntry" });

export type StandingsEntry = z.infer<typeof standingsEntrySchema>;

export const standingsResultSchema = z
  .object({ standings: z.array(standingsEntrySchema) })
  .meta({ id: "StandingsResult" });

export type StandingsResult = z.infer<typeof standingsResultSchema>;
