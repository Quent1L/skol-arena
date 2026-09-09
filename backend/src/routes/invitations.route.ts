import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { createAppHono } from "../types/hono";
import { invitationService } from "../services/invitation.service";
import { organizationService } from "../services/organization.service";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  validateInvitationCodeSchema,
  consumeInvitationCodeSchema,
  invitationValidationSchema,
  invitationConsumptionSchema,
  organizationJoinSchema,
} from "@skol-arena/shared/schemas/invitation.schema";

const invitations = createAppHono();

const TAGS = ["Invitations"];

// Rate limited: this answers whether a code is real to anyone who asks, which is
// exactly the oracle needed to guess one. Codes are the only thing standing between
// a stranger and an account on an invite-only instance.
invitations.post(
  "/validate",
  rateLimit({ window: 300, max: 10 }),
  describe({
    tags: TAGS,
    summary: "Check an invitation code",
    description:
      "Pre-flight check before sign-up. Fails with the reason the code cannot be " +
      "used: expired, exhausted, deactivated or unknown. Rate limited per client.",
    notFound: true,
    rateLimited: true,
    success: { description: "The code is usable", schema: invitationValidationSchema },
  }),
  validate("json", validateInvitationCodeSchema),
  async (c) => {
    const { code } = c.req.valid("json");
    const result = await invitationService.validateCode(code);
    return c.json(result);
  }
);

invitations.post(
  "/consume",
  describe({
    tags: TAGS,
    summary: "Redeem an invitation code",
    description:
      "Turns an authenticated Better Auth identity into an app user. Requires a " +
      "session but not an app profile, which is what this endpoint creates.",
    auth: true,
    notFound: true,
    success: { description: "The app user that was created", schema: invitationConsumptionSchema },
  }),
  validate("json", consumeInvitationCodeSchema),
  async (c) => {
    const betterAuthUser = c.get("user");

    if (!betterAuthUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { code } = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip");

    const appUser = await invitationService.consumeCodeAndCreateAppUser(
      code,
      betterAuthUser.id,
      betterAuthUser.email,
      betterAuthUser.name || betterAuthUser.email,
      ipAddress
    );

    return c.json({
      success: true,
      appUserId: appUser.id
    });
  }
);

invitations.post(
  "/join-organization",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Join an organization with a code",
    auth: true,
    notFound: true,
    conflict: true,
    success: { description: "The organization that was joined", schema: organizationJoinSchema },
  }),
  validate("json", validateInvitationCodeSchema),
  async (c) => {
    const appUserId = c.get("appUserId");
    const betterAuthUser = c.get("user")!;
    const { code } = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip");

    const result = await organizationService.joinViaCode(
      code,
      appUserId,
      betterAuthUser.id,
      betterAuthUser.email,
      ipAddress,
    );

    return c.json(result);
  }
);

export default invitations;
