/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MmrCalculationService } from "../mmr-calculation.service";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// ── DB mock (chainable select + query builders) ────────────────────────────

let _selectResult: any[] = [];

function makeSelectChain() {
  const chain: any = {
    then: (resolve: any, reject: any) => Promise.resolve(_selectResult).then(resolve, reject),
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
  };
  return chain;
}

function setSelectResult(value: any[]) {
  _selectResult = value;
}

const mockDb = {
  query: {
    matches: {
      findFirst: mock(() => Promise.resolve(null as any)),
      findMany: mock(() => Promise.resolve([] as any[])),
    },
    matchSides: {
      findMany: mock(() => Promise.resolve([] as any[])),
    },
  },
  select: mock((_fields: any) => makeSelectChain()),
};

mock.module("../../config/database", () => ({ db: mockDb }));

const mockRankedRepo = {
  getConfigByTournamentId: mock(() => Promise.resolve(null as any)),
  getRankTiers: mock(() => Promise.resolve([] as any[])),
  upsertRankTier: mock((..._args: any[]) => Promise.resolve()),
};

mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: mockRankedRepo,
}));

const mockPlayerMmrRepo = {
  deleteMmrHistoryForPlayer: mock(() => Promise.resolve()),
  getMmrHistoryOrdered: mock(() => Promise.resolve([] as any[])),
  getMmrHistoryForPlayerAndMatch: mock((_seasonId: any, _oppId: any, _matchId: any) => Promise.resolve(null as any)),
  getBySeasonAndPlayer: mock(() => Promise.resolve(null as any)),
  createMmrHistory: mock((_args: any) => Promise.resolve()),
  upsert: mock((_args: any) => Promise.resolve()),
  getAllPlayersBySeasonId: mock(() => Promise.resolve([] as any[])),
  getCheckpointState: mock(() => Promise.resolve(null as any)),
  preloadOpponentHistories: mock(() => Promise.resolve(new Map<string, number>())),
  getPlayerCurrentMmrs: mock(() => Promise.resolve(new Map<string, number>())),
  deleteBySeasonAndPlayer: mock((_seasonId: any, _playerId: any) => Promise.resolve()),
  getFinalizedMatchesPageForSeason: mock((_seasonId: any, _cursor: any, _pageSize: any) => Promise.resolve([] as any[])),
  deleteAllMmrHistoryForSeason: mock(() => Promise.resolve()),
  createMmrHistoryBatch: mock((_rows: any[]) => Promise.resolve()),
};

mock.module("../../repository/player-mmr.repository", () => ({
  playerMmrRepository: mockPlayerMmrRepo,
}));

// Carried-over entry MMR. Empty by default: a season without carry-over.
const mockMmrSeedRepo = {
  getMapBySeason: mock(() => Promise.resolve(new Map<string, number>())),
  getSeedMmr: mock((_seasonId: any, _playerId: any) => Promise.resolve(null as number | null)),
};

mock.module("../../repository/mmr-seed.repository", () => ({
  mmrSeedRepository: mockMmrSeedRepo,
}));

// The season ruleset the replays price against. `discipline: null` keeps the
// interaction mode at the engine default, as an unset discipline would.
mock.module("../../repository/tournament-ruleset.repository", () => ({
  tournamentRulesetRepository: {
    getSnapshotContext: mock(() =>
      Promise.resolve({ id: "season-1", status: "ongoing", mode: "ranked", disciplineId: null }),
    ),
    getByTournamentId: mock(() =>
      Promise.resolve({ payload: { discipline: null, outcomeTypes: rulesetOutcomes } }),
    ),
    buildPayloadForDiscipline: mock(() =>
      Promise.resolve({ discipline: null, outcomeTypes: rulesetOutcomes }),
    ),
    upsert: mock(() => Promise.resolve()),
    setRecalcPending: mock(() => Promise.resolve()),
  },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  id: "config-1",
  tournamentId: "season-1",
  baseMmr: 1000,
  kFactor: 32,
  placementMatches: 3,
  usePreviousMmr: false,
  allowAsymmetricMatches: false,
  sourceTierSeasonId: null,
};

/**
 * What an outcome is worth now comes from the season's ruleset snapshot rather
 * than a join off the match, so the fixtures register the outcome here and the
 * match only carries its id. `registerOutcome` is reset between tests along with
 * the mocks.
 */
let rulesetOutcomes: any[] = [];

function registerOutcome(
  matchId: string,
  outcomeType: { scoreCountsForMmr: boolean; points: number; mmrMultiplier?: number } | null,
): string | null {
  if (!outcomeType) return null;
  const id = `outcome-${matchId}`;
  rulesetOutcomes.push({
    id,
    name: `Outcome ${matchId}`,
    points: outcomeType.points,
    mmrMultiplier: outcomeType.mmrMultiplier ?? 1,
    scoreCountsForMmr: outcomeType.scoreCountsForMmr,
    isDefault: false,
    archivedAt: null,
    reasons: [],
  });
  return id;
}

function makeMatch(
  id: string,
  outcomeType: { scoreCountsForMmr: boolean; points: number } | null = null,
) {
  return { id, outcomeTypeId: registerOutcome(id, outcomeType) };
}

function makeSideResult(opts: {
  opponentPlayerIds?: string[];
  scoreForPlayer?: number;
  scoreForOpponent?: number;
  playerWon?: boolean | null;
}) {
  return {
    opponentPlayerIds: opts.opponentPlayerIds ?? ["opp-1"],
    scoreForPlayer: opts.scoreForPlayer ?? 0,
    scoreForOpponent: opts.scoreForOpponent ?? 0,
    playerWon: opts.playerWon ?? null,
  };
}

function clearMock(m: ReturnType<typeof mock>) {
  m.mock.calls.length = 0;
  m.mock.results.length = 0;
}

function resetMocks() {
  rulesetOutcomes = [];
  for (const m of Object.values(mockRankedRepo) as ReturnType<typeof mock>[]) clearMock(m);
  for (const m of Object.values(mockPlayerMmrRepo) as ReturnType<typeof mock>[]) clearMock(m);
  for (const m of Object.values(mockMmrSeedRepo) as ReturnType<typeof mock>[]) clearMock(m);

  mockMmrSeedRepo.getMapBySeason.mockImplementation(() => Promise.resolve(new Map()));
  mockMmrSeedRepo.getSeedMmr.mockImplementation(() => Promise.resolve(null));
  mockRankedRepo.getConfigByTournamentId.mockImplementation(() => Promise.resolve(DEFAULT_CONFIG));
  mockRankedRepo.getRankTiers.mockImplementation(() => Promise.resolve([]));
  mockRankedRepo.upsertRankTier.mockImplementation(() => Promise.resolve());
  mockPlayerMmrRepo.deleteMmrHistoryForPlayer.mockImplementation(() => Promise.resolve());
  mockPlayerMmrRepo.getMmrHistoryOrdered.mockImplementation(() => Promise.resolve([]));
  mockPlayerMmrRepo.getMmrHistoryForPlayerAndMatch.mockImplementation(() => Promise.resolve(null));
  mockPlayerMmrRepo.getBySeasonAndPlayer.mockImplementation(() => Promise.resolve(null));
  mockPlayerMmrRepo.createMmrHistory.mockImplementation(() => Promise.resolve());
  mockPlayerMmrRepo.upsert.mockImplementation(() => Promise.resolve());
  mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() => Promise.resolve([]));
  mockPlayerMmrRepo.getCheckpointState.mockImplementation(() => Promise.resolve(null));
  mockPlayerMmrRepo.preloadOpponentHistories.mockImplementation(() => Promise.resolve(new Map()));
  mockPlayerMmrRepo.getPlayerCurrentMmrs.mockImplementation(() => Promise.resolve(new Map()));
  mockPlayerMmrRepo.deleteBySeasonAndPlayer.mockImplementation(() => Promise.resolve());
  mockPlayerMmrRepo.getFinalizedMatchesPageForSeason.mockImplementation(() => Promise.resolve([]));
  mockPlayerMmrRepo.deleteAllMmrHistoryForSeason.mockImplementation(() => Promise.resolve());
  mockPlayerMmrRepo.createMmrHistoryBatch.mockImplementation(() => Promise.resolve());

  _selectResult = [];
  mockDb.query.matches.findFirst.mockImplementation(() => Promise.resolve(null));
  mockDb.query.matches.findMany.mockImplementation(() => Promise.resolve([]));
  mockDb.query.matchSides.findMany.mockImplementation(() => Promise.resolve([]));
  mockDb.select.mockImplementation((_fields: any) => makeSelectChain());
  clearMock(mockDb.query.matches.findFirst);
  clearMock(mockDb.query.matches.findMany);
  clearMock(mockDb.query.matchSides.findMany);
  clearMock(mockDb.select);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("MmrCalculationService", () => {
  let service: MmrCalculationService;

  beforeEach(() => {
    service = new MmrCalculationService();
    resetMocks();
  });

  // ── recalculatePlayerMmr ───────────────────────────────────────────────────

  describe("recalculatePlayerMmr", () => {
    const SEASON = "season-1";
    const PLAYER = "player-1";

    function setupMatches(
      matches: Array<{ id: string; outcomeTypeId: string | null }>,
      sideResults: Record<string, ReturnType<typeof makeSideResult>>,
    ) {
      (service as any).getPlayerMatchesForSeason = async () => matches;
      (service as any).preloadMatchSides = async (matchIds: string[]) => {
        const map = new Map();
        for (const id of matchIds) map.set(id, sideResults[id] ?? makeSideResult({ playerWon: null }));
        return map;
      };
    }

    it("no match → deletes the MMR entry, no upsert", async () => {
      setupMatches([], {});
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(mockPlayerMmrRepo.deleteBySeasonAndPlayer.mock.calls).toHaveLength(1);
      expect(mockPlayerMmrRepo.upsert.mock.calls).toHaveLength(0);
    });

    it("1 victoire → wins=1, losses=0, MMR > baseMmr", async () => {
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: true }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].wins).toBe(1);
      expect(call[0].losses).toBe(0);
      expect(call[0].currentMmr).toBeGreaterThan(1000);
    });

    it("1 loss → losses=1, wins=0, MMR < baseMmr", async () => {
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: false }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].losses).toBe(1);
      expect(call[0].wins).toBe(0);
      expect(call[0].currentMmr).toBeLessThan(1000);
    });

    it("3 consecutive wins → winStreak=3, maxWinStreak=3", async () => {
      setupMatches(
        [makeMatch("m1"), makeMatch("m2"), makeMatch("m3")],
        {
          m1: makeSideResult({ playerWon: true }),
          m2: makeSideResult({ playerWon: true }),
          m3: makeSideResult({ playerWon: true }),
        },
      );
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].winStreak).toBe(3);
      expect(call[0].maxWinStreak).toBe(3);
    });

    it("3 wins then 1 loss → winStreak=0, maxWinStreak=3", async () => {
      setupMatches(
        [makeMatch("m1"), makeMatch("m2"), makeMatch("m3"), makeMatch("m4")],
        {
          m1: makeSideResult({ playerWon: true }),
          m2: makeSideResult({ playerWon: true }),
          m3: makeSideResult({ playerWon: true }),
          m4: makeSideResult({ playerWon: false }),
        },
      );
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].winStreak).toBe(0);
      expect(call[0].maxWinStreak).toBe(3);
    });

    it("win, loss, 2 wins → winStreak=2, maxWinStreak=2", async () => {
      setupMatches(
        [makeMatch("m1"), makeMatch("m2"), makeMatch("m3"), makeMatch("m4")],
        {
          m1: makeSideResult({ playerWon: true }),
          m2: makeSideResult({ playerWon: false }),
          m3: makeSideResult({ playerWon: true }),
          m4: makeSideResult({ playerWon: true }),
        },
      );
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].winStreak).toBe(2);
      expect(call[0].maxWinStreak).toBe(2);
    });

    it("draws count as draw and in matchesPlayed, not in wins/losses", async () => {
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: null }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].wins).toBe(0);
      expect(call[0].losses).toBe(0);
      expect(call[0].draws).toBe(1);
      expect(call[0].matchesPlayed).toBe(1);
    });

    it("MMR floor at 1 (no negative MMR)", async () => {
      mockRankedRepo.getConfigByTournamentId.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_CONFIG, baseMmr: 10, kFactor: 200 }),
      );

      setupMatches(
        [makeMatch("m1"), makeMatch("m2"), makeMatch("m3")],
        {
          m1: makeSideResult({ playerWon: false }),
          m2: makeSideResult({ playerWon: false }),
          m3: makeSideResult({ playerWon: false }),
        },
      );

      mockPlayerMmrRepo.getBySeasonAndPlayer.mockImplementation(() =>
        Promise.resolve({ currentMmr: 1200 }),
      );

      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].currentMmr).toBeGreaterThanOrEqual(1);
    });

    it("the first N matches are placement (K doubled)", async () => {
      mockRankedRepo.getConfigByTournamentId.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_CONFIG, placementMatches: 2 }),
      );

      const historyArgs: any[] = [];
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyArgs.push(args);
        return Promise.resolve();
      });

      setupMatches(
        [makeMatch("m1"), makeMatch("m2"), makeMatch("m3")],
        {
          m1: makeSideResult({ playerWon: true }),
          m2: makeSideResult({ playerWon: true }),
          m3: makeSideResult({ playerWon: true }),
        },
      );

      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(historyArgs[0].isPlacement).toBe(true);  // match 1 (0 played before)
      expect(historyArgs[1].isPlacement).toBe(true);  // match 2 (1 played before)
      expect(historyArgs[2].isPlacement).toBe(false); // match 3 (2 played before ≥ placementMatches)
    });

    it("MMR history created for each match", async () => {
      setupMatches(
        [makeMatch("m1"), makeMatch("m2"), makeMatch("m3")],
        {
          m1: makeSideResult({ playerWon: true }),
          m2: makeSideResult({ playerWon: false }),
          m3: makeSideResult({ playerWon: true }),
        },
      );
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(mockPlayerMmrRepo.createMmrHistory.mock.calls).toHaveLength(3); // reset in beforeEach
    });

    it("history contains consistent mmrBefore/mmrAfter/delta", async () => {
      const historyArgs: any[] = [];
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyArgs.push(args);
        return Promise.resolve();
      });

      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: true }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      const entry = historyArgs[0];
      expect(entry.mmrBefore).toBe(1000);
      expect(entry.mmrAfter).toBe(entry.mmrBefore + entry.mmrDelta);
      expect(entry.mmrDelta).toBeGreaterThan(0);
    });

    it("outcomeType forfeit (points=1) → smaller delta than a normal win", async () => {
      const historyFormatNormal: any[] = [];
      const historyFormatForfeit: any[] = [];

      // Normal win (no outcome type → no points multiplier)
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyFormatNormal.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1", null)], {
        m1: makeSideResult({ playerWon: true }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      resetMocks();
      service = new MmrCalculationService();

      // Forfait win (points=1)
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyFormatForfeit.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1", { scoreCountsForMmr: false, points: 1 })], {
        m1: makeSideResult({ playerWon: true }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(historyFormatForfeit[0].mmrDelta).toBeLessThan(historyFormatNormal[0].mmrDelta);
    });

    it("outcomeType points=0 → delta=0 (match ignored for MMR)", async () => {
      const historyArgs: any[] = [];
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyArgs.push(args);
        return Promise.resolve();
      });

      setupMatches([makeMatch("m1", { scoreCountsForMmr: false, points: 0 })], {
        m1: makeSideResult({ playerWon: true }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(historyArgs[0].mmrDelta).toBe(0);
    });

    it("winner/loser symmetry: uses opponent mmrBefore from history when available", async () => {
      const winnerHistory: any[] = [];
      const loserHistory: any[] = [];

      // Process winner: opponent "opp-1" has no history → falls back to currentMmr=1000
      mockPlayerMmrRepo.getPlayerCurrentMmrs.mockImplementation(() =>
        Promise.resolve(new Map([["opp-1", 1000]])),
      );
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        winnerHistory.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1")], { m1: makeSideResult({ playerWon: true, opponentPlayerIds: ["opp-1"] }) });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      resetMocks();
      service = new MmrCalculationService();

      // Process loser: opponent "winner-1" has history entry showing mmrBefore=1000
      mockPlayerMmrRepo.preloadOpponentHistories.mockImplementation(() =>
        Promise.resolve(new Map([["winner-1:m1", 1000]])),
      );
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        loserHistory.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1")], { m1: makeSideResult({ playerWon: false, opponentPlayerIds: ["winner-1"] }) });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      // Both opponents had mmrBefore=1000, so |winDelta| and |lossDelta| should be equal
      expect(Math.abs(winnerHistory[0].mmrDelta)).toBe(Math.abs(loserHistory[0].mmrDelta));
    });

    it("kEffective in history is amplified when the score is lopsided and scoreCountsForMmr=true", async () => {
      const historyNoScore: any[] = [];
      const historyWithScore: any[] = [];

      // Win with no score (0-0, total=0 → no amplification)
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyNoScore.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: true, scoreForPlayer: 0, scoreForOpponent: 0 }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      resetMocks();
      service = new MmrCalculationService();

      // Lopsided win 10-0 → maximum amplification (diff/total = 1)
      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyWithScore.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: true, scoreForPlayer: 10, scoreForOpponent: 0 }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(historyWithScore[0].kEffective).toBeGreaterThan(historyNoScore[0].kEffective);
    });

    it("mmrDelta higher for a 10-0 score than a 5-5 score with scoreCountsForMmr=true", async () => {
      const historyDraw: any[] = [];
      const historyDomination: any[] = [];

      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyDraw.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: true, scoreForPlayer: 5, scoreForOpponent: 5 }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      resetMocks();
      service = new MmrCalculationService();

      mockPlayerMmrRepo.createMmrHistory.mockImplementation((args: any) => {
        historyDomination.push(args);
        return Promise.resolve();
      });
      setupMatches([makeMatch("m1")], {
        m1: makeSideResult({ playerWon: true, scoreForPlayer: 10, scoreForOpponent: 0 }),
      });
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(historyDomination[0].mmrDelta).toBeGreaterThan(historyDraw[0].mmrDelta);
    });

    it("returns immediately when there is no ranked config", async () => {
      mockRankedRepo.getConfigByTournamentId.mockImplementation(() => Promise.resolve(null));
      await service.recalculatePlayerMmr(SEASON, PLAYER);

      expect(mockPlayerMmrRepo.upsert.mock.calls).toHaveLength(0);
    });
  });

  // ── ensurePlayerMmrExists ──────────────────────────────────────────────────

  describe("ensurePlayerMmrExists", () => {
    it("player already exists → no upsert", async () => {
      mockPlayerMmrRepo.getBySeasonAndPlayer.mockImplementation(() =>
        Promise.resolve({ currentMmr: 1000 }),
      );
      await (service as any).ensurePlayerMmrExists("s1", 1000, "p1");
      expect(mockPlayerMmrRepo.upsert.mock.calls).toHaveLength(0);
    });

    it("player missing → upsert with baseMmr and counters at zero", async () => {
      await (service as any).ensurePlayerMmrExists("s1", 800, "p1");
      expect(mockPlayerMmrRepo.upsert.mock.calls).toHaveLength(1);
      expect(mockPlayerMmrRepo.upsert.mock.calls[0][0]).toMatchObject({
        seasonId: "s1",
        playerId: "p1",
        currentMmr: 800,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        winStreak: 0,
        maxWinStreak: 0,
      });
    });

    it("player carried over from the previous season → upsert at the seeded MMR, not baseMmr", async () => {
      mockMmrSeedRepo.getSeedMmr.mockImplementation(() => Promise.resolve(1180));
      await (service as any).ensurePlayerMmrExists("s1", 1000, "p1");
      expect(mockPlayerMmrRepo.upsert.mock.calls[0][0]).toMatchObject({ currentMmr: 1180 });
    });
  });

  // ── Entry MMR carried over from the previous season ───────────────────────

  describe("carried-over entry MMR", () => {
    it("recalculatePlayerMmr → the 1st match starts from the seeded MMR, not baseMmr", async () => {
      mockMmrSeedRepo.getMapBySeason.mockImplementation(() =>
        Promise.resolve(new Map([["p1", 1180]])),
      );
      (service as any).getPlayerMatchesForSeason = async () => [makeMatch("m1")];
      (service as any).preloadMatchSides = async () =>
        new Map([["m1", makeSideResult({ playerWon: false })]]);

      await service.recalculatePlayerMmr("s1", "p1");

      // A loss from 1180 leaves the player above baseMmr: starting at
      // baseMmr would have made them finish below it.
      const call = mockPlayerMmrRepo.upsert.mock.calls.at(-1)!;
      expect(call[0].currentMmr).toBeGreaterThan(1000);
      expect(call[0].currentMmr).toBeLessThan(1180);
      const history = mockPlayerMmrRepo.createMmrHistory.mock.calls.at(-1)!;
      expect(history[0].mmrBefore).toBe(1180);
    });

    it("recalculateSeasonMmrDeterministic → the replay starts at the seeded MMR", async () => {
      mockMmrSeedRepo.getMapBySeason.mockImplementation(() =>
        Promise.resolve(new Map([["p1", 1180], ["p2", 820]])),
      );
      let served = false;
      mockPlayerMmrRepo.getFinalizedMatchesPageForSeason.mockImplementation(() => {
        if (served) return Promise.resolve([]);
        served = true;
        return Promise.resolve([
          {
            id: "m1",
            playedAt: new Date("2026-01-01T10:00:00Z"),
            winnerSide: "A",
            outcomeTypeId: registerOutcome("m1", { scoreCountsForMmr: true, points: 3 }),
            sides: [
              { score: 0, entry: { players: [{ playerId: "p1" }] } },
              { score: 0, entry: { players: [{ playerId: "p2" }] } },
            ],
          },
        ]);
      });

      await service.recalculateSeasonMmrDeterministic("s1");

      const history = mockPlayerMmrRepo.createMmrHistoryBatch.mock.calls[0][0] as any[];
      const p1 = history.find((row) => row.playerId === "p1");
      const p2 = history.find((row) => row.playerId === "p2");
      expect(p1.mmrBefore).toBe(1180);
      expect(p2.mmrBefore).toBe(820);
      // The favorite wins: the gain is smaller than for an even match.
      expect(p1.mmrDelta).toBeGreaterThan(0);
      expect(p2.mmrDelta).toBeLessThan(0);
    });
  });

  // ── getMatchPlayerIds ──────────────────────────────────────────────────────

  describe("getMatchPlayerIds", () => {
    it("no result → empty array", async () => {
      setSelectResult([]);
      const result = await (service as any).getMatchPlayerIds("m1");
      expect(result).toEqual([]);
    });

    it("deduplicates playerIds", async () => {
      setSelectResult([{ playerId: "p1" }, { playerId: "p2" }, { playerId: "p1" }]);
      const result = await (service as any).getMatchPlayerIds("m1");
      expect(result).toEqual(["p1", "p2"]);
    });

    it("calls db.select once", async () => {
      setSelectResult([{ playerId: "p1" }]);
      await (service as any).getMatchPlayerIds("m1");
      expect(mockDb.select.mock.calls).toHaveLength(1);
    });
  });

  // ── getPlayerMatchesForSeason ──────────────────────────────────────────────

  describe("getPlayerMatchesForSeason", () => {
    it("no matchId found → returns [] without calling findMany", async () => {
      setSelectResult([]);
      const result = await (service as any).getPlayerMatchesForSeason("s1", "p1");
      expect(result).toEqual([]);
      expect(mockDb.query.matches.findMany.mock.calls).toHaveLength(0);
    });

    it("matchIds found → calls findMany and returns its results", async () => {
      setSelectResult([{ matchId: "m1" }, { matchId: "m2" }]);
      mockDb.query.matches.findMany.mockImplementation(() =>
        Promise.resolve([{ id: "m1" }, { id: "m2" }]),
      );
      const result = await (service as any).getPlayerMatchesForSeason("s1", "p1");
      expect(result).toHaveLength(2);
      expect(mockDb.query.matches.findMany.mock.calls).toHaveLength(1);
    });
  });

  // ── extractMatchSidesForPlayer ─────────────────────────────────────────────

  describe("extractMatchSidesForPlayer", () => {
    function makeRawSides(
      playerIdsA: string[],
      playerIdsB: string[],
      scoreA: number,
      scoreB: number,
    ) {
      return [
        { position: 1, score: scoreA, entry: { players: playerIdsA.map((id) => ({ playerId: id })) } },
        { position: 2, score: scoreB, entry: { players: playerIdsB.map((id) => ({ playerId: id })) } },
      ];
    }

    const DEFAULTS = { opponentPlayerIds: [], scoreForPlayer: 0, scoreForOpponent: 0, playerWon: null };

    it("match not found → default values", async () => {
      mockDb.query.matchSides.findMany.mockImplementation(() =>
        Promise.resolve(makeRawSides(["p1"], ["p2"], 3, 1)),
      );
      // findFirst already returns null by default
      const result = await (service as any).extractMatchSidesForPlayer("m1", "p1");
      expect(result).toEqual(DEFAULTS);
    });

    it("fewer than 2 sides → default values", async () => {
      mockDb.query.matchSides.findMany.mockImplementation(() => Promise.resolve([]));
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({ id: "m1", winnerSide: "A" }),
      );
      const result = await (service as any).extractMatchSidesForPlayer("m1", "p1");
      expect(result).toEqual(DEFAULTS);
    });

    it("player on side A, winnerSide A → playerWon=true, correct scores", async () => {
      mockDb.query.matchSides.findMany.mockImplementation(() =>
        Promise.resolve(makeRawSides(["p1"], ["p2"], 3, 1)),
      );
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({ id: "m1", winnerSide: "A" }),
      );
      const result = await (service as any).extractMatchSidesForPlayer("m1", "p1");
      expect(result.playerWon).toBe(true);
      expect(result.scoreForPlayer).toBe(3);
      expect(result.scoreForOpponent).toBe(1);
      expect(result.opponentPlayerIds).toEqual(["p2"]);
    });

    it("player on side B, winnerSide A → playerWon=false, scores swapped", async () => {
      mockDb.query.matchSides.findMany.mockImplementation(() =>
        Promise.resolve(makeRawSides(["p1"], ["p2"], 3, 1)),
      );
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({ id: "m1", winnerSide: "A" }),
      );
      const result = await (service as any).extractMatchSidesForPlayer("m1", "p2");
      expect(result.playerWon).toBe(false);
      expect(result.scoreForPlayer).toBe(1);
      expect(result.scoreForOpponent).toBe(3);
      expect(result.opponentPlayerIds).toEqual(["p1"]);
    });

    it("winnerSide null → playerWon=null (draw / no result)", async () => {
      mockDb.query.matchSides.findMany.mockImplementation(() =>
        Promise.resolve(makeRawSides(["p1"], ["p2"], 2, 2)),
      );
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({ id: "m1", winnerSide: null }),
      );
      const result = await (service as any).extractMatchSidesForPlayer("m1", "p1");
      expect(result.playerWon).toBeNull();
    });
  });

  // ── processMatchFinalization ───────────────────────────────────────────────

  describe("processMatchFinalization", () => {
    function stubPrivates(svc: MmrCalculationService, playerIds: string[]) {
      (svc as any).getMatchPlayerIds = mock(async () => playerIds);
      (svc as any).ensurePlayerMmrExists = mock(async () => {});
      (svc as any).recalculatePlayerMmr = mock(async () => {});
    }

    it("match not found → immediate return, no downstream call, empty Map", async () => {
      stubPrivates(service, []);
      const result = await service.processMatchFinalization("m1");
      expect((service as any).getMatchPlayerIds.mock.calls).toHaveLength(0);
      expect(result.size).toBe(0);
    });

    it("non-ranked tournament → immediate return", async () => {
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({
          id: "m1",
          tournamentId: "s1",
          tournament: { mode: "league", rankedConfig: null },
        }),
      );
      stubPrivates(service, []);
      await service.processMatchFinalization("m1");
      expect((service as any).getMatchPlayerIds.mock.calls).toHaveLength(0);
    });

    it("ranked match, 2 players → recalculate called for each via the cascade", async () => {
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({
          id: "m1",
          tournamentId: "s1",
          playedAt: new Date("2024-01-01"),
          tournament: { mode: "ranked", rankedConfig: { baseMmr: 1000 } },
        }),
      );
      stubPrivates(service, ["p1", "p2"]);
      const result = await service.processMatchFinalization("m1");
      expect((service as any).ensurePlayerMmrExists.mock.calls).toHaveLength(2);
      expect((service as any).recalculatePlayerMmr.mock.calls).toHaveLength(2);
      // Direct participants are tagged "match_finalized" (not "match_cancelled")
      // — proves processMatchFinalization now goes through the generic cascade
      // with its own reason, not a copy-pasted cancellation code path.
      expect(result.get("p1")?.reason).toBe("match_finalized");
      expect(result.get("p2")?.reason).toBe("match_finalized");
    });

    it("rankedConfig null → baseMmr falls back to 1000 for ensurePlayerMmrExists", async () => {
      mockDb.query.matches.findFirst.mockImplementation(() =>
        Promise.resolve({
          id: "m1",
          tournamentId: "s1",
          tournament: { mode: "ranked", rankedConfig: null },
        }),
      );
      stubPrivates(service, ["p1"]);
      await service.processMatchFinalization("m1");
      expect((service as any).ensurePlayerMmrExists.mock.calls[0][1]).toBe(1000);
    });

  });

  // ── cascadeRecalculateFromMatch (via cascadeRecalculateAfterCancellation) ──
  // No coverage existed anywhere in the repo for the wave-propagation cascade
  // before this fix (confirmed by search). This exercises the orchestration:
  // direct participants first, then a third party found by findAffectedPlayers,
  // tagged with the right reasons, until the wave loop finds nothing left to change.

  describe("cascadeRecalculateFromMatch", () => {
    it("recalculates a third party returned by findAffectedPlayers and tags it 'cascade'", async () => {
      const playerMmrStore: Record<string, number> = { p1: 1000, p2: 1000, p3: 1000 };

      mockPlayerMmrRepo.getBySeasonAndPlayer.mockImplementation((...args: any[]) =>
        Promise.resolve({ currentMmr: playerMmrStore[args[1] as string] }),
      );
      mockPlayerMmrRepo.upsert.mockImplementation((args: any) => {
        playerMmrStore[args.playerId] = args.currentMmr;
        return Promise.resolve(args);
      });

      (service as any).getMatchPlayerIds = mock(async () => ["p1", "p2"]);

      const matchesByPlayer: Record<string, ReturnType<typeof makeMatch>[]> = {
        p1: [makeMatch("m1")],
        p2: [makeMatch("m1")],
        p3: [makeMatch("m2")],
      };
      const sideByPlayer: Record<string, ReturnType<typeof makeSideResult>> = {
        p1: makeSideResult({ playerWon: true, opponentPlayerIds: ["p2"] }),
        p2: makeSideResult({ playerWon: false, opponentPlayerIds: ["p1"] }),
        p3: makeSideResult({ playerWon: true, opponentPlayerIds: ["p1"] }),
      };
      (service as any).getPlayerMatchesForSeason = async (_seasonId: string, playerId: string) =>
        matchesByPlayer[playerId] ?? [];
      (service as any).preloadMatchSides = async (matchIds: string[], playerId: string) => {
        const map = new Map();
        for (const id of matchIds) map.set(id, sideByPlayer[playerId] ?? makeSideResult({ playerWon: null }));
        return map;
      };

      let findAffectedCalls = 0;
      (service as any).findAffectedPlayers = mock(async () => {
        findAffectedCalls++;
        return findAffectedCalls === 1 ? ["p3"] : [];
      });

      const result = await service.cascadeRecalculateAfterCancellation("m1", "s1", new Date("2024-01-01T00:00:00Z"));

      // 2 calls: 1st finds p3 after the direct wave changes p1/p2, 2nd (after
      // p3's own wave) finds nothing left → loop stops.
      expect((service as any).findAffectedPlayers.mock.calls).toHaveLength(2);
      expect((service as any).findAffectedPlayers.mock.calls[0][1]).toEqual(["p1", "p2"]);
      expect(result.get("p1")?.reason).toBe("match_cancelled");
      expect(result.get("p2")?.reason).toBe("match_cancelled");
      expect(result.get("p3")?.reason).toBe("cascade");
      expect(playerMmrStore.p3).not.toBe(1000); // p3 was actually recalculated, not skipped
    });

    it("no direct change → findAffectedPlayers never called", async () => {
      (service as any).getMatchPlayerIds = mock(async () => ["p1", "p2"]);
      (service as any).recalculatePlayerMmr = mock(async () => {}); // no-op: mmr never actually changes
      (service as any).findAffectedPlayers = mock(async () => ["should-not-be-reached"]);

      await service.cascadeRecalculateAfterCancellation("m1", "s1", new Date("2024-01-01T00:00:00Z"));

      expect((service as any).findAffectedPlayers.mock.calls).toHaveLength(0);
    });
  });

  // ── recalculateSeasonMmrDeterministic ─────────────────────────────────────

  describe("recalculateSeasonMmrDeterministic", () => {
    function makeGlobalMatch(opts: {
      id: string;
      playedAt: string;
      sideAIds: string[];
      sideBIds: string[];
      winnerSide: string | null;
      scoreA?: number | null;
      scoreB?: number | null;
      outcomeType?: { scoreCountsForMmr: boolean; points: number; mmrMultiplier?: number } | null;
    }) {
      return {
        id: opts.id,
        playedAt: new Date(opts.playedAt),
        winnerSide: opts.winnerSide,
        outcomeTypeId: registerOutcome(opts.id, opts.outcomeType ?? null),
        sides: [
          { position: 1, score: opts.scoreA ?? null, entry: { players: opts.sideAIds.map((id) => ({ playerId: id })) } },
          { position: 2, score: opts.scoreB ?? null, entry: { players: opts.sideBIds.map((id) => ({ playerId: id })) } },
        ],
      };
    }

    // Simulates the real keyset-paginated repository method against an
    // in-memory, already playedAt/id-sorted fixture list.
    function makePaginator(sortedMatches: ReturnType<typeof makeGlobalMatch>[]) {
      return (_seasonId: string, cursor: { playedAt: Date; id: string } | undefined, pageSize: number) => {
        let startIdx = 0;
        if (cursor) {
          const idx = sortedMatches.findIndex((m) => m.id === cursor.id);
          startIdx = idx + 1;
        }
        return Promise.resolve(sortedMatches.slice(startIdx, startIdx + pageSize));
      };
    }

    it("1 match 1v1, p1 win → history + upsert for both players, opposite deltas", async () => {
      const matches = [
        makeGlobalMatch({ id: "m1", playedAt: "2024-01-01T00:00:00Z", sideAIds: ["p1"], sideBIds: ["p2"], winnerSide: "A" }),
      ];
      mockPlayerMmrRepo.getFinalizedMatchesPageForSeason.mockImplementation(makePaginator(matches));

      const historyBatches: any[][] = [];
      mockPlayerMmrRepo.createMmrHistoryBatch.mockImplementation((rows: any[]) => {
        historyBatches.push(rows);
        return Promise.resolve();
      });
      const upserts: any[] = [];
      mockPlayerMmrRepo.upsert.mockImplementation((args: any) => {
        upserts.push(args);
        return Promise.resolve();
      });

      await service.recalculateSeasonMmrDeterministic("s1");

      expect(mockPlayerMmrRepo.deleteAllMmrHistoryForSeason.mock.calls).toHaveLength(1);
      expect(historyBatches[0]).toHaveLength(2);
      const p1History = historyBatches[0].find((r) => r.playerId === "p1")!;
      const p2History = historyBatches[0].find((r) => r.playerId === "p2")!;
      expect(p1History.mmrDelta).toBeGreaterThan(0);
      expect(p2History.mmrDelta).toBeLessThan(0);
      expect(upserts.find((u) => u.playerId === "p1")!.currentMmr).toBe(p1History.mmrAfter);
      expect(upserts.find((u) => u.playerId === "p2")!.currentMmr).toBe(p2History.mmrAfter);
    });

    it("player with 0 matches remaining after recalculation → player_mmr entry deleted", async () => {
      mockPlayerMmrRepo.getFinalizedMatchesPageForSeason.mockImplementation(makePaginator([]));
      mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
        Promise.resolve([{ playerId: "ghost-player" }]),
      );

      await service.recalculateSeasonMmrDeterministic("s1");

      expect(mockPlayerMmrRepo.deleteBySeasonAndPlayer.mock.calls).toHaveLength(1);
      expect(mockPlayerMmrRepo.deleteBySeasonAndPlayer.mock.calls[0]).toEqual(["s1", "ghost-player"]);
      expect(mockPlayerMmrRepo.upsert.mock.calls).toHaveLength(0);
    });

    it("tangled match graph: identical result regardless of page size (1 vs everything in one page)", async () => {
      // p1 beats p2, p2 beats p3, p3 beats p1 — cyclic dependency between players,
      // exactly the shape that made the old per-player unordered loop diverge.
      const matches = [
        makeGlobalMatch({ id: "m1", playedAt: "2024-01-01T00:00:00Z", sideAIds: ["p1"], sideBIds: ["p2"], winnerSide: "A" }),
        makeGlobalMatch({ id: "m2", playedAt: "2024-01-02T00:00:00Z", sideAIds: ["p2"], sideBIds: ["p3"], winnerSide: "A" }),
        makeGlobalMatch({ id: "m3", playedAt: "2024-01-03T00:00:00Z", sideAIds: ["p3"], sideBIds: ["p1"], winnerSide: "A" }),
        makeGlobalMatch({ id: "m4", playedAt: "2024-01-04T00:00:00Z", sideAIds: ["p1"], sideBIds: ["p3"], winnerSide: "B" }),
      ];

      async function runWithPageSize(pageSize: number) {
        const svc = new MmrCalculationService();
        mockPlayerMmrRepo.getFinalizedMatchesPageForSeason.mockImplementation(makePaginator(matches));
        const upserts: any[] = [];
        mockPlayerMmrRepo.upsert.mockImplementation((args: any) => {
          upserts.push(args);
          return Promise.resolve();
        });
        await svc.recalculateSeasonMmrDeterministic("s1", pageSize);
        return upserts.sort((a, b) => a.playerId.localeCompare(b.playerId));
      }

      const resultSinglePage = await runWithPageSize(500);
      resetMocks();
      const resultOneMatchPerPage = await runWithPageSize(1);

      expect(resultOneMatchPerPage).toEqual(resultSinglePage);
    });

    it("no ranked config → returns immediately, no downstream call", async () => {
      mockRankedRepo.getConfigByTournamentId.mockImplementation(() => Promise.resolve(null));
      await service.recalculateSeasonMmrDeterministic("s1");
      expect(mockPlayerMmrRepo.deleteAllMmrHistoryForSeason.mock.calls).toHaveLength(0);
      expect(mockPlayerMmrRepo.getFinalizedMatchesPageForSeason.mock.calls).toHaveLength(0);
    });
  });
});
