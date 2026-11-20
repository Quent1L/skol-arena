import { matchRepository } from "../repository/match.repository";
import { matchConfirmationRepository } from "../repository/match-confirmation.repository";
import type { NotificationType } from "@skol-arena/shared";

/** The shape the resolver needs: whatever carries an action and may point at a match. */
export interface ActionableNotification {
  id: string;
  type: NotificationType;
  requiresAction: boolean;
  matchId: string | null;
}

/**
 * Whether the situation a notification asks an organizer (or a player) to settle is still
 * live. `requiresAction` is written once, at creation; this is the state it stood for,
 * read back from the match. A notification whose action is no longer pending stops
 * blocking: it can be dismissed like any other.
 *
 * Anything the resolver cannot tie back to a live situation — no match id (the match was
 * deleted, `match_id` is set to null), an unknown match, a type that carries no match
 * state — counts as settled rather than blocking forever.
 */
export const notificationActionService = {
  async resolvePendingActions(notifications: ActionableNotification[]): Promise<Set<string>> {
    const actionable = notifications.filter((n) => n.requiresAction && n.matchId);
    if (actionable.length === 0) return new Set();

    const matchIds = [...new Set(actionable.map((n) => n.matchId as string))];
    const statusRows = await matchRepository.getStatusesByIds(matchIds);
    const statusById = new Map(statusRows.map((row) => [row.id, row.status]));

    const finalizedIds = statusRows.filter((row) => row.status === "finalized").map((row) => row.id);
    const withOpenPostDispute = new Set(await matchConfirmationRepository.getMatchIdsWithOpenPostDispute(finalizedIds));

    const pending = new Set<string>();
    for (const notification of actionable) {
      const status = statusById.get(notification.matchId as string);
      if (!status) continue;

      if (this.isPending(notification.type, status, withOpenPostDispute.has(notification.matchId as string))) {
        pending.add(notification.id);
      }
    }

    return pending;
  },

  isPending(type: NotificationType, matchStatus: string, hasOpenPostDispute: boolean): boolean {
    switch (type) {
      // An organizer is asked to arbitrate for as long as the match sits in conflict.
      case "MATCH_DISPUTE_ESCALATED":
        return matchStatus === "disputed";
      // The result stays finalized throughout: what makes the request live is the
      // contestation itself, which disappears when its author takes it back.
      case "MATCH_POST_DISPUTE":
        return matchStatus === "finalized" && hasOpenPostDispute;
      case "MATCH_VALIDATION":
        return matchStatus === "reported" || matchStatus === "disputed";
      default:
        return false;
    }
  },
};
