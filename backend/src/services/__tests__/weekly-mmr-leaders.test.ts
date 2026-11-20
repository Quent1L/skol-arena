import { describe, it, expect, mock } from "bun:test";

mock.module("../../config/database", () => ({ db: {} }));

import { splitWeeklyMmrLeaders, startOfWeekUtc } from "../ranked-season.service";
import type { WeeklyMmrLeader } from "@skol-arena/shared/types/index";

function row(playerId: string, mmrGained: number, matchesPlayed = 1): WeeklyMmrLeader {
  return {
    playerId,
    displayName: playerId.toUpperCase(),
    shortName: playerId.slice(0, 3),
    mmrGained,
    matchesPlayed,
  };
}

describe("splitWeeklyMmrLeaders", () => {
  it("keeps the 3 biggest gains, descending", () => {
    const { gainers } = splitWeeklyMmrLeaders([row("a", 12), row("b", 48), row("c", 3), row("d", 30)]);
    expect(gainers.map((g) => g.playerId)).toEqual(["b", "d", "a"]);
  });

  it("keeps the 3 heaviest drops, most negative first", () => {
    const { losers } = splitWeeklyMmrLeaders([row("a", -12), row("b", -48), row("c", -3), row("d", -30)]);
    expect(losers.map((l) => l.playerId)).toEqual(["b", "d", "a"]);
  });

  it("excludes players who broke even from both lists", () => {
    const { gainers, losers } = splitWeeklyMmrLeaders([row("a", 0), row("b", 5), row("c", -5)]);
    expect(gainers.map((g) => g.playerId)).toEqual(["b"]);
    expect(losers.map((l) => l.playerId)).toEqual(["c"]);
  });

  it("returns empty lists when nobody played", () => {
    expect(splitWeeklyMmrLeaders([])).toEqual({ gainers: [], losers: [] });
  });

  it("honours custom list sizes", () => {
    const rows = [row("a", 10), row("b", 20), row("c", -10), row("d", -20)];
    const { gainers, losers } = splitWeeklyMmrLeaders(rows, 1, 1);
    expect(gainers.map((g) => g.playerId)).toEqual(["b"]);
    expect(losers.map((l) => l.playerId)).toEqual(["d"]);
  });
});

describe("startOfWeekUtc", () => {
  it("rewinds mid-week to the preceding Monday at midnight", () => {
    // Thursday 2026-07-30T14:22Z
    expect(startOfWeekUtc(new Date("2026-07-30T14:22:00Z")).toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  it("keeps a Monday on its own day", () => {
    expect(startOfWeekUtc(new Date("2026-07-27T09:00:00Z")).toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(startOfWeekUtc(new Date("2026-08-02T23:59:00Z")).toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });
});
