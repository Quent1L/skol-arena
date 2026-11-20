import type {
  Announcement,
  AnnouncementPopup,
  CreateAnnouncementInput,
  CreateNotification,
} from "@skol-arena/shared";
import {
  announcementRepository,
  type AnnouncementListRow,
  type AnnouncementRow,
} from "../repository/announcement.repository";
import { participantRepository } from "../repository/participant.repository";
import { tournamentRepository } from "../repository/tournament.repository";
import { userRepository } from "../repository/user.repository";
import { tournamentService } from "./tournament.service";
import { notificationService } from "./notification.service";
import { ErrorCode, ForbiddenError, NotFoundError } from "../types/errors";

async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await userRepository.getById(userId);
  return user?.role === "super_admin";
}

/**
 * An app-wide announcement is a super admin's call; a tournament one belongs to whoever
 * manages that tournament (owner, co-admin, or a super admin).
 */
async function assertCanPublish(
  userId: string,
  target: { audience: Announcement["audience"]; tournamentId: string | null },
): Promise<void> {
  const allowed =
    target.audience === "all" || !target.tournamentId
      ? await isSuperAdmin(userId)
      : await tournamentService.canManageTournament(target.tournamentId, userId);
  if (!allowed) throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
}

async function resolveRecipients(row: AnnouncementRow): Promise<string[]> {
  const ids =
    row.audience === "tournament" && row.tournamentId
      ? await participantRepository.getActiveParticipantIds(row.tournamentId)
      : await userRepository.getActiveUserIds();
  return ids.filter((id) => id !== row.createdBy);
}

async function isInAudience(row: AnnouncementRow, userId: string): Promise<boolean> {
  if (row.createdBy === userId) return false;
  if (row.audience === "tournament" && row.tournamentId) {
    return await tournamentRepository.isActiveParticipant(row.tournamentId, userId);
  }
  return true;
}

function toFeedNotification(
  row: AnnouncementRow,
  userId: string,
  tournamentName: string | null,
): CreateNotification {
  return {
    userId,
    type: "ANNOUNCEMENT",
    titleKey: "notifications.ANNOUNCEMENT_TITLE",
    messageKey: "notifications.ANNOUNCEMENT_MESSAGE",
    translationParams: { title: row.title, body: row.body, tournamentName },
    actionUrl: row.tournamentId ? `/tournaments/${row.tournamentId}` : undefined,
    requiresAction: false,
    announcementId: row.id,
  };
}

function toResponse(row: AnnouncementListRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    tournamentId: row.tournamentId,
    tournamentName: row.tournamentName,
    inFeed: row.inFeed,
    asPopup: row.asPopup,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    authorName: row.authorName,
    recipientCount: row.recipientCount,
    seenCount: row.seenCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPopup(row: AnnouncementRow): AnnouncementPopup {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    tournamentId: row.tournamentId,
    createdAt: row.createdAt.toISOString(),
  };
}

export const announcementService = {
  async create(userId: string, input: CreateAnnouncementInput) {
    const tournamentId = input.audience === "tournament" ? (input.tournamentId ?? null) : null;
    await assertCanPublish(userId, { audience: input.audience, tournamentId });
    const tournament = tournamentId
      ? await tournamentRepository.getByIdSimple(tournamentId)
      : undefined;
    if (tournamentId && !tournament) throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);

    const row = await announcementRepository.create({
      title: input.title,
      body: input.body,
      audience: input.audience,
      tournamentId,
      inFeed: input.inFeed,
      asPopup: input.asPopup,
      expiresAt: input.expiresAt ?? null,
      createdBy: userId,
    });
    if (row.inFeed) {
      const recipients = await resolveRecipients(row);
      const tournamentName = tournament?.name ?? null;
      await notificationService.sendMany(
        recipients.map((id) => toFeedNotification(row, id, tournamentName)),
      );
    }
    return { id: row.id };
  },

  /** Every announcement for a super admin; one tournament's for whoever manages it. */
  async list(userId: string, tournamentId?: string): Promise<Announcement[]> {
    if (tournamentId) {
      await assertCanPublish(userId, { audience: "tournament", tournamentId });
      const rows = await announcementRepository.listForTournament(tournamentId);
      return rows.map(toResponse);
    }
    if (!(await isSuperAdmin(userId))) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }
    return (await announcementRepository.listAll()).map(toResponse);
  },

  async delete(userId: string, id: string): Promise<void> {
    const row = await announcementRepository.findById(id);
    if (!row) throw new NotFoundError(ErrorCode.NOT_FOUND);
    await assertCanPublish(userId, row);
    // Deleted first and one by one, so the players' open bells hear of it; the cascade
    // alone would remove the rows silently.
    await notificationService.deleteByAnnouncement(id);
    await announcementRepository.delete(id);
  },

  async getPendingPopups(userId: string, tournamentId?: string): Promise<AnnouncementPopup[]> {
    // A kiosk is a shared screen, not a player: nobody there to read an announcement.
    const user = await userRepository.getById(userId);
    if (!user || user.role === "kiosk") return [];
    const rows = await announcementRepository.findPendingPopups(userId, tournamentId);
    return rows.map(toPopup);
  },

  /** The pop-up was dismissed: never shown again, and its feed copy reads as read. */
  async markSeen(userId: string, id: string): Promise<void> {
    const row = await announcementRepository.findById(id);
    // Outside the audience reads as missing: no view counted, no id confirmed.
    if (!row || !(await isInAudience(row, userId))) throw new NotFoundError(ErrorCode.NOT_FOUND);
    await announcementRepository.markSeen(id, userId);
    await notificationService.markAnnouncementRead(userId, id);
  },
};
