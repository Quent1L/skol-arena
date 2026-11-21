import { z } from "zod";
import { vmsg } from "../types/validation-messages";

/**
 * Lowercase words or digits joined by dashes: the generated passphrases
 * (`frost-otter-ridge-plume`) as well as custom codes (`club2026`, `summer-league`).
 */
export const INVITATION_CODE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const invitationCodeValue = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, vmsg("validation.invalidCodeFormat"))
  .max(64, vmsg("validation.invalidCodeFormat"))
  .regex(INVITATION_CODE_REGEX, vmsg("validation.invalidCodeFormat"));

export const generateInvitationCodeSchema = z.object({
  /** Custom code; a passphrase is generated when omitted. */
  code: invitationCodeValue.optional(),
  /** null = unlimited uses. */
  maxUses: z.number().int().min(1).nullable().optional().default(1),
  expiresInDays: z.number().int().min(1).optional(),
  notes: z.string().max(500).optional(),
  organizationId: z.uuid().optional(),
});

export const validateInvitationCodeSchema = z.object({ code: invitationCodeValue });

export const consumeInvitationCodeSchema = z.object({ code: invitationCodeValue });

export type GenerateInvitationCodeInput = z.infer<typeof generateInvitationCodeSchema>;
export type ValidateInvitationCodeInput = z.infer<typeof validateInvitationCodeSchema>;
export type ConsumeInvitationCodeInput = z.infer<typeof consumeInvitationCodeSchema>;

// ============================================
// Response shapes
// ============================================

export const invitationCodeSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    createdBy: z.string(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    /** null = unlimited uses. */
    maxUses: z.number().int().nullable(),
    usedCount: z.number().int(),
    isActive: z.boolean(),
    notes: z.string().nullable(),
    organizationId: z.string().nullable(),
  })
  .meta({ id: "InvitationCode" });

export type InvitationCode = z.infer<typeof invitationCodeSchema>;

export const invitationCodeListSchema = z.array(invitationCodeSchema);

/**
 * Answer to a pre-flight check on a code. Only ever returned when the code is
 * usable — an unusable one fails with the error that says why, so `valid` is
 * always true here and exists to keep the payload self-describing.
 */
export const invitationValidationSchema = z
  .object({
    valid: z.boolean(),
    /** null = unlimited uses. */
    remainingUses: z.number().int().nullable(),
    organizationId: z.string().optional(),
    organizationName: z.string().optional(),
  })
  .meta({ id: "InvitationValidation" });

export type InvitationValidation = z.infer<typeof invitationValidationSchema>;

export const invitationConsumptionSchema = z
  .object({
    success: z.boolean(),
    appUserId: z.string(),
  })
  .meta({ id: "InvitationConsumption" });

export type InvitationConsumption = z.infer<typeof invitationConsumptionSchema>;

export const organizationJoinSchema = z.object({ organizationName: z.string() }).meta({ id: "OrganizationJoin" });

export type OrganizationJoin = z.infer<typeof organizationJoinSchema>;
