/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { NotFoundError } from "../../types/errors";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_TOURNAMENT = {
  id: "tournament-1",
  mode: "league",
  teamMode: "static" as const,
  scoringConfig: { pointPerVictory: 3, pointPerDraw: 1, pointPerLoss: 0 },
  championshipConfig: null,
  allowDraw: true,
  scoreEnabled: true,
};

const TEAM_A = { id: "team-a", name: "Alpha", tournamentId: "tournament-1" };
const TEAM_B = { id: "team-b", name: "Beta", tournamentId: "tournament-1" };
const TEAM_C = { id: "team-c", name: "Gamma", tournamentId: "tournament-1" };

function makeMatchWithSides(
  id: string,
  winnerSide: "A" | "B" | null,
  sideA: { teamId: string; score: number; pointsAwarded?: number | null },
  sideB: { teamId: string; score: number; pointsAwarded?: number | null },
) {
  return {
    id,
    winnerSide,
    outcomeTypeId: null,
    outcomeType: null,
    sides: [
      {
        position: 1,
        score: sideA.score,
        pointsAwarded: sideA.pointsAwarded ?? null,
        entry: {
          teamId: sideA.teamId,
          players: [],
        },
      },
      {
        position: 2,
        score: sideB.score,
        pointsAwarded: sideB.pointsAwarded ?? null,
        entry: {
          teamId: sideB.teamId,
          players: [],
        },
      },
    ],
  };
}

function makeFlexMatchWithPoints(
  id: string,
  winnerSide: "A" | "B" | null,
  playersA: string[],
  playersB: string[],
  scoreA: number,
  scoreB: number,
  pointsA: number,
  pointsB: number,
  countsForRanking = true,
) {
  return {
    id,
    winnerSide,
    outcomeTypeId: null,
    outcomeType: null,
    playerPoints: [
      ...playersA.map((pid) => ({ playerId: pid, pointsAwarded: countsForRanking ? pointsA : 0, countsForRanking })),
      ...playersB.map((pid) => ({ playerId: pid, pointsAwarded: countsForRanking ? pointsB : 0, countsForRanking })),
    ],
    sides: [
      {
        position: 1,
        score: scoreA,
        entryId: "entry-a",
        entry: { id: "entry-a", players: playersA.map((pid) => ({ playerId: pid })) },
      },
      {
        position: 2,
        score: scoreB,
        entryId: "entry-b",
        entry: { id: "entry-b", players: playersB.map((pid) => ({ playerId: pid })) },
      },
    ],
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRepo = {
  getTournamentWithScoring: mock(() => Promise.resolve(DEFAULT_TOURNAMENT as any)),
  getMatchesWithSides: mock((_id: string, _statuses: string[]) => Promise.resolve([] as any[])),
  getPlayerPointsForStandings: mock((_id: string, _statuses: string[]) => Promise.resolve([] as any[])),
  getTournamentTeams: mock(() => Promise.resolve([TEAM_A, TEAM_B] as any[])),
  getTournamentEntries: mock(() => Promise.resolve([] as any[])),
  // Legacy — still used by recalculatePoints
  getMatchesForStandings: mock(() => Promise.resolve([] as any[])),
  getMatchSides: mock(() => Promise.resolve([] as any[])),
  deletePlayerPointsForTournament: mock(() => Promise.resolve()),
  insertPlayerPoints: mock(() => Promise.resolve()),
  // Computed data cache
  getComputedData: mock(() => Promise.resolve(null)),
  setComputedData: mock(() => Promise.resolve()),
  deleteComputedData: mock(() => Promise.resolve()),
};

mock.module("../../repository/standings.repository", () => ({
  standingsRepository: mockRepo,
}));

const mockMatchSidesRepo = {
  updatePointsAwarded: mock(() => Promise.resolve()),
};

mock.module("../../repository/match-sides.repository", () => ({
  matchSidesRepository: mockMatchSidesRepo,
}));

/**
 * What an outcome is called and worth now comes from the competition's ruleset
 * snapshot rather than a join off the match, so the fixtures register outcomes
 * here and the match carries only the id. Reset between tests.
 */
let rulesetOutcomes: any[] = [];

function registerOutcome(id: string, opts: { isDefault: boolean; points: number }) {
  rulesetOutcomes.push({
    id,
    name: `Outcome ${id}`,
    points: opts.points,
    mmrMultiplier: 1,
    scoreCountsForMmr: true,
    isDefault: opts.isDefault,
    archivedAt: null,
    reasons: [],
  });
  return id;
}

mock.module("../../repository/tournament-ruleset.repository", () => ({
  tournamentRulesetRepository: {
    getSnapshotContext: mock(() =>
      Promise.resolve({ id: "tournament-1", status: "ongoing", mode: "championship", disciplineId: null }),
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

let inactivePlayerIds = new Set<string>();

mock.module("../../repository/participant.repository", () => ({
  participantRepository: {
    findInactivePlayerIds: mock(() => Promise.resolve(inactivePlayerIds)),
  },
}));

import { standingsService } from "../standings.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetMocks() {
  rulesetOutcomes = [];
  inactivePlayerIds = new Set();
  mockRepo.getTournamentWithScoring.mockImplementation(() => Promise.resolve(DEFAULT_TOURNAMENT));
  mockRepo.getMatchesWithSides.mockImplementation((_id: string, _statuses: string[]) => Promise.resolve([]));
  mockRepo.getPlayerPointsForStandings.mockImplementation((_id: string, _statuses: string[]) => Promise.resolve([]));
  mockRepo.getTournamentTeams.mockImplementation(() => Promise.resolve([TEAM_A, TEAM_B]));
  mockRepo.getTournamentEntries.mockImplementation(() => Promise.resolve([]));
  mockRepo.getMatchesForStandings.mockImplementation(() => Promise.resolve([]));
  mockRepo.getMatchSides.mockImplementation(() => Promise.resolve([]));
  mockRepo.deletePlayerPointsForTournament.mockImplementation(() => Promise.resolve());
  mockRepo.insertPlayerPoints.mockImplementation(() => Promise.resolve());
  mockRepo.getComputedData.mockImplementation(() => Promise.resolve(null));
  mockRepo.setComputedData.mockImplementation(() => Promise.resolve());
  mockRepo.deleteComputedData.mockImplementation(() => Promise.resolve());
  mockRepo.insertPlayerPoints.mockClear();
  mockRepo.getMatchesWithSides.mockClear();
  mockRepo.getTournamentWithScoring.mockClear();
  mockRepo.deleteComputedData.mockClear();
  mockMatchSidesRepo.updatePointsAwarded.mockImplementation(() => Promise.resolve());
  mockMatchSidesRepo.updatePointsAwarded.mockClear();
}

function makeMatchWithOutcomeType(
  id: string,
  winnerSide: "A" | "B" | null,
  sideA: { teamId: string; score: number; pointsAwarded?: number | null },
  sideB: { teamId: string; score: number; pointsAwarded?: number | null },
  isDefault: boolean,
  points = 3,
) {
  return {
    ...makeMatchWithSides(id, winnerSide, sideA, sideB),
    outcomeTypeId: registerOutcome(`ot-${id}`, { isDefault, points }),
  };
}

function findEntry(standings: any[], id: string) {
  return standings.find((e) => e.id === id);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("StandingsService", () => {
  beforeEach(resetMocks);

  // ── Errors ─────────────────────────────────────────────────────────────────

  describe("errors", () => {
    it("throws NotFoundError when the tournament doesn't exist", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() => Promise.resolve(null));
      await expect(standingsService.getOfficialStandings("unknown")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns an empty standings list when there is no match", async () => {
      const result = await standingsService.getOfficialStandings("tournament-1");
      expect(result.standings).toHaveLength(2); // teams are always initialized
      expect(findEntry(result.standings, "team-a")?.points).toBe(0);
    });
  });

  // ── Mode static ───────────────────────────────────────────────────────────

  describe("mode static", () => {
    it("side A win: A earns 3 pts, B earns 0 pt", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", "A", { teamId: "team-a", score: 3 }, { teamId: "team-b", score: 1 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      expect(a.points).toBe(3);
      expect(a.wins).toBe(1);
      expect(a.draws).toBe(0);
      expect(a.losses).toBe(0);
      expect(a.scored).toBe(3);
      expect(a.conceded).toBe(1);
      expect(a.scoreDiff).toBe(2);
      expect(a.matchesPlayed).toBe(1);

      expect(b.points).toBe(0);
      expect(b.wins).toBe(0);
      expect(b.losses).toBe(1);
      expect(b.scored).toBe(1);
      expect(b.conceded).toBe(3);
      expect(b.scoreDiff).toBe(-2);
    });

    it("side B win: B earns 3 pts, A earns 0 pt", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", "B", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 3 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(findEntry(standings, "team-b")?.points).toBe(3);
      expect(findEntry(standings, "team-b")?.wins).toBe(1);
      expect(findEntry(standings, "team-a")?.points).toBe(0);
      expect(findEntry(standings, "team-a")?.losses).toBe(1);
    });

    it("draw match: each team earns 1 pt", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", null, { teamId: "team-a", score: 2 }, { teamId: "team-b", score: 2 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(findEntry(standings, "team-a")?.points).toBe(1);
      expect(findEntry(standings, "team-a")?.draws).toBe(1);
      expect(findEntry(standings, "team-b")?.points).toBe(1);
      expect(findEntry(standings, "team-b")?.draws).toBe(1);
    });

    it("pointsAwarded overrides the tournament's points", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A",
            { teamId: "team-a", score: 3, pointsAwarded: 5 },
            { teamId: "team-b", score: 1, pointsAwarded: 2 },
          ),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(findEntry(standings, "team-a")?.points).toBe(5);
      expect(findEntry(standings, "team-b")?.points).toBe(2);
    });

    it("custom tournament points (2/0/1)", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({
          ...DEFAULT_TOURNAMENT,
          scoringConfig: { pointPerVictory: 2, pointPerDraw: 0, pointPerLoss: 1 },
        }),
      );
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", "A", { teamId: "team-a", score: 2 }, { teamId: "team-b", score: 0 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(findEntry(standings, "team-a")?.points).toBe(2);
      expect(findEntry(standings, "team-b")?.points).toBe(1);
    });

    it("accumulation across several matches", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 3 }, { teamId: "team-b", score: 1 }),
          makeMatchWithSides("m2", "B", { teamId: "team-a", score: 0 }, { teamId: "team-b", score: 2 }),
          makeMatchWithSides("m3", null, { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 1 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      expect(a.wins).toBe(1);
      expect(a.draws).toBe(1);
      expect(a.losses).toBe(1);
      expect(a.points).toBe(4); // 3 + 0 + 1
      expect(a.matchesPlayed).toBe(3);

      expect(b.wins).toBe(1);
      expect(b.draws).toBe(1);
      expect(b.losses).toBe(1);
      expect(b.points).toBe(4); // 0 + 3 + 1
    });

    it("ignores matches with fewer than 2 sides", async () => {
      // Simulate a match with only 1 side
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([{ id: "m1", winnerSide: "A", sides: [{ position: 1, score: 3, pointsAwarded: null, entry: { teamId: "team-a", players: [] } }] }]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(findEntry(standings, "team-a")?.points).toBe(0);
    });
  });

  // ── Sorting / tiebreaking ────────────────────────────────────────────────────────

  describe("sorting and tiebreaking", () => {
    it("sorts by points descending", async () => {
      mockRepo.getTournamentTeams.mockImplementation(() => Promise.resolve([TEAM_A, TEAM_B, TEAM_C]));

      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 3 }, { teamId: "team-b", score: 0 }),
          makeMatchWithSides("m2", "A", { teamId: "team-a", score: 3 }, { teamId: "team-c", score: 0 }),
          makeMatchWithSides("m3", "A", { teamId: "team-b", score: 2 }, { teamId: "team-c", score: 1 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(standings[0].id).toBe("team-a"); // 6 pts
      expect(standings[1].id).toBe("team-b"); // 3 pts
      expect(standings[2].id).toBe("team-c"); // 0 pts
    });

    it("ties broken by id when all criteria are equal", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 5 }, { teamId: "team-b", score: 2 }),
          makeMatchWithSides("m2", "B", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 3 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      // A and B: same pts, wins, ratio, buchholz, h2h (1-1), quality, winRate → sort by id
      expect(standings[0].id).toBe("team-a");
    });

    it("ties broken by id on a draw with all criteria equal", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", null, { teamId: "team-a", score: 5 }, { teamId: "team-b", score: 3 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(standings[0].id).toBe("team-a"); // same stats after draw → sort by id
    });
  });

  // ── Mode flex ─────────────────────────────────────────────────────────────

  describe("mode flex", () => {
    const flexTournament = { ...DEFAULT_TOURNAMENT, teamMode: "flex" as const };

    const flexEntries = [
      {
        id: "entry-a",
        tournamentId: "tournament-1",
        players: [
          { playerId: "p-a1", player: { id: "p-a1", displayName: "Player A1", shortName: "PA1" } },
          { playerId: "p-a2", player: { id: "p-a2", displayName: "Player A2", shortName: "PA2" } },
        ],
      },
      {
        id: "entry-b",
        tournamentId: "tournament-1",
        players: [
          { playerId: "p-b1", player: { id: "p-b1", displayName: "Player B1", shortName: "PB1" } },
          { playerId: "p-b2", player: { id: "p-b2", displayName: "Player B2", shortName: "PB2" } },
        ],
      },
    ];

    beforeEach(() => {
      mockRepo.getTournamentWithScoring.mockImplementation(() => Promise.resolve(flexTournament));
      mockRepo.getTournamentEntries.mockImplementation(() => Promise.resolve(flexEntries));
    });

    it("a player who left is listed last, flagged inactive, with the points they earned", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", "A", ["p-a1", "p-a2"], ["p-b1", "p-b2"], 3, 1, 3, 0)]),
      );
      inactivePlayerIds = new Set(["p-a1"]);

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      const last = standings[standings.length - 1];
      expect(last.id).toBe("p-a1");
      expect(last.inactive).toBe(true);
      expect(last.points).toBe(3);
      expect(standings[0].id).toBe("p-a2");
      expect(standings.filter((row) => row.inactive)).toHaveLength(1);
    });

    it("the inactive flag is applied on a cache hit and never written to the cache", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", "A", ["p-a1", "p-a2"], ["p-b1", "p-b2"], 3, 1, 3, 0)]),
      );
      inactivePlayerIds = new Set(["p-a1"]);
      await standingsService.getOfficialStandings("tournament-1");

      const written = (mockRepo.setComputedData.mock.calls.at(-1) as any[])[2];
      expect(written.standings.some((row: any) => row.inactive)).toBe(false);

      mockRepo.getComputedData.mockImplementation(() => Promise.resolve(written));
      inactivePlayerIds = new Set(["p-b1"]);
      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(standings[standings.length - 1].id).toBe("p-b1");
      expect(standings.find((row) => row.id === "p-a1")?.inactive).toBeUndefined();
    });

    it("side A win: all A players earn 3 pts", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", "A", ["p-a1", "p-a2"], ["p-b1", "p-b2"], 3, 1, 3, 0)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      for (const pid of ["p-a1", "p-a2"]) {
        const p = findEntry(standings, pid)!;
        expect(p.points).toBe(3);
        expect(p.wins).toBe(1);
        expect(p.scored).toBe(3);
        expect(p.conceded).toBe(1);
      }
      for (const pid of ["p-b1", "p-b2"]) {
        const p = findEntry(standings, pid)!;
        expect(p.points).toBe(0);
        expect(p.losses).toBe(1);
      }
    });

    it("side B win: all B players earn 3 pts", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", "B", ["p-a1", "p-a2"], ["p-b1", "p-b2"], 1, 3, 0, 3)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      for (const pid of ["p-b1", "p-b2"]) {
        expect(findEntry(standings, pid)?.wins).toBe(1);
        expect(findEntry(standings, pid)?.points).toBe(3);
      }
      for (const pid of ["p-a1", "p-a2"]) {
        expect(findEntry(standings, pid)?.losses).toBe(1);
        expect(findEntry(standings, pid)?.points).toBe(0);
      }
    });

    it("draw match: all players have 1 pt and 1 draw", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", null, ["p-a1", "p-a2"], ["p-b1", "p-b2"], 2, 2, 1, 1)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      for (const pid of ["p-a1", "p-a2", "p-b1", "p-b2"]) {
        expect(findEntry(standings, pid)?.draws).toBe(1);
        expect(findEntry(standings, pid)?.points).toBe(1);
      }
    });

    it("regression: side A players are updated even when entry B has no players", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([
          {
            id: "m1",
            winnerSide: "A",
            playerPoints: [
              { playerId: "p-a1", pointsAwarded: 3, countsForRanking: true },
              { playerId: "p-a2", pointsAwarded: 3, countsForRanking: true },
            ],
            sides: [
              { position: 1, score: 3, entryId: "entry-a", entry: { id: "entry-a", players: [{ playerId: "p-a1" }, { playerId: "p-a2" }] } },
              { position: 2, score: 0, entryId: "entry-b", entry: { id: "entry-b", players: [] } },
            ],
          },
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      expect(findEntry(standings, "p-a1")?.points).toBe(3);
      expect(findEntry(standings, "p-a2")?.points).toBe(3);
    });

    it("player over the limit: countsForRanking=false → 0 pts, matchesPlayed not incremented", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([
          makeFlexMatchWithPoints("m1", "A", ["p-a1"], ["p-b1"], 3, 0, 3, 0, false /* countsForRanking = false */),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "p-a1")!;
      expect(a.points).toBe(0);
      expect(a.matchesPlayed).toBe(0); // not counted since !countsForRanking
      expect(a.wins).toBe(0);
    });
  });

  // ── Classement provisoire vs officiel ─────────────────────────────────────

  describe("provisional vs official", () => {
    const finalizedMatch = makeMatchWithSides("m-final", "A", { teamId: "team-a", score: 3 }, { teamId: "team-b", score: 1 });
    const reportedMatch = makeMatchWithSides("m-reported", "B", { teamId: "team-a", score: 0 }, { teamId: "team-b", score: 2 });

    beforeEach(() => {
      mockRepo.getMatchesWithSides.mockImplementation(
        (_id: any, statuses: any) =>
          Promise.resolve(
            [
              { ...finalizedMatch, status: "finalized" },
              { ...reportedMatch, status: "reported" },
            ].filter((m: any) => statuses.includes(m.status)),
          ),
      );
    });

    it("official: only counts finalized matches", async () => {
      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      expect(a.points).toBe(3);
      expect(a.wins).toBe(1);
      expect(b.points).toBe(0);
      expect(b.matchesPlayed).toBe(1);
    });

    it("provisional: counts reported + finalized", async () => {
      const { standings } = await standingsService.getProvisionalStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      expect(a.points).toBe(3);
      expect(a.wins).toBe(1);
      expect(a.losses).toBe(1);
      expect(a.matchesPlayed).toBe(2);

      expect(b.points).toBe(3);
      expect(b.wins).toBe(1);
      expect(b.losses).toBe(1);
      expect(b.matchesPlayed).toBe(2);
    });

    it("provisional has more matches than official", async () => {
      const official = await standingsService.getOfficialStandings("tournament-1");
      const provisional = await standingsService.getProvisionalStandings("tournament-1");

      const officialTotal = official.standings.reduce((s, e) => s + e.matchesPlayed, 0);
      const provisionalTotal = provisional.standings.reduce((s, e) => s + e.matchesPlayed, 0);

      expect(provisionalTotal).toBeGreaterThan(officialTotal);
    });
  });

  // ── Tournament configuration ──────────────────────────────────────────────

  describe("tournament configuration", () => {
    it("scoreEnabled=false (static): scored/conceded/scoreDiff stay at 0", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, scoreEnabled: false }),
      );
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", "A", { teamId: "team-a", score: 3 }, { teamId: "team-b", score: 1 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      expect(a.scored).toBe(0);
      expect(a.conceded).toBe(0);
      expect(a.scoreDiff).toBe(0);
      expect(b.scored).toBe(0);
      expect(b.conceded).toBe(0);
      expect(b.scoreDiff).toBe(0);
      expect(a.points).toBe(3);
      expect(a.wins).toBe(1);
    });

    it("scoreEnabled=false (flex): scored/conceded/scoreDiff stay at 0", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, teamMode: "flex" as const, scoreEnabled: false }),
      );
      mockRepo.getTournamentEntries.mockImplementation(() =>
        Promise.resolve([
          {
            id: "entry-a", tournamentId: "tournament-1",
            players: [{ playerId: "p-a", player: { id: "p-a", displayName: "A", shortName: "PA" } }],
          },
          {
            id: "entry-b", tournamentId: "tournament-1",
            players: [{ playerId: "p-b", player: { id: "p-b", displayName: "B", shortName: "PB" } }],
          },
        ]),
      );
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", "A", ["p-a"], ["p-b"], 5, 1, 3, 0)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "p-a")!;

      expect(a.scored).toBe(0);
      expect(a.conceded).toBe(0);
      expect(a.scoreDiff).toBe(0);
      expect(a.wins).toBe(1);
      expect(a.points).toBe(3);
    });

    it("allowDraw=false: draws are still counted as draws", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, allowDraw: false }),
      );
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", null, { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 1 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "team-a")?.draws).toBe(1);
      expect(findEntry(standings, "team-b")?.draws).toBe(1);
    });
  });

  // ── Computed tiebreakers ──────────────────────────────────────────────────

  describe("computed tiebreakers", () => {
    it("winLossRatio = wins / max(1, losses) — avoids division by zero", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }),
          makeMatchWithSides("m2", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;

      expect(a.wins).toBe(2);
      expect(a.losses).toBe(0);
      expect(a.winLossRatio).toBe(2); // 2 / max(1, 0) = 2
    });

    it("victoryQuality: win → +points, loss → −points", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithOutcomeType("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }, true, 2)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "team-a")?.victoryQuality).toBe(2);
      expect(findEntry(standings, "team-b")?.victoryQuality).toBe(-2);
    });

    it("victoryQuality: non-default type with points=1 → +1 win, −1 loss", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithOutcomeType("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }, false, 1)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "team-a")?.victoryQuality).toBe(1);
      expect(findEntry(standings, "team-b")?.victoryQuality).toBe(-1);
    });

    it("victoryQuality: accumulation of several results", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithOutcomeType("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }, true, 3),
          makeMatchWithOutcomeType("m2", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }, false, 1),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "team-a")?.victoryQuality).toBe(4); // 3 + 1
    });

    it("buchholzScore: a team that beat a strong opponent ranks first on a tie", async () => {
      // A and B both have 3 pts / 1W, but A's beaten opponent X (0 pts) while B's beaten Y (3 pts)
      const TEAM_X = { id: "team-x", name: "X", tournamentId: "tournament-1" };
      const TEAM_Y = { id: "team-y", name: "Y", tournamentId: "tournament-1" };

      mockRepo.getTournamentTeams.mockImplementation(() => Promise.resolve([TEAM_A, TEAM_B, TEAM_X, TEAM_Y]));
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-x", score: 0 }),
          makeMatchWithSides("m2", "A", { teamId: "team-b", score: 1 }, { teamId: "team-y", score: 0 }),
          // Y wins one match → Y gets 3 pts; X never wins → X stays at 0
          makeMatchWithSides("m3", "A", { teamId: "team-y", score: 1 }, { teamId: "team-x", score: 0 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      // A's only opponent X has 0 pts; B's only opponent Y has 3 pts
      expect(a.buchholzScore).toBe(0);
      expect(b.buchholzScore).toBe(3);

      // B ranks higher due to buchholz
      expect(standings.indexOf(b)).toBeLessThan(standings.indexOf(a));
    });
  });

  // ── Tiebreak head-to-head ─────────────────────────────────────────────────

  describe("head-to-head tiebreak", () => {
    it("H2H: cumulative records across multiple matches between the same pair", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }),
          makeMatchWithSides("m2", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      expect(a.headToHead["team-b"]?.wins).toBe(2);
      expect(a.headToHead["team-b"]?.losses).toBe(0);
      expect(b.headToHead["team-a"]?.wins).toBe(0);
      expect(b.headToHead["team-a"]?.losses).toBe(2);
    });

    it("H2H draw: counted both ways", async () => {
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([makeMatchWithSides("m1", null, { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 1 })]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "team-a")?.headToHead["team-b"]?.draws).toBe(1);
      expect(findEntry(standings, "team-b")?.headToHead["team-a"]?.draws).toBe(1);
    });

    it("circular H2H subgroup (3 teams): falls back to ID when everything is tied", async () => {
      mockRepo.getTournamentTeams.mockImplementation(() => Promise.resolve([TEAM_A, TEAM_B, TEAM_C]));
      // Circular: A beats B, B beats C, C beats A → all tied 3pts/1W/1L/buchholz=6
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-b", score: 0 }),
          makeMatchWithSides("m2", "A", { teamId: "team-b", score: 1 }, { teamId: "team-c", score: 0 }),
          makeMatchWithSides("m3", "A", { teamId: "team-c", score: 1 }, { teamId: "team-a", score: 0 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      // All must have same base stats
      for (const e of standings) {
        expect(e.points).toBe(3);
        expect(e.wins).toBe(1);
        expect(e.losses).toBe(1);
        expect(e.buchholzScore).toBe(6); // each opponent has 3 pts
      }

      // H2H is circular (1W each within subgroup) → victoryQuality/winRate equal → sort by ID
      expect(standings[0].id).toBe("team-a");
      expect(standings[1].id).toBe("team-b");
      expect(standings[2].id).toBe("team-c");
    });

    it("H2H isolation: only opponents within the subgroup are counted", async () => {
      // A and B are tied; each beat an external opponent (C); H2H subgroup should only count A vs B
      mockRepo.getTournamentTeams.mockImplementation(() => Promise.resolve([TEAM_A, TEAM_B, TEAM_C]));
      mockRepo.getMatchesWithSides.mockImplementation(() =>
        Promise.resolve([
          makeMatchWithSides("m1", "A", { teamId: "team-a", score: 1 }, { teamId: "team-c", score: 0 }),
          makeMatchWithSides("m2", "A", { teamId: "team-b", score: 1 }, { teamId: "team-c", score: 0 }),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "team-a")!;
      const b = findEntry(standings, "team-b")!;

      // A has headToHead vs C (external), but no H2H vs B within subgroup
      expect(a.headToHead["team-c"]?.wins).toBe(1);
      expect(a.headToHead["team-b"]).toBeUndefined();

      // A and B tied on everything → ID sort
      expect(standings.indexOf(a)).toBeLessThan(standings.indexOf(b));
    });
  });

  // ── Mode flex — tiebreakers ───────────────────────────────────────────────

  describe("flex mode — tiebreakers", () => {
    const flexEntries1v1 = [
      {
        id: "entry-a", tournamentId: "tournament-1",
        players: [{ playerId: "p-a", player: { id: "p-a", displayName: "A", shortName: "PA" } }],
      },
      {
        id: "entry-b", tournamentId: "tournament-1",
        players: [{ playerId: "p-b", player: { id: "p-b", displayName: "B", shortName: "PB" } }],
      },
    ];

    beforeEach(() => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, teamMode: "flex" as const }),
      );
      mockRepo.getTournamentEntries.mockImplementation(() => Promise.resolve(flexEntries1v1));
    });

    it("victoryQuality flex: outcomeType.points=2 → +2 win, −2 loss", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([{
          ...makeFlexMatchWithPoints("m1", "A", ["p-a"], ["p-b"], 1, 0, 3, 0),
          outcomeTypeId: registerOutcome("ot-m1", { isDefault: false, points: 2 }),
        }]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "p-a")?.victoryQuality).toBe(2);
      expect(findEntry(standings, "p-b")?.victoryQuality).toBe(-2);
    });

    it("victoryQuality flex: outcomeType=null → default 3 pts per win", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([makeFlexMatchWithPoints("m1", "A", ["p-a"], ["p-b"], 1, 0, 3, 0)]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "p-a")?.victoryQuality).toBe(3);
      expect(findEntry(standings, "p-b")?.victoryQuality).toBe(-3);
    });

    it("buchholzScore flex: sum of the points of defeated opponents", async () => {
      // p-a beats p-b in m1; then p-b beats another player in m2 → p-b gets 3 pts
      const flexEntries3 = [
        ...flexEntries1v1,
        {
          id: "entry-c", tournamentId: "tournament-1",
          players: [{ playerId: "p-c", player: { id: "p-c", displayName: "C", shortName: "PC" } }],
        },
      ];
      mockRepo.getTournamentEntries.mockImplementation(() => Promise.resolve(flexEntries3));

      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([
          makeFlexMatchWithPoints("m1", "A", ["p-a"], ["p-b"], 1, 0, 3, 0),
          makeFlexMatchWithPoints("m2", "A", ["p-b"], ["p-c"], 1, 0, 3, 0),
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      // p-a's opponent p-b ends up with 3 pts (from beating p-c) → p-a.buchholz = 3
      expect(findEntry(standings, "p-a")?.buchholzScore).toBe(3);
    });

    it("buchholzScore flex 2v2: average of opponents, not the sum", async () => {
      // p-a beats (p-b + p-c) in a 2v2; p-b ends up with 3 pts, p-c with 1 pt
      // p-a.buchholz should be (3+1)/2 = 2, not 3+1 = 4
      const flexEntries2v2 = [
        {
          id: "entry-a", tournamentId: "tournament-1",
          players: [{ playerId: "p-a", player: { id: "p-a", displayName: "A", shortName: "PA" } }],
        },
        {
          id: "entry-bc", tournamentId: "tournament-1",
          players: [
            { playerId: "p-b", player: { id: "p-b", displayName: "B", shortName: "PB" } },
            { playerId: "p-c", player: { id: "p-c", displayName: "C", shortName: "PC" } },
          ],
        },
        {
          id: "entry-d", tournamentId: "tournament-1",
          players: [{ playerId: "p-d", player: { id: "p-d", displayName: "D", shortName: "PD" } }],
        },
      ];
      mockRepo.getTournamentEntries.mockImplementation(() => Promise.resolve(flexEntries2v2));

      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([
          {
            id: "m1", winnerSide: "A" as const, outcomeTypeId: null, outcomeType: null,
            playerPoints: [
              { playerId: "p-a", pointsAwarded: 3, countsForRanking: true },
              { playerId: "p-b", pointsAwarded: 0, countsForRanking: true },
              { playerId: "p-c", pointsAwarded: 0, countsForRanking: true },
            ],
            sides: [
              { position: 1, score: 3, entryId: "entry-a", entry: { id: "entry-a", players: [{ playerId: "p-a" }] } },
              { position: 2, score: 1, entryId: "entry-bc", entry: { id: "entry-bc", players: [{ playerId: "p-b" }, { playerId: "p-c" }] } },
            ],
          },
          {
            id: "m2", winnerSide: "A" as const, outcomeTypeId: null, outcomeType: null,
            playerPoints: [
              { playerId: "p-b", pointsAwarded: 3, countsForRanking: true },
              { playerId: "p-d", pointsAwarded: 0, countsForRanking: true },
            ],
            sides: [
              { position: 1, score: 2, entryId: "entry-bc", entry: { id: "entry-bc", players: [{ playerId: "p-b" }] } },
              { position: 2, score: 0, entryId: "entry-d", entry: { id: "entry-d", players: [{ playerId: "p-d" }] } },
            ],
          },
          {
            id: "m3", winnerSide: null, outcomeTypeId: null, outcomeType: null,
            playerPoints: [
              { playerId: "p-c", pointsAwarded: 1, countsForRanking: true },
              { playerId: "p-d", pointsAwarded: 1, countsForRanking: true },
            ],
            sides: [
              { position: 1, score: 1, entryId: "entry-bc", entry: { id: "entry-bc", players: [{ playerId: "p-c" }] } },
              { position: 2, score: 1, entryId: "entry-d", entry: { id: "entry-d", players: [{ playerId: "p-d" }] } },
            ],
          },
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(findEntry(standings, "p-b")?.points).toBe(3);
      expect(findEntry(standings, "p-c")?.points).toBe(1);
      expect(findEntry(standings, "p-a")?.buchholzScore).toBe(2);
    });

    it("countsForRanking=false: scores are not counted", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([{
          id: "m1",
          winnerSide: "A" as const,
          outcomeTypeId: null,
          outcomeType: null,
          playerPoints: [{ playerId: "p-a", pointsAwarded: 0, countsForRanking: false }],
          sides: [
            { position: 1, score: 5, entryId: "entry-a", entry: { id: "entry-a", players: [{ playerId: "p-a" }] } },
            { position: 2, score: 2, entryId: "entry-b", entry: { id: "entry-b", players: [] } },
          ],
        }]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "p-a")!;

      expect(a.scored).toBe(0);
      expect(a.conceded).toBe(0);
      expect(a.scoreDiff).toBe(0);
      expect(a.points).toBe(0);
      expect(a.matchesPlayed).toBe(0);
    });

    it("countsForRanking=false: buchholz and victoryQuality not incremented", async () => {
      mockRepo.getPlayerPointsForStandings.mockImplementation(() =>
        Promise.resolve([{
          ...makeFlexMatchWithPoints("m1", "A", ["p-a"], ["p-b"], 1, 0, 3, 0, false),
        }]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "p-a")!;

      expect(a.victoryQuality).toBe(0);
      expect(a.buchholzScore).toBe(0);
    });
  });

  // ── recalculatePointsInternal ─────────────────────────────────────────────

  describe("recalculatePointsInternal", () => {
    it("static: updates pointsAwarded on each matchSide (A win)", async () => {
      mockRepo.getMatchesForStandings.mockImplementation(() =>
        Promise.resolve([{ id: "m1", winnerSide: "A", playedAt: new Date() }]),
      );
      mockRepo.getMatchSides.mockImplementation(() =>
        Promise.resolve([
          { matchId: "m1", entryId: "entry-a", pointsAwarded: null, entry: null },
          { matchId: "m1", entryId: "entry-b", pointsAwarded: null, entry: null },
        ]),
      );

      await standingsService.recalculatePointsInternal("tournament-1");

      expect(mockMatchSidesRepo.updatePointsAwarded).toHaveBeenCalledWith("m1", "entry-a", 3);
      expect(mockMatchSidesRepo.updatePointsAwarded).toHaveBeenCalledWith("m1", "entry-b", 0);
    });

    it("static: updates pointsAwarded (draw)", async () => {
      mockRepo.getMatchesForStandings.mockImplementation(() =>
        Promise.resolve([{ id: "m1", winnerSide: null, playedAt: new Date() }]),
      );
      mockRepo.getMatchSides.mockImplementation(() =>
        Promise.resolve([
          { matchId: "m1", entryId: "entry-a", pointsAwarded: null, entry: null },
          { matchId: "m1", entryId: "entry-b", pointsAwarded: null, entry: null },
        ]),
      );

      await standingsService.recalculatePointsInternal("tournament-1");

      expect(mockMatchSidesRepo.updatePointsAwarded).toHaveBeenCalledWith("m1", "entry-a", 1);
      expect(mockMatchSidesRepo.updatePointsAwarded).toHaveBeenCalledWith("m1", "entry-b", 1);
    });

    it("flex: only the first N chronological matches count (maxMatchesPerPlayer)", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({
          ...DEFAULT_TOURNAMENT,
          teamMode: "flex" as const,
          championshipConfig: { maxMatchesPerPlayer: 2 },
        }),
      );

      const t1 = new Date("2025-01-01");
      const t2 = new Date("2025-01-02");
      const t3 = new Date("2025-01-03");

      mockRepo.getMatchesForStandings.mockImplementation(() =>
        Promise.resolve([
          { id: "m1", winnerSide: "A", playedAt: t1 },
          { id: "m2", winnerSide: "A", playedAt: t2 },
          { id: "m3", winnerSide: "A", playedAt: t3 },
        ]),
      );
      mockRepo.getMatchSides.mockImplementation(() =>
        Promise.resolve([
          { matchId: "m1", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p-x" }] } },
          { matchId: "m1", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
          { matchId: "m2", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p-x" }] } },
          { matchId: "m2", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
          { matchId: "m3", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p-x" }] } },
          { matchId: "m3", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
        ]),
      );

      await standingsService.recalculatePointsInternal("tournament-1");

      const rows = (mockRepo.insertPlayerPoints.mock.calls as any)[0][0] as Array<{ matchId: string; playerId: string; countsForRanking: boolean; pointsAwarded: number }>;

      const byMatch = (mid: string) => rows.find((r) => r.matchId === mid && r.playerId === "p-x")!;

      expect(byMatch("m1").countsForRanking).toBe(true);
      expect(byMatch("m1").pointsAwarded).toBe(3);
      expect(byMatch("m2").countsForRanking).toBe(true);
      expect(byMatch("m3").countsForRanking).toBe(false);
      expect(byMatch("m3").pointsAwarded).toBe(0);
    });

    it("flex: the limit applies per player, not per entry", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({
          ...DEFAULT_TOURNAMENT,
          teamMode: "flex" as const,
          championshipConfig: { maxMatchesPerPlayer: 1 },
        }),
      );

      const t1 = new Date("2025-01-01");
      const t2 = new Date("2025-01-02");

      mockRepo.getMatchesForStandings.mockImplementation(() =>
        Promise.resolve([
          { id: "m1", winnerSide: "A", playedAt: t1 },
          { id: "m2", winnerSide: "A", playedAt: t2 },
        ]),
      );
      // Same entry, 2 players: p1 and p2 — each has their own independent counter
      mockRepo.getMatchSides.mockImplementation(() =>
        Promise.resolve([
          { matchId: "m1", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p1" }, { playerId: "p2" }] } },
          { matchId: "m1", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
          { matchId: "m2", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p1" }, { playerId: "p2" }] } },
          { matchId: "m2", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
        ]),
      );

      await standingsService.recalculatePointsInternal("tournament-1");

      const rows = (mockRepo.insertPlayerPoints.mock.calls as any)[0][0] as Array<{ matchId: string; playerId: string; countsForRanking: boolean }>;

      const get = (pid: string, mid: string) => rows.find((r) => r.playerId === pid && r.matchId === mid)!;

      expect(get("p1", "m1").countsForRanking).toBe(true);
      expect(get("p1", "m2").countsForRanking).toBe(false);
      expect(get("p2", "m1").countsForRanking).toBe(true);
      expect(get("p2", "m2").countsForRanking).toBe(false);
    });

    it("flex: matches sorted chronologically before applying the limit", async () => {
      // Provide matches in reverse order; m3 (oldest) should count, m1 (newest) should not
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({
          ...DEFAULT_TOURNAMENT,
          teamMode: "flex" as const,
          championshipConfig: { maxMatchesPerPlayer: 1 },
        }),
      );

      const t1 = new Date("2025-01-03");
      const t2 = new Date("2025-01-01");

      mockRepo.getMatchesForStandings.mockImplementation(() =>
        Promise.resolve([
          { id: "m1", winnerSide: "A", playedAt: t1 }, // newer, should NOT count
          { id: "m2", winnerSide: "A", playedAt: t2 }, // older, should count
        ]),
      );
      mockRepo.getMatchSides.mockImplementation(() =>
        Promise.resolve([
          { matchId: "m1", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p-x" }] } },
          { matchId: "m1", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
          { matchId: "m2", entryId: "entry-a", pointsAwarded: null, entry: { players: [{ playerId: "p-x" }] } },
          { matchId: "m2", entryId: "entry-b", pointsAwarded: null, entry: { players: [] } },
        ]),
      );

      await standingsService.recalculatePointsInternal("tournament-1");

      const rows = (mockRepo.insertPlayerPoints.mock.calls as any)[0][0] as Array<{ matchId: string; playerId: string; countsForRanking: boolean }>;

      const get = (mid: string) => rows.find((r) => r.matchId === mid && r.playerId === "p-x")!;

      expect(get("m2").countsForRanking).toBe(true);  // older match counted first
      expect(get("m1").countsForRanking).toBe(false); // newer match excluded
    });

    it("invalidates the cache at the start of recalculation", async () => {
      await standingsService.recalculatePointsInternal("tournament-1");

      expect(mockRepo.deleteComputedData).toHaveBeenCalledWith("tournament-1");
    });
  });

  // ── Additional edge cases ───────────────────────────────────────────

  describe("additional edge cases", () => {
    it("tournament with no team (static): returns an empty standings list", async () => {
      mockRepo.getTournamentTeams.mockImplementation(() => Promise.resolve([]));

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(standings).toHaveLength(0);
    });

    it("tournament with no entry (flex): returns an empty standings list", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, teamMode: "flex" as const }),
      );
      mockRepo.getTournamentEntries.mockImplementation(() => Promise.resolve([]));

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(standings).toHaveLength(0);
    });

    it("cache hit: returns the cached value without recalculating matches", async () => {
      const cachedResult = {
        standings: [{ id: "team-a", name: "Alpha", shortName: "ALPHA", points: 99, wins: 10, draws: 0, losses: 0, scored: 0, conceded: 0, scoreDiff: 0, matchesPlayed: 10, winLossRatio: 10, buchholzScore: 0, victoryQuality: 10, victoryQualityBreakdown: [], winRate: 1, headToHead: {} }],
      };
      mockRepo.getComputedData.mockImplementation(() => Promise.resolve(cachedResult as any));

      const result = await standingsService.getOfficialStandings("tournament-1");

      expect(result).toEqual(cachedResult);
      expect(mockRepo.getMatchesWithSides).not.toHaveBeenCalled();
      expect(mockRepo.getTournamentWithScoring).not.toHaveBeenCalled();
    });

    it("player present in several entries: appears only once in the standings", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, teamMode: "flex" as const }),
      );
      mockRepo.getTournamentEntries.mockImplementation(() =>
        Promise.resolve([
          {
            id: "entry-a", tournamentId: "tournament-1",
            players: [{ playerId: "p-shared", player: { id: "p-shared", displayName: "Shared", shortName: "SHR" } }],
          },
          {
            id: "entry-b", tournamentId: "tournament-1",
            players: [{ playerId: "p-shared", player: { id: "p-shared", displayName: "Shared", shortName: "SHR" } }],
          },
        ]),
      );

      const { standings } = await standingsService.getOfficialStandings("tournament-1");

      expect(standings.filter((e) => e.id === "p-shared")).toHaveLength(1);
    });

    it("winRate flex = wins / max(1, matchesPlayed) — avoids division by zero", async () => {
      mockRepo.getTournamentWithScoring.mockImplementation(() =>
        Promise.resolve({ ...DEFAULT_TOURNAMENT, teamMode: "flex" as const }),
      );
      mockRepo.getTournamentEntries.mockImplementation(() =>
        Promise.resolve([
          {
            id: "entry-a", tournamentId: "tournament-1",
            players: [{ playerId: "p-a", player: { id: "p-a", displayName: "A", shortName: "PA" } }],
          },
        ]),
      );
      // No matches → matchesPlayed = 0
      mockRepo.getPlayerPointsForStandings.mockImplementation(() => Promise.resolve([]));

      const { standings } = await standingsService.getOfficialStandings("tournament-1");
      const a = findEntry(standings, "p-a")!;

      expect(a.matchesPlayed).toBe(0);
      expect(a.winRate).toBe(0); // 0 / max(1, 0) = 0
    });
  });
});
