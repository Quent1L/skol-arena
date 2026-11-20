/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import { notificationService } from "../notification.service";
import { notificationActionService } from "../notification-action.service";
import { notificationRepository } from "../../repository/notification.repository";
import { BadRequestError, ErrorCode, type AppError } from "../../types/errors";

const blocking = {
  id: "n-1",
  userId: "u-1",
  type: "MATCH_POST_DISPUTE",
  requiresAction: true,
  matchId: "m-1",
  titleKey: "notifications.MATCH_POST_DISPUTE_TITLE",
  messageKey: "notifications.MATCH_POST_DISPUTE_MESSAGE",
  translationParams: {},
};

let deleted: Array<[string, string]> = [];
let pendingIds: string[] = [];

beforeEach(() => {
  deleted = [];
  pendingIds = ["n-1"];
  (notificationRepository as any).getById = async () => blocking;
  (notificationRepository as any).getStatus = async () => ({ actionCompleted: false });
  (notificationRepository as any).delete = async (id: string, userId: string) => {
    deleted.push([id, userId]);
  };
  (notificationActionService as any).resolvePendingActions = async () => new Set(pendingIds);
});

afterEach(() => {
  const restore = (instance: object) => {
    for (const key of Object.getOwnPropertyNames(instance)) {
      delete (instance as Record<string, unknown>)[key];
    }
  };
  restore(notificationRepository);
  restore(notificationActionService);
});

describe("NotificationService.delete", () => {
  it("refuses to drop a notification whose action is still owed", async () => {
    try {
      await notificationService.delete("n-1", "u-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as AppError).code).toBe(ErrorCode.NOTIFICATION_ACTION_PENDING);
    }
    expect(deleted).toHaveLength(0);
  });

  it("lets it go once the situation it pointed at is settled", async () => {
    pendingIds = [];

    await notificationService.delete("n-1", "u-1");

    expect(deleted).toEqual([["n-1", "u-1"]]);
  });

  it("lets it go when the recipient marked the action completed", async () => {
    (notificationRepository as any).getStatus = async () => ({ actionCompleted: true });

    await notificationService.delete("n-1", "u-1");

    expect(deleted).toEqual([["n-1", "u-1"]]);
  });

  it("never gets in the way of an ordinary notification", async () => {
    (notificationRepository as any).getById = async () => ({
      ...blocking,
      requiresAction: false,
    });
    (notificationRepository as any).getStatus = async () => {
      throw new Error("should not be consulted");
    };

    await notificationService.delete("n-1", "u-1");

    expect(deleted).toEqual([["n-1", "u-1"]]);
  });
});

describe("NotificationService.getForUser", () => {
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    ...blocking,
    id,
    isRead: false,
    actionCompleted: false,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  });

  beforeEach(() => {
    (notificationRepository as any).countForUser = async () => ({ total: 3, unread: 2 });
  });

  it("stamps each actionable notification with whether its action is settled", async () => {
    (notificationRepository as any).getPageForUser = async () => [
      row("n-1"),
      row("n-2"),
      row("n-3", { requiresAction: false }),
    ];
    pendingIds = ["n-1"];

    const page = await notificationService.getForUser("u-1");

    expect(page.data.map((n) => [n.id, n.actionResolved])).toEqual([
      ["n-1", false],
      ["n-2", true],
      ["n-3", false],
    ]);
    // The match id stays server-side; the type is what the client draws the card from
    expect(page.data[0]).not.toHaveProperty("matchId");
    expect(page.data[0]!.type).toBe("MATCH_POST_DISPUTE");
  });

  it("reports the counts of the whole feed, not of the page", async () => {
    (notificationRepository as any).getPageForUser = async () => [row("n-1")];
    (notificationRepository as any).countForUser = async () => ({ total: 812, unread: 47 });

    const page = await notificationService.getForUser("u-1", "fr", { limit: 20 });

    expect(page.data).toHaveLength(1);
    expect(page.total).toBe(812);
    expect(page.unreadCount).toBe(47);
  });

  it("asks for one row beyond the page and hands back a cursor when it comes", async () => {
    let requested = 0;
    (notificationRepository as any).getPageForUser = async (_u: string, limit: number) => {
      requested = limit;
      return [row("n-1"), row("n-2"), row("n-3")];
    };

    const page = await notificationService.getForUser("u-1", "fr", { limit: 2 });

    expect(requested).toBe(3);
    expect(page.data.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  it("closes the feed once the last page is served", async () => {
    (notificationRepository as any).getPageForUser = async () => [row("n-1")];

    const page = await notificationService.getForUser("u-1", "fr", { limit: 20 });

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("resumes from the cursor it handed out", async () => {
    const seen: Array<{ createdAt: Date; id: string } | undefined> = [];
    (notificationRepository as any).getPageForUser = async (
      _u: string,
      _limit: number,
      cursor?: { createdAt: Date; id: string },
    ) => {
      seen.push(cursor);
      return seen.length === 1 ? [row("n-1"), row("n-2")] : [row("n-3")];
    };

    const first = await notificationService.getForUser("u-1", "fr", { limit: 1 });
    await notificationService.getForUser("u-1", "fr", {
      limit: 1,
      cursor: first.nextCursor!,
    });

    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toEqual({
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      id: "n-1",
    });
  });

  it("refuses a cursor it did not write", async () => {
    (notificationRepository as any).getPageForUser = async () => [];

    try {
      await notificationService.getForUser("u-1", "fr", { cursor: "not-a-cursor" });
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });
});

describe("NotificationService bulk operations", () => {
  it("marks the whole feed read in one call", async () => {
    let calledWith: string | undefined;
    (notificationRepository as any).markAllAsRead = async (userId: string) => {
      calledWith = userId;
      return 412;
    };

    expect(await notificationService.markAllAsRead("u-1")).toEqual({
      affected: 412,
      kept: 0,
    });
    expect(calledWith).toBe("u-1");
  });

  it("keeps the notifications whose action is still owed when clearing the feed", async () => {
    (notificationRepository as any).getUnsettledActionsForUser = async () => [
      { id: "n-1", type: "MATCH_POST_DISPUTE", requiresAction: true, matchId: "m-1" },
      { id: "n-2", type: "MATCH_VALIDATION", requiresAction: true, matchId: "m-2" },
    ];
    pendingIds = ["n-1"];
    let keptIds: string[] = [];
    (notificationRepository as any).deleteAllForUser = async (_userId: string, keep: string[]) => {
      keptIds = keep;
      return 57;
    };

    expect(await notificationService.deleteAllForUser("u-1")).toEqual({
      affected: 57,
      kept: 1,
    });
    expect(keptIds).toEqual(["n-1"]);
  });
});
