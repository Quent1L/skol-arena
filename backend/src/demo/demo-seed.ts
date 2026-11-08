/**
 * Demo data: a club that has been playing for a few months, loaded at startup when
 * INIT_DEMO_DATA is set (see `utils/init-demo-data.ts`).
 *
 * The point is to let someone trying the product sign in and find every screen
 * populated: championships ongoing, finished and open for registration, a ranked
 * season with a ladder, a bracket halfway through, static teams, matches waiting for
 * their confirmation, a disputed result, and every way a match can end.
 *
 * Unlike the screenshot seed, dates follow the real clock: the data should look
 * current on the day the container starts, not on the day it was written.
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../config/database";
import {
  tournamentScoringConfigs,
  championshipConfigs,
  rankedSeasonConfigs,
  rankTiers,
  bracketConfigs,
  bracketRounds,
  tournamentAdmins,
} from "../db/schema";
import { newId } from "../utils/uuid";
import { logger } from "../utils/logger";
import { avatarService } from "../services/avatar.service";
import { standingsService } from "../services/standings.service";
import { mmrCalculationService } from "../services/mmr-calculation.service";
import { bracketService } from "../services/bracket.service";
import { rankedSeasonService } from "../services/ranked-season.service";
import { rulesMatchHistoryService } from "../services/rules-match-history.service";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { readAvatar } from "./avatars";
import { buildPairings, createRandom, favouredWins, type Random } from "./random";
import {
  createAccount,
  createCompetition,
  createDiscipline,
  createTeam,
  insertMatch,
  outcomeOf,
  playBracketRound,
  type BracketResult,
  type MatchStatus,
  type SeededDiscipline,
  type TournamentRow,
} from "./builders";
import {
  DARTS,
  DEMO_ADMIN_KEY,
  DEMO_PASSWORD,
  DEMO_PEOPLE,
  FORFEIT_REASONS,
  POOL,
  POOL_FOUL_REASONS,
  POOL_OUTCOMES,
  POOL_RACE_TO,
  TABLE_FOOTBALL,
  TABLE_FOOTBALL_OUTCOMES,
  demoEmail,
} from "./demo-dataset";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type DemoContext = {
  random: Random;
  now: Date;
  /** person key -> app_users.id */
  ids: Map<string, string>;
  /** app_users.id -> hidden strength */
  strength: Map<string, number>;
};

export type DemoSummary = { players: number; competitions: number; matches: number };

function idOf(ctx: DemoContext, key: string): string {
  const value = ctx.ids.get(key);
  if (!value) throw new Error(`Unknown demo person: ${key}`);
  return value;
}

function adminId(ctx: DemoContext): string {
  return idOf(ctx, DEMO_ADMIN_KEY);
}

function daysAgo(ctx: DemoContext, days: number, hour = 20, minute = 0): Date {
  const d = new Date(ctx.now.getTime() - days * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function hoursAgo(ctx: DemoContext, hours: number): Date {
  const d = new Date(ctx.now.getTime() - hours * 3_600_000);
  d.setUTCSeconds(0, 0);
  return d;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** An evening slot `days` ago, jittered so two matches rarely share a minute. */
function eveningOf(ctx: DemoContext, days: number): Date {
  return daysAgo(ctx, days, ctx.random.int(17, 21), ctx.random.int(0, 59));
}

function wins(ctx: DemoContext, playerA: string, playerB: string): boolean {
  return favouredWins(
    ctx.random,
    ctx.strength.get(playerA) ?? 0.5,
    ctx.strength.get(playerB) ?? 0.5,
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

async function seedPeople(ctx: DemoContext): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const person of DEMO_PEOPLE) {
    const appId = await createAccount({
      authId: `demo-${person.key}`,
      name: person.name,
      email: demoEmail(person.key),
      shortName: person.shortName,
      role: person.role,
      passwordHash,
      // Enough reports behind them that the app shows established players.
      trustScoreCount: person.role === "super_admin" ? 0 : ctx.random.int(4, 18),
      lastLoginAt: daysAgo(ctx, ctx.random.int(0, 4), 19),
    });
    ctx.ids.set(person.key, appId);
    ctx.strength.set(appId, person.strength);
  }
}

/** Some players with a picture, the rest keep their initials: a real club has both. */
async function seedAvatars(ctx: DemoContext): Promise<void> {
  for (const person of DEMO_PEOPLE) {
    if (!person.avatar) continue;
    try {
      await avatarService.setAvatar(idOf(ctx, person.key), await readAvatar(person.avatar));
    } catch (err) {
      // Cosmetic: a player without a picture is still a complete demo.
      logger.warn({ err, player: person.key }, "Demo data: avatar skipped");
    }
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

type PlayedResult = {
  scoreA: number;
  scoreB: number;
  outcomeTypeId: string;
  outcomeReasonId?: string;
};

function reasonOf(discipline: SeededDiscipline, outcome: string, reason: string): string | undefined {
  return outcomeOf(discipline, outcome).reasonIds.get(reason);
}

/** Race to 5 frames, ending mostly on a clean win, sometimes on a foul or a forfeit. */
function poolResult(ctx: DemoContext, pool: SeededDiscipline, aWins: boolean): PlayedResult {
  const order = (w: number, l: number): [number, number] => (aWins ? [w, l] : [l, w]);
  const roll = ctx.random.next();

  if (roll < 0.05) {
    const reason = ctx.random.next() < 0.5 ? FORFEIT_REASONS.noShow : FORFEIT_REASONS.withdrawal;
    const [scoreA, scoreB] = order(POOL_RACE_TO, reason === FORFEIT_REASONS.noShow ? 0 : ctx.random.int(0, 2));
    return { scoreA, scoreB, outcomeTypeId: outcomeOf(pool, POOL_OUTCOMES.forfeit).id, outcomeReasonId: reasonOf(pool, POOL_OUTCOMES.forfeit, reason) };
  }

  const [scoreA, scoreB] = order(POOL_RACE_TO, ctx.random.int(0, POOL_RACE_TO - 1));
  if (roll < 0.2) {
    const reason = POOL_FOUL_REASONS[ctx.random.int(0, POOL_FOUL_REASONS.length - 1)]!;
    return { scoreA, scoreB, outcomeTypeId: outcomeOf(pool, POOL_OUTCOMES.foul).id, outcomeReasonId: reasonOf(pool, POOL_OUTCOMES.foul, reason) };
  }
  return { scoreA, scoreB, outcomeTypeId: outcomeOf(pool, POOL_OUTCOMES.standard).id };
}

/** First to 10 goals; a 10-9 is a golden goal. */
function tableFootballResult(ctx: DemoContext, discipline: SeededDiscipline, aWins: boolean): PlayedResult {
  const loser = ctx.random.int(3, 9);
  const name = loser === 9 ? TABLE_FOOTBALL_OUTCOMES.goldenGoal : TABLE_FOOTBALL_OUTCOMES.standard;
  const [scoreA, scoreB] = aWins ? [10, loser] : [loser, 10];
  return { scoreA, scoreB, outcomeTypeId: outcomeOf(discipline, name).id };
}

function oneVsOne(playerA: string, playerB: string, result: PlayedResult) {
  return [
    { playerIds: [playerA], score: result.scoreA },
    { playerIds: [playerB], score: result.scoreB },
  ] as [{ playerIds: string[]; score: number }, { playerIds: string[]; score: number }];
}

// ---------------------------------------------------------------------------
// Championships
// ---------------------------------------------------------------------------

type LeagueOptions = {
  name: string;
  description: string;
  playerKeys: string[];
  status: "ongoing" | "finished";
  startDaysAgo: number;
  endDaysAgo: number;
  matchCount: number;
  coAdminKey?: string;
};

type RowFields = Omit<Partial<TournamentRow>, "id" | "disciplineId" | "createdBy"> &
  Pick<TournamentRow, "name" | "mode" | "startDate" | "endDate">;

/** The settings every demo competition shares; `fields` overrides them. */
function baseRow(
  ctx: DemoContext,
  discipline: SeededDiscipline,
  fields: RowFields,
): TournamentRow & { id: string; disciplineId: string } {
  return {
    id: newId(),
    teamMode: "flex" as const,
    status: "ongoing" as const,
    minTeamSize: 1,
    maxTeamSize: 1,
    scoreEnabled: true,
    allowDraw: false,
    minScore: 0,
    maxScore: POOL_RACE_TO,
    validationMode: "strict" as const,
    validationTimerHours: 48,
    ...fields,
    disciplineId: discipline.id,
    createdBy: adminId(ctx),
  };
}

async function addChampionshipConfig(tournamentId: string, maxMatchesPerPlayer: number) {
  await db.insert(tournamentScoringConfigs).values({ tournamentId, pointPerVictory: 3, pointPerDraw: 1, pointPerLoss: 0 });
  await db.insert(championshipConfigs).values({
    tournamentId,
    maxMatchesPerPlayer,
    maxTimesWithSamePartner: 2,
    maxTimesWithSameOpponent: 2,
  });
}

async function createLeague(ctx: DemoContext, pool: SeededDiscipline, opts: LeagueOptions): Promise<string> {
  const playerIds = opts.playerKeys.map((key) => idOf(ctx, key));
  const row = baseRow(ctx, pool, {
    name: opts.name,
    description: opts.description,
    mode: "championship",
    status: opts.status,
    startDate: dateStr(daysAgo(ctx, opts.startDaysAgo)),
    endDate: dateStr(daysAgo(ctx, opts.endDaysAgo)),
    createdAt: daysAgo(ctx, opts.startDaysAgo + 3),
  });
  const tournamentId = await createCompetition(row, playerIds);
  await addChampionshipConfig(tournamentId, 2 * (playerIds.length - 1));
  if (opts.coAdminKey) {
    await db
      .insert(tournamentAdmins)
      .values({ tournamentId, userId: idOf(ctx, opts.coAdminKey), role: "co_admin" })
      .onConflictDoNothing();
  }
  return tournamentId;
}

/** Plays `matchCount` finalized matches spread from the start date to today (or the end). */
async function playLeague(ctx: DemoContext, pool: SeededDiscipline, tournamentId: string, opts: LeagueOptions): Promise<number> {
  const playerIds = opts.playerKeys.map((key) => idOf(ctx, key));
  const pairs = buildPairings(ctx.random, playerIds, 2).slice(0, opts.matchCount);
  const lastDay = Math.max(opts.endDaysAgo, 1);
  const span = Math.max(opts.startDaysAgo - lastDay, 1);

  for (let i = 0; i < pairs.length; i++) {
    const [playerA, playerB] = pairs[i]!;
    const result = poolResult(ctx, pool, wins(ctx, playerA, playerB));
    await insertMatch({
      tournamentId,
      sides: oneVsOne(playerA, playerB, result),
      outcomeTypeId: result.outcomeTypeId,
      outcomeReasonId: result.outcomeReasonId,
      playedAt: eveningOf(ctx, opts.startDaysAgo - Math.floor((i / pairs.length) * span)),
      reportedBy: ctx.random.next() < 0.5 ? playerA : playerB,
    });
  }
  return pairs.length;
}

/**
 * Matches still in flight, all involving the admin since that is who the visitor
 * signs in as: two to confirm, one waiting on the opponent, one disputed.
 */
async function playPendingForAdmin(ctx: DemoContext, pool: SeededDiscipline, tournamentId: string, opponents: string[]): Promise<number> {
  const admin = adminId(ctx);
  const plan: { opponent: string; status: MatchStatus; adminReports: boolean }[] = [
    { opponent: opponents[0]!, status: "reported", adminReports: false },
    { opponent: opponents[1]!, status: "reported", adminReports: false },
    { opponent: opponents[2]!, status: "reported", adminReports: true },
    { opponent: opponents[3]!, status: "disputed", adminReports: false },
  ];

  for (const [index, entry] of plan.entries()) {
    const opponent = idOf(ctx, entry.opponent);
    const result = poolResult(ctx, pool, wins(ctx, opponent, admin));
    await insertMatch({
      tournamentId,
      // The reporter is on side A; for the dispute the contester is side B: the admin.
      sides: entry.adminReports ? oneVsOne(admin, opponent, { ...result, scoreA: result.scoreB, scoreB: result.scoreA }) : oneVsOne(opponent, admin, result),
      outcomeTypeId: result.outcomeTypeId,
      outcomeReasonId: result.outcomeReasonId,
      playedAt: hoursAgo(ctx, 4 + index * 7),
      status: entry.status,
      reportedBy: entry.adminReports ? admin : opponent,
      contestationReason: "I won the last frame, the score should be the other way round.",
    });
  }
  return plan.length;
}

async function seedPoolLeague(ctx: DemoContext, pool: SeededDiscipline): Promise<number> {
  const opts: LeagueOptions = {
    name: "Pool League",
    description: "The club's main league. Play when you are both free, report the score, and the table updates itself.",
    playerKeys: DEMO_PEOPLE.map((p) => p.key),
    status: "ongoing",
    startDaysAgo: 45,
    endDaysAgo: -30,
    matchCount: 80,
    coAdminKey: "liam",
  };
  const tournamentId = await createLeague(ctx, pool, opts);
  const played = await playLeague(ctx, pool, tournamentId, opts);
  const pending = await playPendingForAdmin(ctx, pool, tournamentId, ["ava", "noah", "maya", "ethan"]);
  await standingsService.recalculatePointsInternal(tournamentId);
  return played + pending;
}

async function seedSpringLeague(ctx: DemoContext, pool: SeededDiscipline): Promise<number> {
  const opts: LeagueOptions = {
    name: "Spring Pool League",
    description: "Last season's league, now closed. Its final table decided the seeding of the cup.",
    playerKeys: DEMO_PEOPLE.slice(0, 10).map((p) => p.key),
    status: "finished",
    startDaysAgo: 170,
    endDaysAgo: 95,
    matchCount: 60,
  };
  const tournamentId = await createLeague(ctx, pool, opts);
  const played = await playLeague(ctx, pool, tournamentId, opts);
  await standingsService.recalculatePointsInternal(tournamentId);
  return played;
}

// ---------------------------------------------------------------------------
// Ranked season
// ---------------------------------------------------------------------------

const RANK_TIERS = [
  { level: 1, name: "Bronze", percentile: 0, minMmr: 700, subRanks: 3, iconClass: "fa fa-seedling" },
  { level: 2, name: "Silver", percentile: 0.35, minMmr: 900, subRanks: 3, iconClass: "fa fa-shield-halved" },
  { level: 3, name: "Gold", percentile: 0.6, minMmr: 1100, subRanks: 3, iconClass: "fa fa-star" },
  { level: 4, name: "Platinum", percentile: 0.82, minMmr: 1300, subRanks: 3, iconClass: "fa fa-gem" },
  { level: 5, name: "Diamond", percentile: 0.94, minMmr: 1500, subRanks: 1, iconClass: "fa fa-crown" },
];

async function createRankedSeason(ctx: DemoContext, pool: SeededDiscipline): Promise<string> {
  const row = baseRow(ctx, pool, {
    name: "Pool Ranked Season",
    description: "Continuous ladder play. Challenge anyone, any time: every result moves your rating.",
    mode: "ranked",
    // No confirmation step: a ranked result counts the moment it is reported.
    validationMode: "none",
    startDate: dateStr(daysAgo(ctx, 60)),
    endDate: dateStr(daysAgo(ctx, -30)),
    createdAt: daysAgo(ctx, 63),
  });
  const seasonId = await createCompetition(row, DEMO_PEOPLE.map((p) => idOf(ctx, p.key)));
  await db.insert(rankedSeasonConfigs).values({ tournamentId: seasonId, baseMmr: 1000, kFactor: 32, placementMatches: 5 });
  await db.insert(rankTiers).values(RANK_TIERS.map((tier) => ({ seasonId, ...tier })));
  return seasonId;
}

/** Ranked pairings, oldest first, then a few for the admin inside the last days. */
function rankedSchedule(ctx: DemoContext): { playerA: string; playerB: string; playedAt: Date }[] {
  const ids = DEMO_PEOPLE.map((p) => idOf(ctx, p.key));
  const pairs = buildPairings(ctx.random, ids, 2).slice(0, 110);
  const schedule = pairs.map(([playerA, playerB], i) => ({
    playerA,
    playerB,
    playedAt: eveningOf(ctx, 58 - Math.floor((i / pairs.length) * 55)),
  }));

  // Recent matches for the admin, so their "this week" figures are not empty.
  const recentOpponents = ["sofia", "chloe", "lucas", "noah"];
  for (const [i, key] of recentOpponents.entries()) {
    schedule.push({ playerA: adminId(ctx), playerB: idOf(ctx, key), playedAt: hoursAgo(ctx, 50 - i * 12) });
  }
  return schedule;
}

/**
 * Ratings come out of the real engine: one chronological replay of the season, the
 * same pass the "recalculate" action runs, then everything the MMR worker refreshes
 * after it. One pass instead of a cascade per match keeps the startup short.
 */
async function computeSeasonStandings(seasonId: string): Promise<void> {
  await mmrCalculationService.recalculateSeasonMmrDeterministic(seasonId);
  // Tier thresholds are percentiles of the pool: without this every player would
  // sit in the bottom tier behind the placeholder minMmr values.
  await rankedSeasonService.recalculateTierMinMmr(seasonId, 1000);
  const players = await playerMmrRepository.getAllPlayersBySeasonId(seasonId);
  await rulesMatchHistoryService.refreshPlayers(seasonId, players.map((p) => p.playerId));
  await rankedSeasonService.computeAndCacheOfficial(seasonId);
  await rankedSeasonService.computeAndCacheProvisional(seasonId);
}

async function seedRankedSeason(ctx: DemoContext, pool: SeededDiscipline): Promise<number> {
  const seasonId = await createRankedSeason(ctx, pool);
  const matchIds: string[] = [];

  for (const { playerA, playerB, playedAt } of rankedSchedule(ctx)) {
    const result = poolResult(ctx, pool, wins(ctx, playerA, playerB));
    matchIds.push(
      await insertMatch({
        tournamentId: seasonId,
        sides: oneVsOne(playerA, playerB, result),
        outcomeTypeId: result.outcomeTypeId,
        outcomeReasonId: result.outcomeReasonId,
        playedAt,
        reportedBy: ctx.random.next() < 0.5 ? playerA : playerB,
      }),
    );
  }

  await computeSeasonStandings(seasonId);
  return matchIds.length;
}

// ---------------------------------------------------------------------------
// Bracket
// ---------------------------------------------------------------------------

async function createCup(ctx: DemoContext, pool: SeededDiscipline): Promise<string> {
  const keys = [DEMO_ADMIN_KEY, "ava", "sofia", "noah", "maya", "ethan", "chloe", "liam"];
  const row = baseRow(ctx, pool, {
    name: "Friday Night Pool Cup",
    description: "Single elimination, eight players, third-place match included.",
    mode: "bracket",
    startDate: dateStr(daysAgo(ctx, 6)),
    endDate: dateStr(daysAgo(ctx, -3)),
    createdAt: daysAgo(ctx, 12),
  });
  const tournamentId = await createCompetition(row, keys.map((key) => idOf(ctx, key)));
  await db.insert(tournamentScoringConfigs).values({ tournamentId });
  await bracketService.generateBracket(
    tournamentId,
    { bracketType: "single_elimination", seedingType: "random", hasBronzeMatch: true },
    adminId(ctx),
  );
  return tournamentId;
}

/** Quarters and semis played; the final and the third-place match are left to play. */
async function seedCup(ctx: DemoContext, pool: SeededDiscipline): Promise<number> {
  const tournamentId = await createCup(ctx, pool);
  const config = await db.query.bracketConfigs.findFirst({ where: eq(bracketConfigs.tournamentId, tournamentId) });
  if (!config) throw new Error("Bracket config missing right after generation");

  const rounds = (await db.query.bracketRounds.findMany({ where: eq(bracketRounds.bracketConfigId, config.id) }))
    .filter((r) => r.bracketType === "winners")
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .slice(0, 2);

  const decide = (playerA: string, playerB: string): BracketResult => poolResult(ctx, pool, wins(ctx, playerA, playerB));
  for (const round of rounds) {
    await playBracketRound(round.id, daysAgo(ctx, 6 - round.roundNumber * 2, 20, 30), decide);
  }
  return 6;
}

// ---------------------------------------------------------------------------
// Static teams
// ---------------------------------------------------------------------------

const DOUBLES_TEAMS: { name: string; members: [string, string] }[] = [
  { name: "The Spin Doctors", members: [DEMO_ADMIN_KEY, "amara"] },
  { name: "Golden Goals", members: ["ava", "daniel"] },
  { name: "Bar Raisers", members: ["sofia", "oliver"] },
  { name: "Midfield Maestros", members: ["noah", "hana"] },
  { name: "Late Tacklers", members: ["isabella", "mateo"] },
  { name: "Rod Squad", members: ["grace", "lucas"] },
];

async function createDoublesLeague(ctx: DemoContext, discipline: SeededDiscipline): Promise<{ tournamentId: string; teams: { id: string; players: string[] }[] }> {
  const players = DOUBLES_TEAMS.flatMap((t) => t.members.map((key) => idOf(ctx, key)));
  const row = baseRow(ctx, discipline, {
    name: "Table Football Doubles",
    description: "Fixed teams of two, every team plays every other one twice.",
    mode: "championship",
    teamMode: "static",
    minTeamSize: 2,
    maxTeamSize: 2,
    maxScore: 10,
    startDate: dateStr(daysAgo(ctx, 30)),
    endDate: dateStr(daysAgo(ctx, -20)),
    createdAt: daysAgo(ctx, 33),
  });
  const tournamentId = await createCompetition(row, players);
  await addChampionshipConfig(tournamentId, 2 * (DOUBLES_TEAMS.length - 1));

  const teams = [];
  for (const team of DOUBLES_TEAMS) {
    const memberIds = team.members.map((key) => idOf(ctx, key));
    teams.push({ id: await createTeam(tournamentId, team.name, memberIds, adminId(ctx)), players: memberIds });
  }
  return { tournamentId, teams };
}

function teamStrength(ctx: DemoContext, players: string[]): number {
  return players.reduce((sum, p) => sum + (ctx.strength.get(p) ?? 0.5), 0) / players.length;
}

async function seedDoublesLeague(ctx: DemoContext, discipline: SeededDiscipline): Promise<number> {
  const { tournamentId, teams } = await createDoublesLeague(ctx, discipline);
  const pairs = buildPairings(ctx.random, teams, 1);

  for (const [i, [teamA, teamB]] of pairs.entries()) {
    const aWins = favouredWins(ctx.random, teamStrength(ctx, teamA.players), teamStrength(ctx, teamB.players));
    const result = tableFootballResult(ctx, discipline, aWins);
    const last = i === pairs.length - 1;
    await insertMatch({
      tournamentId,
      sides: [
        { teamId: teamA.id, playerIds: teamA.players, score: result.scoreA },
        { teamId: teamB.id, playerIds: teamB.players, score: result.scoreB },
      ],
      outcomeTypeId: result.outcomeTypeId,
      // The newest result is still waiting for the other team to confirm it.
      status: last ? "reported" : "finalized",
      playedAt: last ? hoursAgo(ctx, 20) : eveningOf(ctx, 28 - Math.floor((i / pairs.length) * 26)),
      reportedBy: teamA.players[0],
    });
  }
  await standingsService.recalculatePointsInternal(tournamentId);
  return pairs.length;
}

// ---------------------------------------------------------------------------
// Open for registration
// ---------------------------------------------------------------------------

/** Starts next week, no match yet: somewhere to try registering and reporting. */
async function seedDartsOpen(ctx: DemoContext, darts: SeededDiscipline): Promise<void> {
  const keys = ["liam", "sofia", "ethan", "chloe", "daniel", "hana"];
  const row = baseRow(ctx, darts, {
    name: "Darts Winter Open",
    description: "Registration is open. Join, then play anyone else registered: best of 5 legs.",
    mode: "championship",
    status: "open",
    maxScore: 3,
    validationMode: "auto",
    validationTimerHours: 24,
    startDate: dateStr(daysAgo(ctx, -7)),
    endDate: dateStr(daysAgo(ctx, -60)),
    createdAt: daysAgo(ctx, 2),
  });
  const tournamentId = await createCompetition(row, keys.map((key) => idOf(ctx, key)));
  await addChampionshipConfig(tournamentId, 10);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Writes the whole demo data set. Expects an empty database: the caller checks.
 * `now` is injectable for tests; production uses the real clock.
 */
export async function seedDemoData(now: Date = new Date()): Promise<DemoSummary> {
  const ctx: DemoContext = { random: createRandom(20261108), now, ids: new Map(), strength: new Map() };

  await seedPeople(ctx);
  await seedAvatars(ctx);

  const pool = await createDiscipline(POOL);
  const tableFootball = await createDiscipline(TABLE_FOOTBALL);
  const darts = await createDiscipline(DARTS);

  let matches = 0;
  matches += await seedSpringLeague(ctx, pool);
  matches += await seedPoolLeague(ctx, pool);
  matches += await seedRankedSeason(ctx, pool);
  matches += await seedCup(ctx, pool);
  matches += await seedDoublesLeague(ctx, tableFootball);
  await seedDartsOpen(ctx, darts);

  return { players: DEMO_PEOPLE.length, competitions: 6, matches };
}
