import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import {
  tournaments,
  tournamentParticipants,
  appUsers,
  teams,
  teamMembers,
  user as betterAuthUser,
} from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import { teamService } from "../../team.service";
import { BadRequestError, ConflictError, NotFoundError } from "../../../types/errors";

/**
 * Team routes check the caller's rights on the tournament in the URL. Every action
 * must therefore stay inside that tournament, or an admin of their own tournament
 * could delete or empty the teams of any other.
 */
describe("Team scoping (integration)", () => {
  let adminId: string;
  let playerId: string;
  let otherPlayerId: string;
  let ownTournamentId: string;
  let foreignTournamentId: string;
  let foreignTeamId: string;

  async function createUser(name: string) {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: authUser!.id })
      .returning();
    return appUser!.id;
  }

  async function createTournament(name: string, maxTeamSize = 2) {
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: "championship",
        teamMode: "static",
        minTeamSize: 1,
        maxTeamSize,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "open",
        createdBy: adminId,
      })
      .returning();
    return tournament!.id;
  }

  async function register(tournamentId: string, userId: string) {
    await testDb.insert(tournamentParticipants).values({ tournamentId, userId, status: "active" });
  }

  beforeAll(async () => {
    adminId = await createUser("Admin");
    playerId = await createUser("Player");
    otherPlayerId = await createUser("Other");
    ownTournamentId = await createTournament("Own");
    foreignTournamentId = await createTournament("Foreign", 1);

    await register(foreignTournamentId, playerId);
    const [team] = await testDb
      .insert(teams)
      .values({ tournamentId: foreignTournamentId, name: "Foreign team", createdBy: playerId })
      .returning();
    foreignTeamId = team!.id;
    await testDb.insert(teamMembers).values({ teamId: foreignTeamId, userId: playerId });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("refuses to delete a team through another tournament", async () => {
    await expect(
      teamService.deleteTeam(foreignTeamId, ownTournamentId, adminId, true),
    ).rejects.toBeInstanceOf(NotFoundError);

    const still = await testDb.query.teams.findFirst({ where: eq(teams.id, foreignTeamId) });
    expect(still).toBeTruthy();
  });

  it("refuses to remove a member through another tournament", async () => {
    await expect(
      teamService.leaveTeam(foreignTeamId, ownTournamentId, playerId, adminId, true),
    ).rejects.toBeInstanceOf(NotFoundError);

    const membership = await testDb.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, foreignTeamId), eq(teamMembers.userId, playerId)),
    });
    expect(membership).toBeTruthy();
  });

  it("refuses to join a team through another tournament", async () => {
    await register(ownTournamentId, otherPlayerId);
    await expect(
      teamService.joinTeam(foreignTeamId, ownTournamentId, otherPlayerId, otherPlayerId, false),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a join once the team is full", async () => {
    await register(foreignTournamentId, otherPlayerId);
    await expect(
      teamService.joinTeam(foreignTeamId, foreignTournamentId, otherPlayerId, otherPlayerId, false),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("only lets registered players create a team", async () => {
    const outsiderId = await createUser("Outsider");
    await expect(
      teamService.createTeam(ownTournamentId, "Outsiders", outsiderId, false),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuses a second team to a player who already has one", async () => {
    await expect(
      teamService.createTeam(foreignTournamentId, "Second", playerId, false),
    ).rejects.toBeInstanceOf(ConflictError);

    const second = await testDb.query.teams.findFirst({
      where: and(eq(teams.tournamentId, foreignTournamentId), eq(teams.name, "Second")),
    });
    expect(second).toBeUndefined();
  });
});
