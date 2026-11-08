import { z } from "zod";
import { validate } from "../../api/validator";
import { describe } from "../../api/describe";
import { createAppHono } from "../../types/hono";
import { requireAuth } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/require-role";
import { organizationService } from "../../services/organization.service";
import {
  organizationSchema,
  organizationWithMemberCountSchema,
  organizationMemberWithUserSchema,
  mutationResultSchema,
} from "@skol-arena/shared/types/index";

const adminOrganizations = createAppHono();

const TAGS = ["Admin — organizations"];

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100),
});

const addMemberSchema = z.object({ userId: z.uuid() });
const renameOrganizationSchema = z.object({ name: z.string().min(1).max(100) });

adminOrganizations.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "List organizations",
    auth: true,
    role: true,
    success: {
      description: "Every organization with its member count",
      schema: z.array(organizationWithMemberCountSchema),
    },
  }),
  async (c) => {
    const orgs = await organizationService.getAllOrganizations();
    return c.json(orgs);
  }
);

adminOrganizations.post(
  "/",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Create an organization",
    auth: true,
    role: true,
    conflict: true,
    success: { status: 201, description: "Organization created", schema: organizationSchema },
  }),
  validate("json", createOrganizationSchema),
  async (c) => {
    const appUserId = c.get("appUserId");
    const { name } = c.req.valid("json");
    const org = await organizationService.createOrganization(name, appUserId);
    return c.json(org, 201);
  }
);

adminOrganizations.get(
  "/:id/members",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "List an organization's members",
    auth: true,
    role: true,
    notFound: true,
    success: {
      description: "Members with their user profile",
      schema: z.array(organizationMemberWithUserSchema),
    },
  }),
  async (c) => {
    const members = await organizationService.getMembers(c.req.param("id"));
    return c.json(members);
  }
);

adminOrganizations.post(
  "/:id/members",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Add a member to an organization",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { status: 201, description: "Member added", schema: mutationResultSchema },
  }),
  validate("json", addMemberSchema),
  async (c) => {
    const { userId } = c.req.valid("json");
    await organizationService.addMemberDirect(c.req.param("id"), userId);
    return c.json({ success: true }, 201);
  },
);

adminOrganizations.delete(
  "/:id/members/:userId",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Remove a member from an organization",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Removal outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    await organizationService.removeMember(c.req.param("id"), c.req.param("userId"));
    return c.json({ success: true });
  }
);

adminOrganizations.patch(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Rename an organization",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The renamed organization", schema: organizationSchema },
  }),
  validate("json", renameOrganizationSchema),
  async (c) => {
    const { name } = c.req.valid("json");
    const updated = await organizationService.renameOrganization(c.req.param("id"), name);
    return c.json(updated);
  },
);

export default adminOrganizations;
