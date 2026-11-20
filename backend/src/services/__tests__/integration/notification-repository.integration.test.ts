import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { notificationRepository } from "../../../repository/notification.repository";
import { makeSeeder } from "../helpers/db-seed";
import { notifications, notificationStatus } from "../../../db/schema";
import { eq } from "drizzle-orm";

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("notificationRepository (integration)", () => {
  let ann: string;
  let bob: string;
  let matchId: string;

  const base = (userId: string, extra: Record<string, unknown> = {}) =>
    ({
      userId,
      type: "MATCH_VALIDATION",
      titleKey: "notifications.title",
      messageKey: "notifications.message",
      translationParams: { n: 1 },
      actionUrl: "/matches/x",
      requiresAction: false,
      matchId,
      ...extra,
    }) as never;

  beforeAll(async () => {
    const admin = await seed.createUser("Admin");
    ann = await seed.createUser("Ann");
    bob = await seed.createUser("Bob");
    const tournamentId = await seed.createTournament(admin);
    const [eA, eB] = await Promise.all([seed.createEntry(tournamentId, [ann]), seed.createEntry(tournamentId, [bob])]);
    matchId = await seed.createMatch({ tournamentId, entryA: eA, entryB: eB, status: "reported", winnerSide: null });
  });

  it("creates a notification together with the recipient's state", async () => {
    const created = await notificationRepository.create(base(ann));
    const status = await notificationRepository.getStatus(created.id, ann);
    expect(status).toMatchObject({ read: false, actionCompleted: false });
    expect((await notificationRepository.getById(created.id))?.titleKey).toBe("notifications.title");
    expect(await notificationRepository.getById(MISSING)).toBeUndefined();
    expect(await notificationRepository.getStatus(created.id, bob)).toBeUndefined();
  });

  it("marks one notification as read, and an action as completed (read too)", async () => {
    const n = await notificationRepository.create(base(ann, { requiresAction: true }));
    await notificationRepository.markAsRead(n.id, ann);
    expect((await notificationRepository.getStatus(n.id, ann))?.read).toBe(true);

    const m = await notificationRepository.create(base(ann, { requiresAction: true }));
    await notificationRepository.markActionCompleted(m.id, ann);
    expect(await notificationRepository.getStatus(m.id, ann)).toMatchObject({ read: true, actionCompleted: true });
  });

  it("pages the feed newest first with a keyset cursor", async () => {
    const user = await seed.createUser("Pager");
    const created = [];
    for (let i = 0; i < 3; i++) created.push(await notificationRepository.create(base(user)));
    const firstPage = await notificationRepository.getPageForUser(user, 2);
    expect(firstPage).toHaveLength(2);
    const last = firstPage[1]!;
    const secondPage = await notificationRepository.getPageForUser(user, 2, { createdAt: last.createdAt, id: last.id });
    expect(secondPage).toHaveLength(1);
    expect(new Set([...firstPage, ...secondPage].map((r) => r.id)).size).toBe(3);
  });

  it("lists unsettled actions and counts read and unread", async () => {
    const user = await seed.createUser("Counter");
    const pending = await notificationRepository.create(base(user, { requiresAction: true }));
    const done = await notificationRepository.create(base(user, { requiresAction: true }));
    await notificationRepository.markActionCompleted(done.id, user);
    await notificationRepository.create(base(user));

    expect((await notificationRepository.getUnsettledActionsForUser(user)).map((r) => r.id)).toEqual([pending.id]);
    expect(await notificationRepository.countForUser(user)).toEqual({ total: 3, unread: 2 });
    expect(await notificationRepository.countForUser(MISSING)).toEqual({ total: 0, unread: 0 });
  });

  it("marks everything read in one statement", async () => {
    const user = await seed.createUser("Reader");
    await notificationRepository.create(base(user));
    await notificationRepository.create(base(user));
    expect(await notificationRepository.markAllAsRead(user)).toBe(2);
    expect(await notificationRepository.markAllAsRead(user)).toBe(0);
  });

  it("deletes one copy, and the notification once nobody holds it", async () => {
    const n = await notificationRepository.create(base(ann));
    await testDb
      .insert(notificationStatus)
      .values({ notificationId: n.id, userId: bob, read: false, actionCompleted: false });

    await notificationRepository.delete(n.id, ann);
    expect(await notificationRepository.getById(n.id)).toBeDefined();
    await notificationRepository.delete(n.id, bob);
    expect(await notificationRepository.getById(n.id)).toBeUndefined();
  });

  it("empties a feed except for the kept ids", async () => {
    const user = await seed.createUser("Cleaner");
    const keep = await notificationRepository.create(base(user));
    await notificationRepository.create(base(user));
    await notificationRepository.create(base(user));

    expect(await notificationRepository.deleteAllForUser(user, [keep.id])).toBe(2);
    expect(await notificationRepository.countForUser(user)).toEqual({ total: 1, unread: 1 });
    expect(await notificationRepository.deleteAllForUser(user, [])).toBe(1);
    expect(await notificationRepository.deleteAllForUser(user, [])).toBe(0);
  });

  it("sweeps read, settled notifications older than the cutoff in bounded batches", async () => {
    const user = await seed.createUser("Sweeper");
    const old = new Date("2020-01-01T00:00:00Z");
    const make = async (opts: { read: boolean; requiresAction?: boolean; done?: boolean }) => {
      const n = await notificationRepository.create(base(user, { requiresAction: opts.requiresAction ?? false }));
      await testDb.update(notifications).set({ createdAt: old }).where(eq(notifications.id, n.id));
      await testDb
        .update(notificationStatus)
        .set({ read: opts.read, actionCompleted: opts.done ?? false })
        .where(eq(notificationStatus.notificationId, n.id));
      return n.id;
    };
    const readOld = await make({ read: true });
    await make({ read: false });
    await make({ read: true, requiresAction: true, done: false });
    const settledOld = await make({ read: true, requiresAction: true, done: true });

    expect(await notificationRepository.deleteReadOlderThan(new Date("2021-01-01"), 1)).toBe(1);
    expect(await notificationRepository.deleteReadOlderThan(new Date("2021-01-01"), 10)).toBe(1);
    expect(await notificationRepository.deleteReadOlderThan(new Date("2021-01-01"), 10)).toBe(0);
    for (const id of [readOld, settledOld]) expect(await notificationRepository.getById(id)).toBeUndefined();
  });

  describe("per-match lookups and cleanup", () => {
    it("finds who still holds an unread notification of a type for a match", async () => {
      const m = await seed.createUser("Holder");
      await notificationRepository.create(base(m, { type: "MATCH_MESSAGE" }));
      const users = await notificationRepository.getUserIdsWithUnreadOfTypeForMatch(matchId, "MATCH_MESSAGE" as never);
      expect(users.has(m)).toBe(true);
      expect(await notificationRepository.hasUnreadOfTypeForMatch(m, matchId, "MATCH_MESSAGE" as never)).toBe(true);
      expect(await notificationRepository.hasUnreadOfTypeForMatch(m, matchId, "BADGE_AWARDED" as never)).toBe(false);
      expect(await notificationRepository.hasUnreadOfTypeForMatch(m, MISSING, "MATCH_MESSAGE" as never)).toBe(false);
    });

    it("deletes the actions of a match for one user, one type, or everybody", async () => {
      const x = await seed.createUser("X");
      const y = await seed.createUser("Y");
      await notificationRepository.create(base(x, { requiresAction: true, type: "MATCH_VALIDATION" }));
      await notificationRepository.create(base(x, { requiresAction: true, type: "MATCH_POST_DISPUTE" }));
      await notificationRepository.create(base(y, { requiresAction: true, type: "MATCH_VALIDATION" }));

      const forUser = await notificationRepository.deleteActionsByMatchIdForUser(matchId, x);
      expect(forUser.map((r) => r.userId)).toEqual([x, x]);

      await notificationRepository.create(base(x, { requiresAction: true, type: "MATCH_VALIDATION" }));
      const ofType = await notificationRepository.deleteActionsByMatchIdAndType(matchId, "MATCH_VALIDATION" as never);
      expect(ofType.length).toBeGreaterThanOrEqual(2);

      await notificationRepository.create(base(y, { requiresAction: true }));
      const all = await notificationRepository.deleteActionsByMatchId(matchId);
      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(await notificationRepository.deleteActionsByMatchId(matchId)).toEqual([]);
    });
  });
});
