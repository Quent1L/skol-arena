import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";
import { newId } from "../../../utils/uuid";

// Initialize the test database BEFORE any imports that use `db`
// createTestDatabase() will call setTestDatabase() to make the shared `db` export point to the test instance
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

// Now import the services - they will use the test database through the shared `db` proxy
import { matchService } from "../../match.service";
import { entryRepository } from "../../../repository/entry.repository";
import { matchRepository } from "../../../repository/match.repository";
import {
  tournaments,
  appUsers,
  user as betterAuthUser,
  tournamentParticipants,
  tournamentEntries,
  tournamentAdmins,
  teams,
  teamMembers,
} from "../../../db/schema";
import { eq } from "drizzle-orm";
import { ConflictError, ErrorCode } from "../../../types/errors";
import { insertTournamentConfigs, setChampionshipCaps } from "../helpers/tournament-config-test-helpers";

describe("Match Partner Validation", () => {
  let tournamentId: string;
  let player1Id: string;
  let player2Id: string;
  let player3Id: string;
  let player4Id: string;
  let authUser1Id: string;
  let authUser2Id: string;
  let authUser3Id: string;
  let authUser4Id: string;

  beforeAll(async () => {
    // Generate valid UUID for tournament
    tournamentId = newId();

    const timestamp = Date.now();

    // Create Better Auth users first
    const [authUser1] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-1-${timestamp}`,
        name: "Player 1",
        email: `player1-${timestamp}@test.com`,
        emailVerified: true,
      })
      .returning();
    authUser1Id = authUser1.id;

    const [authUser2] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-2-${timestamp}`,
        name: "Player 2",
        email: `player2-${timestamp}@test.com`,
        emailVerified: true,
      })
      .returning();
    authUser2Id = authUser2.id;

    const [authUser3] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-3-${timestamp}`,
        name: "Player 3",
        email: `player3-${timestamp}@test.com`,
        emailVerified: true,
      })
      .returning();
    authUser3Id = authUser3.id;

    const [authUser4] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `test-auth-4-${timestamp}`,
        name: "Player 4",
        email: `player4-${timestamp}@test.com`,
        emailVerified: true,
      })
      .returning();
    authUser4Id = authUser4.id;

    // Create app users
    const [user1] = await testDb
      .insert(appUsers)
      .values({
        externalId: authUser1Id,
        displayName: "Player 1",
        shortName: "PLY1",
        role: "player",
      })
      .returning();
    player1Id = user1.id;

    const [user2] = await testDb
      .insert(appUsers)
      .values({
        externalId: authUser2Id,
        displayName: "Player 2",
        shortName: "PLY2",
        role: "player",
      })
      .returning();
    player2Id = user2.id;

    const [user3] = await testDb
      .insert(appUsers)
      .values({
        externalId: authUser3Id,
        displayName: "Player 3",
        shortName: "PLY3",
        role: "player",
      })
      .returning();
    player3Id = user3.id;

    const [user4] = await testDb
      .insert(appUsers)
      .values({
        externalId: authUser4Id,
        displayName: "Player 4",
        shortName: "PLY4",
        role: "player",
      })
      .returning();
    player4Id = user4.id;

    // Create tournament with flex mode
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    await testDb.insert(tournaments).values({
      id: tournamentId,
      name: "Test Tournament Partner Validation",
      createdBy: player1Id,
      teamMode: "flex",
      mode: "championship",
      status: "open",
      minTeamSize: 1,
      maxTeamSize: 2,
      startDate: today,
      endDate: nextWeek,
    });
    await insertTournamentConfigs(testDb, tournamentId, {
      // Allow max 2 matches with the same partner
      championship: { maxMatchesPerPlayer: 10, maxTimesWithSamePartner: 2, maxTimesWithSameOpponent: 10 },
    });

    // Add participants
    await testDb.insert(tournamentParticipants).values([
      { tournamentId, userId: player1Id },
      { tournamentId, userId: player2Id },
      { tournamentId, userId: player3Id },
      { tournamentId, userId: player4Id },
    ]);
  });

  it("Step 1: should count matches correctly after creating first match", async () => {
    console.log("[DEBUG] Test 1 starting...");
    console.log("[DEBUG] About to call matchService.createMatch...");
    // Create first match: Player1 + Player2 vs Player3 + Player4
    await matchService.createMatch(
      {
        tournamentId,
        sides: [
          { position: 1, playerIds: [player1Id, player2Id] },
          { position: 2, playerIds: [player3Id, player4Id] },
        ],
        status: "scheduled",
      },
      player1Id,
    );

    // Check that entry was created for Player1 + Player2
    const entry12 = await entryRepository.findExistingEntry(tournamentId, undefined, [player1Id, player2Id]);
    expect(entry12).toBeTruthy();

    // Count matches where Player1 and Player2 played together as a complete team
    const count = await matchRepository.countMatchesForTeam(tournamentId, [player1Id, player2Id]);

    expect(Number(count)).toBe(1);
  });

  it("Step 2: should count matches correctly after creating second match", async () => {
    // Create second match: Player1 + Player2 vs Player3 + Player4
    await matchService.createMatch(
      {
        tournamentId,
        sides: [
          { position: 1, playerIds: [player1Id, player2Id] },
          { position: 2, playerIds: [player3Id, player4Id] },
        ],
        status: "scheduled",
      },
      player1Id,
    );

    // Count matches where Player1 and Player2 played together as a complete team (should be 2 now)
    const count = await matchRepository.countMatchesForTeam(tournamentId, [player1Id, player2Id]);

    expect(Number(count)).toBe(2);
  });

  it("should prevent creating third match with same partners when limit is 2", async () => {
    // Try to create third match: Player1 + Player2 vs Player3 + Player4
    // This should fail because maxTimesWithSamePartner is 2

    try {
      await matchService.createMatch(
        {
          tournamentId,
          sides: [
            { position: 1, playerIds: [player1Id, player2Id] },
            { position: 2, playerIds: [player3Id, player4Id] },
          ],
          status: "scheduled",
        },
        player1Id,
      );
      throw new Error("Expected ConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.MAX_PARTNER_MATCHES_EXCEEDED);
    }
  });

  it("should validate match correctly - returns errors when partner limit exceeded", async () => {
    // Validate match creation (should fail)
    const validation = await matchService.validateMatch({
      tournamentId,
      sides: [
        { position: 1, playerIds: [player1Id, player2Id] },
        { position: 2, playerIds: [player3Id, player4Id] },
      ],
      status: "scheduled",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors[0]).toContain("Player 1");
    expect(validation.errors[0]).toContain("Player 2");
  });

  it("should not create duplicate entries during validation", async () => {
    // Get entries before validation
    const entriesBefore = await testDb
      .select()
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, tournamentId));

    const countBefore = entriesBefore.length;

    // Validate match multiple times
    await matchService.validateMatch({
      tournamentId,
      sides: [
        { position: 1, playerIds: [player1Id, player3Id] },
        { position: 2, playerIds: [player2Id, player4Id] },
      ],
      status: "scheduled",
    });

    await matchService.validateMatch({
      tournamentId,
      sides: [
        { position: 1, playerIds: [player1Id, player3Id] },
        { position: 2, playerIds: [player2Id, player4Id] },
      ],
      status: "scheduled",
    });

    // Get entries after validation
    const entriesAfter = await testDb
      .select()
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, tournamentId));

    const countAfter = entriesAfter.length;

    // Count should be the same - validation should not create entries
    expect(countAfter).toBe(countBefore);
  });

  it("should allow creating match with different partner combination", async () => {
    // Create match: Player1 + Player3 vs Player2 + Player4
    // This should succeed because Player1 hasn't played with Player3 before
    const match = await matchService.createMatch(
      {
        tournamentId,
        sides: [
          { position: 1, playerIds: [player1Id, player3Id] },
          { position: 2, playerIds: [player2Id, player4Id] },
        ],
        status: "scheduled",
      },
      player1Id,
    );

    expect(match).toBeTruthy();
    expect(match?.id).toBeTruthy();

    // Verify entry was created (or found existing)
    const entry13 = await entryRepository.findExistingEntry(tournamentId, undefined, [player1Id, player3Id]);
    expect(entry13).toBeTruthy();

    // Count matches where Player1 and Player3 played together as a complete team
    const count = await matchRepository.countMatchesForTeam(tournamentId, [player1Id, player3Id]);

    expect(Number(count)).toBe(1);
  });

  it("Step 7: should count team-vs-team opponent matches correctly", async () => {
    // At this point, we have:
    // - Match 1: [Player1+Player2] vs [Player3+Player4]
    // - Match 2: [Player1+Player2] vs [Player3+Player4]
    // - Match 3: [Player1+Player3] vs [Player2+Player4]

    // Count matches where [Player1+Player2] faced [Player3+Player4] as complete teams
    const count12vs34 = await matchRepository.countMatchesTeamsVsTeam(
      tournamentId,
      [player1Id, player2Id],
      [player3Id, player4Id],
    );
    // [P1+P2] faced [P3+P4] in Match 1 and Match 2
    expect(Number(count12vs34)).toBe(2);

    // Count matches where [Player1+Player3] faced [Player2+Player4] as complete teams
    const count13vs24 = await matchRepository.countMatchesTeamsVsTeam(
      tournamentId,
      [player1Id, player3Id],
      [player2Id, player4Id],
    );
    // [P1+P3] faced [P2+P4] only in Match 3
    expect(Number(count13vs24)).toBe(1);
  });

  it("Step 8: should not count crossed-team compositions as team-vs-team matches", async () => {
    // [P1+P4] as a team never faced [P2+P3] as a team in any existing match
    const count14vs23 = await matchRepository.countMatchesTeamsVsTeam(
      tournamentId,
      [player1Id, player4Id],
      [player2Id, player3Id],
    );
    expect(Number(count14vs23)).toBe(0);
  });

  it("Step 9 (regression): should allow {P1,P4} vs {P2,P3} even though individual pairs played before", async () => {
    // REGRESSION: Old code would block this because P4 individually played against P3
    // twice (in matches 1 and 2) and maxTimesWithSameOpponent would be 2.
    // New code checks COMPLETE TEAM compositions: [P1,P4] never faced [P2,P3] as teams → allowed.

    // Update tournament settings to have lower opponent limit (triggers old bug)
    await setChampionshipCaps(testDb, tournamentId, {
      maxTimesWithSameOpponent: 2,
    });

    // [P1,P4] vs [P2,P3] — these teams never faced each other → should be allowed
    const result = await matchService.createMatch(
      {
        tournamentId,
        sides: [
          { position: 1, playerIds: [player1Id, player4Id] },
          { position: 2, playerIds: [player2Id, player3Id] },
        ],
        status: "scheduled",
      },
      player1Id,
    );
    expect(result).toBeTruthy();
    expect(result?.id).toBeDefined();

    // Verify the count is now 1
    const count = await matchRepository.countMatchesTeamsVsTeam(
      tournamentId,
      [player1Id, player4Id],
      [player2Id, player3Id],
    );
    expect(Number(count)).toBe(1);
  });

  it("Step 10: should block match when complete team-vs-team opponent limit is reached", async () => {
    // At this point [P1,P2] faced [P3,P4] twice and maxTimesWithSameOpponent = 2.
    // Raise the partner limit to avoid the partner check blocking first.
    await setChampionshipCaps(testDb, tournamentId, {
      maxTimesWithSamePartner: 10,
    });

    // [P1,P2] vs [P3,P4] → opponent count = 2 = limit → should be blocked
    try {
      await matchService.createMatch(
        {
          tournamentId,
          sides: [
            { position: 1, playerIds: [player1Id, player2Id] },
            { position: 2, playerIds: [player3Id, player4Id] },
          ],
          status: "scheduled",
        },
        player1Id,
      );
      throw new Error("Expected ConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED);
    }
  });
});

describe("Static Team Rule Validation", () => {
  let staticTournamentId: string;
  let teamAId: string;
  let teamBId: string;
  let p1Id: string;
  let p2Id: string;
  let p3Id: string;
  let p4Id: string;

  beforeAll(async () => {
    staticTournamentId = newId();
    const timestamp = Date.now() + 9000;
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Auth users
    const authIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const [u] = await testDb
        .insert(betterAuthUser)
        .values({
          id: `st-auth-${i}-${timestamp}`,
          name: `Static P${i}`,
          email: `static-p${i}-${timestamp}@test.com`,
          emailVerified: true,
        })
        .returning();
      authIds.push(u.id);
    }

    // App users
    const appIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const [u] = await testDb
        .insert(appUsers)
        .values({
          externalId: authIds[i],
          displayName: `Static Player ${i + 1}`,
          shortName: `SP${i + 1}`,
          role: "player",
        })
        .returning();
      appIds.push(u.id);
    }
    [p1Id, p2Id, p3Id, p4Id] = appIds;

    // Tournament: static mode, tight partner/opponent limits
    await testDb.insert(tournaments).values({
      id: staticTournamentId,
      name: "Static Team Rule Test",
      createdBy: p1Id,
      teamMode: "static",
      mode: "championship",
      status: "open",
      minTeamSize: 2,
      maxTeamSize: 2,
      startDate: today,
      endDate: nextWeek,
    });
    await insertTournamentConfigs(testDb, staticTournamentId, {
      championship: { maxMatchesPerPlayer: 10, maxTimesWithSamePartner: 2, maxTimesWithSameOpponent: 10 },
    });

    // Participants
    await testDb.insert(tournamentParticipants).values([
      { tournamentId: staticTournamentId, userId: p1Id },
      { tournamentId: staticTournamentId, userId: p2Id },
      { tournamentId: staticTournamentId, userId: p3Id },
      { tournamentId: staticTournamentId, userId: p4Id },
    ]);

    // Make p1 a tournament admin so they can create matches in static mode
    await testDb.insert(tournamentAdmins).values({ tournamentId: staticTournamentId, userId: p1Id });

    // Teams
    const [tA] = await testDb
      .insert(teams)
      .values({
        tournamentId: staticTournamentId,
        name: "Team Alpha",
        createdBy: p1Id,
      })
      .returning();
    teamAId = tA.id;

    const [tB] = await testDb
      .insert(teams)
      .values({
        tournamentId: staticTournamentId,
        name: "Team Beta",
        createdBy: p3Id,
      })
      .returning();
    teamBId = tB.id;

    // Team members
    await testDb.insert(teamMembers).values([
      { teamId: teamAId, userId: p1Id },
      { teamId: teamAId, userId: p2Id },
      { teamId: teamBId, userId: p3Id },
      { teamId: teamBId, userId: p4Id },
    ]);
  });

  it("should allow first static team match", async () => {
    const result = await matchService.createMatch(
      {
        tournamentId: staticTournamentId,
        sides: [
          { position: 1, teamId: teamAId },
          { position: 2, teamId: teamBId },
        ],
        status: "scheduled",
      },
      p1Id,
    );
    expect(result).toBeTruthy();
    expect(result?.id).toBeDefined();
  });

  it("should allow second static team match when under partner limit", async () => {
    const result = await matchService.createMatch(
      {
        tournamentId: staticTournamentId,
        sides: [
          { position: 1, teamId: teamAId },
          { position: 2, teamId: teamBId },
        ],
        status: "scheduled",
      },
      p1Id,
    );
    expect(result).toBeTruthy();
  });

  it("should ignore the partner limit (2) in static mode", async () => {
    const result = await matchService.createMatch(
      {
        tournamentId: staticTournamentId,
        sides: [
          { position: 1, teamId: teamAId },
          { position: 2, teamId: teamBId },
        ],
        status: "scheduled",
      },
      p1Id,
    );
    expect(result?.id).toBeDefined();
  });

  it("should block match when opponent limit is reached", async () => {
    // Raise partner limit, lower opponent limit to 2
    await setChampionshipCaps(testDb, staticTournamentId, {
      maxTimesWithSamePartner: 10,
      maxTimesWithSameOpponent: 2,
    });

    // A vs B already played three times → opponent limit = 2 → should block
    try {
      await matchService.createMatch(
        {
          tournamentId: staticTournamentId,
          sides: [
            { position: 1, teamId: teamAId },
            { position: 2, teamId: teamBId },
          ],
          status: "scheduled",
        },
        p1Id,
      );
      throw new Error("Expected ConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED);
    }
  });

  it("should block when all players in static teams have hit match limit", async () => {
    // Set per-player limit to 2 (already played 3 matches) and raise other limits
    await setChampionshipCaps(testDb, staticTournamentId, {
      maxMatchesPerPlayer: 2,
      maxTimesWithSamePartner: 10,
      maxTimesWithSameOpponent: 10,
    });

    try {
      await matchService.createMatch(
        {
          tournamentId: staticTournamentId,
          sides: [
            { position: 1, teamId: teamAId },
            { position: 2, teamId: teamBId },
          ],
          status: "scheduled",
        },
        p1Id,
      );
      throw new Error("Expected ConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.ALL_PLAYERS_MAX_MATCHES_EXCEEDED);
    }
  });
});

describe("Flex 1v1 Opponent Validation via allPlayerIds", () => {
  let flex1v1TournamentId: string;
  let soloAId: string;
  let soloBId: string;

  beforeAll(async () => {
    flex1v1TournamentId = newId();
    const timestamp = Date.now() + 19000;
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [authA] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `solo-auth-a-${timestamp}`,
        name: "Solo A",
        email: `solo-a-${timestamp}@test.com`,
        emailVerified: true,
      })
      .returning();

    const [authB] = await testDb
      .insert(betterAuthUser)
      .values({
        id: `solo-auth-b-${timestamp}`,
        name: "Solo B",
        email: `solo-b-${timestamp}@test.com`,
        emailVerified: true,
      })
      .returning();

    const [userA] = await testDb
      .insert(appUsers)
      .values({
        externalId: authA.id,
        displayName: "Solo A",
        shortName: "SLOA",
        role: "player",
      })
      .returning();
    soloAId = userA.id;

    const [userB] = await testDb
      .insert(appUsers)
      .values({
        externalId: authB.id,
        displayName: "Solo B",
        shortName: "SLOB",
        role: "player",
      })
      .returning();
    soloBId = userB.id;

    await testDb.insert(tournaments).values({
      id: flex1v1TournamentId,
      name: "Flex 1v1 Opponent Validation Test",
      createdBy: soloAId,
      teamMode: "flex",
      mode: "championship",
      status: "open",
      minTeamSize: 1,
      maxTeamSize: 1,
      startDate: today,
      endDate: nextWeek,
    });
    await insertTournamentConfigs(testDb, flex1v1TournamentId, {
      championship: { maxMatchesPerPlayer: 10, maxTimesWithSamePartner: 10, maxTimesWithSameOpponent: 2 },
    });

    await testDb.insert(tournamentParticipants).values([
      { tournamentId: flex1v1TournamentId, userId: soloAId },
      { tournamentId: flex1v1TournamentId, userId: soloBId },
    ]);
  });

  it("should validate as valid before the opponent limit is reached", async () => {
    const validation = await matchService.validateMatch({
      tournamentId: flex1v1TournamentId,
      allPlayerIds: [soloAId, soloBId],
      status: "scheduled",
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("should reach the opponent limit after two 1v1 matches", async () => {
    for (let i = 0; i < 2; i++) {
      const result = await matchService.createMatch(
        {
          tournamentId: flex1v1TournamentId,
          sides: [
            { position: 1, playerIds: [soloAId] },
            { position: 2, playerIds: [soloBId] },
          ],
          status: "scheduled",
        },
        soloAId,
      );
      expect(result).toBeTruthy();
    }

    const count = await matchRepository.countMatchesTeamsVsTeam(flex1v1TournamentId, [soloAId], [soloBId]);
    expect(Number(count)).toBe(2);
  });

  it("should surface MAX_OPPONENT_MATCHES_EXCEEDED from /validate using only allPlayerIds (no sides)", async () => {
    // Regression test: the wizard's participants step only sends allPlayerIds
    // (the team split isn't known yet), but for an unambiguous 2-player flex
    // match /validate must still catch the same rule the real create call enforces.
    const validation = await matchService.validateMatch({
      tournamentId: flex1v1TournamentId,
      allPlayerIds: [soloAId, soloBId],
      status: "scheduled",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors[0]).toContain("Solo A");
    expect(validation.errors[0]).toContain("Solo B");

    // The real create call should fail with the same error code.
    try {
      await matchService.createMatch(
        {
          tournamentId: flex1v1TournamentId,
          sides: [
            { position: 1, playerIds: [soloAId] },
            { position: 2, playerIds: [soloBId] },
          ],
          status: "scheduled",
        },
        soloAId,
      );
      throw new Error("Expected ConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED);
    }
  });
});

afterAll(async () => {
  await closeTestDatabase();
});
