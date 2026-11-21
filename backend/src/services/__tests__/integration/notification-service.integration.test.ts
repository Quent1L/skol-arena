import { describe, it, expect, mock, beforeAll, beforeEach } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

let sendImpl: (sub: unknown, payload: string) => Promise<unknown> = async () => ({});
const sendNotification = mock((sub: unknown, payload: string) => sendImpl(sub, payload));
mock.module("web-push", () => ({ setVapidDetails: () => {}, sendNotification }));

const wsSend = mock((_userId: string, _message: unknown) => true);
mock.module("../../websocket.service", () => ({ webSocketService: { send: wsSend } }));

let pending = new Set<string>();
mock.module("../../notification-action.service", () => ({
  notificationActionService: { resolvePendingActions: async () => pending },
}));

const { notificationService } = await import("../../notification.service");
const { notificationRepository } = await import("../../../repository/notification.repository");
const { pushDeviceRepository } = await import("../../../repository/push-device.repository");
const { makeSeeder } = await import("../helpers/db-seed");
const { BadRequestError, ForbiddenError, NotFoundError } = await import("../../../types/errors");

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";
const KNOWN_ENDPOINT = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;

describe("notificationService (integration)", () => {
  let ann: string;
  let bob: string;
  let matchId: string;

  const base = (userId: string, extra: Record<string, unknown> = {}) =>
    ({
      userId,
      type: "MATCH_VALIDATION",
      titleKey: "notifications.title",
      messageKey: "notifications.message",
      translationParams: {},
      actionUrl: "/x",
      requiresAction: false,
      matchId,
      ...extra,
    }) as never;

  beforeAll(async () => {
    const admin = await seed.createUser("Admin");
    ann = await seed.createUser("Ann");
    bob = await seed.createUser("Bob");
    const tournamentId = await seed.createTournament(admin);
    const [a, b] = await Promise.all([seed.createEntry(tournamentId, [ann]), seed.createEntry(tournamentId, [bob])]);
    matchId = await seed.createMatch({ tournamentId, entryA: a, entryB: b, status: "reported", winnerSide: null });
  });

  beforeEach(() => {
    wsSend.mockClear();
    sendNotification.mockClear();
    sendImpl = async () => ({});
    pending = new Set();
  });

  describe("send", () => {
    it("stores the notification, pushes it over the socket and to every device", async () => {
      await notificationService.registerPushDevice(ann, {
        deviceType: "WEB",
        subscriptionEndpoint: KNOWN_ENDPOINT("ok"),
        subscriptionData: { keys: { p256dh: "p", auth: "a" } },
        locale: "en",
      } as never);

      const sent = await notificationService.send(base(ann));

      expect(sent.userId).toBe(ann);
      expect(wsSend).toHaveBeenCalledTimes(1);
      expect(wsSend.mock.calls[0]![1]).toMatchObject({ event: "new_notification" });
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(JSON.parse(sendNotification.mock.calls[0]![1]).id).toBe(sent.id);
    });

    it("drops a device with an endpoint outside the known push services", async () => {
      const [device] = await pushDeviceRepository.register(bob, {
        deviceType: "WEB",
        subscriptionEndpoint: "https://evil.example/push",
        subscriptionData: { keys: { auth: "a" } },
      } as never);
      await notificationService.send(base(bob));
      expect(sendNotification).not.toHaveBeenCalled();
      expect((await notificationService.getPushDevices(bob)).map((d) => d.id)).not.toContain(device!.id);
    });

    it("skips a device without keys and removes one whose subscription expired", async () => {
      const user = await seed.createUser("Pushy");
      await pushDeviceRepository.register(user, {
        deviceType: "WEB",
        subscriptionEndpoint: KNOWN_ENDPOINT("nokeys"),
        subscriptionData: null,
      } as never);
      const [expired] = await pushDeviceRepository.register(user, {
        deviceType: "WEB",
        subscriptionEndpoint: KNOWN_ENDPOINT("gone"),
        subscriptionData: { keys: { p256dh: "p", auth: "a" } },
      } as never);
      sendImpl = async (sub) => {
        if ((sub as { endpoint: string }).endpoint.endsWith("gone"))
          throw Object.assign(new Error("gone"), { statusCode: 410 });
        return {};
      };

      await notificationService.send(base(user));

      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect((await notificationService.getPushDevices(user)).map((d) => d.id)).not.toContain(expired!.id);
    });

    it("keeps a device on a transient push error", async () => {
      const user = await seed.createUser("Flaky");
      const [device] = await pushDeviceRepository.register(user, {
        deviceType: "WEB",
        subscriptionEndpoint: KNOWN_ENDPOINT("flaky"),
        subscriptionData: { keys: { p256dh: "p", auth: "a" } },
      } as never);
      sendImpl = async () => {
        throw new Error("timeout");
      };
      await notificationService.send(base(user));
      expect((await notificationService.getPushDevices(user)).map((d) => d.id)).toContain(device!.id);
    });
  });

  describe("push devices", () => {
    it("lets the owner re-register but refuses a stranger without the secret", async () => {
      const owner = await seed.createUser("DeviceOwner");
      const thief = await seed.createUser("Thief");
      const endpoint = KNOWN_ENDPOINT("claim");
      const data = (auth: string) =>
        ({
          deviceType: "WEB",
          subscriptionEndpoint: endpoint,
          subscriptionData: { keys: { p256dh: "p", auth } },
        }) as never;
      await notificationService.registerPushDevice(owner, data("secret"));
      await notificationService.registerPushDevice(owner, data("secret"));

      await expect(notificationService.registerPushDevice(thief, data("guess"))).rejects.toBeInstanceOf(ForbiddenError);
      const moved = await notificationService.registerPushDevice(thief, data("secret"));
      expect(moved[0]!.userId).toBe(thief);
    });

    it("removes a device", async () => {
      const user = await seed.createUser("Remover");
      const [device] = await notificationService.registerPushDevice(user, {
        deviceType: "WEB",
        subscriptionEndpoint: KNOWN_ENDPOINT("rm"),
        subscriptionData: { keys: { p256dh: "p", auth: "a" } },
      } as never);
      expect(await notificationService.removePushDevice(user, device!.id)).toHaveLength(1);
    });
  });

  describe("feed", () => {
    it("pages with an opaque cursor and reports totals", async () => {
      const user = await seed.createUser("Reader");
      for (let i = 0; i < 3; i++) await notificationService.send(base(user));

      const first = await notificationService.getForUser(user, "en", { limit: 2 });
      expect(first.data).toHaveLength(2);
      expect(first).toMatchObject({ hasMore: true, total: 3, unreadCount: 3 });
      expect(first.nextCursor).toBeTruthy();

      const second = await notificationService.getForUser(user, "fr", { limit: 2, cursor: first.nextCursor! });
      expect(second.data).toHaveLength(1);
      expect(second).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it("rejects a malformed cursor", async () => {
      await expect(notificationService.getForUser(ann, "fr", { cursor: "not-a-cursor" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("flags actions that are no longer pending as resolved", async () => {
      const user = await seed.createUser("Actor");
      const open = await notificationService.send(base(user, { requiresAction: true }));
      const done = await notificationService.send(base(user, { requiresAction: true }));
      pending = new Set([open.id]);

      const feed = await notificationService.getForUser(user);
      expect(feed.data.find((n) => n.id === open.id)?.actionResolved).toBe(false);
      expect(feed.data.find((n) => n.id === done.id)?.actionResolved).toBe(true);
    });
  });

  describe("state changes", () => {
    it("marks as read, completes actions, and marks everything read", async () => {
      const user = await seed.createUser("Marker");
      const n = await notificationService.send(base(user, { requiresAction: true }));
      await notificationService.markAsRead(n.id, user);
      await notificationService.markActionCompleted(n.id, user);
      await notificationService.send(base(user));
      expect(await notificationService.markAllAsRead(user)).toEqual({ affected: 1, kept: 0 });
    });

    it("deletes everything but the actions still pending", async () => {
      const user = await seed.createUser("Cleaner");
      const open = await notificationService.send(base(user, { requiresAction: true }));
      await notificationService.send(base(user));
      pending = new Set([open.id]);

      expect(await notificationService.deleteAllForUser(user)).toEqual({ affected: 1, kept: 1 });
    });

    it("refuses to delete a notification whose action is pending, allows it once settled", async () => {
      const user = await seed.createUser("Deleter");
      const open = await notificationService.send(base(user, { requiresAction: true }));
      pending = new Set([open.id]);
      await expect(notificationService.delete(open.id, user)).rejects.toBeInstanceOf(BadRequestError);

      pending = new Set();
      await notificationService.delete(open.id, user);
      expect(await notificationRepository.getById(open.id)).toBeUndefined();
      await expect(notificationService.delete(MISSING, user)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("skips the pending check once the action was completed", async () => {
      const user = await seed.createUser("Completer");
      const done = await notificationService.send(base(user, { requiresAction: true }));
      await notificationService.markActionCompleted(done.id, user);
      pending = new Set([done.id]);
      await notificationService.delete(done.id, user);
      expect(await notificationRepository.getById(done.id)).toBeUndefined();
    });
  });

  describe("per-match helpers", () => {
    it("delegates the unread lookups", async () => {
      const user = await seed.createUser("Lookup");
      await notificationService.send(base(user, { type: "MATCH_MESSAGE" }));
      expect(
        (await notificationService.getUserIdsWithUnreadOfTypeForMatch(matchId, "MATCH_MESSAGE" as never)).has(user),
      ).toBe(true);
      expect(await notificationService.hasUnreadOfTypeForMatch(user, matchId, "MATCH_MESSAGE" as never)).toBe(true);
    });

    it("tells connected clients when actions are deleted", async () => {
      const x = await seed.createUser("SockX");
      await notificationService.send(base(x, { requiresAction: true, type: "MATCH_VALIDATION" }));
      wsSend.mockClear();
      const forUser = await notificationService.deleteActionsByMatchIdForUser(matchId, x);
      expect(forUser).toHaveLength(1);
      expect(wsSend).toHaveBeenCalledWith(x, { event: "notification_deleted", data: { id: forUser[0]!.id } });

      await notificationService.send(base(x, { requiresAction: true, type: "MATCH_POST_DISPUTE" }));
      expect(
        (await notificationService.deleteActionsByMatchIdAndType(matchId, "MATCH_POST_DISPUTE" as never)).length,
      ).toBeGreaterThanOrEqual(1);

      await notificationService.send(base(x, { requiresAction: true }));
      expect((await notificationService.deleteActionsByMatchId(matchId)).length).toBeGreaterThanOrEqual(1);
      expect(await notificationService.deleteActionsByMatchId(matchId)).toEqual([]);
    });
  });
});
