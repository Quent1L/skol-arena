import { AVATAR_SIZES, type AvatarSize } from "@skol-arena/shared";
import { organizationRepository } from "../repository/organization.repository";
import { userRepository } from "../repository/user.repository";
import { getAvatarStorage, type StoredBlob } from "../storage";
import { ErrorCode, ForbiddenError, NotFoundError } from "../types/errors";
import { logger } from "../utils/logger";
import { avatarImageService } from "./avatar-image.service";
import { AVATAR_CONTENT_TYPE, userPrefix, variantKey, versionPrefix } from "./avatar-keys";

/**
 * Losing an old version only leaves an orphan, never a broken avatar: its URL
 * carries a version that is no longer current, so nothing serves it any more.
 */
async function deleteQuietly(prefix: string): Promise<void> {
  try {
    await getAvatarStorage().deletePrefix(prefix);
  } catch (err) {
    logger.warn({ err, prefix }, "Could not delete avatar objects");
  }
}

async function assertCanRemove(actorId: string, targetId: string): Promise<void> {
  if (actorId === targetId) return;
  const actor = await userRepository.getById(actorId);
  if (actor?.role === "super_admin") return;
  if (await organizationRepository.isOwnerOfSharedOrganization(actorId, targetId)) return;
  throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
}

export const avatarService = {
  /**
   * Stores every variant first and only then points the profile at them, so a
   * failure halfway leaves the previous avatar in place.
   */
  async setAvatar(userId: string, bytes: Uint8Array): Promise<string> {
    const variants = await avatarImageService.process(bytes);
    // Random v4, not v7: a time-ordered id in a public URL would tell anyone when
    // the player last changed their picture.
    const version = crypto.randomUUID();
    const storage = getAvatarStorage();
    for (const [size, data] of variants) {
      await storage.put(variantKey(userId, version, size), data, AVATAR_CONTENT_TYPE);
    }

    const previous = await userRepository.getAvatarVersion(userId);
    await userRepository.setAvatarVersion(userId, version);
    if (previous) {
      await deleteQuietly(versionPrefix(userId, previous));
    }
    return version;
  },

  /** A player removes their own avatar; a super admin or an owner of one of their organizations may too. */
  async removeAvatar(actorId: string, targetId: string): Promise<void> {
    const target = await userRepository.getById(targetId);
    if (!target) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    await assertCanRemove(actorId, targetId);
    await this.purge(targetId);
  },

  /** Drops the avatar without any permission check, for account lifecycle events. */
  async purge(userId: string): Promise<void> {
    await userRepository.setAvatarVersion(userId, null);
    await deleteQuietly(userPrefix(userId));
  },

  async lookup(ids: string[]): Promise<Record<string, string>> {
    const rows = await userRepository.getAvatarVersions([...new Set(ids)]);
    return Object.fromEntries(rows.map((r) => [r.id, r.avatarVersion]));
  },

  /** True when `version` is the player's current avatar: anything older answers 404. */
  async isCurrentVersion(userId: string, version: string): Promise<boolean> {
    return (await userRepository.getAvatarVersion(userId)) === version;
  },

  async getVariant(userId: string, version: string, size: AvatarSize): Promise<StoredBlob> {
    if (!(await this.isCurrentVersion(userId, version))) {
      throw new NotFoundError(ErrorCode.AVATAR_NOT_FOUND);
    }
    const blob = await getAvatarStorage().get(variantKey(userId, version, size));
    if (!blob) throw new NotFoundError(ErrorCode.AVATAR_NOT_FOUND);
    return blob;
  },

  isSize(value: number): value is AvatarSize {
    return (AVATAR_SIZES as readonly number[]).includes(value);
  },
};
