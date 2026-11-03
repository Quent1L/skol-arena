import { z } from "zod";
import { vmsg } from "./validation-messages";

// ============================================
// Types and interfaces for disciplines
// ============================================

export type TeamInteractionMode = 'INDIVIDUAL' | 'SHARED_RESOURCE' | 'COLLABORATIVE';

export const TEAM_INTERACTION_MODES = ['INDIVIDUAL', 'SHARED_RESOURCE', 'COLLABORATIVE'] as const;

// `.meta({ id })` names the schema in the generated OpenAPI document, so an entity
// reused across endpoints is described once under components.schemas instead of
// being inlined at each of them. Ids must stay unique across the shared package.
export const disciplineSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullish(),
    scoreInstructions: z.string().nullish(),
    teamInteractionMode: z.enum(TEAM_INTERACTION_MODES).nullish(),
    /** Set once archived: hidden from the selectors, still readable on past results. */
    archivedAt: z.iso.datetime().nullish(),
  })
  .meta({ id: "Discipline" });

export type Discipline = z.infer<typeof disciplineSchema>;

export const disciplineListSchema = z.array(disciplineSchema);

/**
 * What a permanent deletion would destroy. Returned in the 409 details so the
 * admin sees why archiving is the way out, rather than a bare refusal.
 */
export const deletionBlockerSchema = z
  .object({
    resource: z.string(),
    count: z.number().int(),
  })
  .meta({ id: "DeletionBlocker" });

export type DeletionBlocker = z.infer<typeof deletionBlockerSchema>;

/** Option list served by GET /disciplines/interaction-modes, labels already translated. */
export const teamInteractionModeOptionSchema = z
  .object({
    value: z.enum(TEAM_INTERACTION_MODES),
    label: z.string(),
  })
  .meta({ id: "TeamInteractionModeOption" });

export type TeamInteractionModeOption = z.infer<typeof teamInteractionModeOptionSchema>;

export interface CreateDisciplineInput {
  name: string;
  icon?: string | null;
  scoreInstructions?: string | null;
  teamInteractionMode?: TeamInteractionMode | null;
}

export interface UpdateDisciplineInput {
  name?: string;
  icon?: string | null;
  scoreInstructions?: string | null;
  teamInteractionMode?: TeamInteractionMode | null;
}

// ============================================
// Zod schemas for validation
// ============================================

export const createDisciplineSchema = z.object({
  name: z
    .string(vmsg("validation.nameRequired"))
    .min(1, vmsg("validation.nameNotEmpty"))
    .max(100, vmsg("validation.nameMax100")),
  icon: z.string().nullish(),
  scoreInstructions: z.string().max(500).nullish(),
  teamInteractionMode: z.enum(TEAM_INTERACTION_MODES).nullish(),
});

export const updateDisciplineSchema = z.object({
  name: z
    .string()
    .min(1, vmsg("validation.nameNotEmpty"))
    .max(100, vmsg("validation.nameMax100"))
    .optional(),
  icon: z.string().nullish(),
  scoreInstructions: z.string().max(500).nullish(),
  teamInteractionMode: z.enum(TEAM_INTERACTION_MODES).nullish(),
});

// ============================================
// Types inferred from schemas
// ============================================

export type CreateDisciplineRequestData = z.infer<
  typeof createDisciplineSchema
>;
export type UpdateDisciplineRequestData = z.infer<
  typeof updateDisciplineSchema
>;


