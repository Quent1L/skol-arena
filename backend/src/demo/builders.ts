/**
 * Database building blocks shared by the demo data (`demo-seed.ts`, run at startup
 * under INIT_DEMO_DATA) and the docs screenshot seed (`scripts/seed-showcase.ts`).
 *
 * They write rows directly rather than going through the HTTP services — a seed has
 * no session, and a backfill would trip the ranked reporting window — but they lean
 * on the real services wherever one exists (entries, rulesets, brackets, MMR), so
 * the data is what the app would have produced by hand.
 */
import { eq } from "drizzle-orm";
import { db } from "../config/database";
import {
  user,
  account,
  appUsers,
  disciplines,
  outcomeTypes,
  outcomeReasons,
  tournaments,
  tournamentParticipants,
  tournamentRulesets,
  tournamentAdmins,
  tournamentEntryPlayers,
  matches,
  matchSides,
  matchResults,
  matchConfirmations,
  bracketMatchMetadata,
  teams,
  teamMembers,
} from "../db/schema";
import { newId } from "../utils/uuid";
import { entryRepository } from "../repository/entry.repository";
import { tournamentRulesetRepository } from "../repository/tournament-ruleset.repository";
import { bracketService } from "../services/bracket.service";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type AccountDef = {
  authId: string;
  name: string;
  email: string;
  shortName: string;
  role: "player" | "tournament_admin" | "super_admin";
  /** Already hashed: hashing is slow, so a seed hashes its one password once. */
  passwordHash: string;
  trustScoreCount: number;
  lastLoginAt: Date;
};

/** Better Auth user + credential account + app user. Returns the app user id. */
export async function createAccount(def: AccountDef): Promise<string> {
  const appId = newId();
  await db.insert(user).values({
    id: def.authId,
    name: def.name,
    email: def.email,
    emailVerified: true,
  });
  await db.insert(account).values({
    id: newId(),
    providerId: "credential",
    accountId: def.email,
    userId: def.authId,
    password: def.passwordHash,
  });
  await db.insert(appUsers).values({
    id: appId,
    externalId: def.authId,
    displayName: def.name,
    shortName: def.shortName,
    role: def.role,
    trustScoreCount: def.trustScoreCount,
    lastLoginAt: def.lastLoginAt,
  });
  return appId;
}

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------

export type OutcomeDef = {
  name: string;
  isDefault?: boolean;
  points?: number;
  mmrMultiplier?: number;
  scoreCountsForMmr?: boolean;
  reasons?: string[];
};

export type DisciplineDef = {
  name: string;
  icon: string;
  scoreInstructions: string;
  teamInteractionMode: "INDIVIDUAL" | "SHARED_RESOURCE" | "COLLABORATIVE";
  outcomes: OutcomeDef[];
};

export type SeededOutcome = { id: string; reasonIds: Map<string, string> };

export type SeededDiscipline = {
  id: string;
  /** Keyed by outcome type name. */
  outcomes: Map<string, SeededOutcome>;
};

async function createOutcome(disciplineId: string, def: OutcomeDef): Promise<SeededOutcome> {
  const id = newId();
  await db.insert(outcomeTypes).values({
    id,
    disciplineId,
    name: def.name,
    isDefault: def.isDefault ?? false,
    points: def.points ?? 3,
    mmrMultiplier: def.mmrMultiplier ?? 1,
    scoreCountsForMmr: def.scoreCountsForMmr ?? true,
  });

  const reasonIds = new Map<string, string>();
  for (const name of def.reasons ?? []) {
    const reasonId = newId();
    await db.insert(outcomeReasons).values({ id: reasonId, outcomeTypeId: id, name });
    reasonIds.set(name, reasonId);
  }
  return { id, reasonIds };
}

export async function createDiscipline(def: DisciplineDef): Promise<SeededDiscipline> {
  const id = newId();
  await db.insert(disciplines).values({
    id,
    name: def.name,
    icon: def.icon,
    scoreInstructions: def.scoreInstructions,
    teamInteractionMode: def.teamInteractionMode,
  });

  const outcomes = new Map<string, SeededOutcome>();
  for (const outcome of def.outcomes) {
    outcomes.set(outcome.name, await createOutcome(id, outcome));
  }
  return { id, outcomes };
}

export function outcomeOf(discipline: SeededDiscipline, name: string): SeededOutcome {
  const outcome = discipline.outcomes.get(name);
  if (!outcome) throw new Error(`Unknown seeded outcome type: ${name}`);
  return outcome;
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

export type TournamentRow = typeof tournaments.$inferInsert;

/**
 * The tournament row, its participants, its owner and the ruleset snapshot every
 * calculation reads. Mode-specific configuration is left to the caller.
 */
export async function createCompetition(
  row: TournamentRow & { id: string; disciplineId: string },
  participantIds: string[],
): Promise<string> {
  await db.insert(tournaments).values(row);
  if (participantIds.length > 0) {
    await db
      .insert(tournamentParticipants)
      .values(participantIds.map((userId) => ({ tournamentId: row.id, userId })));
  }
  await db
    .insert(tournamentAdmins)
    .values({ tournamentId: row.id, userId: row.createdBy, role: "owner" })
    .onConflictDoNothing();
  await db
    .insert(tournamentRulesets)
    .values({
      tournamentId: row.id,
      payload: await tournamentRulesetRepository.buildPayloadForDiscipline(row.disciplineId),
    })
    .onConflictDoNothing();
  return row.id;
}

/** A static team and its members. Returns the team id. */
export async function createTeam(
  tournamentId: string,
  name: string,
  memberIds: string[],
  createdBy: string,
): Promise<string> {
  const id = newId();
  await db.insert(teams).values({ id, tournamentId, name, createdBy });
  await db.insert(teamMembers).values(memberIds.map((userId) => ({ teamId: id, userId })));
  return id;
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export type MatchStatus = "finalized" | "reported" | "disputed";

export type MatchSideInput = {
  playerIds: string[];
  /** Static team mode only. */
  teamId?: string;
  score: number | null;
};

export type MatchInput = {
  tournamentId: string;
  sides: [MatchSideInput, MatchSideInput];
  outcomeTypeId: string;
  outcomeReasonId?: string;
  playedAt: Date;
  status?: MatchStatus;
  /** Must be one of the players. Defaults to the first player of side A. */
  reportedBy?: string;
  /** Explicit winner, for matches without a score. Derived from the scores otherwise. */
  winnerSide?: "A" | "B" | null;
  contestationReason?: string;
  validationTimerHours?: number;
};

function winnerOf(input: MatchInput): "A" | "B" | null {
  if (input.winnerSide !== undefined) return input.winnerSide;
  const [a, b] = input.sides.map((s) => s.score ?? 0);
  if (a! > b!) return "A";
  return b! > a! ? "B" : null;
}

function sidePositionOf(input: MatchInput, playerId: string): 1 | 2 {
  return input.sides[0].playerIds.includes(playerId) ? 1 : 2;
}

async function insertMatchRow(input: MatchInput, matchId: string, reportedBy: string) {
  const status = input.status ?? "finalized";
  const timer = input.validationTimerHours ?? 48;
  await db.insert(matches).values({
    id: matchId,
    tournamentId: input.tournamentId,
    status,
    playedAt: input.playedAt,
    winnerSide: winnerOf(input),
    outcomeTypeId: input.outcomeTypeId,
    outcomeReasonId: input.outcomeReasonId ?? null,
    createdBy: reportedBy,
    createdAt: input.playedAt,
    confirmationDeadline:
      status === "finalized" ? null : new Date(input.playedAt.getTime() + timer * 3_600_000),
  });
}

async function insertSides(input: MatchInput, matchId: string) {
  for (const [index, side] of input.sides.entries()) {
    // The real lookup: a flex composition or a static team that already played
    // reuses its entry, exactly like a match entered through the app.
    const entry = await entryRepository.getOrCreateForMatch(
      input.tournamentId,
      side.teamId,
      side.teamId ? undefined : side.playerIds,
    );
    if (!entry) throw new Error("Entry lookup returned nothing");
    await db
      .insert(matchSides)
      .values({ matchId, entryId: entry.id, position: index + 1, score: side.score });
  }
}

async function insertResult(input: MatchInput, matchId: string, reportedBy: string) {
  const finalized = (input.status ?? "finalized") === "finalized";
  await db.insert(matchResults).values({
    matchId,
    reportedBy,
    reportedAt: input.playedAt,
    finalizedBy: finalized ? reportedBy : null,
    finalizedAt: finalized ? input.playedAt : null,
    finalizationReason: finalized ? "consensus" : null,
  });
}

/**
 * The reporter implicitly confirms their own report; that is what makes the other
 * side the one the app is waiting on. A disputed match also gets the contestation.
 */
async function insertConfirmations(input: MatchInput, matchId: string, reportedBy: string) {
  await db.insert(matchConfirmations).values({
    matchId,
    playerId: reportedBy,
    isConfirmed: true,
    sidePosition: sidePositionOf(input, reportedBy),
  });
  if (input.status !== "disputed") return;

  const reporterSide = sidePositionOf(input, reportedBy);
  const contester = input.sides[reporterSide === 1 ? 1 : 0].playerIds[0]!;
  await db.insert(matchConfirmations).values({
    matchId,
    playerId: contester,
    isConfirmed: false,
    isContested: true,
    contestationReason: input.contestationReason ?? "The score is wrong.",
    sidePosition: sidePositionOf(input, contester),
  });
}

/** Inserts one match with its sides, result and confirmations. Returns the match id. */
export async function insertMatch(input: MatchInput): Promise<string> {
  const matchId = newId();
  const reportedBy = input.reportedBy ?? input.sides[0].playerIds[0]!;
  await insertMatchRow(input, matchId, reportedBy);
  await insertSides(input, matchId);
  await insertResult(input, matchId, reportedBy);
  await insertConfirmations(input, matchId, reportedBy);
  return matchId;
}

// ---------------------------------------------------------------------------
// Brackets
// ---------------------------------------------------------------------------

export type BracketResult = {
  scoreA: number;
  scoreB: number;
  outcomeTypeId: string;
  outcomeReasonId?: string;
};

async function playerOfEntry(entryId: string): Promise<string> {
  const row = await db.query.tournamentEntryPlayers.findFirst({
    where: eq(tournamentEntryPlayers.entryId, entryId),
  });
  if (!row) throw new Error(`Bracket entry ${entryId} has no player`);
  return row.playerId;
}

async function finalizeBracketMatch(matchId: string, result: BracketResult, playedAt: Date, reporter: string) {
  await db
    .update(matches)
    .set({
      status: "finalized",
      winnerSide: result.scoreA > result.scoreB ? "A" : "B",
      playedAt,
      outcomeTypeId: result.outcomeTypeId,
      outcomeReasonId: result.outcomeReasonId ?? null,
    })
    .where(eq(matches.id, matchId));
  await db
    .insert(matchResults)
    .values({
      matchId,
      reportedBy: reporter,
      reportedAt: playedAt,
      finalizedBy: reporter,
      finalizedAt: playedAt,
      finalizationReason: "consensus",
    })
    .onConflictDoNothing();
}

/**
 * Finalizes every match of one 1v1 bracket round and feeds winners (and losers, for
 * a bronze match) forward through the real bracket service. `decide` gets the two
 * players in side order and returns the result.
 */
export async function playBracketRound(
  bracketRoundId: string,
  playedAt: Date,
  decide: (playerA: string, playerB: string) => BracketResult,
): Promise<void> {
  const metadata = await db.query.bracketMatchMetadata.findMany({
    where: eq(bracketMatchMetadata.bracketRoundId, bracketRoundId),
    orderBy: (m, { asc }) => [asc(m.matchNumber)],
  });

  for (const meta of metadata) {
    const sides = await db.query.matchSides.findMany({
      where: eq(matchSides.matchId, meta.matchId),
      orderBy: (s, { asc }) => [asc(s.position)],
    });
    if (sides.length !== 2) continue;

    const playerA = await playerOfEntry(sides[0]!.entryId);
    const playerB = await playerOfEntry(sides[1]!.entryId);
    const result = decide(playerA, playerB);

    await db.update(matchSides).set({ score: result.scoreA }).where(eq(matchSides.id, sides[0]!.id));
    await db.update(matchSides).set({ score: result.scoreB }).where(eq(matchSides.id, sides[1]!.id));
    await finalizeBracketMatch(meta.matchId, result, playedAt, playerA);

    await bracketService.advanceWinnerToNextRound(meta.matchId);
    await bracketService.advanceLoserToNextRound(meta.matchId);
  }
}
