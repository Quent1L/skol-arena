import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import {
  avatarLookupRequestSchema,
  avatarLookupResponseSchema,
  avatarUploadResponseSchema,
} from "@skol-arena/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { avatarService } from "../services/avatar.service";
import { avatarMaxUploadBytes, formatUploadLimit } from "../config/avatar";
import { createAppHono } from "../types/hono";
import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { BadRequestError, ErrorCode, PayloadTooLargeError } from "../types/errors";

const avatars = createAppHono();

const TAGS = ["Avatars"];
/** Room for the multipart envelope around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Refuses an oversized body while it streams in, before it is buffered or parsed.
 * The limit is read per request, like every other avatar setting.
 */
const uploadBodyLimit = (): ReturnType<typeof bodyLimit> => async (c, next) => {
  const max = avatarMaxUploadBytes();
  return bodyLimit({
    maxSize: max + MULTIPART_OVERHEAD_BYTES,
    onError: () => {
      throw new PayloadTooLargeError(ErrorCode.AVATAR_TOO_LARGE, { max: formatUploadLimit(max) });
    },
  })(c, next);
};

/** Exactly one file, under `file`. Its name and declared type are ignored. */
async function readUploadedFile(form: Record<string, unknown>): Promise<Uint8Array> {
  const file = form.file;
  if (!(file instanceof File)) {
    throw new BadRequestError(ErrorCode.AVATAR_FILE_MISSING);
  }
  return new Uint8Array(await file.arrayBuffer());
}

const userIdParamSchema = z.object({ id: z.uuid() });

// PUT /users/me/avatar - Upload or replace the current user's avatar
avatars.put(
  "/me/avatar",
  requireAuth,
  rateLimit({ window: 3600, max: 20 }),
  describe({
    tags: TAGS,
    summary: "Upload or replace the current user's avatar",
    description:
      "multipart/form-data with a single `file` field holding a JPEG, PNG or WebP image. " +
      "The image is re-encoded server side to square-bounded WebP variants; the original is not kept.",
    auth: true,
    upload: true,
    rateLimited: true,
    success: { description: "The new avatar version", schema: avatarUploadResponseSchema },
  }),
  uploadBodyLimit(),
  async (c) => {
    const form = await c.req.parseBody({ all: false });
    const bytes = await readUploadedFile(form);
    const avatarVersion = await avatarService.setAvatar(c.get("appUserId"), bytes);
    return c.json({ avatarVersion });
  }
);

// DELETE /users/me/avatar - Remove the current user's avatar
avatars.delete(
  "/me/avatar",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Remove the current user's avatar",
    auth: true,
    success: { status: 204, description: "Avatar removed" },
  }),
  async (c) => {
    const appUserId = c.get("appUserId");
    await avatarService.removeAvatar(appUserId, appUserId);
    return c.body(null, 204);
  }
);

// DELETE /users/:id/avatar - Moderation: remove another player's avatar
avatars.delete(
  "/:id/avatar",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Remove a player's avatar",
    description:
      "Allowed to the player themselves, to super admins and to owners of an organization the player belongs to.",
    auth: true,
    role: true,
    notFound: true,
    success: { status: 204, description: "Avatar removed" },
  }),
  validate("param", userIdParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    await avatarService.removeAvatar(c.get("appUserId"), id);
    return c.body(null, 204);
  }
);

// POST /users/avatars/lookup - Current avatar version of a batch of players
avatars.post(
  "/avatars/lookup",
  describe({
    tags: TAGS,
    summary: "Look up the avatars of several players",
    description:
      "Returns the current avatar version of each requested player who has one. " +
      "Image URLs are /api/avatars/{userId}/{version}/{64|128|256}.webp.",
    success: { description: "Avatar versions by player id", schema: avatarLookupResponseSchema },
  }),
  validate("json", avatarLookupRequestSchema),
  async (c) => {
    const { ids } = c.req.valid("json");
    return c.json({ avatars: await avatarService.lookup(ids) });
  }
);

export default avatars;
