/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

import { matchFinalizationOrchestrator } from "../match-finalization.orchestrator";
import { notificationService } from "../notification.service";
import { bracketService } from "../bracket.service";
import { mmrCalculationService } from "../mmr-calculation.service";
import { mmrAnimationEventService } from "../mmr-animation-event.service";
import { rankedSeasonRepository } from "../../repository/ranked-season.repository";
import { rankedSeasonService } from "../ranked-season.service";
import { standingsService } from "../standings.service";
import { matchRepository } from "../../repository/match.repository";
import { playerComputedDataRepository } from "../../repository/player-computed-data.repository";
import { tournamentStatsRepository } from "../../repository/tournament-stats.repository";

interface CallTracker {
  deleteActions: number;
  advWinner: number;
  advLoser: number;
  enqueueMmr: number;
  mmrCalc: number;
  mmrAnim: number;
  rankedOfficial: number;
  rankedProvisional: number;
  standingsRecalc: number;
  standingsInvalidate: number;
  playerComputedDelete: number;
  statsDelete: number;
}

let calls: CallTracker;

// MMR recalculation is offloaded to an async job queue (graphile-worker).
// The orchestrator only enqueues the job; the downstream MMR/ranked services
// run later in a worker process, so we mock the queue to track the handoff.
mock.module("../mmr-job-queue.service", () => ({
  enqueueMmrFinalization: async () => {
    calls.enqueueMmr += 1;
  },
  enqueueMmrCascade: async () => {
    calls.enqueueMmr += 1;
  },
}));

beforeEach(() => {
  calls = {
    deleteActions: 0,
    advWinner: 0,
    advLoser: 0,
    enqueueMmr: 0,
    mmrCalc: 0,
    mmrAnim: 0,
    rankedOfficial: 0,
    rankedProvisional: 0,
    standingsRecalc: 0,
    standingsInvalidate: 0,
    playerComputedDelete: 0,
    statsDelete: 0,
  };
  (notificationService as any).deleteActionsByMatchId = async () => {
    calls.deleteActions += 1;
    return [];
  };
  (bracketService as any).advanceWinnerToNextRound = async () => {
    calls.advWinner += 1;
  };
  (bracketService as any).advanceLoserToNextRound = async () => {
    calls.advLoser += 1;
  };
  (mmrCalculationService as any).processMatchFinalization = async () => {
    calls.mmrCalc += 1;
  };
  (mmrAnimationEventService as any).createOfficialEventsAndBroadcast = async () => {
    calls.mmrAnim += 1;
  };
  (rankedSeasonService as any).computeAndCacheOfficial = async () => {
    calls.rankedOfficial += 1;
  };
  (rankedSeasonService as any).computeAndCacheProvisional = async () => {
    calls.rankedProvisional += 1;
  };
  (standingsService as any).recalculatePointsInternal = async () => {
    calls.standingsRecalc += 1;
    return { updatedMatches: 0 };
  };
  (standingsService as any).invalidateCache = async () => {
    calls.standingsInvalidate += 1;
  };
  (matchRepository as any).getPlayerIdsForMatch = async () => [];
  (playerComputedDataRepository as any).deleteMany = async () => {
    calls.playerComputedDelete += 1;
  };
  (tournamentStatsRepository as any).deleteComputedStats = async () => {
    calls.statsDelete += 1;
  };
});

afterEach(() => {
  const restore = (instance: object) => {
    if (Object.getPrototypeOf(instance) === Object.prototype) return;
    for (const key of Object.getOwnPropertyNames(instance)) {
      delete (instance as Record<string, unknown>)[key];
    }
  };
  restore(notificationService);
  restore(bracketService);
  restore(mmrCalculationService);
  restore(mmrAnimationEventService);
  restore(rankedSeasonRepository);
  restore(rankedSeasonService);
  restore(standingsService);
  restore(matchRepository);
  restore(playerComputedDataRepository);
  restore(tournamentStatsRepository);
});

describe("MatchFinalizationOrchestrator", () => {
  it("enqueues MMR job when tournament has ranked config", async () => {
    (rankedSeasonRepository as any).getConfigByTournamentId = async () => ({
      id: "rs-1",
    });
    (matchRepository as any).getTournament = async () => ({
      id: "t-1",
      mode: "ranked",
    });

    await matchFinalizationOrchestrator.runPostFinalizationEffects("m-1", "t-1");

    expect(calls.deleteActions).toBe(1);
    expect(calls.advWinner).toBe(1);
    expect(calls.advLoser).toBe(1);
    expect(calls.enqueueMmr).toBe(1);
    expect(calls.statsDelete).toBe(1);
    // MMR + ranked caches now run in the worker, not synchronously here
    expect(calls.mmrCalc).toBe(0);
    expect(calls.rankedOfficial).toBe(0);
    expect(calls.rankedProvisional).toBe(0);
  });

  it("skips MMR job when tournament has no ranked config", async () => {
    (rankedSeasonRepository as any).getConfigByTournamentId = async () => null;
    (matchRepository as any).getTournament = async () => ({
      id: "t-1",
      mode: "championship",
      teamMode: "static",
    });

    await matchFinalizationOrchestrator.runPostFinalizationEffects("m-1", "t-1");

    expect(calls.enqueueMmr).toBe(0);
    expect(calls.rankedOfficial).toBe(0);
    expect(calls.rankedProvisional).toBe(0);
    expect(calls.standingsInvalidate).toBe(1);
  });

  it("recalculates points for flex championship with maxMatchesPerPlayer", async () => {
    (rankedSeasonRepository as any).getConfigByTournamentId = async () => null;
    (matchRepository as any).getTournament = async () => ({
      id: "t-1",
      mode: "championship",
      teamMode: "flex",
      championshipConfig: { maxMatchesPerPlayer: 5 },
    });

    await matchFinalizationOrchestrator.runPostFinalizationEffects("m-1", "t-1");

    expect(calls.standingsRecalc).toBe(1);
    expect(calls.standingsInvalidate).toBe(0);
  });
});
