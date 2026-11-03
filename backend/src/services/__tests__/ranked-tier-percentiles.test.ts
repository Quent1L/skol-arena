/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// Percentile boundaries are derived from the MMR distribution of the season, so what
// the distribution contains is the whole behaviour under test here.

const mockRankedRepo = {
  getRankTiers: mock(() => Promise.resolve([] as any[])),
  upsertRankTier: mock((..._args: any[]) => Promise.resolve()),
  getConfigByTournamentId: mock(() => Promise.resolve({ placementMatches: 0 } as any)),
};

mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: mockRankedRepo,
}));

const mockPlayerMmrRepo = {
  getAllPlayersBySeasonId: mock(() => Promise.resolve([] as any[])),
};

mock.module("../../repository/player-mmr.repository", () => ({
  playerMmrRepository: mockPlayerMmrRepo,
}));

let inactivePlayerIds = new Set<string>();

mock.module("../../repository/participant.repository", () => ({
  participantRepository: {
    findInactivePlayerIds: mock(() => Promise.resolve(inactivePlayerIds)),
  },
}));

const { RankedSeasonService } = await import("../ranked-season.service");

function player(currentMmr: number, matchesPlayed = 10, playerId = `p-${currentMmr}`) {
  return { currentMmr, matchesPlayed, playerId };
}

describe("recalculateTierMinMmr", () => {
  let service: InstanceType<typeof RankedSeasonService>;

  beforeEach(() => {
    for (const m of [
      ...(Object.values(mockRankedRepo) as ReturnType<typeof mock>[]),
      ...(Object.values(mockPlayerMmrRepo) as ReturnType<typeof mock>[]),
    ]) {
      m.mock.calls.length = 0;
      m.mock.results.length = 0;
    }
    mockRankedRepo.getRankTiers.mockImplementation(() => Promise.resolve([]));
    mockRankedRepo.upsertRankTier.mockImplementation(() => Promise.resolve());
    mockRankedRepo.getConfigByTournamentId.mockImplementation(() =>
      Promise.resolve({ placementMatches: 0 }),
    );
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() => Promise.resolve([]));
    inactivePlayerIds = new Set();
    service = new RankedSeasonService();
  });

  it("no tier → nothing is written", async () => {
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls).toHaveLength(0);
  });

  it("no player → the ladder is left untouched, never flattened onto baseMmr", async () => {
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([
        { level: 1, percentile: 0 },
        { level: 2, percentile: 0.5 },
      ]),
    );
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls).toHaveLength(0);
  });

  it("the bottom tier floors at the weakest player when they sit below baseMmr", async () => {
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([{ level: 1, percentile: 0 }]),
    );
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
      Promise.resolve([player(1500), player(800)]),
    );
    await service.recalculateTierMinMmr("s1", 1000);
    // 800 would otherwise fall through a ladder starting at 1000.
    expect(mockRankedRepo.upsertRankTier.mock.calls[0][2]).toEqual({ minMmr: 800 });
  });

  it("the bottom tier never rises above baseMmr", async () => {
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([{ level: 1, percentile: 0 }]),
    );
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
      Promise.resolve([player(1500), player(1200)]),
    );
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls[0][2]).toEqual({ minMmr: 1000 });
  });

  it("percentile 0.5 over 4 players → index 2 of the ascending sort", async () => {
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([{ level: 2, percentile: 0.5 }]),
    );
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
      Promise.resolve([player(1200), player(800), player(1500), player(900)]),
    );
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls[0][2]).toEqual({ minMmr: 1200 });
  });

  it("ignores players still in placement: their MMR is unsettled", async () => {
    mockRankedRepo.getConfigByTournamentId.mockImplementation(() =>
      Promise.resolve({ placementMatches: 5 }),
    );
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([{ level: 2, percentile: 0.5 }]),
    );
    // Without the filter the two unplaced 100s would drag the boundary down to 900.
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
      Promise.resolve([
        player(1200),
        player(800),
        player(1500),
        player(900),
        player(100, 1),
        player(100, 4),
      ]),
    );
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls[0][2]).toEqual({ minMmr: 1200 });
  });

  it("ignores players who left the season: they hold no rank anymore", async () => {
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([{ level: 2, percentile: 0.5 }]),
    );
    // Without the filter the two departed 100s would drag the boundary down to 900.
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
      Promise.resolve([
        player(1200),
        player(800),
        player(1500),
        player(900),
        player(100, 10, "gone-1"),
        player(100, 10, "gone-2"),
      ]),
    );
    inactivePlayerIds = new Set(["gone-1", "gone-2"]);
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls[0][2]).toEqual({ minMmr: 1200 });
  });

  it("only unplaced players → the ladder is kept as it is", async () => {
    mockRankedRepo.getConfigByTournamentId.mockImplementation(() =>
      Promise.resolve({ placementMatches: 5 }),
    );
    mockRankedRepo.getRankTiers.mockImplementation(() =>
      Promise.resolve([{ level: 2, percentile: 0.5 }]),
    );
    mockPlayerMmrRepo.getAllPlayersBySeasonId.mockImplementation(() =>
      Promise.resolve([player(1500, 1), player(800, 2)]),
    );
    await service.recalculateTierMinMmr("s1", 1000);
    expect(mockRankedRepo.upsertRankTier.mock.calls).toHaveLength(0);
  });
});
