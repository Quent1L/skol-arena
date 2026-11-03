import { z } from "zod";
import { vmsg } from "./validation-messages";

// ============================================
// Types and interfaces for outcome reasons
// ============================================

export const outcomeReasonSchema = z
  .object({
    id: z.string(),
    outcomeTypeId: z.string(),
    name: z.string(),
    outcomeType: z
      .object({
        id: z.string(),
        disciplineId: z.string(),
        name: z.string(),
        discipline: z.object({ id: z.string(), name: z.string() }).optional(),
      })
      .optional(),
  })
  .meta({ id: "OutcomeReason" });

export type OutcomeReason = z.infer<typeof outcomeReasonSchema>;

export const outcomeReasonListSchema = z.array(outcomeReasonSchema);

export interface CreateOutcomeReasonInput {
  outcomeTypeId: string;
  name: string;
}

export interface UpdateOutcomeReasonInput {
  outcomeTypeId?: string;
  name?: string;
}

// ============================================
// Zod schemas for validation
// ============================================

export const createOutcomeReasonSchema = z.object({
  outcomeTypeId: z.string().uuid(vmsg("validation.invalidOutcomeTypeId")),
  name: z
    .string(vmsg("validation.nameRequired"))
    .min(1, vmsg("validation.nameNotEmpty"))
    .max(100, vmsg("validation.nameMax100")),
});

export const updateOutcomeReasonSchema = z.object({
  outcomeTypeId: z.string().uuid(vmsg("validation.invalidOutcomeTypeId")).optional(),
  name: z
    .string()
    .min(1, vmsg("validation.nameNotEmpty"))
    .max(100, vmsg("validation.nameMax100"))
    .optional(),
});

// ============================================
// Types inferred from schemas
// ============================================

export type CreateOutcomeReasonRequestData = z.infer<
  typeof createOutcomeReasonSchema
>;
export type UpdateOutcomeReasonRequestData = z.infer<
  typeof updateOutcomeReasonSchema
>;


