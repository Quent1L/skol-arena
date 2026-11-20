import type { ClientMatchMessage } from "@skol-arena/shared/types/index";
import { MATCH_MESSAGE_MAX_LENGTH, POST_FINALIZATION_DISPUTE_DAYS } from "@skol-arena/shared/types/index";
import { matchMessageRepository } from "../repository/match-message.repository";
import { matchRepository } from "../repository/match.repository";
import { userRepository } from "../repository/user.repository";
import { BadRequestError, ErrorCode, ForbiddenError, NotFoundError } from "../types/errors";
import { logger } from "../utils/logger";
import { matchNotificationBuilder } from "./match-notification.builder";
import { matchRealtimeService } from "./match-realtime.service";
import { matchPermissionValidator } from "./validators/match-permission.validator";
import { webSocketService } from "./websocket.service";

type MessageRow = Awaited<ReturnType<typeof matchMessageRepository.listByMatch>>[number];

/**
 * Discussion attached to a match. It replaces the score counter-proposal: instead of
 * submitting a rival result, a player says what they disagree with, and the author of
 * the entry corrects it. Bodies are stored and returned as plain text — never HTML —
 * so rendering them cannot inject markup.
 */
export class MatchMessageService {
  async list(matchId: string, userId: string): Promise<ClientMatchMessage[]> {
    await this.assertCanRead(matchId, userId);

    const rows = await matchMessageRepository.listByMatch(matchId);
    return rows.map((row) => this.toClient(row));
  }

  async post(matchId: string, userId: string, body: string): Promise<ClientMatchMessage> {
    const match = await this.assertCanRead(matchId, userId);

    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > MATCH_MESSAGE_MAX_LENGTH) {
      throw new BadRequestError(ErrorCode.MATCH_MESSAGE_INVALID_BODY);
    }

    this.assertThreadOpen(match);

    const created = await matchMessageRepository.create({
      matchId,
      authorId: userId,
      kind: "user",
      body: trimmed,
    });

    const author = await userRepository.getById(userId);
    const message = this.toClient({
      ...created,
      author: author ? { id: author.id, displayName: author.displayName } : null,
    });

    await this.broadcast(matchId, message);
    await matchNotificationBuilder.notifyMatchMessage(matchId, userId);

    return message;
  }

  /**
   * Posts a note a player attached to an action of the flow — today the reason of a
   * dispute, which belongs in the conversation rather than frozen on a form. Never
   * throws: the action it comments on has already happened.
   */
  async postUserNote(matchId: string, userId: string, body?: string | null): Promise<void> {
    if (!body || body.trim().length === 0) return;

    try {
      await this.post(matchId, userId, body);
    } catch (error) {
      logger.error({ err: error, matchId, userId }, "Failed to record match user note");
    }
  }

  /**
   * Records a milestone of the validation flow in the thread. `key` is an i18n key and
   * `params` its interpolation values, so the message renders in the reader's language.
   * Never throws: a failure here must not roll back the action it describes.
   */
  async postSystem(matchId: string, key: string, params: Record<string, string | number | null>): Promise<void> {
    try {
      const created = await matchMessageRepository.create({
        matchId,
        authorId: null,
        kind: "system",
        body: key,
        translationParams: params,
      });

      await this.broadcast(matchId, this.toClient({ ...created, author: null }));
    } catch (error) {
      logger.error({ err: error, matchId, key }, "Failed to record match system message");
    }
  }

  /**
   * Participants and the tournament organizers can read and write. Anyone else cannot,
   * including players of the same tournament who are not in this match.
   */
  private async assertCanRead(matchId: string, userId: string) {
    const match = await matchRepository.getById(matchId);
    if (!match) {
      throw new NotFoundError(ErrorCode.MATCH_NOT_FOUND);
    }

    const isParticipant = await matchRepository.isUserInMatch(matchId, userId);
    if (isParticipant) return match;

    const canManage = await matchPermissionValidator.canManageMatches(match.tournamentId, userId);
    if (!canManage) {
      throw new ForbiddenError(ErrorCode.NOT_A_PARTICIPANT);
    }

    return match;
  }

  /**
   * The thread closes with the dispute window: a player can always explain, answer or
   * withdraw a contestation they are still allowed to file.
   */
  private assertThreadOpen(match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>): void {
    if (match.status !== "finalized") return;

    const finalizedAt = match.result?.finalizedAt;
    if (!finalizedAt) return;

    const daysSince = (Date.now() - new Date(finalizedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > POST_FINALIZATION_DISPUTE_DAYS) {
      throw new BadRequestError(ErrorCode.MATCH_THREAD_CLOSED);
    }
  }

  private async broadcast(matchId: string, message: ClientMatchMessage): Promise<void> {
    const match = await matchRepository.getById(matchId);
    if (!match) return;

    const audience = await matchRealtimeService.resolveAudience(matchId, match.tournamentId);

    for (const userId of audience) {
      webSocketService.send(userId, { event: "match_message", data: message });
    }
  }

  private toClient(
    row: Omit<MessageRow, "author"> & {
      author: { id: string; displayName: string } | null;
    },
  ): ClientMatchMessage {
    return {
      id: row.id,
      matchId: row.matchId,
      kind: row.kind,
      body: row.body,
      translationParams: (row.translationParams as Record<string, string | number | null> | null) ?? null,
      createdAt: row.createdAt as unknown as Date,
      author: row.author ? { id: row.author.id, displayName: row.author.displayName } : null,
    };
  }
}

export const matchMessageService = new MatchMessageService();
