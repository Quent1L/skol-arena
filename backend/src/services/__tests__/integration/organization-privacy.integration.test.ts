import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import {
  tournaments,
  tournamentEntries,
  tournamentEntryPlayers,
  appUsers,
  user as betterAuthUser,
  organizations,
  organizationMembers,
  matches,
  matchSides,
} from "../../../db/schema";
import { playerStatsService } from "../../player-stats.service";
import { rankedSeasonService } from "../../ranked-season.service";

/**
 * The public reads around a player (their tournaments, their stats, the season list)
 * must apply the same organization rule as the tournament pages: a competition of a
 * private organization only shows up for its members.
 */
describe("Organization privacy of public reads (integration)", () => {
  let memberId: string;
  let outsiderId: string;
  let playerId: string;
  let privateTournamentId: string;
  let publicTournamentId: string;
  let privateSeasonId: string;

  async function createUser(name: string, role: "super_admin" | "player" = "player") {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: authUser!.id, role })
      .returning();
    return appUser!.id;
  }

  async function createTournament(
    name: string,
    organizationId: string | null,
    mode: "championship" | "ranked" = "championship",
  ) {
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode,
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "open",
        createdBy: playerId,
        organizationId,
      })
      .returning();
    return tournament!.id;
  }

  async function enter(tournamentId: string, userId: string) {
    const [entry] = await testDb
      .insert(tournamentEntries)
      .values({ tournamentId, entryType: "PLAYER" })
      .returning();
    await testDb.insert(tournamentEntryPlayers).values({ entryId: entry!.id, playerId: userId });
    return entry!.id;
  }

  /** A finalized 1v1 the player won, so the stats page has something to count. */
  async function playWin(tournamentId: string, opponentId: string) {
    const ownEntry = await enter(tournamentId, playerId);
    const opponentEntry = await enter(tournamentId, opponentId);
    const [match] = await testDb
      .insert(matches)
      .values({ tournamentId, status: "finalized", winnerSide: "A" })
      .returning();
    await testDb.insert(matchSides).values([
      { matchId: match!.id, entryId: ownEntry, position: 1, score: 2 },
      { matchId: match!.id, entryId: opponentEntry, position: 2, score: 0 },
    ]);
  }

  beforeAll(async () => {
    playerId = await createUser("Player");
    memberId = await createUser("Member");
    outsiderId = await createUser("Outsider");

    const [org] = await testDb
      .insert(organizations)
      .values({ name: `Org-${Date.now()}`, createdBy: playerId })
      .returning();
    await testDb.insert(organizationMembers).values([
      { organizationId: org!.id, userId: memberId, role: "member" },
      { organizationId: org!.id, userId: playerId, role: "member" },
    ]);

    privateTournamentId = await createTournament("Private", org!.id);
    publicTournamentId = await createTournament("Public", null);
    privateSeasonId = await createTournament("Private season", org!.id, "ranked");
    await playWin(privateTournamentId, memberId);
    await playWin(publicTournamentId, outsiderId);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lists a player's private tournaments to members only", async () => {
    const forMember = await playerStatsService.getPlayerTournaments(playerId, memberId);
    const forOutsider = await playerStatsService.getPlayerTournaments(playerId, outsiderId);
    const forAnonymous = await playerStatsService.getPlayerTournaments(playerId, null);

    expect(forMember.map((t) => t.id).sort()).toEqual([privateTournamentId, publicTournamentId].sort());
    expect(forOutsider.map((t) => t.id)).toEqual([publicTournamentId]);
    expect(forAnonymous.map((t) => t.id)).toEqual([publicTournamentId]);
  });

  it("leaves private seasons out of the season list for outsiders", async () => {
    const forMember = await rankedSeasonService.listSeasons({ viewerId: memberId });
    const forOutsider = await rankedSeasonService.listSeasons({ viewerId: outsiderId });

    expect(forMember.map((s) => s.id)).toContain(privateSeasonId);
    expect(forOutsider.map((s) => s.id)).not.toContain(privateSeasonId);
  });

  it("does not serve a member's cached stats to an outsider", async () => {
    const forMember = await playerStatsService.getPlayerStats(playerId, {}, memberId);
    const forOutsider = await playerStatsService.getPlayerStats(playerId, {}, outsiderId);

    expect(forMember.stats.tournamentsParticipated).toBe(2);
    expect(forOutsider.stats.tournamentsParticipated).toBe(1);
  });
});
