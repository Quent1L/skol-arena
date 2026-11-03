import { z } from "zod";
import { vmsg } from "./validation-messages";
import { disciplineSchema } from "./discipline";

// ============================================
// Types and interfaces for outcome types
// ============================================

export const outcomeTypeSchema = z
  .object({
    id: z.string(),
    disciplineId: z.string(),
    name: z.string(),
    isDefault: z.boolean(),
    scoreCountsForMmr: z.boolean(),
    points: z.number(),
    mmrMultiplier: z.number(),
    discipline: disciplineSchema.nullish(),
    /** Set once archived: no longer selectable at match entry, still resolvable. */
    archivedAt: z.iso.datetime().nullish(),
  })
  .meta({ id: "OutcomeType" });

export type OutcomeType = z.infer<typeof outcomeTypeSchema>;

export const outcomeTypeListSchema = z.array(outcomeTypeSchema);

export const victoryQualityDetailSchema = z
  .object({
    outcomeTypeName: z.string(),
    points: z.number(),
    wins: z.number(),
    losses: z.number(),
    contribution: z.number(),
  })
  .meta({ id: "VictoryQualityDetail" });

export type VictoryQualityDetail = z.infer<typeof victoryQualityDetailSchema>;

export interface CreateOutcomeTypeInput {
  disciplineId: string;
  name: string;
  isDefault?: boolean;
  scoreCountsForMmr?: boolean;
  points?: number;
  mmrMultiplier?: number;
}

export interface UpdateOutcomeTypeInput {
  disciplineId?: string;
  name?: string;
  isDefault?: boolean;
  scoreCountsForMmr?: boolean;
  points?: number;
  mmrMultiplier?: number;
}

// ============================================
// Zod schemas for validation
// ============================================

export const createOutcomeTypeSchema = z.object({
  disciplineId: z.string().uuid(vmsg("validation.invalidDisciplineId")),
  name: z
    .string(vmsg("validation.nameRequired"))
    .min(1, vmsg("validation.nameNotEmpty"))
    .max(100, vmsg("validation.nameMax100")),
  isDefault: z.boolean().optional(),
  scoreCountsForMmr: z.boolean().optional(),
  points: z.number().int().min(0).default(3),
  mmrMultiplier: z.number().positive().default(1),
});

export const updateOutcomeTypeSchema = z.object({
  disciplineId: z.string().uuid(vmsg("validation.invalidDisciplineId")).optional(),
  name: z
    .string()
    .min(1, vmsg("validation.nameNotEmpty"))
    .max(100, vmsg("validation.nameMax100"))
    .optional(),
  isDefault: z.boolean().optional(),
  scoreCountsForMmr: z.boolean().optional(),
  points: z.number().int().min(0).optional(),
  mmrMultiplier: z.number().positive().optional(),
});

// ============================================
// Types inferred from schemas
// ============================================

export type CreateOutcomeTypeRequestData = z.infer<
  typeof createOutcomeTypeSchema
>;
export type UpdateOutcomeTypeRequestData = z.infer<
  typeof updateOutcomeTypeSchema
>;


