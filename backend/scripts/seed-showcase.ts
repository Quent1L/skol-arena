/**
 * Showcase seed — populates the screenshot database used by the docs site.
 *
 * Usage (from backend/):
 *   DATABASE_URL=postgres://skolarena:skolarena@localhost:5436/skolarena_showcase \
 *     bun run scripts/seed-showcase.ts
 *
 * This is NOT the e2e seed (scripts/seed-e2e.ts, port 5435). That one is tuned
 * for assertions and stays deliberately small; this one exists to make the app
 * look like a competition that has actually been played: twelve players with
 * real-sounding names, four tournaments, a season's worth of matches, and MMR
 * computed by the real engine rather than hardcoded.
 *
 * Deterministic: every "random" draw comes from a seeded LCG, so re-running the
 * script on a fresh database reproduces the same standings, the same ladder, and
 * therefore the same screenshots.
 */

import { hashPassword } from "better-auth/crypto";
import { runMigrations } from "../src/utils/migrate";
import { db } from "../src/config/database";
import {
  user,
  tournamentScoringConfigs,
  championshipConfigs,
  rankedSeasonConfigs,
  rankTiers,
  bracketConfigs,
  bracketRounds,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "../src/utils/uuid";
import { avatarService } from "../src/services/avatar.service";
import { standingsService } from "../src/services/standings.service";
import { mmrCalculationService } from "../src/services/mmr-calculation.service";
import { bracketService } from "../src/services/bracket.service";
import { rankedSeasonService } from "../src/services/ranked-season.service";
import { readAvatar, type AvatarName } from "../src/demo/avatars";
import { buildPairings as pairUp, createRandom, favouredWins as favoured } from "../src/demo/random";
import {
  createAccount,
  createCompetition,
  createDiscipline,
  insertMatch as insertSeededMatch,
  outcomeOf,
  playBracketRound,
  type MatchStatus,
} from "../src/demo/builders";

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

// The building blocks are shared with the demo data (src/demo/), the seed and the
// draws are this script's own: same seed, same screenshots.
const random = createRandom(20260823);
const rand = random.next;
const randInt = random.int;

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

const PASSWORD = "ShowcasePass123!";
const ADMIN_EMAIL = "margaux@skol.demo";

type PlayerDef = {
  key: string;
  name: string;
  short: string;
  /** Hidden skill, 0..1. Drives who wins; never surfaced in the app. */
  strength: number;
};

const ADMIN = { key: "margaux", name: "Margaux Lemoine", short: "MLE" };

const PLAYERS: PlayerDef[] = [
  { key: "theo", name: "Theo Marchand", short: "TMA", strength: 0.88 },
  { key: "camille", name: "Camille Roussel", short: "CRO", strength: 0.66 },
  { key: "ilyas", name: "Ilyas Benali", short: "IBE", strength: 0.95 },
  { key: "marta", name: "Marta Kowalczyk", short: "MKO", strength: 0.68 },
  { key: "lucas", name: "Lucas Ferreira", short: "LFE", strength: 0.61 },
  { key: "anais", name: "Anais Delcourt", short: "ADE", strength: 0.71 },
  { key: "youssef", name: "Youssef Amrani", short: "YAM", strength: 0.55 },
  { key: "nina", name: "Nina Berglund", short: "NBE", strength: 0.64 },
  { key: "rafael", name: "Rafael Costa", short: "RCO", strength: 0.47 },
  { key: "elias", name: "Elias Ndiaye", short: "END", strength: 0.58 },
  { key: "chloe", name: "Chloe Vasseur", short: "CVA", strength: 0.42 },
  { key: "jonas", name: "Jonas Weber", short: "JWE", strength: 0.35 },
];

/** Populated by seedUsers(): key -> app_users.id */
const userId = new Map<string, string>();
const strengthOf = new Map<string, number>();

function id(key: string): string {
  const value = userId.get(key);
  if (!value) throw new Error(`Unknown seeded user: ${key}`);
  return value;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Frozen "today" so a re-seed months later still produces the same screenshots. */
const NOW = new Date("2026-08-23T18:30:00.000Z");

function daysAgo(n: number, hour = 20, minute = 15): Date {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Real wall clock, unlike NOW. Matches still awaiting confirmation have to be
 * recent relative to the machine taking the screenshots, or the app shows their
 * 48h window as expired and hides the accept / dispute buttons.
 */
const REAL_NOW = new Date();
function hoursAgo(n: number): Date {
  return new Date(REAL_NOW.getTime() - n * 3_600_000);
}

/**
 * Monday 00:00 of the real current week.
 *
 * The "MMR this week" tile on a player's season profile counts history entries
 * after `startOfWeek(new Date(), { weekStartsOn: 1 })` — the real clock, not
 * the frozen NOW above. Anything stamped against NOW falls out of that window
 * within days of a re-seed and the tile renders an em dash, so the tail of the
 * ranked season is anchored here instead.
 */
function realWeekStart(): Date {
  const d = new Date(REAL_NOW);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * `count` instants spread across the current real week, oldest first, always
 * strictly inside it whatever weekday the capture runs on.
 */
function thisWeekSpread(count: number): Date[] {
  const start = realWeekStart().getTime() + 9 * 3_600_000;
  const end = REAL_NOW.getTime() - 2 * 3_600_000;
  const span = Math.max(end - start, 3_600_000);
  return Array.from(
    { length: count },
    (_, i) => new Date(start + Math.round((span * (i + 1)) / (count + 1))),
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function seedUsers() {
  const defs = [
    { ...ADMIN, role: "super_admin" as const, email: ADMIN_EMAIL, strength: 0.5 },
    ...PLAYERS.map((p) => ({
      ...p,
      role: "player" as const,
      email: `${p.key}@skol.demo`,
    })),
  ];

  const passwordHash = await hashPassword(PASSWORD);
  for (const def of defs) {
    const appId = await createAccount({
      authId: `showcase-auth-${def.key}`,
      name: def.name,
      email: def.email,
      shortName: def.short,
      role: def.role,
      passwordHash,
      // Enough reports behind them that the app shows an established player,
      // not someone on their first match.
      trustScoreCount: def.role === "player" ? randInt(4, 18) : 0,
      lastLoginAt: daysAgo(randInt(0, 3), 19, 0),
    });

    userId.set(def.key, appId);
    strengthOf.set(appId, def.strength);
  }

  console.log(`Seeded ${defs.length} users`);
}

/**
 * Players with a picture, the rest keep their initials: a real club is a mix of
 * both, and the screenshots should show the fallback as much as the avatar.
 * The files live in src/demo/avatars/, shared with the demo data.
 */
const AVATAR_KEYS: AvatarName[] = ["theo", "ilyas", "camille", "marta", "anais", "lucas", "nina"];

async function seedAvatars() {
  for (const key of AVATAR_KEYS) {
    const bytes = await readAvatar(key);
    // The real upload pipeline: same resize, same variants, same storage keys.
    await avatarService.setAvatar(id(key), bytes);
  }
  console.log(`Seeded ${AVATAR_KEYS.length} avatars`);
}

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------

type DisciplineIds = { discipline: string; standard: string; overtime: string; forfeit: string };

async function seedDiscipline(
  name: string,
  icon: string,
  scoreInstructions: string,
): Promise<DisciplineIds> {
  const seeded = await createDiscipline({
    name,
    icon,
    scoreInstructions,
    teamInteractionMode: "INDIVIDUAL",
    outcomes: [
      { name: "Standard win", isDefault: true },
      // A game decided in overtime was close, so it moves the rating less than
      // a clean win. This is the mmrMultiplier knob the docs describe.
      { name: "Overtime win", mmrMultiplier: 0.8 },
      // The whole point of the setting: a walkover moves the standings but
      // leaves nobody's rating touched.
      { name: "Forfeit", scoreCountsForMmr: false, reasons: ["No-show", "Withdrawal"] },
    ],
  });
  return {
    discipline: seeded.id,
    standard: outcomeOf(seeded, "Standard win").id,
    overtime: outcomeOf(seeded, "Overtime win").id,
    forfeit: outcomeOf(seeded, "Forfeit").id,
  };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

/** A 1v1 flex match, on the shared builder. */
async function insertMatch(opts: {
  tournamentId: string;
  outcomeTypeId: string;
  playerA: string;
  playerB: string;
  scoreA: number;
  scoreB: number;
  playedAt: Date;
  status?: MatchStatus;
  reportedBy?: string;
}): Promise<string> {
  return insertSeededMatch({
    tournamentId: opts.tournamentId,
    sides: [
      { playerIds: [opts.playerA], score: opts.scoreA },
      { playerIds: [opts.playerB], score: opts.scoreB },
    ],
    outcomeTypeId: opts.outcomeTypeId,
    playedAt: opts.playedAt,
    status: opts.status,
    reportedBy: opts.reportedBy ?? opts.playerA,
    contestationReason: "Last goal was scored after the buzzer.",
  });
}

/** Table football score: winner reaches 10, loser lands somewhere below. */
function drawScore(strongerWins: boolean): [number, number] {
  const loser = randInt(2, 8);
  return strongerWins ? [10, loser] : [loser, 10];
}

/**
 * Round-robin-ish schedule: every pair meets at most `meetings` times, in an
 * unpredictable order.
 */
function buildPairings(playerIds: string[], meetings: number) {
  return pairUp(random, playerIds, meetings);
}

/** Result drawn from the two hidden strengths: ordered standings, but not perfectly. */
function favouredWins(playerA: string, playerB: string): boolean {
  return favoured(random, strengthOf.get(playerA) ?? 0.5, strengthOf.get(playerB) ?? 0.5);
}

// ---------------------------------------------------------------------------
// Championships
// ---------------------------------------------------------------------------

async function seedChampionship(opts: {
  name: string;
  description: string;
  discipline: DisciplineIds;
  playerKeys: string[];
  status: "ongoing" | "finished";
  startDaysAgo: number;
  endDaysAgo: number;
  matchCount: number;
  /** Matches left waiting on the opponent, only for an ongoing competition. */
  pendingCount?: number;
  /** Player the screenshots are taken as; the open matches are made to be theirs. */
  viewerKey?: string;
}): Promise<string> {
  const tournamentId = newId();
  const playerIds = opts.playerKeys.map(id);

  await createCompetition(
    {
      id: tournamentId,
      name: opts.name,
      description: opts.description,
      mode: "championship",
      teamMode: "flex",
      status: opts.status,
      minTeamSize: 1,
      maxTeamSize: 1,
      scoreEnabled: true,
      allowDraw: false,
      minScore: 0,
      maxScore: 10,
      validationMode: "strict",
      validationTimerHours: 48,
      startDate: dateStr(daysAgo(opts.startDaysAgo)),
      endDate: dateStr(daysAgo(opts.endDaysAgo)),
      disciplineId: opts.discipline.discipline,
      createdBy: id(ADMIN.key),
      createdAt: daysAgo(opts.startDaysAgo + 3),
    },
    playerIds,
  );
  await db.insert(tournamentScoringConfigs).values({
    tournamentId,
    pointPerVictory: 3,
    pointPerDraw: 1,
    pointPerLoss: 0,
  });
  await db.insert(championshipConfigs).values({
    tournamentId,
    maxMatchesPerPlayer: 14,
    maxTimesWithSamePartner: 2,
    maxTimesWithSameOpponent: 2,
  });

  const pairs = buildPairings(playerIds, 2).slice(0, opts.matchCount);
  // Matches are spread from the start date up to today, never past it: a season
  // that has not finished yet cannot already have results dated next month.
  const span = Math.max(opts.startDaysAgo - Math.max(opts.endDaysAgo, 0), 1);
  const pending = opts.pendingCount ?? 0;
  const viewerId = opts.viewerKey ? id(opts.viewerKey) : null;

  for (let i = 0; i < pairs.length; i++) {
    const [playerA, pairedB] = pairs[i]!;

    // The tail of the schedule is what is still in flight.
    const remaining = pairs.length - i;
    const status: MatchStatus =
      remaining <= pending ? (remaining === 1 ? "disputed" : "reported") : "finalized";

    // The screenshots are taken as `viewerKey`, and the confirm / contest panel
    // only renders for a player who is actually in the match, so every match
    // left open is one of theirs.
    const playerB =
      status !== "finalized" && viewerId && playerA !== viewerId && pairedB !== viewerId
        ? viewerId
        : pairedB;

    const aWins = favouredWins(playerA, playerB);
    const [scoreA, scoreB] = drawScore(aWins);
    const dayOffset = opts.startDaysAgo - Math.floor((i / pairs.length) * span);

    await insertMatch({
      tournamentId,
      outcomeTypeId: opts.discipline.standard,
      playerA,
      playerB,
      scoreA,
      scoreB,
      playedAt:
        status === "finalized"
          ? daysAgo(dayOffset, randInt(17, 22), randInt(0, 59))
          : hoursAgo(randInt(3, 30)),
      status,
      // Someone else has to be the reporter, otherwise there is nothing left
      // for the viewer to confirm.
      reportedBy:
        status === "finalized"
          ? rand() < 0.5
            ? playerA
            : playerB
          : playerA === viewerId
            ? playerB
            : playerA,
    });
  }

  await standingsService.recalculatePointsInternal(tournamentId);
  console.log(`Seeded championship "${opts.name}" (${pairs.length} matches)`);
  return tournamentId;
}

// ---------------------------------------------------------------------------
// Ranked season
// ---------------------------------------------------------------------------

/**
 * Mostly clean wins, with enough overtime results and walkovers that the
 * season's outcome-distribution chart shows a distribution instead of one bar
 * sitting at 100%.
 */
function pickRankedOutcome(discipline: DisciplineIds): string {
  const roll = rand();
  if (roll < 0.06) return discipline.forfeit;
  if (roll < 0.24) return discipline.overtime;
  return discipline.standard;
}

async function seedRankedSeason(discipline: DisciplineIds): Promise<string> {
  const seasonId = newId();
  const playerIds = PLAYERS.map((p) => id(p.key));

  await createCompetition(
    {
      id: seasonId,
      name: "Ranked Season 4",
      description:
        "Continuous ladder play. Face anyone, any time, and the rating follows you across the season.",
      mode: "ranked",
      teamMode: "flex",
      status: "ongoing",
      minTeamSize: 1,
      maxTeamSize: 1,
      scoreEnabled: true,
      allowDraw: false,
      minScore: 0,
      maxScore: 10,
      // No confirmation step: a ranked result counts the moment it is reported.
      // This is also what keeps the Official/Provisional switch off the standings
      // screenshot — TournamentStandingsTab only renders it when the mode is not
      // "none".
      validationMode: "none",
      validationTimerHours: 48,
      startDate: dateStr(daysAgo(74)),
      endDate: dateStr(daysAgo(-16)),
      disciplineId: discipline.discipline,
      createdBy: id(ADMIN.key),
      createdAt: daysAgo(78),
    },
    playerIds,
  );
  await db.insert(rankedSeasonConfigs).values({
    tournamentId: seasonId,
    baseMmr: 1000,
    kFactor: 32,
    placementMatches: 5,
  });
  await db.insert(rankTiers).values([
    { seasonId, level: 1, name: "Bronze", percentile: 0, minMmr: 700, subRanks: 3, iconClass: "fa fa-seedling" },
    { seasonId, level: 2, name: "Silver", percentile: 0.35, minMmr: 900, subRanks: 3, iconClass: "fa fa-shield-halved" },
    { seasonId, level: 3, name: "Gold", percentile: 0.6, minMmr: 1100, subRanks: 3, iconClass: "fa fa-star" },
    { seasonId, level: 4, name: "Platinum", percentile: 0.82, minMmr: 1300, subRanks: 3, iconClass: "fa fa-gem" },
    { seasonId, level: 5, name: "Diamond", percentile: 0.94, minMmr: 1500, subRanks: 1, iconClass: "fa fa-crown" },
  ]);

  const pairs = buildPairings(playerIds, 2).slice(0, 84);
  const matchIds: string[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const [playerA, playerB] = pairs[i]!;
    const aWins = favouredWins(playerA, playerB);
    const [scoreA, scoreB] = drawScore(aWins);
    const dayOffset = 70 - Math.floor((i / pairs.length) * 69);

    matchIds.push(
      await insertMatch({
        tournamentId: seasonId,
        outcomeTypeId: pickRankedOutcome(discipline),
        playerA,
        playerB,
        scoreA,
        scoreB,
        playedAt: daysAgo(dayOffset, randInt(17, 22), randInt(0, 59)),
        reportedBy: rand() < 0.5 ? playerA : playerB,
      }),
    );
  }

  // A handful of recent matches for the showcase account, stamped inside the
  // real current week so its "MMR this week" tile has something to show. Theo
  // takes three of four, which nets him a gain without lifting him past Ilyas.
  const recent: [string, boolean][] = [
    ["camille", true],
    ["ilyas", false],
    ["marta", true],
    ["anais", true],
  ];
  const recentTimes = thisWeekSpread(recent.length);
  for (let i = 0; i < recent.length; i++) {
    const [opponentKey, theoWins] = recent[i]!;
    const [scoreA, scoreB] = drawScore(theoWins);
    matchIds.push(
      await insertMatch({
        tournamentId: seasonId,
        outcomeTypeId: i === 1 ? discipline.overtime : discipline.standard,
        playerA: id("theo"),
        playerB: id(opponentKey),
        scoreA,
        scoreB,
        playedAt: recentTimes[i]!,
        reportedBy: id("theo"),
      }),
    );
  }

  // Ratings come out of the real engine, in the order the matches were played,
  // so the ladder, the streaks and the history charts all agree with each other.
  for (const matchId of matchIds) {
    await mmrCalculationService.processMatchFinalization(matchId);
  }

  // Tier thresholds are percentiles of the pool, not fixed bands: without this
  // the ladder keeps the placeholder minMmr values above and every player lands
  // in the bottom tier.
  await rankedSeasonService.recalculateTierMinMmr(seasonId, 1000);

  console.log(`Seeded ranked season (${matchIds.length} matches, MMR computed)`);
  return seasonId;
}

// ---------------------------------------------------------------------------
// Bracket
// ---------------------------------------------------------------------------

async function seedBracket(discipline: DisciplineIds): Promise<string> {
  const tournamentId = newId();
  const playerKeys = [
    "theo",
    "ilyas",
    "camille",
    "anais",
    "marta",
    "nina",
    "lucas",
    "elias",
  ];
  const playerIds = playerKeys.map(id);

  await createCompetition(
    {
      id: tournamentId,
      name: "Friday Night Cup",
      description:
        "Single elimination night, eight players, bronze match included.",
      mode: "bracket",
      teamMode: "flex",
      status: "ongoing",
      minTeamSize: 1,
      maxTeamSize: 1,
      scoreEnabled: true,
      allowDraw: false,
      minScore: 0,
      maxScore: 10,
      validationMode: "strict",
      validationTimerHours: 48,
      startDate: dateStr(daysAgo(4)),
      endDate: dateStr(daysAgo(-3)),
      disciplineId: discipline.discipline,
      createdBy: id(ADMIN.key),
      createdAt: daysAgo(11),
    },
    playerIds,
  );
  await db.insert(tournamentScoringConfigs).values({ tournamentId });

  // Built by the real service so the rounds, the seeds and the winner links are
  // exactly what the app would have produced.
  await bracketService.generateBracket(
    tournamentId,
    { bracketType: "single_elimination", seedingType: "random", hasBronzeMatch: true },
    id(ADMIN.key),
  );

  // Round names now travel as i18n keys (`roundNameKey`) and the capture browser
  // asks for English, so the persisted `roundName` is only a fallback and is never
  // what the screenshots render. Nothing to rewrite here.
  const config = await db.query.bracketConfigs.findFirst({
    where: eq(bracketConfigs.tournamentId, tournamentId),
  });
  if (!config) throw new Error("Bracket config missing right after generation");

  const rounds = await db.query.bracketRounds.findMany({
    where: eq(bracketRounds.bracketConfigId, config.id),
  });

  // A bracket nobody has played yet is a grid of empty cards. Play the quarters
  // and the semis so the screenshot shows a tournament in progress: two rounds
  // of results, a final and a third place match still open.
  const mainRounds = rounds
    .filter((r) => r.bracketType === "winners")
    .sort((a, b) => a.roundNumber - b.roundNumber);

  for (const round of mainRounds.slice(0, 2)) {
    await playBracketRound(round.id, daysAgo(4 - round.roundNumber, 20, 30), (playerA, playerB) => {
      const [scoreA, scoreB] = drawScore(favouredWins(playerA, playerB));
      return { scoreA, scoreB, outcomeTypeId: discipline.standard };
    });
  }

  console.log('Seeded bracket "Friday Night Cup" (quarters and semis played)');
  return tournamentId;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!/skolarena_showcase/.test(url)) {
    throw new Error(`Refusing to seed a non-showcase database: ${url}`);
  }

  await runMigrations();

  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);
  if (existing.length > 0) {
    console.log("Showcase database already seeded — skipping.");
    process.exit(0);
  }

  await seedUsers();
  await seedAvatars();

  const tableFootball = await seedDiscipline(
    "Table football",
    "fa fa-futbol",
    "First side to 10 goals. Report the final score for both sides.",
  );
  const darts = await seedDiscipline(
    "Darts",
    "fa fa-bullseye",
    "501, straight out. Report the number of legs won by each side.",
  );

  await seedChampionship({
    name: "Summer League 2026",
    description:
      "The main league. Play when you are both free, report the score, and the table updates itself.",
    discipline: tableFootball,
    playerKeys: PLAYERS.map((p) => p.key),
    status: "ongoing",
    startDaysAgo: 58,
    endDaysAgo: -22,
    matchCount: 74,
    pendingCount: 5,
    viewerKey: "theo",
  });

  await seedChampionship({
    name: "Spring League 2026",
    description: "Closed season. Final standings decided the Friday Night Cup seeding.",
    discipline: darts,
    playerKeys: PLAYERS.slice(0, 8).map((p) => p.key),
    status: "finished",
    startDaysAgo: 168,
    endDaysAgo: 92,
    matchCount: 44,
  });

  await seedRankedSeason(tableFootball);
  await seedBracket(tableFootball);

  console.log("Showcase seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Showcase seed failed:", err);
  process.exit(1);
});
