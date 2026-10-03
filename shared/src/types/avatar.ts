import { z } from "zod";

// ============================================
// Player avatars
// ============================================

/** Square variants generated for every avatar, in pixels. */
export const AVATAR_SIZES = [64, 128, 256] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];

/** Default upload ceiling; the server reads its own from AVATAR_MAX_UPLOAD_BYTES. */
export const AVATAR_MAX_UPLOAD_BYTES_DEFAULT = 5 * 1024 * 1024;

/**
 * What the file picker offers. Only a hint for the browser: the server sniffs the
 * bytes and never trusts a declared type or extension.
 */
export const AVATAR_ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/** Random id of one avatar version. It is part of the image URL. */
export const avatarVersionSchema = z.uuid({ version: "v4" }).meta({ id: "AvatarVersion" });

/** Most ids a single avatar lookup may ask for. */
export const AVATAR_LOOKUP_MAX_IDS = 200;

export const avatarLookupRequestSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(AVATAR_LOOKUP_MAX_IDS),
  })
  .meta({ id: "AvatarLookupRequest" });

export type AvatarLookupRequest = z.infer<typeof avatarLookupRequestSchema>;

export const avatarLookupResponseSchema = z
  .object({
    /** Only the requested players who have an avatar appear here. */
    avatars: z.record(z.string(), avatarVersionSchema),
  })
  .meta({ id: "AvatarLookupResponse" });

export type AvatarLookupResponse = z.infer<typeof avatarLookupResponseSchema>;

export const avatarUploadResponseSchema = z
  .object({
    avatarVersion: avatarVersionSchema,
  })
  .meta({ id: "AvatarUploadResponse" });

export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;

/** Path of one avatar variant, relative to the API origin. */
export function avatarPath(userId: string, version: string, size: AvatarSize): string {
  return `/api/avatars/${userId}/${version}/${size}.webp`;
}
