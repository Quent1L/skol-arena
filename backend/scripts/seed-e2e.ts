/**
 * E2E seed script — populates the dedicated e2e database (docker: frontend/e2e/docker-compose.yml).
 *
 * Usage (from backend/):
 *   DATABASE_URL=postgres://skolarena:skolarena@localhost:5435/skolarena_e2e bun run scripts/seed-e2e.ts
 *
 * Idempotent: skips everything if the e2e admin already exists.
 * IDs are hardcoded and mirrored in frontend/e2e/fixtures.ts.
 */

import { hashPassword } from "better-auth/crypto";
import { runMigrations } from "../src/utils/migrate";
import { db } from "../src/config/database";
import {
  user,
  account,
  appUsers,
  disciplines,
  outcomeTypes,
  outcomeReasons,
  tournaments,
  tournamentScoringConfigs,
  championshipConfigs,
  tournamentParticipants,
  tournamentEntries,
  tournamentEntryPlayers,
  matches,
  matchSides,
  matchResults,
  rankedSeasonConfigs,
  rankTiers,
  playerMmr,
  mmrHistory,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { CHAMPIONSHIP_LIMITS } from "@skol-arena/shared";
import { newId } from "../src/utils/uuid";
import { stampEngineVersion } from "../src/utils/init-mmr-engine";

// ---------------------------------------------------------------------------
// Fixed IDs — keep in sync with frontend/e2e/fixtures.ts
// ---------------------------------------------------------------------------

const IDS = {
  adminApp: "e2e00000-0000-4000-8000-00000000a001",
  player1App: "e2e00000-0000-4000-8000-00000000b001",
  player2App: "e2e00000-0000-4000-8000-00000000b002",
  player3App: "e2e00000-0000-4000-8000-00000000b003",
  player4App: "e2e00000-0000-4000-8000-00000000b004",
  discipline: "e2e00000-0000-4000-8000-00000000d001",
  outcomeNormal: "e2e00000-0000-4000-8000-00000000c001",
  outcomeForfeit: "e2e00000-0000-4000-8000-00000000c002",
  forfeitReason: "e2e00000-0000-4000-8000-00000000c003",
  championship: "e2e00000-0000-4000-8000-00000000f001",
  season: "e2e00000-0000-4000-8000-00000000f002",
  champMatch: "e2e00000-0000-4000-8000-00000000e001",
  rankedMatch1: "e2e00000-0000-4000-8000-00000000e002",
  rankedMatch2: "e2e00000-0000-4000-8000-00000000e003",
  rankedPendingMatch: "e2e00000-0000-4000-8000-00000000e004",
} as const;

const ADMIN_EMAIL = "e2e-admin@skol.test";
const ADMIN_PASSWORD = "E2eAdminPass123!";
const PLAYER_PASSWORD = "E2ePlayerPass123!";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function seedUsers() {
  const defs = [
    { app: IDS.adminApp, auth: "e2e-auth-admin", email: ADMIN_EMAIL, name: "E2E Admin", short: "ADM", role: "super_admin" as const, password: ADMIN_PASSWORD },
    { app: IDS.player1App, auth: "e2e-auth-player1", email: "e2e-player1@skol.test", name: "E2E Player One", short: "P1", role: "player" as const, password: PLAYER_PASSWORD },
    { app: IDS.player2App, auth: "e2e-auth-player2", email: "e2e-player2@skol.test", name: "E2E Player Two", short: "P2", role: "player" as const, password: PLAYER_PASSWORD },
    { app: IDS.player3App, auth: "e2e-auth-player3", email: "e2e-player3@skol.test", name: "E2E Player Three", short: "P3", role: "player" as const, password: PLAYER_PASSWORD },
    { app: IDS.player4App, auth: "e2e-auth-player4", email: "e2e-player4@skol.test", name: "E2E Player Four", short: "P4", role: "player" as const, password: PLAYER_PASSWORD },
  ];

  for (const d of defs) {
    await db.insert(user).values({
      id: d.auth,
      name: d.name,
      email: d.email,
      emailVerified: true,
    });
    await db.insert(account).values({
      id: newId(),
      providerId: "credential",
      accountId: d.email,
      userId: d.auth,
      password: await hashPassword(d.password),
    });
    await db.insert(appUsers).values({
      id: d.app,
      externalId: d.auth,
      displayName: d.name,
      shortName: d.short,
      role: d.role,
    });
  }
  console.log(`Seeded ${defs.length} users`);
}

async function seedDiscipline() {
  await db.insert(disciplines).values({
    id: IDS.discipline,
    name: "E2E Discipline",
    icon: "fa fa-gamepad",
  });
  await db.insert(outcomeTypes).values([
    { id: IDS.outcomeNormal, disciplineId: IDS.discipline, name: "Normal", isDefault: true, points: 3 },
    { id: IDS.outcomeForfeit, disciplineId: IDS.discipline, name: "Forfeit", isDefault: false, points: 3, scoreCountsForMmr: false },
  ]);
  await db.insert(outcomeReasons).values({
    id: IDS.forfeitReason,
    outcomeTypeId: IDS.outcomeForfeit,
    name: "No-show",
  });
  console.log("Seeded discipline + outcome types");
}

/** Insert a 1v1 match (entries + sides), finalized by default. */
async function insertFinalizedMatch(opts: {
  matchId: string;
  tournamentId: string;
  playerA: string;
  playerB: string;
  scoreA: number;
  scoreB: number;
  playedAt: Date;
  status?: "finalized" | "reported";
}) {
  const winnerSide = opts.scoreA > opts.scoreB ? "A" : opts.scoreB > opts.scoreA ? "B" : null;
  const entryA = newId();
  const entryB = newId();

  await db.insert(tournamentEntries).values([
    { id: entryA, tournamentId: opts.tournamentId, entryType: "PLAYER" },
    { id: entryB, tournamentId: opts.tournamentId, entryType: "PLAYER" },
  ]);
  await db.insert(tournamentEntryPlayers).values([
    { entryId: entryA, playerId: opts.playerA },
    { entryId: entryB, playerId: opts.playerB },
  ]);
  const status = opts.status ?? "finalized";
  await db.insert(matches).values({
    id: opts.matchId,
    tournamentId: opts.tournamentId,
    status,
    playedAt: opts.playedAt,
    winnerSide,
    outcomeTypeId: IDS.outcomeNormal,
  });
  await db.insert(matchSides).values([
    { matchId: opts.matchId, entryId: entryA, position: 1, score: opts.scoreA, pointsAwarded: winnerSide === "A" ? 3 : winnerSide === null ? 1 : 0 },
    { matchId: opts.matchId, entryId: entryB, position: 2, score: opts.scoreB, pointsAwarded: winnerSide === "B" ? 3 : winnerSide === null ? 1 : 0 },
  ]);
  if (status === "finalized") {
    await db.insert(matchResults).values({
      matchId: opts.matchId,
      finalizedAt: opts.playedAt,
      finalizationReason: "admin_override",
    });
  }
}

async function seedChampionship() {
  await db.insert(tournaments).values({
    id: IDS.championship,
    name: "E2E Championship",
    mode: "championship",
    teamMode: "flex",
    status: "ongoing",
    minTeamSize: 1,
    maxTeamSize: 1,
    scoreEnabled: true,
    allowDraw: true,
    validationMode: "none",
    startDate: dateStr(daysAgo(30)),
    endDate: dateStr(daysAgo(-30)),
    disciplineId: IDS.discipline,
    createdBy: IDS.adminApp,
  });

  await db.insert(tournamentScoringConfigs).values({
    tournamentId: IDS.championship,
  });
  await db.insert(championshipConfigs).values({
    tournamentId: IDS.championship,
    // The highest caps the form accepts: tests keep creating matches between the same
    // four players, yet an admin must still be able to save this championship. Matches
    // created by previous runs are purged by frontend/e2e/global-setup.ts.
    maxMatchesPerPlayer: CHAMPIONSHIP_LIMITS.maxMatchesPerPlayer.max,
    maxTimesWithSamePartner: CHAMPIONSHIP_LIMITS.maxTimesWithSamePartner.max,
    maxTimesWithSameOpponent: CHAMPIONSHIP_LIMITS.maxTimesWithSameOpponent.max,
  });

  const players = [IDS.player1App, IDS.player2App, IDS.player3App, IDS.player4App];
  await db.insert(tournamentParticipants).values(
    players.map((userId) => ({ tournamentId: IDS.championship, userId })),
  );

  await insertFinalizedMatch({
    matchId: IDS.champMatch,
    tournamentId: IDS.championship,
    playerA: IDS.player1App,
    playerB: IDS.player2App,
    scoreA: 3,
    scoreB: 1,
    playedAt: daysAgo(2),
  });
  console.log("Seeded championship + participants + 1 finalized match");
}

async function seedRankedSeason() {
  await db.insert(tournaments).values({
    id: IDS.season,
    name: "E2E Season",
    mode: "ranked",
    teamMode: "flex",
    status: "ongoing",
    minTeamSize: 1,
    maxTeamSize: 1,
    scoreEnabled: true,
    allowDraw: false,
    // strict: la bascule Officiel/Provisoire du leaderboard n'est visible
    // que si la validation n'est pas "none"
    validationMode: "strict",
    startDate: dateStr(daysAgo(30)),
    endDate: dateStr(daysAgo(-60)),
    disciplineId: IDS.discipline,
    createdBy: IDS.adminApp,
  });
  await db.insert(rankedSeasonConfigs).values({
    tournamentId: IDS.season,
    baseMmr: 1000,
    kFactor: 32,
    placementMatches: 5,
  });
  // The ladder below is written by hand and does not follow from the season's few
  // matches. Unstamped, the backend would replay it from those matches at boot
  // (recalculateOutdatedRankedSeasons) and every MMR the specs expect would be gone.
  await stampEngineVersion(IDS.season);
  await db.insert(rankTiers).values([
    { seasonId: IDS.season, level: 1, name: "Bronze", percentile: 0, minMmr: 700, subRanks: 1, iconClass: "fa fa-seedling" },
    { seasonId: IDS.season, level: 2, name: "Silver", percentile: 0.4, minMmr: 900, subRanks: 1, iconClass: "fa fa-shield" },
    { seasonId: IDS.season, level: 3, name: "Gold", percentile: 0.65, minMmr: 1100, subRanks: 1, iconClass: "fa fa-star" },
    { seasonId: IDS.season, level: 4, name: "Platinum", percentile: 0.85, minMmr: 1300, subRanks: 1, iconClass: "fa fa-gem" },
    { seasonId: IDS.season, level: 5, name: "Diamond", percentile: 0.95, minMmr: 1500, subRanks: 1, iconClass: "fa fa-crown" },
  ]);

  const players = [IDS.player1App, IDS.player2App, IDS.player3App, IDS.player4App];
  await db.insert(tournamentParticipants).values(
    players.map((userId) => ({ tournamentId: IDS.season, userId })),
  );

  // player4 stays below placementMatches (3 < 5) so the provisional list is non-empty
  await db.insert(playerMmr).values([
    { seasonId: IDS.season, playerId: IDS.player1App, currentMmr: 1550, matchesPlayed: 8, wins: 7, losses: 1, winStreak: 3, maxWinStreak: 5 },
    { seasonId: IDS.season, playerId: IDS.player2App, currentMmr: 1200, matchesPlayed: 8, wins: 4, losses: 4 },
    { seasonId: IDS.season, playerId: IDS.player3App, currentMmr: 1000, matchesPlayed: 8, wins: 3, losses: 5 },
    { seasonId: IDS.season, playerId: IDS.player4App, currentMmr: 850, matchesPlayed: 3, wins: 1, losses: 2, lossStreak: 2, maxLossStreak: 2 },
  ]);

  await insertFinalizedMatch({
    matchId: IDS.rankedMatch1,
    tournamentId: IDS.season,
    playerA: IDS.player1App,
    playerB: IDS.player2App,
    scoreA: 5,
    scoreB: 2,
    playedAt: daysAgo(3),
  });
  await insertFinalizedMatch({
    matchId: IDS.rankedMatch2,
    tournamentId: IDS.season,
    playerA: IDS.player1App,
    playerB: IDS.player3App,
    scoreA: 4,
    scoreB: 3,
    playedAt: daysAgo(1),
  });

  // Unfinalized match: feeds the provisional leaderboard (reported/pending/disputed statuses)
  await insertFinalizedMatch({
    matchId: IDS.rankedPendingMatch,
    tournamentId: IDS.season,
    playerA: IDS.player4App,
    playerB: IDS.player2App,
    scoreA: 5,
    scoreB: 1,
    playedAt: daysAgo(0),
    status: "reported",
  });

  await db.insert(mmrHistory).values([
    { seasonId: IDS.season, playerId: IDS.player1App, matchId: IDS.rankedMatch1, mmrBefore: 1500, mmrAfter: 1526, mmrDelta: 26, kEffective: 32, opponentAvgMmr: 1200, outcome: "win", winStreakAfter: 2, matchesPlayedAfter: 7 },
    { seasonId: IDS.season, playerId: IDS.player2App, matchId: IDS.rankedMatch1, mmrBefore: 1226, mmrAfter: 1200, mmrDelta: -26, kEffective: 32, opponentAvgMmr: 1500, outcome: "loss", lossStreakAfter: 1, matchesPlayedAfter: 8 },
    { seasonId: IDS.season, playerId: IDS.player1App, matchId: IDS.rankedMatch2, mmrBefore: 1526, mmrAfter: 1550, mmrDelta: 24, kEffective: 32, opponentAvgMmr: 1000, outcome: "win", winStreakAfter: 3, matchesPlayedAfter: 8 },
    { seasonId: IDS.season, playerId: IDS.player3App, matchId: IDS.rankedMatch2, mmrBefore: 1024, mmrAfter: 1000, mmrDelta: -24, kEffective: 32, opponentAvgMmr: 1526, outcome: "loss", lossStreakAfter: 1, matchesPlayedAfter: 8 },
  ]);
  console.log("Seeded ranked season + tiers + MMR + history");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!/skolarena_e2e/.test(process.env.DATABASE_URL)) {
    throw new Error(`Refusing to seed a non-e2e database: ${process.env.DATABASE_URL}`);
  }

  await runMigrations();

  const existing = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1);
  if (existing.length > 0) {
    console.log("E2E database already seeded — skipping.");
    process.exit(0);
  }

  await seedUsers();
  await seedDiscipline();
  await seedChampionship();
  await seedRankedSeason();

  console.log("E2E seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("E2E seed failed:", err);
  process.exit(1);
});
