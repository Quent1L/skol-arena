import { z } from "zod";
import { pushEndpointSchema } from "./push-endpoint";

export const NotificationTypeEnum = z.enum([
  "MATCH_CREATED",
  "MATCH_VALIDATION",
  // Deprecated: the score counter-proposal flow was removed.
  "MATCH_SCORE_PROPOSAL",
  "MATCH_POST_DISPUTE",
  "MATCH_DISPUTE_ESCALATED",
  "MATCH_MESSAGE",
  "BADGE_AWARDED",
  "BADGE_REVOKED",
  "MATCH_RESULT_CORRECTED",
]);

export const DeviceTypeEnum = z.enum(["WEB", "ANDROID", "IOS"]);

export const CreateNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: NotificationTypeEnum,
  titleKey: z.string(),
  messageKey: z.string(),
  translationParams: z.record(z.string(), z.any()).optional(),
  actionUrl: z.string().optional(),
  requiresAction: z.boolean().default(false),
  matchId: z.string().uuid().optional(),
});

export const RegisterDeviceSchema = z.object({
  deviceType: DeviceTypeEnum,
  subscriptionEndpoint: pushEndpointSchema,
  subscriptionData: z.record(z.string(), z.any()).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
});

export const NotificationResponseSchema = z
  .object({
    id: z.string().uuid(),
    // Drives the icon and accent the client renders the card with
    type: NotificationTypeEnum,
    // Pre-rendered server-side, kept as a fallback when the client does not know the key
    title: z.string(),
    message: z.string(),
    // Raw keys + params so the client can render with its own locale and timezone
    titleKey: z.string(),
    messageKey: z.string(),
    translationParams: z.record(z.string(), z.any()).nullable().optional(),
    actionUrl: z.string().nullable(),
    requiresAction: z.boolean(),
    /**
     * The action this notification asked for is no longer pending — the contestation was
     * taken back, the match left the conflict, the match is gone. It stops blocking and
     * can be dismissed like any other. Always false when `requiresAction` is false.
     */
    actionResolved: z.boolean(),
    isRead: z.boolean(),
    actionCompleted: z.boolean().optional(),
    createdAt: z.string(), // ISO date
  })
  .meta({ id: "Notification" });

export const NotificationListSchema = z.array(NotificationResponseSchema);

/**
 * A keyset cursor, opaque to the client: base64url of "<createdAt ISO>|<id>".
 * Keyset rather than offset because the feed moves under the reader — a socket push
 * prepends a row, a deletion removes one — which makes an offset skip or repeat items.
 */
export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const paginatedNotificationsSchema = z
  .object({
    data: z.array(NotificationResponseSchema),
    hasMore: z.boolean(),
    /** Feed to the next call as `cursor`; null once the last page has been served. */
    nextCursor: z.string().nullable(),
    /** Counted server-side: the loaded page is no longer the whole list. */
    unreadCount: z.number().int(),
    total: z.number().int(),
  })
  .meta({ id: "PaginatedNotifications" });

export const bulkNotificationResultSchema = z
  .object({
    affected: z.number().int(),
    /** Notifications left in place because the action they ask for is still pending. */
    kept: z.number().int(),
  })
  .meta({ id: "BulkNotificationResult" });

/** A push subscription registered for the current user. */
export const PushDeviceSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    deviceType: DeviceTypeEnum,
    subscriptionEndpoint: pushEndpointSchema,
    subscriptionData: z.string().nullable(),
    active: z.boolean(),
    locale: z.string().nullable(),
    timezone: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: "PushDevice" });

export type PushDevice = z.infer<typeof PushDeviceSchema>;

export type NotificationType = z.infer<typeof NotificationTypeEnum>;
export type DeviceType = z.infer<typeof DeviceTypeEnum>;
export type CreateNotification = z.infer<typeof CreateNotificationSchema>;
export type RegisterDevice = z.infer<typeof RegisterDeviceSchema>;
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type PaginatedNotifications = z.infer<typeof paginatedNotificationsSchema>;
export type BulkNotificationResult = z.infer<typeof bulkNotificationResultSchema>;
