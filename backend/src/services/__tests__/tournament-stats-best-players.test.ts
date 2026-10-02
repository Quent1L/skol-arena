/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";

mock.module("../../repository/tournament-stats.repository", () => ({
  tournamentStatsRepository: {},
}));

import type { BestDuoEntry } from "@skol-arena/shared";
import { computeBestDuoPlayers, computeBestTeams } from "../tournament-stats.service";

let matchCounter = 0;

/** Entries are keyed by their roster, as they are in a real tournament. */
function side(position: number, playerIds: string[]) {
  const id = [...playerIds].sort().join("-");
  return {
    position,
    entryId: id,
    entry: {
      id,
      players: playerIds.map((playerId) => ({
        playerId,
        player: { id: playerId, displayName: playerId.toUpperCase(), shortName: playerId },
      })),
    },
  };
}

function match(winnerSide: "A" | "B" | null, sideA: string[], sideB: string[]) {
  return {
    id: `m${matchCounter++}`,
    winnerSide,
    playedAt: new Date(),
    outcomeTypeId: null,
    outcomeType: null,
    sides: [side(1, sideA), side(2, sideB)],
  };
}

/** `n` 2v2 matches where the first pair beats the second. */
function series(winners: [string, string], losers: [string, string], n: number) {
  return Array.from({ length: n }, () => match("A", winners, losers));
}

function entryOf(entries: BestDuoEntry[], playerId: string) {
  return entries.find((entry) => entry.playerId === playerId);
}

describe("computeBestDuoPlayers", () => {
  it("ranks on the win rate weighted by sample size", () => {
    const matches = [
      // regular: 16 wins over 20 matches → 80 % on a real sample.
      ...series(["regular", "mate"], ["foil", "foil2"], 16),
      ...series(["foil", "foil2"], ["regular", "mate"], 4),
      // lucky: 3-0 and gone.
      ...series(["lucky", "mate2"], ["foil", "foil2"], 3),
    ];

    const best = computeBestDuoPlayers(matches as any).entries;
    const regular = entryOf(best, "regular")!;
    const lucky = entryOf(best, "lucky")!;

    expect(regular).toMatchObject({ matchesPlayed: 20, winRate: 80 });
    // A perfect record on three matches no longer outranks a season-long one.
    expect(lucky.winRate).toBe(100);
    expect(best.indexOf(regular)).toBeLessThan(best.indexOf(lucky));
    // The card draws its bars from `score`, so it has to decrease along the ranking
    // even where the raw win rate goes up.
    expect(regular.score).toBeGreaterThan(lucky.score);
  });

  it("keeps players below the sample threshold out while anyone clears it", () => {
    const matches = [
      ...series(["regular", "mate"], ["foil", "foil2"], 5),
      // One match, won: not enough to be ranked at all.
      ...series(["oneshot", "mate2"], ["foil", "foil2"], 1),
    ];

    const board = computeBestDuoPlayers(matches as any);

    expect(board.entries.map((entry) => entry.playerId)).not.toContain("oneshot");
    expect(entryOf(board.entries, "regular")).toMatchObject({ matchesPlayed: 5, winRate: 100 });
    expect(board.isLowSample).toBe(false);
  });

  it("falls back to the small samples rather than showing an empty card", () => {
    // A tournament two matches old: nobody clears the threshold yet.
    const board = computeBestDuoPlayers(series(["a", "b"], ["c", "d"], 2) as any);

    expect(entryOf(board.entries, "a")).toMatchObject({ matchesPlayed: 2, winRate: 100 });
    // ...and the card is told so, rather than passing a two-match sample off as a ranking.
    expect(board.isLowSample).toBe(true);
  });

  it("gives the same rank to players nothing separates", () => {
    // The two winners share every match, so no criterion can put one above the other.
    const best = computeBestDuoPlayers(series(["a", "b"], ["c", "d"], 4) as any).entries;

    expect(entryOf(best, "a")).toMatchObject({ rank: 1, tiedCount: 2 });
    expect(entryOf(best, "b")).toMatchObject({ rank: 1, tiedCount: 2 });
  });

  it("counts draws in the denominator", () => {
    const matches = [...series(["a", "b"], ["c", "d"], 3), match(null, ["a", "b"], ["c", "d"])];

    const best = computeBestDuoPlayers(matches as any).entries;

    expect(entryOf(best, "a")).toMatchObject({ wins: 3, matchesPlayed: 4, winRate: 75 });
  });
});

describe("computeBestTeams", () => {
  it("puts a long winning record above a single perfect night", () => {
    const matches = [
      ...series(["regular", "mate"], ["foil", "foil2"], 9),
      ...series(["foil", "foil2"], ["regular", "mate"], 3),
      ...series(["lucky", "mate2"], ["foil", "foil2"], 2),
    ];

    const teams = computeBestTeams(matches as any).entries;

    expect(teams[0]).toMatchObject({ winRate: 75, matchesPlayed: 12 });
    expect(teams[0]!.displayName).toContain("REGULAR");
    // Two matches is below the threshold, and others clear it.
    expect(teams.some((team) => team.displayName.includes("LUCKY"))).toBe(false);
  });

  it("carries the roster so the card can draw an avatar and a link per player", () => {
    const teams = computeBestTeams(series(["regular", "mate"], ["foil", "foil2"], 4) as any).entries;

    expect(teams[0]!.players).toEqual([
      { playerId: "regular", displayName: "REGULAR", shortName: "regular" },
      { playerId: "mate", displayName: "MATE", shortName: "mate" },
    ]);
  });
});

describe("computeBestTeams without draws", () => {
  it("counts a tie as played, not as a draw, when draws are not allowed", () => {
    const matches = [
      ...series(["regular", "mate"], ["foil", "foil2"], 3),
      match(null, ["regular", "mate"], ["foil", "foil2"]),
    ];

    const strict = computeBestTeams(matches as any, false).entries;
    const regular = strict.find((team) => team.displayName.includes("REGULAR"))!;
    expect(regular).toMatchObject({ wins: 3, draws: 0, matchesPlayed: 4, winRate: 75 });

    const lenient = computeBestTeams(matches as any, true).entries;
    expect(lenient.find((team) => team.displayName.includes("REGULAR"))).toMatchObject({
      draws: 1,
      matchesPlayed: 4,
      winRate: 75,
    });
  });
});
