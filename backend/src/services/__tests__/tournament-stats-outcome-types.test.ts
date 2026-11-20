/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";

mock.module("../../repository/tournament-stats.repository", () => ({
  tournamentStatsRepository: {},
}));

import { computeOutcomeTypeFunStats } from "../tournament-stats.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function side(position: number, playerIds: string[]) {
  return {
    position,
    entryId: `e${position}`,
    entry: {
      id: `e${position}`,
      players: playerIds.map((id) => ({
        playerId: id,
        player: { id, displayName: id.toUpperCase(), shortName: id },
      })),
    },
  };
}

/**
 * One finalized match of `typeId`. winnerSide "A" makes sideA win, "B" makes it lose,
 * null is a draw.
 */
function match(
  typeId: string | null,
  winnerSide: "A" | "B" | null,
  sideA: string[],
  sideB: string[],
  typeName = typeId,
) {
  return {
    id: `m-${Math.round(performance.now() * 1000)}-${sideA.join()}-${sideB.join()}`,
    winnerSide,
    playedAt: new Date(),
    outcomeTypeId: typeId,
    outcomeType: typeId ? { id: typeId, name: typeName!, isDefault: false } : null,
    sides: [side(1, sideA), side(2, sideB)],
  };
}

/** `n` matches of `typeId` where `winner` beats `loser`. */
function series(typeId: string, winner: string, loser: string, n: number) {
  return Array.from({ length: n }, () => match(typeId, "A", [winner], [loser]));
}

/**
 * Outcome names now come from the competition's ruleset snapshot rather than a
 * join off the match, so the fixtures' own type ids and names are turned into
 * one here.
 */
function funStats(matches: ReturnType<typeof match>[]) {
  const seen = new Map<string, string>();
  for (const m of matches) {
    if (m.outcomeTypeId && m.outcomeType) seen.set(m.outcomeTypeId, m.outcomeType.name);
  }

  const ruleset: any = {
    discipline: null,
    outcomeTypes: [...seen].map(([id, name]) => ({
      id,
      name,
      points: 3,
      mmrMultiplier: 1,
      scoreCountsForMmr: true,
      isDefault: false,
      archivedAt: null,
      reasons: [],
    })),
  };

  return computeOutcomeTypeFunStats(matches as any, ruleset);
}

function stat(stats: ReturnType<typeof computeOutcomeTypeFunStats>, typeId: string) {
  const found = stats.find((s) => s.outcomeTypeId === typeId);
  if (!found) throw new Error(`outcome type ${typeId} missing from stats`);
  return found;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("computeOutcomeTypeFunStats", () => {
  it("ranks volume by raw count and efficiency by weighted rate", () => {
    const matches = [
      // grinder: 12 wins but 24 matches played → high volume, 50 % rate
      ...series("normal", "grinder", "filler", 12),
      ...series("normal", "filler", "grinder", 12),
      // sniper: 9 wins over 10 matches → lower volume, 90 % rate
      ...series("normal", "sniper", "filler", 9),
      ...series("normal", "filler", "sniper", 1),
    ];

    const normal = stat(funStats(matches), "normal");

    expect(normal.topWinnersByVolume.leaders[0]!.playerId).toBe("filler");
    expect(normal.topWinnersByVolume.leaders[1]!.playerId).toBe("grinder");
    expect(normal.topWinnersByRate.leaders[0]!.playerId).toBe("sniper");
    expect(normal.topWinnersByRate.leaders[0]!.ratePct).toBe(90);
    expect(normal.topWinnersByRate.isLowSample).toBe(false);
  });

  it("exposes each entry's context: matches played, rate, and share of total", () => {
    const matches = [
      ...series("normal", "a", "b", 6), // a: 6 wins / 8 played
      ...series("normal", "b", "a", 2), // b: 2 wins / 8 played
    ];

    const normal = stat(funStats(matches), "normal");
    const leader = normal.topWinnersByVolume.leaders[0]!;

    expect(normal.totalMatches).toBe(8);
    expect(leader.playerId).toBe("a");
    expect(leader.count).toBe(6);
    expect(leader.matchesPlayed).toBe(8);
    expect(leader.ratePct).toBe(75);
    // 6 of the 8 wins recorded on this outcome type
    expect(leader.sharePct).toBe(75);
  });

  it("counts draws in matches played without inflating wins", () => {
    const matches = [...series("normal", "a", "b", 3), match("normal", null, ["a"], ["b"])];

    const normal = stat(funStats(matches), "normal");
    const a = normal.topWinnersByVolume.leaders[0]!;

    expect(a.count).toBe(3);
    expect(a.matchesPlayed).toBe(4);
    expect(a.ratePct).toBe(75);
  });

  it("excludes players under the threshold from efficiency when others reach it", () => {
    const matches = [
      ...series("normal", "regular", "punchingbag", 5), // 5 played, 100 %
      match("normal", "A", ["rookie"], ["punchingbag"]), // 1 played, 100 %
    ];

    const normal = stat(funStats(matches), "normal");

    expect(normal.topWinnersByRate.leaders.map((p) => p.playerId)).toEqual(["regular"]);
    expect(normal.topWinnersByVolume.leaders.map((p) => p.playerId)).toContain("rookie");
    expect(normal.topWinnersByRate.isLowSample).toBe(false);
  });

  it("raises the threshold and flags a small sample on a rare outcome type", () => {
    // Nobody reaches 3 matches on this type: without the fallback the column is empty.
    const matches = [
      match("fanny", "A", ["a"], ["b"]),
      match("fanny", "A", ["a"], ["c"]),
      match("fanny", "A", ["d"], ["e"]),
    ];

    const fanny = stat(funStats(matches), "fanny");

    expect(fanny.topWinnersByRate.leaders.length).toBeGreaterThan(0);
    expect(fanny.topWinnersByRate.leaders[0]!.playerId).toBe("a");
    expect(fanny.topWinnersByRate.isLowSample).toBe(true);
  });

  it("handles the winner and loser flags independently", () => {
    // "champ" wins 4 times, each victim loses only once → winners pass the threshold,
    // losers do not.
    const matches = [
      match("normal", "A", ["champ"], ["v1"]),
      match("normal", "A", ["champ"], ["v2"]),
      match("normal", "A", ["champ"], ["v3"]),
      match("normal", "A", ["champ"], ["v4"]),
    ];

    const normal = stat(funStats(matches), "normal");

    expect(normal.topWinnersByRate.isLowSample).toBe(false);
    expect(normal.topLosersByRate.isLowSample).toBe(true);
    expect(normal.topLosersByRate.leaders.length).toBeGreaterThan(0);
  });

  it("returns empty rate lists with no flag when the type has only draws", () => {
    const matches = [
      match("draw", null, ["a"], ["b"]),
      match("draw", null, ["a"], ["b"]),
      match("draw", null, ["a"], ["b"]),
    ];

    const drawType = stat(funStats(matches), "draw");

    expect(drawType.topWinnersByVolume.leaders).toEqual([]);
    expect(drawType.topWinnersByRate.leaders).toEqual([]);
    expect(drawType.topLosersByRate.leaders).toEqual([]);
    expect(drawType.topWinnersByRate.isLowSample).toBe(false);
    expect(drawType.topLosersByRate.isLowSample).toBe(false);
  });

  it("computes the share of total across both winners of a 2v2 match", () => {
    const matches = series("normal", "x", "y", 4).map((m) => ({
      ...m,
      sides: [side(1, ["x", "mate"]), side(2, ["y", "opp"])],
    }));

    const normal = stat(funStats(matches), "normal");

    // 8 wins recorded across 4 matches, split evenly between the two team mates
    expect(normal.topWinnersByVolume.leaders.map((p) => p.sharePct)).toEqual([50, 50]);
  });

  it("sorts outcome types by match count descending", () => {
    const matches = [
      ...series("rare", "a", "b", 1),
      ...series("common", "a", "b", 5),
      ...series("medium", "a", "b", 3),
    ];

    const stats = funStats(matches);

    expect(stats.map((s) => s.outcomeTypeId)).toEqual(["common", "medium", "rare"]);
  });

  it("ignores matches without an outcome type and keeps only 3 ranks per list", () => {
    const matches = [
      match(null, "A", ["a"], ["b"]),
      ...series("normal", "a", "z", 5),
      ...series("normal", "b", "z", 4),
      ...series("normal", "c", "z", 3),
      ...series("normal", "d", "z", 2),
    ];

    const stats = funStats(matches);
    const volume = stats[0]!.topWinnersByVolume;

    expect(stats).toHaveLength(1);
    expect(volume.leaders.map((p) => p.playerId)).toEqual(["a", "b", "c"]);
    // "d" has fewer wins than everyone shown: cut for space, but tied with nobody.
    expect(volume.omittedCount).toBe(0);
    expect(volume.omittedNames).toEqual([]);
  });
});

describe("computeOutcomeTypeFunStats — ex aequo", () => {
  it("gives the same rank to players no criterion can separate", () => {
    const matches = [
      ...series("normal", "a", "z", 5),
      ...series("normal", "b", "z", 5),
      ...series("normal", "c", "z", 2),
    ];

    const volume = stat(funStats(matches), "normal").topWinnersByVolume;

    expect(volume.leaders.map((p) => p.rank)).toEqual([1, 1, 3]);
    expect(volume.leaders.map((p) => p.tiedCount)).toEqual([2, 2, 1]);
    expect(volume.isFlat).toBe(false);
  });

  it("ne coupe pas un groupe d'ex aequo au milieu", () => {
    // Ranks 1, 2, 3, 3: the third rank is two players wide and must come whole.
    const matches = [
      ...series("normal", "a", "z", 5),
      ...series("normal", "b", "z", 4),
      ...series("normal", "c", "z", 3),
      ...series("normal", "d", "z", 3),
    ];

    const volume = stat(funStats(matches), "normal").topWinnersByVolume;

    expect(volume.leaders.map((p) => p.playerId)).toEqual(["a", "b", "c", "d"]);
    expect(volume.leaders.map((p) => p.rank)).toEqual([1, 2, 3, 3]);
    expect(volume.omittedCount).toBe(0);
  });

  it("switches to an honor roll when the ranking can't separate anyone", () => {
    // A rare outcome type: four players, one win each, nothing between them.
    const matches = [
      match("fanny", "A", ["a"], ["z"]),
      match("fanny", "A", ["b"], ["z"]),
      match("fanny", "A", ["c"], ["z"]),
      match("fanny", "A", ["d"], ["z"]),
    ];

    const volume = stat(funStats(matches), "fanny").topWinnersByVolume;

    expect(volume.isFlat).toBe(true);
    expect(volume.leaders).toHaveLength(4);
    expect(volume.leaders.every((p) => p.rank === 1 && p.tiedCount === 4)).toBe(true);
  });

  it("keeps the podium spot for the only player who pulled it off", () => {
    const volume = stat(funStats([match("fanny", "A", ["a"], ["z"])]), "fanny").topWinnersByVolume;

    // One winner is not a tie: being alone up there is an achievement, not an ex aequo.
    expect(volume.isFlat).toBe(false);
    expect(volume.leaders).toHaveLength(1);
    expect(volume.leaders[0]).toMatchObject({ playerId: "a", rank: 1, tiedCount: 1 });
  });

  it("only presents as tied the players cut off from their own rank", () => {
    // Seven players on two wins each, then "h" on one: only the seven are tied.
    const winners = ["a", "b", "c", "d", "e", "f", "g"];
    const matches = [...winners.flatMap((w) => series("fanny", w, "z", 2)), match("fanny", "A", ["h"], ["z"])];

    const volume = stat(funStats(matches), "fanny").topWinnersByVolume;

    expect(volume.leaders).toHaveLength(6);
    expect(volume.omittedCount).toBe(1);
    expect(volume.leaders.every((p) => p.rank === 1)).toBe(true);
  });

  it("plafonne le tableau d'honneur et compte le reste", () => {
    const winners = Array.from({ length: 15 }, (_, i) => `p${i}`);
    const matches = winners.map((w) => match("fanny", "A", [w], ["z"]));

    const volume = stat(funStats(matches), "fanny").topWinnersByVolume;

    expect(volume.isFlat).toBe(true);
    expect(volume.leaders).toHaveLength(12);
    expect(volume.omittedCount).toBe(3);
    expect(volume.omittedNames).toHaveLength(3);
  });
});
