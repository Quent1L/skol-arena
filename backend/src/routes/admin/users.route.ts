import { validate } from "../../api/validator";
import { describe, type DescribeOptions } from "../../api/describe";
import { createAppHono } from "../../types/hono";
import { requireAuth } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/require-role";
import { userService } from "../../services/user.service";
import {
  adminAddOrganizationSchema,
  adminArchiveUserSchema,
  adminRestoreUserSchema,
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  adminUserDetailSchema,
  adminUserListResponseSchema,
  adminUserStatsSchema,
  mutationResultSchema,
} from "@skol-arena/shared";

const adminUsers = createAppHono();

const TAGS = ["Admin — users"];

adminUsers.use("*", requireAuth, requireSuperAdmin);

/**
 * Every route in this file sits behind requireAuth + requireSuperAdmin, so the tag
 * and both guard responses are the same on all of them.
 */
const adminRoute = (options: Omit<DescribeOptions, "tags" | "auth" | "role">) =>
  describe({ ...options, tags: TAGS, auth: true, role: true });

adminUsers.get(
  "/",
  adminRoute({
    summary: "List users",
    success: {
      description: "A page of users plus the total matching the filters",
      schema: adminUserListResponseSchema,
    },
  }),
  validate("query", adminUserListQuerySchema),
  async (c) => {
    const filters = c.req.valid("query");
    return c.json(await userService.listUsersAdmin(filters));
  },
);

// Registered before /:id so the static segment wins.
adminUsers.get(
  "/stats",
  adminRoute({
    summary: "Get user statistics",
    success: { description: "Population counts across the instance", schema: adminUserStatsSchema },
  }),
  async (c) => {
    return c.json(await userService.getAdminStats());
  },
);

adminUsers.get(
  "/:id",
  adminRoute({
    summary: "Get a user",
    notFound: true,
    success: { description: "The user with their organizations", schema: adminUserDetailSchema },
  }),
  async (c) => {
    return c.json(await userService.getUserAdminDetail(c.req.param("id")));
  },
);

adminUsers.patch(
  "/:id",
  adminRoute({
    summary: "Update a user",
    notFound: true,
    conflict: true,
    success: { description: "The updated user", schema: adminUserDetailSchema },
  }),
  validate("json", adminUpdateUserSchema),
  async (c) => {
    const actorId = c.get("appUserId");
    const updated = await userService.adminUpdateUser(actorId, c.req.param("id"), c.req.valid("json"));
    return c.json(updated);
  },
);

adminUsers.post(
  "/:id/reset-password",
  adminRoute({
    summary: "Send a password reset email",
    notFound: true,
    success: { description: "The email was queued", schema: mutationResultSchema },
  }),
  async (c) => {
    await userService.sendPasswordReset(c.req.param("id"));
    return c.json({ success: true });
  },
);

adminUsers.post(
  "/:id/deactivate",
  adminRoute({
    summary: "Deactivate a user",
    notFound: true,
    success: { description: "The deactivated user", schema: adminUserDetailSchema },
  }),
  async (c) => {
    const actorId = c.get("appUserId");
    return c.json(await userService.deactivateUser(actorId, c.req.param("id")));
  },
);

adminUsers.post(
  "/:id/reactivate",
  adminRoute({
    summary: "Reactivate a user",
    notFound: true,
    success: { description: "The reactivated user", schema: adminUserDetailSchema },
  }),
  async (c) => {
    return c.json(await userService.reactivateUser(c.req.param("id")));
  },
);

adminUsers.post(
  "/:id/archive",
  adminRoute({
    summary: "Archive a user",
    description:
      "Destroys the sign-in identity and anonymises the name, keeping the row so " +
      "matches, standings and MMR history stay intact.",
    notFound: true,
    success: { description: "The archived user", schema: adminUserDetailSchema },
  }),
  validate("json", adminArchiveUserSchema),
  async (c) => {
    const actorId = c.get("appUserId");
    return c.json(await userService.archiveUser(actorId, c.req.param("id"), c.req.valid("json")));
  },
);

adminUsers.post(
  "/:id/restore",
  adminRoute({
    summary: "Restore an archived user",
    description:
      "Moves the sign-in identity of sourceUserId onto this archived profile, so a " +
      "returning player recovers their history.",
    notFound: true,
    conflict: true,
    success: { description: "The restored user", schema: adminUserDetailSchema },
  }),
  validate("json", adminRestoreUserSchema),
  async (c) => {
    const actorId = c.get("appUserId");
    return c.json(await userService.restoreArchivedUser(actorId, c.req.param("id"), c.req.valid("json")));
  },
);

adminUsers.delete(
  "/:id",
  adminRoute({
    summary: "Delete a user permanently",
    description: "Refused while any record still references the user.",
    notFound: true,
    conflict: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const actorId = c.get("appUserId");
    await userService.deleteUserPermanently(actorId, c.req.param("id"));
    return c.json({ success: true });
  },
);

adminUsers.post(
  "/:id/organizations",
  adminRoute({
    summary: "Add a user to an organization",
    notFound: true,
    conflict: true,
    success: { status: 201, description: "Membership created", schema: mutationResultSchema },
  }),
  validate("json", adminAddOrganizationSchema),
  async (c) => {
    const { organizationId } = c.req.valid("json");
    await userService.addUserToOrganization(c.req.param("id"), organizationId);
    return c.json({ success: true }, 201);
  },
);

adminUsers.delete(
  "/:id/organizations/:orgId",
  adminRoute({
    summary: "Remove a user from an organization",
    notFound: true,
    success: { description: "Removal outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    await userService.removeUserFromOrganization(c.req.param("id"), c.req.param("orgId"));
    return c.json({ success: true });
  },
);

export default adminUsers;
