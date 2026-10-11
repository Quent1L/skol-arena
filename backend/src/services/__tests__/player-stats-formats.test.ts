import { describe, it, expect, mock } from "bun:test";

mock.module("../../repository/player-stats.repository", () => ({ playerStatsRepository: {} }));
mock.module("../../repository/match-sides.repository", () => ({ matchSidesRepository: {} }));
mock.module("../../repository/player-computed-data.repository", () => ({
  playerComputedDataRepository: {},
}));

import { tallyFormats, type MatchResult } from "../player-stats.service";

/** ownPosition is always 1 here, so winnerSide "A" is a win and "B" a loss. */
function result(
  matchId: string,
  entryId: string,
  oppEntryId: string,
  winnerSide: string | null,
  allowDraw = false,
): MatchResult {
  return {
    matchId,
    entryId,
    ownScore: 0,
    ownPosition: 1,
    winnerSide,
    oppEntryId,
    oppScore: 0,
    allowDraw,
    pointsAwarded: null,
    outcomeTypeId: null,
  };
}

// solo/duo/trio: the player's own entries; the rest are opponents.
const SIZES = new Map([
  ["solo", 1],
  ["duo", 2],
  ["trio", 3],
  ["opp1", 1],
  ["opp2", 2],
  ["opp3", 3],
]);

describe("tallyFormats", () => {
  it("splits the record by format, read from the player's side", () => {
    const formats = tallyFormats(
      [
        result("m1", "solo", "opp1", "A"),
        result("m2", "solo", "opp1", "B"),
        result("m3", "solo", "opp1", "A"),
        result("m4", "duo", "opp2", "B"),
        result("m5", "duo", "opp1", "A"),
        result("m6", "solo", "opp2", "B"),
      ],
      SIZES,
    );

    expect(formats).toEqual([
      { teamSize: 1, opponentSize: 1, wins: 2, losses: 1, draws: 0, matchesPlayed: 3, winRate: 67 },
      { teamSize: 2, opponentSize: 2, wins: 0, losses: 1, draws: 0, matchesPlayed: 1, winRate: 0 },
      { teamSize: 1, opponentSize: 2, wins: 0, losses: 1, draws: 0, matchesPlayed: 1, winRate: 0 },
      { teamSize: 2, opponentSize: 1, wins: 1, losses: 0, draws: 0, matchesPlayed: 1, winRate: 100 },
    ]);
  });

  it("lists even formats first, smallest first", () => {
    const formats = tallyFormats(
      [
        result("m1", "trio", "opp3", "A"),
        result("m2", "solo", "opp3", "A"),
        result("m3", "duo", "opp2", "A"),
        result("m4", "solo", "opp1", "A"),
      ],
      SIZES,
    );

    expect(formats.map((f) => `${f.teamSize}v${f.opponentSize}`)).toEqual(["1v1", "2v2", "3v3", "1v3"]);
  });

  it("counts a draw only where the tournament allows draws", () => {
    const [format] = tallyFormats(
      [result("m1", "solo", "opp1", null, true), result("m2", "solo", "opp1", null, false)],
      SIZES,
    );

    expect(format).toMatchObject({ matchesPlayed: 2, draws: 1, wins: 0, losses: 0, winRate: 0 });
  });

  it("counts a match once even when it comes back on several rows", () => {
    const [format] = tallyFormats(
      [result("m1", "solo", "opp1", "A"), result("m1", "solo", "opp1", "A")],
      SIZES,
    );

    expect(format.matchesPlayed).toBe(1);
  });

  it("skips a match whose side has no known player", () => {
    expect(tallyFormats([result("m1", "solo", "ghost", "A")], SIZES)).toEqual([]);
  });
});
