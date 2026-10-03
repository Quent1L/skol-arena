import type { AvatarSize } from "@skol-arena/shared";

/** Every avatar object lives under this prefix, whatever the store. */
export const AVATARS_PREFIX = "avatars/";

/** Every variant is re-encoded to WebP, so the type never varies. */
export const AVATAR_CONTENT_TYPE = "image/webp";

export function variantKey(userId: string, version: string, size: AvatarSize): string {
  return `${AVATARS_PREFIX}${userId}/${version}/${size}.webp`;
}

export function versionPrefix(userId: string, version: string): string {
  return `${AVATARS_PREFIX}${userId}/${version}/`;
}

export function userPrefix(userId: string): string {
  return `${AVATARS_PREFIX}${userId}/`;
}
