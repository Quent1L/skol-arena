import { describe, it, expect, mock } from "bun:test";

/**
 * `getMmrSnapshotAt` prices the match wizard's balance preview. Everything it
 * does is fallback ordering, so the repositories are mocked and only that
 * ordering is asserted.
 */

const SEASON = "season-1";
const CONFIG = { baseMmr: 1000, placementMatches: 5 };

// playerId -> the checkpoint the repository reports for that player, or null
// when they have no earlier match in the season.
const CHECKPOINTS: Record<string, { mmr: number; wins: number; losses: number; draws: number } | null> = {
  veteran: { mmr: 1320, wins: 6, losses: 3, draws: 1 },
  rookie: { mmr: 1040, wins: 1, losses: 1, draws: 0 },
  seeded: null,
  newcomer: null,
};

const SEEDS = new Map<string, number>([["seeded", 1180]]);

let configResult: typeof CONFIG | undefined = CONFIG;

mock.module("../../config/database", () => ({ db: {} }));

mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: {
    getConfigByTournamentId: mock(() => Promise.resolve(configResult)),
  },
}));

mock.module("../../repository/mmr-seed.repository", () => ({
  mmrSeedRepository: {
    getMapBySeason: mock(() => Promise.resolve(SEEDS)),
  },
}));

mock.module("../../repository/player-mmr.repository", () => ({
  playerMmrRepository: {
    getCheckpointState: mock((_season: string, playerId: string) => Promise.resolve(CHECKPOINTS[playerId] ?? null)),
  },
}));

const { mmrCalculationService } = await import("../mmr-calculation.service");
const { NotFoundError, BadRequestError } = await import("../../types/errors");

const AT = new Date("2026-03-01T12:00:00.000Z");

async function snapshotOf(playerIds: string[]) {
  const rows = await mmrCalculationService.getMmrSnapshotAt(SEASON, playerIds, AT);
  return Object.fromEntries(rows.map((r) => [r.playerId, r]));
}

describe("getMmrSnapshotAt", () => {
  it("reports the checkpoint MMR of a player who has already played", async () => {
    const snapshot = await snapshotOf(["veteran"]);
    expect(snapshot.veteran).toEqual({ playerId: "veteran", mmr: 1320, isPlacement: false });
  });

  it("falls back to the carry-over seed before the season base", async () => {
    const snapshot = await snapshotOf(["seeded", "newcomer"]);
    expect(snapshot.seeded.mmr).toBe(1180);
    expect(snapshot.newcomer.mmr).toBe(CONFIG.baseMmr);
  });

  it("flags a player who had not finished placement at that date", async () => {
    // 2 matches before `at` against a threshold of 5 — still placing, even
    // though the same player may be well past it today.
    const snapshot = await snapshotOf(["rookie", "veteran", "newcomer"]);
    expect(snapshot.rookie.isPlacement).toBe(true);
    expect(snapshot.veteran.isPlacement).toBe(false);
    expect(snapshot.newcomer.isPlacement).toBe(true);
  });

  it("collapses duplicate ids into a single entry", async () => {
    const rows = await mmrCalculationService.getMmrSnapshotAt(SEASON, ["veteran", "veteran", "rookie"], AT);
    expect(rows).toHaveLength(2);
  });

  it("returns nothing for an empty request", async () => {
    expect(await mmrCalculationService.getMmrSnapshotAt(SEASON, [], AT)).toEqual([]);
  });

  it("refuses a request over the per-call ceiling", async () => {
    const tooMany = Array.from({ length: 33 }, (_, i) => `player-${i}`);
    await expect(mmrCalculationService.getMmrSnapshotAt(SEASON, tooMany, AT)).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects a tournament that is not a ranked season", async () => {
    configResult = undefined;
    try {
      await expect(mmrCalculationService.getMmrSnapshotAt(SEASON, ["veteran"], AT)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    } finally {
      configResult = CONFIG;
    }
  });
});
