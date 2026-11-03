import { z } from "zod";
import { vmsg } from "./validation-messages";
import { userRoleEnum, userRoleSchema } from "./enums";
import { displayNameRegex } from "../schemas/user.schema";

// ============================================
// Admin user management (super_admin only)
// ============================================

// Timestamps are z.date() rather than z.iso.datetime(): these payloads are consumed
// after the frontend interceptor has revived them, so Date is the type callers see.
// The OpenAPI document still describes them as string/date-time, which is what goes
// over the wire.
export const adminUserListItemSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    email: z.string().nullable(),
    emailVerified: z.boolean(),
    role: z.enum(userRoleEnum),
    createdAt: z.date(),
    lastLoginAt: z.date().nullable(),
    deactivatedAt: z.date().nullable(),
    /**
     * Set when the Better Auth identity was destroyed and the name anonymised.
     * The row is kept so matches, standings and MMR history stay intact.
     */
    archivedAt: z.date().nullable(),
    matchCount: z.number().int(),
    tournamentCount: z.number().int(),
    /**
     * providerId of the `account` rows: "credential" (native password) and/or
     * "keycloak" (SSO). Both can coexist since Better Auth links accounts sharing
     * the same email. Empty for accounts created outside Better Auth (seeds).
     */
    authProviders: z.array(z.string()),
  })
  .meta({ id: "AdminUserListItem" });

export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;

export const adminUserOrganizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.enum(["owner", "member"]),
    joinedAt: z.date(),
  })
  .meta({ id: "AdminUserOrganization" });

export type AdminUserOrganization = z.infer<typeof adminUserOrganizationSchema>;

export const adminUserDetailSchema = adminUserListItemSchema
  .extend({ organizations: z.array(adminUserOrganizationSchema) })
  .meta({ id: "AdminUserDetail" });

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const adminUserListResponseSchema = z
  .object({
    data: z.array(adminUserListItemSchema),
    total: z.number().int(),
  })
  .meta({ id: "AdminUserListResponse" });

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

export const adminUserStatsSchema = z
  .object({
    total: z.number().int(),
    activeLast7Days: z.number().int(),
    activeLast30Days: z.number().int(),
    newThisMonth: z.number().int(),
    deactivated: z.number().int(),
    archived: z.number().int(),
    byRole: z.record(z.enum(userRoleEnum), z.number().int()),
  })
  .meta({ id: "AdminUserStats" });

export type AdminUserStats = z.infer<typeof adminUserStatsSchema>;

/** Tables whose restrict FK blocks a permanent deletion. */
export const adminUserDeletionBlockerSchema = z
  .object({
    resource: z.string(),
    count: z.number().int(),
  })
  .meta({ id: "AdminUserDeletionBlocker" });

export type AdminUserDeletionBlocker = z.infer<typeof adminUserDeletionBlockerSchema>;

export const adminUserStatusEnum = ["active", "deactivated"] as const;
export type AdminUserStatus = (typeof adminUserStatusEnum)[number];

export const adminUserSortEnum = [
  "displayName",
  "role",
  "createdAt",
  "lastLoginAt",
] as const;
export type AdminUserSort = (typeof adminUserSortEnum)[number];

export const adminUserListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  status: z.enum(adminUserStatusEnum).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(adminUserSortEnum).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUpdateUserSchema = z
  .object({
    displayName: z.string().trim().min(3).max(50).regex(displayNameRegex).optional(),
    shortName: z
      .string()
      .trim()
      .min(3)
      .max(8)
      .regex(displayNameRegex)
      .transform((v) => v.toUpperCase())
      .optional(),
    role: z.enum(userRoleEnum).optional(),
    email: z.email().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    ...vmsg("validation.atLeastOneField"),
  });

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

/** Both optional: the backend falls back to a generated "Archive N" label. */
export const adminArchiveUserSchema = z.object({
  displayName: z.string().trim().min(3).max(50).regex(displayNameRegex).optional(),
  shortName: z
    .string()
    .trim()
    .min(3)
    .max(8)
    .regex(displayNameRegex)
    .transform((v) => v.toUpperCase())
    .optional(),
});

export type AdminArchiveUserInput = z.infer<typeof adminArchiveUserSchema>;

/**
 * Moves the sign-in identity of `sourceUserId` onto an archived profile, so a
 * returning player recovers their history. The source account must hold no data
 * of its own, otherwise two histories would have to be merged.
 */
export const adminRestoreUserSchema = z.object({
  sourceUserId: z.uuid(),
});

export type AdminRestoreUserInput = z.infer<typeof adminRestoreUserSchema>;

export const adminAddOrganizationSchema = z.object({
  organizationId: z.uuid(),
});

export type AdminAddOrganizationInput = z.infer<typeof adminAddOrganizationSchema>;
