import { z } from "zod";

export const organizationRoleEnum = ["owner", "member"] as const;
export type OrganizationRole = (typeof organizationRoleEnum)[number];

export const organizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdBy: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Organization" });

export type Organization = z.infer<typeof organizationSchema>;

export const organizationMemberSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    userId: z.string(),
    role: z.enum(organizationRoleEnum),
    joinedAt: z.iso.datetime(),
  })
  .meta({ id: "OrganizationMember" });

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const organizationWithMemberCountSchema = organizationSchema
  .extend({ memberCount: z.number().int() })
  .meta({ id: "OrganizationWithMemberCount" });

export type OrganizationWithMemberCount = z.infer<typeof organizationWithMemberCountSchema>;

export const organizationMemberWithUserSchema = organizationMemberSchema
  .extend({
    user: z.object({
      id: z.string(),
      displayName: z.string(),
      shortName: z.string(),
      role: z.string(),
    }),
  })
  .meta({ id: "OrganizationMemberWithUser" });

export type OrganizationMemberWithUser = z.infer<typeof organizationMemberWithUserSchema>;
