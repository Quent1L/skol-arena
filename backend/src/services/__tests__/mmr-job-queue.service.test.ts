/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const addJob = mock(async (..._args: any[]) => ({}));
const migrate = mock(async () => {});
const makeWorkerUtils = mock(async (..._args: any[]) => ({ addJob, migrate }));
mock.module("graphile-worker", () => ({ makeWorkerUtils }));

const broadcastToTournament = mock((..._args: any[]) => {});
mock.module("../websocket.service", () => ({ webSocketService: { broadcastToTournament } }));

const queue = await import("../mmr-job-queue.service");

beforeEach(() => {
  addJob.mockClear();
  addJob.mockImplementation(async () => ({}));
  broadcastToTournament.mockClear();
});

describe("mmr job queue", () => {
  it("connects and migrates once, however many jobs follow", async () => {
    await queue.enqueueMmrFinalization("m1", "t1");
    await queue.enqueueMmrSeasonRecalculation("t1");
    expect(makeWorkerUtils).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it("queues a finalization on the tournament's own queue and warns the clients", async () => {
    await queue.enqueueMmrFinalization("m1", "t1");
    expect(addJob).toHaveBeenCalledWith(
      "finalize_match_mmr",
      { matchId: "m1", tournamentId: "t1" },
      { jobKey: "finalize:m1", queueName: "mmr:t1" },
    );
    expect(broadcastToTournament).toHaveBeenCalledWith("t1", {
      event: "leaderboard_recalculating",
      data: { seasonId: "t1" },
    });
  });

  it("queues a season recalculation, a cascade and a correction the same way", async () => {
    await queue.enqueueMmrSeasonRecalculation("t1");
    await queue.enqueueMmrCascade("m2", "t1", new Date("2026-03-01T10:00:00Z"));
    await queue.enqueueMmrCorrection("m3", "t1");

    expect(addJob.mock.calls.map((c) => c[0])).toEqual(["recalculate_season_mmr", "cancel_match_mmr", "correct_match_mmr"]);
    expect(addJob.mock.calls[1]![1]).toEqual({ matchId: "m2", tournamentId: "t1", cancelledMatchPlayedAt: "2026-03-01T10:00:00.000Z" });
    expect(addJob.mock.calls.map((c) => c[2].jobKey)).toEqual(["recalculate_season:t1", "cancel:m2", "correct:m3"]);
    expect(broadcastToTournament).toHaveBeenCalledTimes(3);
  });

  it("queues the rewind behind the season's recalculations without broadcasting", async () => {
    await queue.enqueueSeasonRewindGeneration("s1");
    expect(addJob).toHaveBeenCalledWith("generate_season_rewind", { seasonId: "s1" }, { jobKey: "rewind:s1", queueName: "mmr:s1" });
    expect(broadcastToTournament).not.toHaveBeenCalled();
  });

  it("queues one identity refresh per player, none for an empty list", async () => {
    await queue.enqueueRewindIdentityRefresh([]);
    expect(addJob).not.toHaveBeenCalled();
    await queue.enqueueRewindIdentityRefresh(["p1", "p2"]);
    expect(addJob.mock.calls.map((c) => c[2].jobKey)).toEqual(["rewind-identity:p1", "rewind-identity:p2"]);
    expect(addJob.mock.calls[0]![2].queueName).toBeUndefined();
  });

  it("collapses badge reconciliation runs on a single job key", async () => {
    await queue.enqueueBadgeReconciliation();
    await queue.enqueueBadgeReconciliation(true);
    expect(addJob.mock.calls.map((c) => [c[1], c[2].jobKey])).toEqual([
      [{ force: false }, "reconcile_pending_badges"],
      [{ force: true }, "reconcile_pending_badges"],
    ]);
  });

  it("never lets a queueing failure reach the caller", async () => {
    addJob.mockImplementation(async () => {
      throw new Error("database unavailable");
    });
    await queue.enqueueMmrFinalization("m1", "t1");
    await queue.enqueueMmrSeasonRecalculation("t1");
    await queue.enqueueSeasonRewindGeneration("s1");
    await queue.enqueueRewindIdentityRefresh(["p1"]);
    await queue.enqueueBadgeReconciliation();
    await queue.enqueueMmrCascade("m", "t1", new Date());
    await queue.enqueueMmrCorrection("m", "t1");
    expect(broadcastToTournament).not.toHaveBeenCalled();
  });
});
