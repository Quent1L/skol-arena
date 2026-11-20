/**
 * Row factories for repository integration tests that talk to the in-memory
 * database directly. Each call mints unique names, so one test file can seed as
 * much as it likes without colliding with itself.
 */
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";
import {
  appUsers,
  matchResults,
  matchSides,
  matches,
  tournamentEntries,
  tournamentEntryPlayers,
  tournaments,
  user as authUser,
} from "../../../db/schema";

type TestDb = PgliteDatabase<typeof schema>;

let counter = 0;
const unique = (label: string) => `${label}-${Date.now()}-${counter++}-${Math.random().toString(16).slice(2, 6)}`;

export interface MatchSeed {
  tournamentId: string;
  entryA: string;
  entryB: string;
  scoreA?: number;
  scoreB?: number;
  status?: (typeof matches.$inferInsert)["status"];
  winnerSide?: "A" | "B" | null;
  playedAt?: Date;
  createdBy?: string;
  reportedBy?: string;
  finalized?: boolean;
}

export function makeSeeder(db: TestDb) {
  async function createUser(name: string, extra: Partial<typeof appUsers.$inferInsert> = {}) {
    const suffix = unique(name);
    const [auth] = await db
      .insert(authUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [app] = await db
      .insert(appUsers)
      .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: auth!.id, ...extra })
      .returning();
    return app!.id;
  }

  async function createTournament(createdBy: string, extra: Partial<typeof tournaments.$inferInsert> = {}) {
    const [row] = await db
      .insert(tournaments)
      .values({
        name: unique("tournament"),
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ongoing",
        createdBy,
        ...extra,
      })
      .returning();
    return row!.id;
  }

  async function createEntry(tournamentId: string, playerIds: string[]) {
    const [entry] = await db.insert(tournamentEntries).values({ tournamentId, entryType: "PLAYER" }).returning();
    await db.insert(tournamentEntryPlayers).values(playerIds.map((playerId) => ({ entryId: entry!.id, playerId })));
    return entry!.id;
  }

  async function createMatch(seed: MatchSeed) {
    const [match] = await db
      .insert(matches)
      .values({
        tournamentId: seed.tournamentId,
        status: seed.status ?? "finalized",
        winnerSide: seed.winnerSide === undefined ? "A" : seed.winnerSide,
        playedAt: seed.playedAt ?? new Date(),
        createdBy: seed.createdBy,
      })
      .returning();
    await db.insert(matchSides).values([
      { matchId: match!.id, entryId: seed.entryA, position: 1, score: seed.scoreA ?? 1 },
      { matchId: match!.id, entryId: seed.entryB, position: 2, score: seed.scoreB ?? 0 },
    ]);
    await db.insert(matchResults).values({
      matchId: match!.id,
      reportedBy: seed.reportedBy ?? seed.createdBy,
      reportedAt: new Date(),
      ...(seed.finalized === false ? {} : { finalizedAt: new Date(), finalizationReason: "consensus" as const }),
    });
    return match!.id;
  }

  return { createUser, createTournament, createEntry, createMatch };
}
