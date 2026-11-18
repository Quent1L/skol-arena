import { describe, expect, it } from "bun:test";
import {
  designateMvp,
  isMvpEligible,
  resolveVoteConfig,
  smoothedFairPlayRate,
  castFairPlayVoteSchema,
  VOTE_DEFAULTS,
  type MvpBallot,
} from "../src/types/votes";

const cfg = { mvpMinVotes: 2, mvpTieRule: "co_mvp" as const };
const p = (targetId: string): MvpBallot => ({ targetId, voterRole: "player" });
const s = (targetId: string): MvpBallot => ({ targetId, voterRole: "spectator" });

describe("designateMvp", () => {
  it("picks the most voted player above the threshold", () => {
    expect(designateMvp([p("a"), p("a"), p("b")], cfg)).toEqual(["a"]);
  });

  it("returns nobody below the minimum", () => {
    expect(designateMvp([p("a"), p("b")], cfg)).toEqual([]);
  });

  it("refuses an MVP chosen by spectators alone", () => {
    expect(designateMvp([s("a"), s("a"), s("a"), p("b"), p("b")], cfg)).toEqual(["b"]);
    expect(designateMvp([s("a"), s("a")], cfg)).toEqual([]);
  });

  it("counts a spectator vote once a player backs the same target", () => {
    expect(designateMvp([s("a"), p("a")], cfg)).toEqual(["a"]);
  });

  it("gives co-MVPs on a tie, or nobody with the none rule", () => {
    const ballots = [p("a"), p("a"), p("b"), p("b")];
    expect(designateMvp(ballots, cfg)).toEqual(["a", "b"]);
    expect(designateMvp(ballots, { ...cfg, mvpTieRule: "none" })).toEqual([]);
  });
});

describe("isMvpEligible", () => {
  it("needs one side of two or more", () => {
    expect(isMvpEligible([1, 1])).toBe(false);
    expect(isMvpEligible([2, 1])).toBe(true);
  });
});

describe("smoothedFairPlayRate", () => {
  it("pulls a single vote towards the average", () => {
    expect(smoothedFairPlayRate(1, 0, 5, 0.5)).toBeCloseTo(3.5 / 6);
    expect(smoothedFairPlayRate(0, 0, 5, 0.8)).toBeCloseTo(0.8);
  });
});

describe("resolveVoteConfig", () => {
  it("fills the defaults and keeps the overrides", () => {
    expect(resolveVoteConfig(null)).toEqual(VOTE_DEFAULTS);
    expect(resolveVoteConfig({ mvpEnabled: true }).mvpEnabled).toBe(true);
  });
});

describe("castFairPlayVoteSchema", () => {
  it("only accepts tags on a negative vote", () => {
    expect(castFairPlayVoteSchema.safeParse({ value: "up", tags: ["other"] }).success).toBe(false);
    expect(castFairPlayVoteSchema.safeParse({ value: "down", tags: ["other"] }).success).toBe(true);
  });
});
