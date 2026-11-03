import { z } from "zod";
import { vmsg } from "./validation-messages";

// ============================================
// Types and interfaces for game rules
// ============================================

// Timestamps are strings: this describes the wire shape, where c.json() has already
// serialised the Date instances the service works with. ClientGameRule below is the
// same payload after the frontend interceptor has revived them.
export const gameRuleSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    createdBy: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "GameRule" });

export type GameRule = z.infer<typeof gameRuleSchema>;

export const gameRuleListSchema = z.array(gameRuleSchema);

export interface ClientGameRule extends Omit<GameRule, "createdAt" | "updatedAt"> {
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Zod schemas
// ============================================

export const createGameRuleSchema = z.object({
  title: z
    .string(vmsg("validation.titleRequired"))
    .min(2, vmsg("validation.titleMin2"))
    .max(200, vmsg("validation.titleMax200")),
  content: z.string(vmsg("validation.contentRequired")).min(1, vmsg("validation.contentRequired")),
});

export const updateGameRuleSchema = z.object({
  title: z
    .string()
    .min(2, vmsg("validation.titleMin2"))
    .max(200, vmsg("validation.titleMax200"))
    .optional(),
  content: z.string().min(1, vmsg("validation.contentRequired")).optional(),
});

// ============================================
// Inferred types
// ============================================

export type CreateGameRuleData = z.infer<typeof createGameRuleSchema>;
export type UpdateGameRuleData = z.infer<typeof updateGameRuleSchema>;
