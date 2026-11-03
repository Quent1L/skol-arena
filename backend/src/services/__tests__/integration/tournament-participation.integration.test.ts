import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
} from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`
// createTestDatabase() will call setTestDatabase() to make the shared `db` export point to the test instance
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

// Now import the services - they will use the test database through the shared `db` proxy
import { tournamentService } from "../../tournament.service";
import { participantRepository } from "../../../repository/participant.repository";
import { tournaments, appUsers, user as betterAuthUser } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { insertTournamentConfigs } from "../helpers/tournament-config-test-helpers";

describe("Tournament Participation Integration Tests", () => {
  let testTournamentId: string;
  let testUserId: string;
  let anotherUserId: string;
  let betterAuthUserId1: string;
  let betterAuthUserId2: string;

  beforeAll(async () => {
    // Create Better Auth users first
    const [authUser1] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-${Date.now()}`,
        name: "Test User Participation",
        email: `test-participation-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();
    betterAuthUserId1 = authUser1.id;

    const [authUser2] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-2-${Date.now()}`,
        name: "Another Test User",
        email: `test-participation-2-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();
    betterAuthUserId2 = authUser2.id;

    // Create app users
    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Test User Participation",
        shortName: "TESTP",
        externalId: betterAuthUserId1,
      })
      .returning();
    testUserId = user.id;

    const [user2] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Another Test User",
        shortName: "ANOTH",
        externalId: betterAuthUserId2,
      })
      .returning();
    anotherUserId = user2.id;
  });

  beforeEach(async () => {
    // Create a fresh test tournament before each test
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `Test Tournament ${Date.now()}`,
        description: "Test tournament for participation",
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        startDate: today,
        endDate: nextWeek,
        status: "open",
        createdBy: testUserId,
      })
      .returning();
    testTournamentId = tournament.id;
    await insertTournamentConfigs(testDb, testTournamentId, {
      championship: { maxMatchesPerPlayer: 10, maxTimesWithSamePartner: 2, maxTimesWithSameOpponent: 2 },
    });
  });

  afterAll(async () => {
    // Close the test database
    await closeTestDatabase();
  });

  describe("joinTournament", () => {
    it("should allow user to join open tournament", async () => {
      const result = await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });

      expect(result).toBeDefined();
      expect(result!.id).toBeDefined();
      expect(result!.userId).toBe(testUserId);
      expect(result!.tournamentId).toBe(testTournamentId);
      expect(result!.status).toBe("active");
      expect(result!.user).toBeDefined();
      expect(result!.tournament).toBeDefined();
    });

    it("should prevent duplicate registration", async () => {
      // First join should succeed
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });

      // Second join should fail
      await expect(
        tournamentService.joinTournament(testUserId, {
          tournamentId: testTournamentId,
        }),
      ).rejects.toThrow();
    });

    it("should allow multiple users to join same tournament", async () => {
      const result1 = await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });

      const result2 = await tournamentService.joinTournament(anotherUserId, {
        tournamentId: testTournamentId,
      });

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.userId).toBe(testUserId);
      expect(result2!.userId).toBe(anotherUserId);
    });

    it("should fail when tournament does not exist", async () => {
      await expect(
        tournamentService.joinTournament(testUserId, {
          tournamentId: "non-existent-id",
        }),
      ).rejects.toThrow();
    });

    it("should fail when tournament is not open", async () => {
      // Change tournament status to finished
      await testDb
        .update(tournaments)
        .set({ status: "finished" })
        .where(eq(tournaments.id, testTournamentId));

      await expect(
        tournamentService.joinTournament(testUserId, {
          tournamentId: testTournamentId,
        }),
      ).rejects.toThrow();
    });
  });

  describe("leaveTournament", () => {
    beforeEach(async () => {
      // Join tournament before each test
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });
    });

    it("should allow user to leave tournament before it starts", async () => {
      const result = await tournamentService.leaveTournament(
        testUserId,
        testTournamentId,
      );

      expect(result.message).toBeDefined();

      // Verify participation is marked as withdrawn
      const participation =
        await participantRepository.findParticipationByUserAndTournament(
          testUserId,
          testTournamentId,
        );
      expect(participation).toBeUndefined(); // Should not find active participation
    });

    it("should let a player leave an ongoing championship and list them as inactive", async () => {
      await testDb
        .update(tournaments)
        .set({ status: "ongoing" })
        .where(eq(tournaments.id, testTournamentId));

      await tournamentService.leaveTournament(testUserId, testTournamentId);

      const inactive = await participantRepository.findInactivePlayerIds(testTournamentId);
      expect([...inactive]).toEqual([testUserId]);
    });

    it("should prevent leaving an ongoing bracket", async () => {
      await testDb
        .update(tournaments)
        .set({ status: "ongoing", mode: "bracket" })
        .where(eq(tournaments.id, testTournamentId));

      await expect(
        tournamentService.leaveTournament(testUserId, testTournamentId),
      ).rejects.toThrow();
    });

    it("should make a player who left active again when they rejoin", async () => {
      await tournamentService.leaveTournament(testUserId, testTournamentId);
      await tournamentService.joinTournament(testUserId, { tournamentId: testTournamentId });

      const inactive = await participantRepository.findInactivePlayerIds(testTournamentId);
      expect(inactive.size).toBe(0);
    });

    it("should refuse a rejoin after an organizer removal", async () => {
      const participation = await participantRepository.findParticipationByUserAndTournament(
        testUserId,
        testTournamentId,
      );
      await participantRepository.markRemoved(participation!.id);

      await expect(
        tournamentService.joinTournament(testUserId, { tournamentId: testTournamentId }),
      ).rejects.toThrow("PARTICIPANT_REMOVED");
      const inactive = await participantRepository.findInactivePlayerIds(testTournamentId);
      expect([...inactive]).toEqual([testUserId]);
    });

    it("should prevent leaving finished tournament", async () => {
      // Change tournament status to finished
      await testDb
        .update(tournaments)
        .set({ status: "finished" })
        .where(eq(tournaments.id, testTournamentId));

      await expect(
        tournamentService.leaveTournament(testUserId, testTournamentId),
      ).rejects.toThrow();
    });

    it("should fail when user is not registered", async () => {
      await expect(
        tournamentService.leaveTournament(anotherUserId, testTournamentId),
      ).rejects.toThrow();
    });

    it("should fail when tournament does not exist", async () => {
      await expect(
        tournamentService.leaveTournament(testUserId, "non-existent-id"),
      ).rejects.toThrow();
    });
  });

  describe("getTournamentParticipants", () => {
    it("should return empty array when no participants", async () => {
      const participants =
        await tournamentService.getTournamentParticipants(testTournamentId);

      expect(participants).toEqual([]);
    });

    it("should list all active participants", async () => {
      // Join with two users
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });
      await tournamentService.joinTournament(anotherUserId, {
        tournamentId: testTournamentId,
      });

      const participants =
        await tournamentService.getTournamentParticipants(testTournamentId);

      expect(participants).toHaveLength(2);
      expect(participants[0].user).toBeDefined();
      expect(participants[1].user).toBeDefined();

      const userIds = participants.map((p) => p.userId);
      expect(userIds).toContain(testUserId);
      expect(userIds).toContain(anotherUserId);
    });

    it("should not include withdrawn participants", async () => {
      // Join with two users
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });
      await tournamentService.joinTournament(anotherUserId, {
        tournamentId: testTournamentId,
      });

      // One user leaves
      await tournamentService.leaveTournament(testUserId, testTournamentId);

      const participants =
        await tournamentService.getTournamentParticipants(testTournamentId);

      expect(participants).toHaveLength(1);
      expect(participants[0].userId).toBe(anotherUserId);
    });

    it("should return participants ordered by join date", async () => {
      // Join with two users at different times
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await tournamentService.joinTournament(anotherUserId, {
        tournamentId: testTournamentId,
      });

      const participants =
        await tournamentService.getTournamentParticipants(testTournamentId);

      expect(participants).toHaveLength(2);
      // Sorted alphabetically by displayName: "Another Test User" < "Test User Participation"
      expect(participants[0].userId).toBe(anotherUserId);
      expect(participants[1].userId).toBe(testUserId);
    });
  });

  describe("listTournaments participation fields", () => {
    function findTest(list: Awaited<ReturnType<typeof tournamentService.listTournaments>>) {
      const found = list.find((t) => t.id === testTournamentId);
      expect(found).toBeDefined();
      return found!;
    }

    it("should report the viewer as a participant only once they joined", async () => {
      const viewer = { id: testUserId, role: "player" };

      let listed = findTest(await tournamentService.listTournaments({}, viewer));
      expect(listed.isParticipant).toBe(false);
      expect(listed.participantCount).toBe(0);

      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });

      listed = findTest(await tournamentService.listTournaments({}, viewer));
      expect(listed.isParticipant).toBe(true);
      expect(listed.participantCount).toBe(1);
    });

    it("should not leak another player's participation to the viewer", async () => {
      await tournamentService.joinTournament(anotherUserId, {
        tournamentId: testTournamentId,
      });

      const listed = findTest(
        await tournamentService.listTournaments({}, { id: testUserId, role: "player" }),
      );
      expect(listed.isParticipant).toBe(false);
      expect(listed.participantCount).toBe(1);
    });

    it("should drop a withdrawn player from both the flag and the count", async () => {
      const viewer = { id: testUserId, role: "player" };

      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });
      await tournamentService.leaveTournament(testUserId, testTournamentId);

      const listed = findTest(await tournamentService.listTournaments({}, viewer));
      expect(listed.isParticipant).toBe(false);
      expect(listed.participantCount).toBe(0);
    });

    it("should stay anonymous-safe when no user is resolved", async () => {
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });

      const listed = findTest(await tournamentService.listTournaments({}, null));
      expect(listed.isParticipant).toBe(false);
      expect(listed.participantCount).toBe(1);
    });
  });

  describe("countActiveParticipants", () => {
    it("should count active participants correctly", async () => {
      let count =
        await participantRepository.countActiveParticipants(testTournamentId);
      expect(count).toBe(0);

      // Join with first user
      await tournamentService.joinTournament(testUserId, {
        tournamentId: testTournamentId,
      });
      count =
        await participantRepository.countActiveParticipants(testTournamentId);
      expect(count).toBe(1);

      // Join with second user
      await tournamentService.joinTournament(anotherUserId, {
        tournamentId: testTournamentId,
      });
      count =
        await participantRepository.countActiveParticipants(testTournamentId);
      expect(count).toBe(2);

      // One user leaves
      await tournamentService.leaveTournament(testUserId, testTournamentId);
      count =
        await participantRepository.countActiveParticipants(testTournamentId);
      expect(count).toBe(1);
    });
  });
});
