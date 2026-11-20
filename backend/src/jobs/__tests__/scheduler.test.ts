/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const withAdvisoryLock = mock(async (..._args: any[]): Promise<any> => ({ ran: true, result: null }));
mock.module("../advisory-lock", () => ({ withAdvisoryLock }));

const autoFinalizeMatchesJob = mock(async () => ({}));
mock.module("../auto-finalize-matches.job", () => ({ autoFinalizeMatchesJob }));
const pruneNotificationsJob = mock(async () => ({ deleted: 0 }));
mock.module("../prune-notifications.job", () => ({ pruneNotificationsJob }));
const rolloverRankedSeasonsJob = mock(async () => ({}));
mock.module("../rollover-ranked-seasons.job", () => ({ rolloverRankedSeasonsJob }));

const pool = { name: "pool" };
mock.module("../../config/database", () => ({ getPool: () => pool }));

const enqueueBadgeReconciliation = mock(async (..._args: any[]) => {});
mock.module("../../services/mmr-job-queue.service", () => ({ enqueueBadgeReconciliation }));

const { startJobScheduler } = await import("../scheduler");

type Registered = { pattern: string; run: () => Promise<void>; stop: ReturnType<typeof mock> };
let registered: Registered[] = [];

function install() {
  registered = [];
  (Bun as any).cron = (pattern: string, run: () => Promise<void>) => {
    const entry = { pattern, run, stop: mock(() => {}) };
    registered.push(entry);
    return { stop: entry.stop };
  };
}

const job = (pattern: string) => registered.find((j) => j.pattern === pattern)!;

beforeEach(() => {
  install();
  withAdvisoryLock.mockClear();
  withAdvisoryLock.mockImplementation(async () => ({ ran: true, result: null }));
  enqueueBadgeReconciliation.mockClear();
  enqueueBadgeReconciliation.mockImplementation(async () => {});
});

describe("startJobScheduler", () => {
  it("registers the four schedules", () => {
    startJobScheduler();
    expect(registered.map((j) => j.pattern)).toEqual(["0 * * * *", "30 * * * *", "0 3 * * *", "30 3 * * *"]);
  });

  it("stops every schedule", () => {
    startJobScheduler().stop();
    for (const entry of registered) expect(entry.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["0 * * * *", 1, autoFinalizeMatchesJob],
    ["30 * * * *", 3, rolloverRankedSeasonsJob],
    ["30 3 * * *", 2, pruneNotificationsJob],
  ])("runs %s under advisory lock %i", async (pattern, lockKey, task) => {
    startJobScheduler();

    await job(pattern).run();

    expect(withAdvisoryLock).toHaveBeenCalledTimes(1);
    expect(withAdvisoryLock.mock.calls[0][0]).toBe(pool);
    expect(withAdvisoryLock.mock.calls[0][1]).toBe(lockKey);
    await withAdvisoryLock.mock.calls[0][2]();
    expect(task).toHaveBeenCalled();
  });

  it.each(["0 * * * *", "30 * * * *", "30 3 * * *"])("survives a skipped or failing run of %s", async (pattern) => {
    startJobScheduler();

    withAdvisoryLock.mockImplementationOnce(async () => ({ ran: false }));
    await job(pattern).run();

    withAdvisoryLock.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    await expect(job(pattern).run()).resolves.toBeUndefined();
  });

  it("enqueues the nightly badge reconciliation without forcing it", async () => {
    startJobScheduler();

    await job("0 3 * * *").run();

    expect(enqueueBadgeReconciliation).toHaveBeenCalledWith(false);
  });

  it("survives a failing badge reconciliation enqueue", async () => {
    startJobScheduler();
    enqueueBadgeReconciliation.mockImplementationOnce(async () => {
      throw new Error("queue down");
    });

    await expect(job("0 3 * * *").run()).resolves.toBeUndefined();
  });
});
