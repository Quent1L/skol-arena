import { z } from "zod";
import { vmsg } from "./validation-messages";
import { validationModeSchema } from "./enums";

// ============================================
// Base schema shared between tournaments and ranked seasons
// ============================================
// A ranked season is a tournament (mode='ranked') with an additional MMR config.
// These two entities share the same "general information" and "score constraints"
// field block. This schema factors out these common fields (form side,
// hence with Date objects rather than ISO strings).

export const baseSeasonFormSchema = z.object({
  name: z
    .string(vmsg("validation.nameRequired"))
    .min(3, vmsg("validation.nameMin3"))
    .max(100, vmsg("validation.nameMax100")),
  description: z.string().optional(),
  disciplineId: z
    .string(vmsg("validation.disciplineRequired"))
    .uuid(vmsg("validation.invalidDisciplineId")),
  startDate: z.date(vmsg("validation.startDateRequired")),
  endDate: z.date(vmsg("validation.endDateRequired")),
  minTeamSize: z
    .number(vmsg("validation.minTeamSizeRequired"))
    .int()
    .min(1, vmsg("validation.teamSizeMin1")),
  maxTeamSize: z
    .number(vmsg("validation.maxTeamSizeRequired"))
    .int()
    .min(1, vmsg("validation.teamSizeMin1")),
  rulesId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  scoreEnabled: z.boolean().optional(),
  minScore: z.number().int().min(0).nullable().optional(),
  maxScore: z.number().int().min(0).nullable().optional(),
  allowDraw: z.boolean().optional(),
  validationMode: validationModeSchema.optional(),
  validationTimerHours: z.number().int().min(1).max(168).nullable().optional(),
});

export const baseSeasonUpdateFormSchema = baseSeasonFormSchema.partial();

export type BaseSeasonFormData = z.infer<typeof baseSeasonFormSchema>;
export type BaseSeasonUpdateFormData = z.infer<
  typeof baseSeasonUpdateFormSchema
>;

// ============================================
// Shared predicates for cross-field validation
// ============================================
// Used via `.refine(predicate, options)` in derived schemas.
// We expose the predicates rather than schema wrappers to avoid
// ZodEffects typing complications.

export const dateRangePredicate = (data: {
  startDate?: Date | string;
  endDate?: Date | string;
}): boolean => {
  if (!data.startDate || !data.endDate) return true;
  const start =
    data.startDate instanceof Date ? data.startDate : new Date(data.startDate);
  const end =
    data.endDate instanceof Date ? data.endDate : new Date(data.endDate);
  return start < end;
};

export const dateRangeError = {
  ...vmsg("validation.startBeforeEnd"),
  path: ["endDate"],
};

export const teamSizePredicate = (data: {
  minTeamSize?: number;
  maxTeamSize?: number;
}): boolean => {
  if (!data.minTeamSize || !data.maxTeamSize) return true;
  return data.maxTeamSize >= data.minTeamSize;
};

export const teamSizeError = {
  ...vmsg("validation.maxTeamSizeGteMin"),
  path: ["maxTeamSize"],
};

export const scoreRangePredicate = (data: {
  scoreEnabled?: boolean;
  minScore?: number | null;
  maxScore?: number | null;
}): boolean => {
  if (data.scoreEnabled === false) return true;
  if (data.minScore != null && data.maxScore != null)
    return data.minScore <= data.maxScore;
  return true;
};

export const scoreRangeError = {
  ...vmsg("validation.minScoreLteMax"),
  path: ["maxScore"],
};
