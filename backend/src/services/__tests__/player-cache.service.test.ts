/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockStandingsRepo = {
  deleteComputedDataMany: mock((_ids: any) => Promise.resolve()),
};
mock.module("../../repository/standings.repository", () => ({
  standingsRepository: mockStandingsRepo,
}));

const mockPlayerStatsRepo = {
  getTournamentIdsByPlayers: mock((_ids: any) => Promise.resolve([] as string[])),
  getPlayerIdsByTournaments: mock((_ids: any) => Promise.resolve([] as string[])),
};
mock.module("../../repository/player-stats.repository", () => ({
  playerStatsRepository: mockPlayerStatsRepo,
}));

const mockPlayerComputedDataRepo = {
  deleteMany: mock((_ids: any) => Promise.resolve()),
};
mock.module("../../repository/player-computed-data.repository", () => ({
  playerComputedDataRepository: mockPlayerComputedDataRepo,
}));

// Unmocked, this one reaches graphile-worker and inserts a job carrying the
// fixture id into whatever DATABASE_URL points at — a poison job the real
// worker then retries 25 times.
const mockEnqueueRewindIdentityRefresh = mock((_ids: any) => Promise.resolve());
mock.module("../mmr-job-queue.service", () => ({
  enqueueRewindIdentityRefresh: mockEnqueueRewindIdentityRefresh,
}));

import { PlayerCacheService } from "../player-cache.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAYER_ID = "player-1";
const service = new PlayerCacheService();

beforeEach(() => {
  mockStandingsRepo.deleteComputedDataMany.mockClear();
  mockPlayerStatsRepo.getTournamentIdsByPlayers.mockClear();
  mockPlayerStatsRepo.getPlayerIdsByTournaments.mockClear();
  mockPlayerComputedDataRepo.deleteMany.mockClear();
  mockEnqueueRewindIdentityRefresh.mockClear();

  mockPlayerStatsRepo.getTournamentIdsByPlayers.mockImplementation(() => Promise.resolve([]));
  mockPlayerStatsRepo.getPlayerIdsByTournaments.mockImplementation(() => Promise.resolve([]));
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PlayerCacheService", () => {
  it("drops the tournament caches the player appears in", async () => {
    mockPlayerStatsRepo.getTournamentIdsByPlayers.mockImplementation(() => Promise.resolve(["t-1", "t-2"]));

    await service.invalidateDenormalizedNames([PLAYER_ID]);

    expect(mockPlayerStatsRepo.getTournamentIdsByPlayers).toHaveBeenCalledWith([PLAYER_ID]);
    expect(mockStandingsRepo.deleteComputedDataMany).toHaveBeenCalledWith(["t-1", "t-2"]);
  });

  // A rename also stales the partner / nemesis / H2H lists cached on everyone
  // this player ever shared a tournament with.
  it("drops the stats of every co-participant as well", async () => {
    mockPlayerStatsRepo.getTournamentIdsByPlayers.mockImplementation(() => Promise.resolve(["t-1"]));
    mockPlayerStatsRepo.getPlayerIdsByTournaments.mockImplementation(() => Promise.resolve(["mate-1", "mate-2"]));

    await service.invalidateDenormalizedNames([PLAYER_ID]);

    expect(mockPlayerStatsRepo.getPlayerIdsByTournaments).toHaveBeenCalledWith(["t-1"]);
    expect(mockPlayerComputedDataRepo.deleteMany).toHaveBeenCalledWith([PLAYER_ID, "mate-1", "mate-2"]);
  });

  it("does not repeat a player already returned as a co-participant", async () => {
    mockPlayerStatsRepo.getTournamentIdsByPlayers.mockImplementation(() => Promise.resolve(["t-1"]));
    mockPlayerStatsRepo.getPlayerIdsByTournaments.mockImplementation(() => Promise.resolve([PLAYER_ID, "mate-1"]));

    await service.invalidateDenormalizedNames([PLAYER_ID]);

    expect(mockPlayerComputedDataRepo.deleteMany).toHaveBeenCalledWith([PLAYER_ID, "mate-1"]);
  });

  it("still drops the player's own stats when they played nothing", async () => {
    await service.invalidateDenormalizedNames([PLAYER_ID]);

    expect(mockStandingsRepo.deleteComputedDataMany).toHaveBeenCalledWith([]);
    expect(mockPlayerComputedDataRepo.deleteMany).toHaveBeenCalledWith([PLAYER_ID]);
  });

  it("queues the rewind identity refresh for the renamed players", async () => {
    await service.invalidateDenormalizedNames([PLAYER_ID]);

    expect(mockEnqueueRewindIdentityRefresh).toHaveBeenCalledWith([PLAYER_ID]);
  });

  it("does nothing without a player", async () => {
    await service.invalidateDenormalizedNames([]);

    expect(mockPlayerStatsRepo.getTournamentIdsByPlayers).not.toHaveBeenCalled();
    expect(mockStandingsRepo.deleteComputedDataMany).not.toHaveBeenCalled();
    expect(mockPlayerComputedDataRepo.deleteMany).not.toHaveBeenCalled();
    expect(mockEnqueueRewindIdentityRefresh).not.toHaveBeenCalled();
  });
});
