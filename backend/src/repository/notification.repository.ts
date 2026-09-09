import { eq, and, or, lt, desc, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../config/database";
import { notifications, notificationStatus } from "../db/schema";
import { CreateNotification } from "@skol-arena/shared";

export const notificationRepository = {
  async create(data: CreateNotification) {
    return await db.transaction(async (tx) => {
      const [notification] = await tx
        .insert(notifications)
        .values({
          userId: data.userId,
          type: data.type,
          titleKey: data.titleKey,
          messageKey: data.messageKey,
          translationParams: data.translationParams,
          actionUrl: data.actionUrl,
          requiresAction: data.requiresAction,
          matchId: data.matchId,
        })
        .returning();

      await tx.insert(notificationStatus).values({
        notificationId: notification.id,
        userId: data.userId,
        read: false,
        actionCompleted: false,
      });

      return notification;
    });
  },

  /**
   * One page of a user's feed, newest first. Driven from `notifications` rather than from
   * the status table so `notifications_user_created_idx` returns the rows already ordered
   * and the LIMIT stops the walk early; the join only carries the per-user read state.
   *
   * `cursor` is the (createdAt, id) pair of the last row served — a keyset, not an offset,
   * because the feed moves under the reader.
   */
  async getPageForUser(
    userId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ) {
    const keyset = cursor
      ? or(
          lt(notifications.createdAt, cursor.createdAt),
          and(
            eq(notifications.createdAt, cursor.createdAt),
            lt(notifications.id, cursor.id),
          ),
        )
      : undefined;

    return await db
      .select({
        id: notifications.id,
        type: notifications.type,
        matchId: notifications.matchId,
        titleKey: notifications.titleKey,
        messageKey: notifications.messageKey,
        translationParams: notifications.translationParams,
        actionUrl: notifications.actionUrl,
        requiresAction: notifications.requiresAction,
        createdAt: notifications.createdAt,
        isRead: notificationStatus.read,
        actionCompleted: notificationStatus.actionCompleted,
      })
      .from(notifications)
      .innerJoin(
        notificationStatus,
        and(
          eq(notifications.id, notificationStatus.notificationId),
          eq(notificationStatus.userId, userId),
        ),
      )
      .where(and(eq(notifications.userId, userId), keyset))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
  },

  /**
   * The user's notifications that still carry an unsettled request — the only ones a
   * bulk delete has to think about. Small by construction: everything else is settled.
   */
  async getUnsettledActionsForUser(userId: string) {
    return await db
      .select({
        id: notifications.id,
        type: notifications.type,
        requiresAction: notifications.requiresAction,
        matchId: notifications.matchId,
      })
      .from(notifications)
      .innerJoin(
        notificationStatus,
        and(
          eq(notifications.id, notificationStatus.notificationId),
          eq(notificationStatus.userId, userId),
        ),
      )
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.requiresAction, true),
          eq(notificationStatus.actionCompleted, false),
        ),
      );
  },

  /** Read and unread totals in a single pass over `notification_status_user_read_idx`. */
  async countForUser(userId: string) {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        unread: sql<number>`count(*) filter (where ${notificationStatus.read} = false)`.mapWith(
          Number,
        ),
      })
      .from(notificationStatus)
      .where(eq(notificationStatus.userId, userId));

    return { total: row?.total ?? 0, unread: row?.unread ?? 0 };
  },

  /** Every unread row of a user marked read in one statement, not one request per row. */
  async markAllAsRead(userId: string) {
    const updated = await db
      .update(notificationStatus)
      .set({ read: true, readAt: new Date() })
      .where(
        and(
          eq(notificationStatus.userId, userId),
          eq(notificationStatus.read, false),
        ),
      )
      .returning({ id: notificationStatus.notificationId });

    return updated.length;
  },

  /**
   * Drops every copy the user holds except `keepIds`, then the notifications nobody holds
   * any more — two statements for the whole list, whatever its size. Same ownership rule
   * as `delete`, which is what the client used to reproduce one HTTP request at a time.
   */
  async deleteAllForUser(userId: string, keepIds: string[]) {
    return await db.transaction(async (tx) => {
      const dropped = await tx
        .delete(notificationStatus)
        .where(
          and(
            eq(notificationStatus.userId, userId),
            keepIds.length
              ? notInArray(notificationStatus.notificationId, keepIds)
              : undefined,
          ),
        )
        .returning({ id: notificationStatus.notificationId });

      if (dropped.length === 0) return 0;

      const ids = dropped.map((row) => row.id);
      await tx.delete(notifications).where(
        and(
          inArray(notifications.id, ids),
          sql`not exists (
            select 1 from ${notificationStatus}
            where ${notificationStatus.notificationId} = ${notifications.id}
          )`,
        ),
      );

      return ids.length;
    });
  },

  /**
   * Retention sweep: one bounded batch of notifications that are read, ask for nothing
   * still owed, and are older than the cutoff. Bounded so the nightly job never takes a
   * lock over the whole table.
   */
  async deleteReadOlderThan(cutoff: Date, batchSize: number) {
    const stale = await db
      .select({ id: notificationStatus.notificationId })
      .from(notificationStatus)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationStatus.notificationId),
      )
      .where(
        and(
          eq(notificationStatus.read, true),
          or(
            eq(notifications.requiresAction, false),
            eq(notificationStatus.actionCompleted, true),
          ),
          lt(notifications.createdAt, cutoff),
        ),
      )
      .limit(batchSize);

    if (stale.length === 0) return 0;

    const ids = stale.map((row) => row.id);
    await db.transaction(async (tx) => {
      await tx
        .delete(notificationStatus)
        .where(inArray(notificationStatus.notificationId, ids));
      await tx.delete(notifications).where(inArray(notifications.id, ids));
    });

    return ids.length;
  },

  async markAsRead(notificationId: string, userId: string) {
    return await db
      .update(notificationStatus)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(notificationStatus.notificationId, notificationId),
          eq(notificationStatus.userId, userId),
        ),
      )
      .returning();
  },

  async markActionCompleted(notificationId: string, userId: string) {
    return await db
      .update(notificationStatus)
      .set({
        actionCompleted: true,
        actionCompletedAt: new Date(),
        read: true, // Auto-mark as read when action is completed
        readAt: new Date(),
      })
      .where(
        and(
          eq(notificationStatus.notificationId, notificationId),
          eq(notificationStatus.userId, userId),
        ),
      )
      .returning();
  },

  async getById(notificationId: string) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));
    return notification;
  },

  async getStatus(notificationId: string, userId: string) {
    const [status] = await db
      .select()
      .from(notificationStatus)
      .where(
        and(
          eq(notificationStatus.notificationId, notificationId),
          eq(notificationStatus.userId, userId),
        ),
      );
    return status;
  },

  /**
   * Drops one recipient's copy, and the notification itself once nobody holds it any
   * more. Whether the deletion is allowed is the service's call — see
   * notificationService.delete.
   */
  async delete(notificationId: string, userId: string) {
    await db
      .delete(notificationStatus)
      .where(
        and(
          eq(notificationStatus.notificationId, notificationId),
          eq(notificationStatus.userId, userId),
        ),
      );

    const remainingStatuses = await db
      .select()
      .from(notificationStatus)
      .where(eq(notificationStatus.notificationId, notificationId));

    if (remainingStatuses.length === 0) {
      await db
        .delete(notifications)
        .where(eq(notifications.id, notificationId));
    }
  },

  /**
   * Whether a user still has an unread notification of a given type for a match.
   * Used to avoid stacking one notification per message on a busy thread.
   */
  async hasUnreadOfTypeForMatch(
    userId: string,
    matchId: string,
    type: CreateNotification["type"],
  ): Promise<boolean> {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .innerJoin(
        notificationStatus,
        eq(notifications.id, notificationStatus.notificationId),
      )
      .where(
        and(
          eq(notifications.matchId, matchId),
          eq(notifications.type, type),
          eq(notificationStatus.userId, userId),
          eq(notificationStatus.read, false),
        ),
      )
      .limit(1);

    return !!existing;
  },

  async deleteActionsByMatchIdForUser(matchId: string, userId: string) {
    const toDelete = await db
      .select({ id: notifications.id, userId: notificationStatus.userId })
      .from(notifications)
      .innerJoin(
        notificationStatus,
        eq(notifications.id, notificationStatus.notificationId),
      )
      .where(
        and(
          eq(notifications.matchId, matchId),
          eq(notifications.requiresAction, true),
          eq(notificationStatus.userId, userId),
        ),
      );

    if (toDelete.length === 0) return toDelete;

    await db.delete(notifications).where(
      inArray(
        notifications.id,
        toDelete.map((notif) => notif.id),
      ),
    );

    return toDelete;
  },

  /**
   * Delete the actionable notifications of a single type for a match.
   * Narrower than deleteActionsByMatchId: used when one situation is resolved
   * (a withdrawn dispute) while other pending actions must survive.
   */
  async deleteActionsByMatchIdAndType(
    matchId: string,
    type: CreateNotification["type"],
  ) {
    const toDelete = await db
      .select({ id: notifications.id, userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.matchId, matchId),
          eq(notifications.type, type),
          eq(notifications.requiresAction, true),
        ),
      );

    if (toDelete.length === 0) return toDelete;

    await db.delete(notifications).where(
      inArray(
        notifications.id,
        toDelete.map((notif) => notif.id),
      ),
    );

    return toDelete;
  },

  async deleteActionsByMatchId(matchId: string) {
    // Find all requiresAction notifications for this match
    const toDelete = await db
      .select({ id: notifications.id, userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.matchId, matchId),
          eq(notifications.requiresAction, true),
        ),
      );

    // Cascade handles the notification_status rows
    if (toDelete.length === 0) return toDelete;

    await db.delete(notifications).where(
      inArray(
        notifications.id,
        toDelete.map((notif) => notif.id),
      ),
    );

    return toDelete;
  },
};
