import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { matchService } from "../../match.service";
import {
  tournaments,
  appUsers,
  user as betterAuthUser,
  tournamentParticipants,
  matches,
  matchSides,
} from "../../../db/schema";
import { asc, eq } from "drizzle-orm";
import { insertTournamentConfigs } from "../helpers/tournament-config-test-helpers";
import { BadRequestError, ForbiddenError } from "../../../types/errors";

async function createUser(label: string, role: "player" | "super_admin" = "player") {
  const id = `${label}-${crypto.randomUUID()}`;
  await testDb.insert(betterAuthUser).values({ id, name: label, email: `${id}@example.com`, emailVerified: true });
  const [user] = await testDb
    .insert(appUsers)
    .values({ displayName: label, shortName: label.slice(0, 5), externalId: id, role })
    .returning();
  return user.id;
}

describe("N-way matches", () => {
  let tournamentId: string;
  let adminId: string;
  let players: string[];

  const side = (position: number, extra: Record<string, unknown> = {}) => ({
    position,
    playerIds: [players[position - 1]],
    ...extra,
  });

  const playersOf = (position: number) => players[position - 1]!;

  const storedSides = (matchId: string) =>
    testDb
      .select({
        position: matchSides.position,
        score: matchSides.score,
        rank: matchSides.rank,
        pointsAwarded: matchSides.pointsAwarded,
      })
      .from(matchSides)
      .where(eq(matchSides.matchId, matchId))
      .orderBy(asc(matchSides.position));

  beforeAll(async () => {
    adminId = await createUser("Admin", "super_admin");
    players = await Promise.all(["Alice", "Bob", "Carol", "Dan", "Eve"].map((n) => createUser(n)));

    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().split("T")[0];
    const [tournament] = await testDb
      .insert(tournaments)
      .values({
        name: `N-way ${Date.now()}`,
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        maxSidesPerMatch: 4,
        allowDraw: true,
        scoreEnabled: true,
        startDate: today,
        endDate: nextWeek,
        status: "ongoing",
        validationMode: "strict",
        createdBy: adminId,
      })
      .returning();
    tournamentId = tournament.id;
    await insertTournamentConfigs(testDb, tournamentId, {
      scoring: { pointsSource: "rank", rankPoints: [10, 6, 3, 1] },
      championship: { maxMatchesPerPlayer: 50, maxTimesWithSameOpponent: 10 },
    });
    await testDb
      .insert(tournamentParticipants)
      .values(players.map((userId) => ({ tournamentId, userId, status: "active" as const })));
  });

  afterEach(async () => {
    await testDb.delete(matches).where(eq(matches.tournamentId, tournamentId));
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("ranks the sides from their scores and awards the placement points", async () => {
    const match = await matchService.createMatch(
      {
        tournamentId,
        status: "reported",
        sides: [side(1, { score: 4 }), side(2, { score: 9 }), side(3, { score: 1 })],
      },
      adminId,
    );

    expect(await storedSides(match!.id)).toEqual([
      { position: 1, score: 4, rank: 2, pointsAwarded: 6 },
      { position: 2, score: 9, rank: 1, pointsAwarded: 10 },
      { position: 3, score: 1, rank: 3, pointsAwarded: 3 },
    ]);
    const [row] = await testDb.select().from(matches).where(eq(matches.id, match!.id));
    expect(row.winnerSide).toBeNull();
    expect(match!.sides.map((s) => s.isWinner)).toEqual([false, true, false]);
  });

  it("keeps an explicit ranking over the scores", async () => {
    const match = await matchService.createMatch(
      {
        tournamentId,
        status: "reported",
        sides: [side(1, { score: 4, rank: 1 }), side(2, { score: 4, rank: 2 }), side(3, { score: 1, rank: 3 })],
      },
      adminId,
    );

    expect((await storedSides(match!.id)).map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it("stores no rank on a scheduled match", async () => {
    const match = await matchService.createMatch(
      { tournamentId, status: "scheduled", sides: [side(1), side(2), side(3), side(4)] },
      adminId,
    );

    const sides = await storedSides(match!.id);
    expect(sides.map((s) => s.rank)).toEqual([null, null, null, null]);
    expect(sides.map((s) => s.pointsAwarded)).toEqual([0, 0, 0, 0]);
  });

  it("refuses more sides than the competition allows", async () => {
    const create = matchService.createMatch(
      { tournamentId, status: "scheduled", sides: [1, 2, 3, 4, 5].map((p) => side(p)) },
      adminId,
    );
    await expect(create).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuses a reported match of three sides without scores", async () => {
    const create = matchService.createMatch(
      { tournamentId, status: "reported", sides: [side(1), side(2), side(3)] },
      adminId,
    );
    await expect(create).rejects.toBeInstanceOf(BadRequestError);
  });

  it("reports the first result of a scheduled match side by side", async () => {
    const match = await matchService.createMatch(
      { tournamentId, status: "scheduled", sides: [side(1), side(2), side(3)] },
      adminId,
    );

    await matchService.updateMatch(
      match!.id,
      {
        playedAt: new Date().toISOString(),
        status: "reported",
        sideResults: [
          { position: 1, rank: 3, score: 0 },
          { position: 2, rank: 1, score: 5 },
          { position: 3, rank: 2, score: 2 },
        ],
      },
      adminId,
    );

    expect(await storedSides(match!.id)).toEqual([
      { position: 1, score: 0, rank: 3, pointsAwarded: 3 },
      { position: 2, score: 5, rank: 1, pointsAwarded: 10 },
      { position: 3, score: 2, rank: 2, pointsAwarded: 6 },
    ]);
  });

  it("refuses the two-side result fields on a match of three sides", async () => {
    const match = await matchService.createMatch(
      { tournamentId, status: "scheduled", sides: [side(1), side(2), side(3)] },
      adminId,
    );

    const update = matchService.updateMatch(
      match!.id,
      { playedAt: new Date().toISOString(), status: "reported", scoreA: 3, scoreB: 1 },
      adminId,
    );
    await expect(update).rejects.toBeInstanceOf(BadRequestError);
  });

  it("still settles a duel through scoreA and scoreB", async () => {
    const match = await matchService.createMatch(
      { tournamentId, status: "reported", sides: [side(1), side(2)], scoreA: 2, scoreB: 5 },
      adminId,
    );

    const [row] = await testDb.select().from(matches).where(eq(matches.id, match!.id));
    expect(row.winnerSide).toBe("B");
    expect((await storedSides(match!.id)).map((s) => s.rank)).toEqual([2, 1]);
  });

  describe("line-up edit", () => {
    const lineupOf = (matchId: string) =>
      matchService.getMatchById(matchId).then((m) => m.sides.map((s) => s.players.map((p) => p.id)));

    it("swaps a player and adds a side to a scheduled match", async () => {
      const match = await matchService.createMatch(
        { tournamentId, status: "scheduled", sides: [side(1), side(2)] },
        adminId,
      );

      await matchService.updateMatch(
        match!.id,
        { playedAt: new Date().toISOString(), sides: [side(1), side(3), side(4)] },
        adminId,
      );

      expect(await lineupOf(match!.id)).toEqual([[playersOf(1)], [playersOf(3)], [playersOf(4)]]);
      expect((await storedSides(match!.id)).map((s) => s.rank)).toEqual([null, null, null]);
    });

    it("ranks the new sides of a reported match from the result sent along", async () => {
      const match = await matchService.createMatch(
        { tournamentId, status: "reported", sides: [side(1), side(2)], scoreA: 3, scoreB: 1 },
        adminId,
      );

      await matchService.updateMatch(
        match!.id,
        {
          playedAt: new Date().toISOString(),
          sides: [side(1), side(2), side(3)],
          sideResults: [
            { position: 1, rank: 2, score: 3 },
            { position: 2, rank: 3, score: 1 },
            { position: 3, rank: 1, score: 6 },
          ],
        },
        adminId,
      );

      expect((await storedSides(match!.id)).map((s) => s.rank)).toEqual([2, 3, 1]);
    });

    it("refuses a new line-up on a reported match without its result", async () => {
      const match = await matchService.createMatch(
        { tournamentId, status: "reported", sides: [side(1), side(2)], scoreA: 3, scoreB: 1 },
        adminId,
      );

      const update = matchService.updateMatch(
        match!.id,
        { playedAt: new Date().toISOString(), sides: [side(1), side(3)] },
        adminId,
      );
      await expect(update).rejects.toBeInstanceOf(BadRequestError);
    });

    it("refuses more sides than the competition allows", async () => {
      const match = await matchService.createMatch(
        { tournamentId, status: "scheduled", sides: [side(1), side(2)] },
        adminId,
      );

      const update = matchService.updateMatch(
        match!.id,
        { playedAt: new Date().toISOString(), sides: [side(1), side(2), side(3), side(4), side(5)] },
        adminId,
      );
      await expect(update).rejects.toBeInstanceOf(BadRequestError);
    });

    it("lets a player fix a line-up they still play in, never one they leave", async () => {
      const match = await matchService.createMatch(
        { tournamentId, status: "scheduled", sides: [side(1), side(2)] },
        playersOf(1),
      );

      const leave = matchService.updateMatch(
        match!.id,
        { playedAt: new Date().toISOString(), sides: [side(2), side(3)].map((s, i) => ({ ...s, position: i + 1 })) },
        playersOf(1),
      );
      await expect(leave).rejects.toBeInstanceOf(ForbiddenError);

      await matchService.updateMatch(
        match!.id,
        { playedAt: new Date().toISOString(), sides: [side(1), side(3)].map((s, i) => ({ ...s, position: i + 1 })) },
        playersOf(1),
      );
      expect(await lineupOf(match!.id)).toEqual([[playersOf(1)], [playersOf(3)]]);
    });
  });
});
