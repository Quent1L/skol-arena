import { describe, it, expect, mock } from "bun:test";

mock.module("../../config/database", () => ({ db: {} }));

import { mergeSeasonMmrStats } from "../ranked-season.service";
import type { ClientPlayerMmr } from "@skol-arena/shared/types/index";
import type { SeasonMmrStatsRow } from "../../repository/player-mmr.repository";

function player(playerId: string, currentMmr: number): ClientPlayerMmr {
  return {
    id: `mmr-${playerId}`,
    seasonId: "season-1",
    playerId,
    currentMmr,
    matchesPlayed: 10,
    wins: 5,
    losses: 5,
    draws: 0,
    winStreak: 0,
    maxWinStreak: 3,
    lossStreak: 0,
    maxLossStreak: 2,
    player: { id: playerId, displayName: playerId.toUpperCase(), shortName: playerId.slice(0, 3) },
  };
}

function stat(playerId: string, peakMmr: number, avgMmr: number): SeasonMmrStatsRow {
  return { playerId, peakMmr, avgMmr, matchesPlayed: 10 };
}

describe("mergeSeasonMmrStats", () => {
  it("attaches the season aggregates to each leaderboard row", () => {
    const merged = mergeSeasonMmrStats(
      [player("a", 1000), player("b", 1200)],
      [stat("a", 1150, 1040), stat("b", 1300, 1210)],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ playerId: "a", peakMmr: 1150, avgMmr: 1040, currentMmr: 1000 });
    expect(merged[1]).toMatchObject({ playerId: "b", peakMmr: 1300, avgMmr: 1210 });
  });

  it("keeps the player relation carried by the leaderboard row", () => {
    const merged = mergeSeasonMmrStats([player("a", 1000)], [stat("a", 1150, 1040)]);
    expect(merged[0].player).toEqual({ id: "a", displayName: "A", shortName: "a" });
  });

  it("drops players filtered out by the placement threshold", () => {
    const merged = mergeSeasonMmrStats([player("a", 1000), player("b", 1200)], [stat("b", 1300, 1210)]);
    expect(merged.map((p) => p.playerId)).toEqual(["b"]);
  });

  it("drops registered players who never played a match", () => {
    expect(mergeSeasonMmrStats([player("a", 1000)], [])).toEqual([]);
  });

  it("ignores stats without a matching leaderboard row", () => {
    const merged = mergeSeasonMmrStats([player("a", 1000)], [stat("a", 1150, 1040), stat("ghost", 9999, 9999)]);
    expect(merged.map((p) => p.playerId)).toEqual(["a"]);
  });

  it("preserves the incoming order, leaving the ranking to the caller", () => {
    const merged = mergeSeasonMmrStats(
      [player("a", 1000), player("b", 1200)],
      [stat("a", 1900, 1800), stat("b", 1300, 1210)],
    );
    expect(merged.map((p) => p.playerId)).toEqual(["a", "b"]);
  });

  it("returns an empty list for a season nobody played", () => {
    expect(mergeSeasonMmrStats([], [])).toEqual([]);
  });
});
