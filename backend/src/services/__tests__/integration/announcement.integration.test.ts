import { describe, it, expect, beforeAll, beforeEach, afterAll, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { announcementService } from "../../announcement.service";
import { notificationService } from "../../notification.service";
import { webSocketService } from "../../websocket.service";
import {
  announcements,
  appUsers,
  matches,
  notifications,
  notificationStatus,
  tournamentAdmins,
  tournamentParticipants,
  tournaments,
  user as betterAuthUser,
} from "../../../db/schema";
import type { CreateAnnouncementInput } from "@skol-arena/shared";

type Role = "player" | "tournament_admin" | "super_admin" | "kiosk";

async function createUser(name: string, role: Role = "player") {
  const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [authUser] = await testDb
    .insert(betterAuthUser)
    .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
    .returning();
  const [appUser] = await testDb
    .insert(appUsers)
    .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: authUser.id, role })
    .returning();
  return appUser.id;
}

async function createTournament(createdBy: string) {
  const [row] = await testDb
    .insert(tournaments)
    .values({
      name: `Announcements ${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "ongoing",
      createdBy,
    })
    .returning();
  return row.id;
}

/** Notifications a user holds, with their read state. */
async function feedOf(userId: string) {
  return testDb
    .select({ id: notifications.id, type: notifications.type, read: notificationStatus.read })
    .from(notifications)
    .innerJoin(notificationStatus, eq(notificationStatus.notificationId, notifications.id))
    .where(eq(notificationStatus.userId, userId));
}

const input = (overrides: Partial<CreateAnnouncementInput>): CreateAnnouncementInput => ({
  title: "Three new badges",
  body: "Go and earn them!",
  audience: "all",
  tournamentId: null,
  inFeed: true,
  asPopup: true,
  ...overrides,
});

afterAll(async () => {
  await closeTestDatabase();
});

describe("Announcements (integration)", () => {
  let superAdmin: string;
  let coAdmin: string;
  let alice: string;
  let bob: string;
  let outsider: string;
  let kiosk: string;
  let tournamentId: string;

  beforeAll(async () => {
    superAdmin = await createUser("Super", "super_admin");
    coAdmin = await createUser("CoAdmin", "tournament_admin");
    alice = await createUser("Alice");
    bob = await createUser("Bob");
    outsider = await createUser("Outsider");
    kiosk = await createUser("Kiosk", "kiosk");
    tournamentId = await createTournament(superAdmin);
    await testDb.insert(tournamentAdmins).values({ tournamentId, userId: coAdmin, role: "co_admin" });
    await testDb.insert(tournamentParticipants).values([
      { tournamentId, userId: alice, status: "active" },
      { tournamentId, userId: bob, status: "withdrawn" },
      { tournamentId, userId: coAdmin, status: "active" },
    ]);
  });

  beforeEach(async () => {
    await testDb.delete(announcements);
    await testDb.delete(notificationStatus);
    await testDb.delete(notifications);
  });

  describe("permissions", () => {
    it("lets a tournament's co-admin publish to that tournament only", async () => {
      await expect(
        announcementService.create(coAdmin, input({ audience: "tournament", tournamentId })),
      ).resolves.toHaveProperty("id");
      await expect(announcementService.create(coAdmin, input({ audience: "all" }))).rejects.toThrow(
        "INSUFFICIENT_PERMISSIONS",
      );
    });

    it("refuses a player who does not manage the tournament", async () => {
      await expect(
        announcementService.create(alice, input({ audience: "tournament", tournamentId })),
      ).rejects.toThrow("INSUFFICIENT_PERMISSIONS");
      await expect(announcementService.list(alice)).rejects.toThrow("INSUFFICIENT_PERMISSIONS");
    });
  });

  describe("feed fan-out", () => {
    it("reaches the tournament's active players only, never the author", async () => {
      await announcementService.create(coAdmin, input({ audience: "tournament", tournamentId }));

      expect(await feedOf(alice)).toHaveLength(1);
      expect(await feedOf(bob)).toHaveLength(0);
      expect(await feedOf(outsider)).toHaveLength(0);
      expect(await feedOf(coAdmin)).toHaveLength(0);
    });

    it("reaches every active account for an app-wide one, kiosks excluded", async () => {
      await announcementService.create(superAdmin, input({ audience: "all" }));

      for (const id of [alice, bob, outsider, coAdmin]) expect(await feedOf(id)).toHaveLength(1);
      expect(await feedOf(kiosk)).toHaveLength(0);
      expect(await feedOf(superAdmin)).toHaveLength(0);
    });

    it("sends nothing to the feed for a pop-up-only announcement", async () => {
      await announcementService.create(superAdmin, input({ inFeed: false }));
      expect(await feedOf(alice)).toHaveLength(0);
    });

    it("lists the announcement with its recipient count", async () => {
      await announcementService.create(coAdmin, input({ audience: "tournament", tournamentId }));
      const [listed] = await announcementService.list(coAdmin, tournamentId);
      expect(listed.recipientCount).toBe(1);
      expect(listed.authorName).toBe("CoAdmin");
    });
  });

  describe("pop-ups", () => {
    it("scopes pending pop-ups to the app or to a tournament the user plays in", async () => {
      await announcementService.create(superAdmin, input({ title: "Global" }));
      await announcementService.create(coAdmin, input({ title: "Local", audience: "tournament", tournamentId }));

      expect((await announcementService.getPendingPopups(alice)).map((a) => a.title)).toEqual(["Global"]);
      expect((await announcementService.getPendingPopups(alice, tournamentId)).map((a) => a.title)).toEqual(["Local"]);
      expect(await announcementService.getPendingPopups(outsider, tournamentId)).toEqual([]);
    });

    it("stops showing a pop-up past its end date, but leaves it in the feed", async () => {
      const tomorrow = new Date(Date.now() + 86_400_000);
      await announcementService.create(superAdmin, input({ title: "Running", expiresAt: tomorrow }));
      const { id } = await announcementService.create(superAdmin, input({ title: "Ending", expiresAt: tomorrow }));
      await testDb
        .update(announcements)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(announcements.id, id));

      expect((await announcementService.getPendingPopups(alice)).map((a) => a.title)).toEqual(["Running"]);
      expect(await feedOf(alice)).toHaveLength(2);
      const listed = await announcementService.list(superAdmin);
      expect(listed.find((a) => a.id === id)?.expiresAt).not.toBeNull();
    });

    it("refuses an end date already past", async () => {
      const { createAnnouncementSchema } = await import("@skol-arena/shared");
      const parsed = createAnnouncementSchema.safeParse(input({ expiresAt: new Date(Date.now() - 1000) }));
      expect(parsed.success).toBe(false);
    });

    it("dismissing a pop-up hides it and marks its feed copy read", async () => {
      const { id } = await announcementService.create(superAdmin, input({}));

      await announcementService.markSeen(alice, id);

      expect(await announcementService.getPendingPopups(alice)).toEqual([]);
      expect(await feedOf(alice)).toEqual([expect.objectContaining({ read: true })]);
      expect(await feedOf(bob)).toEqual([expect.objectContaining({ read: false })]);
    });
  });

  it("deleting an announcement removes its copies from every feed, open bells included", async () => {
    const { id } = await announcementService.create(superAdmin, input({}));
    const [aliceCopy] = await feedOf(alice);
    const send = spyOn(webSocketService, "send");
    try {
      await announcementService.delete(superAdmin, id);
      expect(send).toHaveBeenCalledWith(alice, {
        event: "notification_deleted",
        data: { id: aliceCopy.id },
      });
    } finally {
      send.mockRestore();
    }
    expect(await feedOf(alice)).toHaveLength(0);
  });
});

describe("MATCH_CREATED auto-read (integration)", () => {
  async function seedMatchNotification(userId: string, matchId: string, type: "MATCH_CREATED" | "MATCH_VALIDATION") {
    const [n] = await testDb
      .insert(notifications)
      .values({
        userId,
        type,
        titleKey: `notifications.${type}_TITLE`,
        messageKey: `notifications.${type}_MESSAGE`,
        requiresAction: type === "MATCH_VALIDATION",
        matchId,
      })
      .returning();
    await testDb.insert(notificationStatus).values({ notificationId: n.id, userId });
    return n.id;
  }

  it("marks only the player's own MATCH_CREATED read, never an actionable one", async () => {
    const admin = await createUser("Admin", "super_admin");
    const player = await createUser("Player");
    const teammate = await createUser("Teammate");
    const tournamentId = await createTournament(admin);
    const [match] = await testDb
      .insert(matches)
      .values({ tournamentId, status: "finalized", winnerSide: "A", playedAt: new Date(), createdBy: admin })
      .returning();

    const created = await seedMatchNotification(player, match.id, "MATCH_CREATED");
    await seedMatchNotification(player, match.id, "MATCH_VALIDATION");
    await seedMatchNotification(teammate, match.id, "MATCH_CREATED");

    const ids = await notificationService.markMatchCreatedRead(player, [match.id]);

    expect(ids).toEqual([created]);
    const feed = await feedOf(player);
    expect(feed.find((n) => n.type === "MATCH_CREATED")?.read).toBe(true);
    expect(feed.find((n) => n.type === "MATCH_VALIDATION")?.read).toBe(false);
    expect((await feedOf(teammate))[0].read).toBe(false);
  });
});
