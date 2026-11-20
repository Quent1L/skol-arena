import { validate } from "../../api/validator";
import { describe } from "../../api/describe";
import { createAppHono } from "../../types/hono";
import { requireAuth } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/require-role";
import { invitationService } from "../../services/invitation.service";
import {
  generateInvitationCodeSchema,
  invitationCodeSchema,
  invitationCodeListSchema,
} from "@skol-arena/shared/schemas/invitation.schema";

const adminInvitations = createAppHono();

const TAGS = ["Admin — invitations"];

adminInvitations.post(
  "/generate",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Generate an invitation code",
    auth: true,
    role: true,
    success: { status: 201, description: "The generated code", schema: invitationCodeSchema },
  }),
  validate("json", generateInvitationCodeSchema),
  async (c) => {
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");
    const code = await invitationService.generateCode({
      createdBy: appUserId,
      ...data,
    });
    return c.json(code, 201);
  },
);

adminInvitations.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "List invitation codes",
    auth: true,
    role: true,
    success: { description: "Every invitation code", schema: invitationCodeListSchema },
  }),
  async (c) => {
    const codes = await invitationService.getAllCodes();
    return c.json(codes);
  },
);

adminInvitations.patch(
  "/:id/deactivate",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Deactivate an invitation code",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The deactivated code", schema: invitationCodeSchema },
  }),
  async (c) => {
    const codeId = c.req.param("id")!;
    const updated = await invitationService.deactivateCode(codeId);
    return c.json(updated);
  },
);

export default adminInvitations;
