/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const autoFinalizeExpiredMatches = mock(async (): Promise<any> => ({
  total: 3,
  finalized: ["a", "b"],
  disputed: ["c"],
}));
mock.module("../../services/match.service", () => ({ matchService: { autoFinalizeExpiredMatches } }));

const rolloverDue = mock(async (): Promise<any> => ({ rolledOver: ["s1"], closed: [], failed: [] }));
mock.module("../../services/ranked-season-rollover.service", () => ({
  rankedSeasonRolloverService: { rolloverDue },
}));

const { autoFinalizeMatchesJob } = await import("../auto-finalize-matches.job");
const { rolloverRankedSeasonsJob } = await import("../rollover-ranked-seasons.job");

beforeEach(() => {
  autoFinalizeExpiredMatches.mockClear();
  rolloverDue.mockClear();
});

describe("autoFinalizeMatchesJob", () => {
  it("returns the service result", async () => {
    const result = await autoFinalizeMatchesJob();
    expect(result.total).toBe(3);
    expect(autoFinalizeExpiredMatches).toHaveBeenCalledTimes(1);
  });

  it("rethrows a service failure", async () => {
    autoFinalizeExpiredMatches.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    await expect(autoFinalizeMatchesJob()).rejects.toThrow("db down");
  });
});

describe("rolloverRankedSeasonsJob", () => {
  it("returns the rollover result", async () => {
    const result = await rolloverRankedSeasonsJob();
    expect<unknown>(result.rolledOver).toEqual(["s1"]);
    expect(rolloverDue).toHaveBeenCalledTimes(1);
  });

  it("rethrows a service failure", async () => {
    rolloverDue.mockImplementationOnce(async () => {
      throw new Error("lock lost");
    });
    await expect(rolloverRankedSeasonsJob()).rejects.toThrow("lock lost");
  });
});
