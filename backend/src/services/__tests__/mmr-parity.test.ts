/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";
import type { MatchMmrInput } from "../mmr-engine";

/**
 * The three MMR paths — finalization, provisional match preview, provisional
 * leaderboard replay — must call the same engine with the same input for the
 * same match. What a player is shown before validation is then, by
 * construction, what they get once the match is finalized.
 *
 * The engine itself is covered by mmr-engine.test.ts; this file only checks that
 * the callers feed it identically.
 */

const SEASON = "season-1";
const MATCH = "match-1";
const CONFIG = { baseMmr: 1000, kFactor: 32, placementMatches: 0 };

const MMR: Record<string, number> = { p1: 1000, p2: 1400, p3: 1100, p4: 900 };
const SIDE_A = ["p1", "p2"];
const SIDE_B = ["p3", "p4"];

const OUTCOME_TYPE_ID = "outcome-type-1";
const DISCIPLINE_ID = "discipline-1";

/**
 * The pricing all three paths must agree on now lives in the season's ruleset
 * snapshot rather than on a join off the match, so it is mocked once here.
 */
const RULESET_PAYLOAD: any = {
  discipline: { id: DISCIPLINE_ID, name: "Pétanque", teamInteractionMode: "INDIVIDUAL" },
  outcomeTypes: [
    {
      id: OUTCOME_TYPE_ID,
      name: "Normal",
      points: 3,
      mmrMultiplier: 1.5,
      scoreCountsForMmr: true,
      isDefault: true,
      archivedAt: null,
      reasons: [],
    },
  ],
};

const MATCH_ROW: any = {
  id: MATCH,
  tournamentId: SEASON,
  status: "reported",
  winnerSide: "A",
  playedAt: new Date("2026-01-01T10:00:00Z"),
  outcomeTypeId: OUTCOME_TYPE_ID,
  sides: [
    { position: 1, score: 10, entry: { id: "e1", players: SIDE_A.map((playerId) => ({ playerId })) } },
    { position: 2, score: 5, entry: { id: "e2", players: SIDE_B.map((playerId) => ({ playerId })) } },
  ],
};

// ─── Engine spy ──────────────────────────────────────────────────────────────

const engineCalls: MatchMmrInput[] = [];
const realEngine = await import("../mmr-engine");
// Captured before mock.module: the namespace object itself gets rebound, so
// reading realEngine.calculateMatchMmr afterwards would call the spy back into
// itself and hang.
const realCalculateMatchMmr = realEngine.calculateMatchMmr;

mock.module("../mmr-engine", () => ({
  ...realEngine,
  calculateMatchMmr: (input: MatchMmrInput) => {
    engineCalls.push(input);
    return realCalculateMatchMmr(input);
  },
}));

// ─── DB / repository mocks, shared by the three paths ────────────────────────

let selectResult: any[] = [];
function makeSelectChain(): any {
  const chain: any = {
    then: (resolve: any, reject: any) => Promise.resolve(selectResult).then(resolve, reject),
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
  };
  return chain;
}

mock.module("../../config/database", () => ({
  db: {
    query: {
      matches: {
        findMany: mock(() => Promise.resolve([MATCH_ROW])),
        findFirst: mock(() => Promise.resolve(MATCH_ROW)),
      },
      matchSides: {
        findMany: mock(() => Promise.resolve(MATCH_ROW.sides.map((s: any) => ({ ...s, matchId: MATCH })))),
      },
    },
    select: mock(() => makeSelectChain()),
    selectDistinct: mock(() => makeSelectChain()),
  },
}));

mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: {
    getConfigByTournamentId: mock(() => Promise.resolve(CONFIG)),
    getRankTiers: mock(() => Promise.resolve([])),
  },
}));

mock.module("../../repository/mmr-seed.repository", () => ({
  mmrSeedRepository: {
    getMapBySeason: mock(() => Promise.resolve(new Map<string, number>())),
    getSeedMmr: mock(() => Promise.resolve(null)),
  },
}));

mock.module("../../repository/player-mmr.repository", () => ({
  playerMmrRepository: {
    getCheckpointState: mock(() => Promise.resolve(null)),
    deleteMmrHistoryForPlayer: mock(() => Promise.resolve()),
    deleteBySeasonAndPlayer: mock(() => Promise.resolve()),
    preloadOpponentHistories: mock(() => Promise.resolve(new Map<string, number>())),
    getPlayerCurrentMmrs: mock(() => Promise.resolve(new Map(Object.entries(MMR)))),
    getBySeasonAndPlayer: mock((_s: string, playerId: string) =>
      Promise.resolve({ currentMmr: MMR[playerId], matchesPlayed: 5 }),
    ),
    getBySeasonOrdered: mock(() =>
      Promise.resolve(
        Object.entries(MMR).map(([playerId, currentMmr]) => ({
          playerId,
          currentMmr,
          matchesPlayed: 5,
          recentResults: [],
        })),
      ),
    ),
    createMmrHistory: mock(() => Promise.resolve()),
    upsert: mock(() => Promise.resolve()),
  },
}));

mock.module("../../repository/tournament-ruleset.repository", () => ({
  tournamentRulesetRepository: {
    getSnapshotContext: mock(() =>
      Promise.resolve({ id: SEASON, status: "ongoing", mode: "ranked", disciplineId: DISCIPLINE_ID }),
    ),
    getByTournamentId: mock(() => Promise.resolve({ payload: RULESET_PAYLOAD })),
    buildPayloadForDiscipline: mock(() => Promise.resolve(RULESET_PAYLOAD)),
    upsert: mock(() => Promise.resolve()),
    setRecalcPending: mock(() => Promise.resolve()),
  },
}));

mock.module("../../repository/ranked-cache.repository", () => ({
  rankedCacheRepository: {
    upsertProvisional: mock(() => Promise.resolve()),
    upsertOfficial: mock(() => Promise.resolve()),
  },
}));

mock.module("../../repository/mmr-animation-event.repository", () => ({
  mmrAnimationEventRepository: {
    upsert: mock((data: any) => Promise.resolve({ id: "evt", createdAt: new Date(), ...data })),
  },
}));

mock.module("../../config/i18n", () => ({ default: { t: (key: string) => key } }));
mock.module("../websocket.service", () => ({ webSocketService: { send: mock(() => undefined) } }));

// Imported AFTER the mocks so the singletons pick them up.
const { mmrCalculationService } = await import("../mmr-calculation.service");
const { mmrAnimationEventService } = await import("../mmr-animation-event.service");
const { rankedSeasonService } = await import("../ranked-season.service");

// ─── Normalisation ───────────────────────────────────────────────────────────

/** Side order and player order are irrelevant: only the pricing must match. */
function normalise(input: MatchMmrInput) {
  const sides = input.sides
    .map((side) => ({
      score: side.score,
      result: side.result,
      players: [...side.players]
        .map((p) => ({ id: p.id, mmr: p.mmr, isPlacement: p.isPlacement }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.players[0].id.localeCompare(b.players[0].id));

  return {
    kFactor: input.kFactor,
    scoreCountsForMmr: input.scoreCountsForMmr,
    mmrMultiplier: input.mmrMultiplier,
    teamInteractionMode: input.teamInteractionMode,
    sides,
  };
}

describe("parity of the three MMR paths", () => {
  it("finalization, preview and replay call the engine with the same match", async () => {
    engineCalls.length = 0;
    selectResult = [{ matchId: MATCH }];
    await mmrCalculationService.recalculatePlayerMmr(SEASON, "p1");
    const official = engineCalls.at(-1)!;

    engineCalls.length = 0;
    await mmrAnimationEventService.createProvisionalEventsForMatch(MATCH, SEASON);
    const preview = engineCalls.at(-1)!;

    engineCalls.length = 0;
    await rankedSeasonService.computeAndCacheProvisional(SEASON);
    const replay = engineCalls.at(-1)!;

    expect(normalise(preview)).toEqual(normalise(official));
    expect(normalise(replay)).toEqual(normalise(official));
  });

  it("the produced deltas are identical across paths", async () => {
    engineCalls.length = 0;
    selectResult = [{ matchId: MATCH }];
    await mmrCalculationService.recalculatePlayerMmr(SEASON, "p1");
    const official = realCalculateMatchMmr(engineCalls.at(-1)!);

    engineCalls.length = 0;
    await mmrAnimationEventService.createProvisionalEventsForMatch(MATCH, SEASON);
    const preview = realCalculateMatchMmr(engineCalls.at(-1)!);

    const byPlayer = (results: typeof official) => Object.fromEntries(results.map((r) => [r.playerId, r.mmrDelta]));

    expect(byPlayer(preview)).toEqual(byPlayer(official));
  });
});
