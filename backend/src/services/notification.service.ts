import webpush from "web-push";
import { logger } from "../utils/logger";
import i18next from "../config/i18n";
import { notificationRepository } from "../repository/notification.repository";
import { pushDeviceRepository } from "../repository/push-device.repository";
import { webSocketService } from "./websocket.service";
import { localizeNotificationParams } from "../utils/notification-format";
import { notificationActionService } from "./notification-action.service";
import { BadRequestError, NotFoundError, ErrorCode } from "../types/errors";
import { CreateNotification, RegisterDevice, PaginatedNotifications } from "@skol-arena/shared";

// Configure web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:noreply@skol-arena.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

type PushDevice = Awaited<ReturnType<typeof pushDeviceRepository.getActiveForUser>>[number];

function buildNotificationContent(
  data: Pick<CreateNotification, "titleKey" | "messageKey" | "translationParams">,
  lng: string = "fr",
  timeZone?: string,
): { title: string; message: string } {
  const params = localizeNotificationParams(data.translationParams, lng, timeZone);
  return {
    title: String(i18next.t(data.titleKey, { lng, ...params })),
    message: String(i18next.t(data.messageKey, { lng, ...params })),
  };
}

function parseSubscriptionKeys(
  device: PushDevice,
): { p256dh: string; auth: string } | undefined {
  if (!device.subscriptionData) {
    logger.warn(`[Push] No subscription data for device ${device.id}`);
    return undefined;
  }
  try {
    const parsed = JSON.parse(device.subscriptionData);
    logger.debug(`[Push] Parsed subscription keys for device ${device.id}`);
    return parsed.keys || parsed;
  } catch (e) {
    logger.error({ err: e }, `[Push] Failed to parse subscription data for device ${device.id}`);
    return undefined;
  }
}

function isExpiredSubscriptionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    (error as { statusCode?: number }).statusCode === 410
  );
}

async function sendPushToDevice(device: PushDevice, pushPayload: unknown): Promise<void> {
  logger.debug(
    `[Push] Processing device ${device.id}, endpoint: ${device.subscriptionEndpoint.substring(0, 50)}...`,
  );
  try {
    const keys = parseSubscriptionKeys(device);
    if (!keys) {
      logger.warn(`[Push] Skipping device ${device.id} - no valid keys`);
      return;
    }

    logger.debug(`[Push] Sending push notification to device ${device.id}`);
    await webpush.sendNotification(
      { endpoint: device.subscriptionEndpoint, keys },
      JSON.stringify(pushPayload),
    );
    logger.debug(`[Push] Successfully sent push notification to device ${device.id}`);
  } catch (error) {
    logger.error({ err: error }, `[Push] Error sending push notification to device ${device.id}:`);
    if (isExpiredSubscriptionError(error)) {
      logger.debug(`[Push] Removing inactive push device ${device.id} for user ${device.userId}`);
      await pushDeviceRepository.remove(device.userId, device.id);
    }
  }
}

interface FeedCursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString(
    "base64url",
  );
}

function decodeCursor(raw: string): FeedCursor {
  const [createdAt, id] = Buffer.from(raw, "base64url").toString().split("|");
  const parsed = createdAt ? new Date(createdAt) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime()) || !id) {
    throw new BadRequestError(ErrorCode.VALIDATION_ERROR);
  }
  return { createdAt: parsed, id };
}

export const notificationService = {
  async send(data: CreateNotification) {
    logger.debug(
      `[Notification] Creating notification for user ${data.userId}, type: ${data.type}`,
    );
    const notification = await notificationRepository.create(data);

    const { title, message } = buildNotificationContent(data);

    logger.debug(
      `[Notification] Sending WebSocket notification to user ${data.userId}`,
    );
    // titleKey/messageKey/translationParams travel along: a connected client
    // re-renders them with its own locale and timezone, title/message are the fallback.
    const sent = webSocketService.send(data.userId, {
      // A notification that has just been raised still asks for what it was raised for.
      event: "new_notification",
      data: { ...notification, title, message, actionResolved: false },
    });
    logger.debug(`[Notification] WebSocket send result: ${sent}`);

    logger.debug(`[Push] Fetching push devices for user ${data.userId}`);
    const devices = await pushDeviceRepository.getActiveForUser(data.userId);
    logger.debug(
      `[Push] Found ${devices.length} push device(s) for user ${data.userId}`,
    );

    // The device is offline, so this is the one channel the server must render itself:
    // use the locale and timezone captured when that device registered.
    for (const device of devices) {
      const rendered = buildNotificationContent(
        data,
        device.locale ?? "fr",
        device.timezone ?? undefined,
      );
      await sendPushToDevice(device, { ...notification, ...rendered });
    }

    return notification;
  },

  /**
   * One page of the feed. Only the page is rendered through i18next and only the page
   * crosses the wire — the counts come from an aggregate, so the unread badge stays right
   * even though the client holds a fraction of the list.
   */
  async getForUser(
    userId: string,
    lng: string = "fr",
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PaginatedNotifications> {
    const limit = options.limit ?? 20;
    const cursor = options.cursor ? decodeCursor(options.cursor) : undefined;

    // One row beyond the page: its presence is what says there is more to read.
    const rows = await notificationRepository.getPageForUser(userId, limit + 1, cursor);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // One batch lookup for the whole page: an actionable notification only keeps
    // blocking while the situation it points at is still open.
    const pending = await notificationActionService.resolvePendingActions(page);
    const { total, unread } = await notificationRepository.countForUser(userId);

    const last = page[page.length - 1];

    return {
      data: page.map(({ matchId: _matchId, ...n }) => ({
        ...n,
        actionResolved: n.requiresAction && !pending.has(n.id),
        createdAt: n.createdAt.toISOString(),
        translationParams: n.translationParams as Record<string, unknown> | null,
        ...buildNotificationContent(
          {
            titleKey: n.titleKey,
            messageKey: n.messageKey,
            translationParams: n.translationParams as Record<string, unknown>,
          },
          lng,
        ),
      })),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      unreadCount: unread,
      total,
    };
  },

  async markAllAsRead(userId: string) {
    const affected = await notificationRepository.markAllAsRead(userId);
    return { affected, kept: 0 };
  },

  /**
   * Clears the feed in one round trip. What survives is what `delete` would have refused
   * to drop one by one: a notification still asking for something that is genuinely owed.
   * The count of those comes back so the client can say what it kept.
   */
  async deleteAllForUser(userId: string) {
    const candidates = await notificationRepository.getUnsettledActionsForUser(userId);
    const pending = await notificationActionService.resolvePendingActions(candidates);
    const keepIds = candidates.filter((n) => pending.has(n.id)).map((n) => n.id);

    const affected = await notificationRepository.deleteAllForUser(userId, keepIds);
    return { affected, kept: keepIds.length };
  },

  async markAsRead(notificationId: string, userId: string) {
    return await notificationRepository.markAsRead(notificationId, userId);
  },

  async markActionCompleted(notificationId: string, userId: string) {
    return await notificationRepository.markActionCompleted(
      notificationId,
      userId,
    );
  },

  async registerPushDevice(userId: string, data: RegisterDevice) {
    logger.debug(
      { userId },
      "[NotificationService] Registering push device for user:",
    );
    const result = await pushDeviceRepository.register(userId, data);
    logger.debug(
      { result },
      "[NotificationService] Push device registered, result:",
    );
    return result;
  },

  async getPushDevices(userId: string) {
    return await pushDeviceRepository.getActiveForUser(userId);
  },

  async removePushDevice(userId: string, deviceId: string) {
    return await pushDeviceRepository.remove(userId, deviceId);
  },

  /**
   * A notification that asks for something cannot be dismissed while that something is
   * still owed — but the flag it carries was written once, at creation. What decides is
   * the live state: the contestation that has been taken back, the match that left the
   * conflict, the match that no longer exists. Marking the action completed by hand is
   * the other way out.
   */
  async delete(notificationId: string, userId: string) {
    const notification = await notificationRepository.getById(notificationId);
    if (!notification) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    if (notification.requiresAction) {
      const status = await notificationRepository.getStatus(notificationId, userId);
      if (!status?.actionCompleted) {
        const pending = await notificationActionService.resolvePendingActions([
          notification,
        ]);
        if (pending.has(notification.id)) {
          throw new BadRequestError(ErrorCode.NOTIFICATION_ACTION_PENDING);
        }
      }
    }

    return await notificationRepository.delete(notificationId, userId);
  },

  async hasUnreadOfTypeForMatch(
    userId: string,
    matchId: string,
    type: CreateNotification["type"],
  ) {
    return await notificationRepository.hasUnreadOfTypeForMatch(
      userId,
      matchId,
      type,
    );
  },

  async deleteActionsByMatchIdForUser(matchId: string, userId: string) {
    const deleted =
      await notificationRepository.deleteActionsByMatchIdForUser(
        matchId,
        userId,
      );
    for (const notif of deleted) {
      webSocketService.send(notif.userId, {
        event: "notification_deleted",
        data: { id: notif.id },
      });
    }
    return deleted;
  },

  async deleteActionsByMatchIdAndType(
    matchId: string,
    type: CreateNotification["type"],
  ) {
    const deleted = await notificationRepository.deleteActionsByMatchIdAndType(
      matchId,
      type,
    );
    for (const notif of deleted) {
      webSocketService.send(notif.userId, {
        event: "notification_deleted",
        data: { id: notif.id },
      });
    }
    return deleted;
  },

  async deleteActionsByMatchId(matchId: string) {
    const deleted =
      await notificationRepository.deleteActionsByMatchId(matchId);
    // Notify each affected user via WebSocket so their UI removes the notification in real-time
    for (const notif of deleted) {
      webSocketService.send(notif.userId, {
        event: "notification_deleted",
        data: { id: notif.id },
      });
    }
    return deleted;
  },
};
