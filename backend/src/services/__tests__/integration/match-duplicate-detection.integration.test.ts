import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
} from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
// createTestDatabase() calls setTestDatabase() so the shared `db` proxy
// routes to the PGlite instance when tests run.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

// Static imports — they are hoisted but `db` is accessed lazily through the
// proxy, so they all see the PGlite instance by the time any test runs.
import { matchService } from "../../match.service";
import {
  tournaments,
  appUsers,
  user as betterAuthUser,
  teams,
  teamMembers,
  tournamentParticipants,
  matches,
} from "../../../db/schema";
import { eq } from "drizzle-orm";
import { insertTournamentConfigs } from "../helpers/tournament-config-test-helpers";

describe("Match Duplicate Detection Integration Tests", () => {
  let testTournamentId: string;
  let testUserId: string;
  let betterAuthUserId: string;
  let teamAId: string;
  let teamBId: string;
  let player1Id: string;
  let player2Id: string;
  let player3Id: string;
  let player4Id: string;

  beforeAll(async () => {
    // Create Better Auth user
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-duplicate-${Date.now()}`,
        name: "Test User Duplicate",
        email: `test-duplicate-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning();
    betterAuthUserId = authUser.id;

    // Create app user with super_admin role
    const [user] = await testDb
      .insert(appUsers)
      .values({
        displayName: "Test User Duplicate",
        shortName: "TUD",
        externalId: betterAuthUserId,
        role: "super_admin",
      })
      .returning();
    testUserId = user.id;

    // Create players for flex mode
    const players = await Promise.all([
      testDb
        .insert(betterAuthUser)
        .values({
          id: `player1-${Date.now()}`,
          name: "Player 1",
          email: `player1-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning()
        .then((r) => r[0]),
      testDb
        .insert(betterAuthUser)
        .values({
          id: `player2-${Date.now()}`,
          name: "Player 2",
          email: `player2-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning()
        .then((r) => r[0]),
      testDb
        .insert(betterAuthUser)
        .values({
          id: `player3-${Date.now()}`,
          name: "Player 3",
          email: `player3-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning()
        .then((r) => r[0]),
      testDb
        .insert(betterAuthUser)
        .values({
          id: `player4-${Date.now()}`,
          name: "Player 4",
          email: `player4-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning()
        .then((r) => r[0]),
    ]);

    const appPlayers = await Promise.all(
      players.map((p) =>
        testDb
          .insert(appUsers)
          .values({
            displayName: p.name,
            shortName: p.name.substring(0, 5).toUpperCase(),
            externalId: p.id,
          })
          .returning()
          .then((r) => r[0]),
      ),
    );

    [player1Id, player2Id, player3Id, player4Id] = appPlayers.map((p) => p.id);

    // Create test tournament (static mode for team-based tests)
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `Test Tournament Duplicate ${Date.now()}`,
        description: "Test tournament for duplicate detection",
        mode: "championship",
        teamMode: "static",
        minTeamSize: 2,
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

    // Create teams for static mode tests
    const [teamA] = await testDb
      .insert(teams)
      .values({
        tournamentId: testTournamentId,
        name: "Team A",
        createdBy: testUserId,
      })
      .returning();
    teamAId = teamA.id;

    const [teamB] = await testDb
      .insert(teams)
      .values({
        tournamentId: testTournamentId,
        name: "Team B",
        createdBy: testUserId,
      })
      .returning();
    teamBId = teamB.id;

    // Add 2 members to each team to satisfy minTeamSize: 2
    await testDb.insert(teamMembers).values([
      { teamId: teamAId, userId: player1Id },
      { teamId: teamAId, userId: player2Id },
      { teamId: teamBId, userId: player3Id },
      { teamId: teamBId, userId: player4Id },
    ]);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe("Static mode duplicate detection", () => {
    afterEach(async () => {
      await testDb
        .delete(matches)
        .where(eq(matches.tournamentId, testTournamentId));
    });

    it("should detect duplicate match with same teams", async () => {
      // Create first match using service
      await matchService.createMatch(
        {
          tournamentId: testTournamentId,
          sides: [{ position: 1, teamId: teamAId }, { position: 2, teamId: teamBId }],
          scoreA: 2,
          scoreB: 1,
          status: "reported",
        },
        testUserId,
      );

      // Validate second match - should warn about duplicate
      const validation = await matchService.validateMatch({
        tournamentId: testTournamentId,
        sides: [{ position: 1, teamId: teamAId }, { position: 2, teamId: teamBId }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain("Un match similaire existe déjà");
    });

    it("should NOT detect duplicate when teams are different", async () => {
      // Create team C
      const [teamC] = await testDb
        .insert(teams)
        .values({
          tournamentId: testTournamentId,
          name: `Team C ${Date.now()}`,
          createdBy: testUserId,
        })
        .returning();

      // Add members to teamC to satisfy minTeamSize
      await testDb.insert(teamMembers).values([
        { teamId: teamC.id, userId: player1Id },
        { teamId: teamC.id, userId: player2Id },
      ]);

      // Validate match with different team
      const validation = await matchService.validateMatch({
        tournamentId: testTournamentId,
        sides: [{ position: 1, teamId: teamAId }, { position: 2, teamId: teamC.id }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings).not.toContain(
        "Un match similaire existe déjà",
      );
    });

    it("should exclude current match when validating for edit", async () => {
      // Create a match
      const matchResult = await matchService.createMatch(
        {
          tournamentId: testTournamentId,
          sides: [{ position: 1, teamId: teamAId }, { position: 2, teamId: teamBId }],
          scoreA: 0,
          scoreB: 0,
          status: "scheduled",
        },
        testUserId,
      );

      // Validate the same match (edit mode) - should NOT warn
      const validation = await matchService.validateMatch({
        tournamentId: testTournamentId,
        sides: [{ position: 1, teamId: teamAId }, { position: 2, teamId: teamBId }],
        matchId: matchResult!.id,
      });

      // Should not warn about itself
      expect(validation.warnings).not.toContain(
        "Un match similaire existe déjà",
      );
    });
  });

  describe("Flex mode duplicate detection", () => {
    let flexTournamentId: string;

    beforeAll(async () => {
      // Create flex mode tournament
      const today = new Date().toISOString().split("T")[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const [tournament] = await testDb
        .insert(tournaments)
        .values({
          name: `Flex Tournament ${Date.now()}`,
          description: "Test flex tournament for duplicate detection",
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
      flexTournamentId = tournament.id;
      await insertTournamentConfigs(testDb, flexTournamentId, {
        championship: { maxMatchesPerPlayer: 10, maxTimesWithSamePartner: 2, maxTimesWithSameOpponent: 2 },
      });

      // Register all players in the flex tournament
      await Promise.all([
        testDb.insert(tournamentParticipants).values({
          tournamentId: flexTournamentId,
          userId: player1Id,
          status: "active",
        }),
        testDb.insert(tournamentParticipants).values({
          tournamentId: flexTournamentId,
          userId: player2Id,
          status: "active",
        }),
        testDb.insert(tournamentParticipants).values({
          tournamentId: flexTournamentId,
          userId: player3Id,
          status: "active",
        }),
        testDb.insert(tournamentParticipants).values({
          tournamentId: flexTournamentId,
          userId: player4Id,
          status: "active",
        }),
      ]);
    });

    afterEach(async () => {
      await testDb
        .delete(matches)
        .where(eq(matches.tournamentId, flexTournamentId));
    });

    it("should detect duplicate match with same player composition", async () => {
      // Create first match using service
      await matchService.createMatch(
        {
          tournamentId: flexTournamentId,
          sides: [{ position: 1, playerIds: [player1Id, player2Id] }, { position: 2, playerIds: [player3Id, player4Id] }],
          scoreA: 2,
          scoreB: 1,
          status: "reported",
        },
        testUserId,
      );

      // Validate second match with same players - should warn
      const validation = await matchService.validateMatch({
        tournamentId: flexTournamentId,
        sides: [{ position: 1, playerIds: [player1Id, player2Id] }, { position: 2, playerIds: [player3Id, player4Id] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain("Un match similaire existe déjà");
    });

    it("should detect duplicate even with players in different order", async () => {
      // Create match using service
      await matchService.createMatch(
        {
          tournamentId: flexTournamentId,
          sides: [{ position: 1, playerIds: [player1Id, player2Id] }, { position: 2, playerIds: [player3Id, player4Id] }],
          scoreA: 2,
          scoreB: 1,
          status: "reported",
        },
        testUserId,
      );

      // Validate with same players but different order
      const validation = await matchService.validateMatch({
        tournamentId: flexTournamentId,
        sides: [{ position: 1, playerIds: [player2Id, player1Id] }, { position: 2, playerIds: [player4Id, player3Id] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain("Un match similaire existe déjà");
    });

    it("should NOT detect duplicate when player composition differs", async () => {
      // Validate match with different players
      const validation = await matchService.validateMatch({
        tournamentId: flexTournamentId,
        sides: [{ position: 1, playerIds: [player1Id, player3Id] }, { position: 2, playerIds: [player2Id, player4Id] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings).not.toContain(
        "Un match similaire existe déjà",
      );
    });
  });
});
