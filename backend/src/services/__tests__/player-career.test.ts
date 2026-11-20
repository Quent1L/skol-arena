import { describe, it, expect, mock } from "bun:test";

mock.module("../../config/database", () => ({ db: {} }));

import { buildPlayerCareer, type CareerSeasonRef, type CareerPlayerMmrRef } from "../ranked-season.service";
import type { ClientRankTier } from "@skol-arena/shared/types/index";
import type { PlayerCareerMmrStatsRow } from "../../repository/player-mmr.repository";

function stat(seasonId: string, over: Partial<PlayerCareerMmrStatsRow> = {}): PlayerCareerMmrStatsRow {
  return { seasonId, peakMmr: 1200, avgMmr: 1100, entryMmr: 1000, matchesPlayed: 10, ...over };
}

function season(id: string, over: Partial<CareerSeasonRef> = {}): CareerSeasonRef {
  return {
    id,
    name: `Season ${id}`,
    status: "finished",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    discipline: { id: "disc-1", name: "Babyfoot", icon: "fa fa-futbol" },
    ...over,
  };
}

function tier(seasonId: string, level: number, minMmr: number): ClientRankTier {
  return {
    id: `${seasonId}-${level}`,
    seasonId,
    level,
    name: `Tier ${level}`,
    percentile: 0,
    minMmr,
    subRanks: 1,
    iconClass: null,
    calculatedAt: new Date("2026-01-01"),
  };
}

function record(seasonId: string, over: Partial<CareerPlayerMmrRef> = {}): CareerPlayerMmrRef {
  return { seasonId, currentMmr: 1150, wins: 6, losses: 3, draws: 1, ...over };
}

const noPlacements = new Map<string, number>();

describe("buildPlayerCareer", () => {
  it("joins the aggregates, the season metadata and the closing record", () => {
    const career = buildPlayerCareer(
      [stat("s1")],
      [season("s1")],
      [tier("s1", 1, 700), tier("s1", 2, 1100)],
      [record("s1")],
      new Map([["s1", 5]]),
    );

    expect(career).toHaveLength(1);
    expect(career[0]).toMatchObject({
      seasonId: "s1",
      seasonName: "Season s1",
      seasonStatus: "finished",
      peakMmr: 1200,
      avgMmr: 1100,
      entryMmr: 1000,
      finalMmr: 1150,
      matchesPlayed: 10,
      wins: 6,
      losses: 3,
      draws: 1,
      placementMatches: 5,
      placementsComplete: true,
    });
    expect(career[0].discipline).toEqual({ id: "disc-1", name: "Babyfoot", icon: "fa fa-futbol" });
  });

  it("ships each season its own ladder", () => {
    const career = buildPlayerCareer(
      [stat("s1"), stat("s2")],
      [season("s1"), season("s2")],
      [tier("s1", 1, 700), tier("s2", 1, 900), tier("s2", 2, 1400)],
      [],
      noPlacements,
    );

    expect(career.find((s) => s.seasonId === "s1")!.tiers.map((t) => t.minMmr)).toEqual([700]);
    expect(career.find((s) => s.seasonId === "s2")!.tiers.map((t) => t.minMmr)).toEqual([900, 1400]);
  });

  it("flags a season under the placement threshold instead of dropping it", () => {
    const career = buildPlayerCareer(
      [stat("s1", { matchesPlayed: 3 })],
      [season("s1")],
      [],
      [record("s1")],
      new Map([["s1", 5]]),
    );

    expect(career).toHaveLength(1);
    expect(career[0].placementsComplete).toBe(false);
  });

  it("treats a season with no configured placements as complete", () => {
    const career = buildPlayerCareer(
      [stat("s1", { matchesPlayed: 1 })],
      [season("s1")],
      [],
      [record("s1")],
      noPlacements,
    );

    expect(career[0]).toMatchObject({ placementMatches: 0, placementsComplete: true });
  });

  it("keeps a season whose ladder was never configured", () => {
    const career = buildPlayerCareer([stat("s1")], [season("s1")], [], [record("s1")], noPlacements);
    expect(career[0].tiers).toEqual([]);
  });

  it("falls back to the entry MMR when the season left no player_mmr row", () => {
    const career = buildPlayerCareer([stat("s1")], [season("s1")], [], [], noPlacements);
    expect(career[0]).toMatchObject({ finalMmr: 1000, wins: 0, losses: 0, draws: 0 });
  });

  it("keeps a season whose discipline was deleted", () => {
    const career = buildPlayerCareer(
      [stat("s1")],
      [season("s1", { discipline: null })],
      [],
      [record("s1")],
      noPlacements,
    );

    expect(career).toHaveLength(1);
    expect(career[0].discipline).toBeNull();
  });

  it("drops an aggregate whose season no longer exists", () => {
    const career = buildPlayerCareer([stat("s1"), stat("gone")], [season("s1")], [], [record("s1")], noPlacements);

    expect(career.map((s) => s.seasonId)).toEqual(["s1"]);
  });

  it("ignores the player_mmr row of another season", () => {
    const career = buildPlayerCareer(
      [stat("s1")],
      [season("s1")],
      [],
      [record("s2", { currentMmr: 9999 })],
      noPlacements,
    );

    expect(career[0].finalMmr).toBe(1000);
  });

  it("returns an empty career for a player with no rated match", () => {
    expect(buildPlayerCareer([], [], [], [], noPlacements)).toEqual([]);
  });
});
