import { describe, it, expect, mock } from "bun:test";

mock.module("../../config/database", () => ({ db: {} }));

import { REWIND_MIN_MATCHES_SNIPER, type RewindPlayerRef } from "@skol-arena/shared/types/index";
import {
  awardsWonBy,
  computeCombatAwards,
  computeCooperationAwards,
  computeDuoAward,
  computeEnduranceAwards,
  computePercentiles,
  computePerformanceAwards,
  computeRivalry,
  countNemesisVictims,
  countPartnerFans,
  percentileEntry,
} from "../season-rewind.awards";
import type { PairTally, PlayerAggregate } from "../season-rewind.replay";

function agg(playerId: string, overrides: Partial<PlayerAggregate> = {}): PlayerAggregate {
  return {
    playerId,
    matchesPlayed: 10,
    wins: 5,
    losses: 5,
    draws: 0,
    initialMmr: 1000,
    finalMmr: 1000,
    peakMmr: 1000,
    peakMatchId: null,
    peakPlayedAt: null,
    bestRank: 1,
    matchesInTop1: 0,
    matchesInTop3: 0,
    matchesInTop5: 0,
    bestWinStreak: 0,
    bestWinStreakMmr: 0,
    bestUnbeatenStreak: 0,
    worstLossStreak: 0,
    worstLossStreakMmr: 0,
    giantKillerWins: 0,
    winsVsRank1: 0,
    bestMmrGain: null,
    biggestUpsetGap: null,
    points: [],
    currentWinStreak: 0,
    currentWinStreakMmr: 0,
    currentUnbeatenStreak: 0,
    currentLossStreak: 0,
    currentLossStreakMmr: 0,
    ...overrides,
  };
}

function directoryOf(...playerIds: string[]): Map<string, RewindPlayerRef> {
  return new Map(
    playerIds.map((id) => [id, { playerId: id, displayName: id.toUpperCase(), shortName: id.slice(0, 3) }]),
  );
}

function tally(aId: string, bId: string, over: Partial<PairTally> = {}): PairTally {
  return { aId, bId, matches: 10, aWins: 5, aLosses: 5, draws: 0, ...over };
}

describe("performance awards", () => {
  const directory = directoryOf("a", "b", "c");

  it("crowns the top of the final ranking as king, whatever their other stats", () => {
    const awards = computePerformanceAwards([agg("a", { finalMmr: 1200 }), agg("b", { finalMmr: 1500 })], directory, [
      "b",
      "a",
    ]);

    expect(awards.king!.player.playerId).toBe("b");
    expect(awards.king!.value).toBe(1500);
  });

  it("skips a ladder leader who never played rather than showing no king", () => {
    // player_mmr also holds auto-registered players who never played: in a small
    // season they can top a ladder where every active player finished lower.
    const awards = computePerformanceAwards([agg("a", { finalMmr: 900 }), agg("b", { finalMmr: 800 })], directory, [
      "c",
      "a",
      "b",
    ]);

    expect(awards.king!.player.playerId).toBe("a");
  });

  it("has no king when nobody in the season played", () => {
    expect(computePerformanceAwards([], directory, ["c"]).king).toBeNull();
  });

  it("awards the peak to the highest MMR ever reached through a match", () => {
    const awards = computePerformanceAwards(
      [
        agg("a", { peakMmr: 1400, peakMatchId: "m1", peakPlayedAt: new Date() }),
        agg("b", { peakMmr: 1600, peakMatchId: "m2", peakPlayedAt: new Date() }),
      ],
      directory,
      ["a", "b"],
    );

    expect(awards.peakMmr!.player.playerId).toBe("b");
    expect(awards.peakMmr!.matchId).toBe("m2");
  });

  it("ignores a peak nobody actually climbed to", () => {
    const awards = computePerformanceAwards([agg("a", { peakMmr: 9999, peakMatchId: null })], directory, ["a"]);

    expect(awards.peakMmr).toBeNull();
  });

  it("ranks progression on the net gain, not the final MMR", () => {
    const awards = computePerformanceAwards(
      [agg("a", { initialMmr: 1000, finalMmr: 1400 }), agg("b", { initialMmr: 1300, finalMmr: 1500 })],
      directory,
      ["b", "a"],
    );

    expect(awards.progression!.player.playerId).toBe("a");
    expect(awards.progression!.value).toBe(400);
  });

  it("requires REWIND_MIN_MATCHES_SNIPER matches for the sniper award", () => {
    const belowThreshold = computePerformanceAwards(
      [
        agg("a", {
          matchesPlayed: REWIND_MIN_MATCHES_SNIPER - 1,
          wins: REWIND_MIN_MATCHES_SNIPER - 1,
        }),
      ],
      directory,
      ["a"],
    );
    expect(belowThreshold.sniper).toBeNull();

    const atThreshold = computePerformanceAwards(
      [agg("a", { matchesPlayed: REWIND_MIN_MATCHES_SNIPER, wins: 16 })],
      directory,
      ["a"],
    );
    expect(atThreshold.sniper!.value).toBe(80);
  });

  it("prefers the better win rate over the bigger sample once both qualify", () => {
    const awards = computePerformanceAwards(
      [agg("a", { matchesPlayed: 100, wins: 60 }), agg("b", { matchesPlayed: REWIND_MIN_MATCHES_SNIPER, wins: 18 })],
      directory,
      ["a", "b"],
    );

    expect(awards.sniper!.player.playerId).toBe("b");
  });
});

describe("combat awards", () => {
  const directory = directoryOf("a", "b", "c");

  it("counts giant-killer wins rather than measuring a gap", () => {
    const awards = computeCombatAwards(
      [agg("a", { giantKillerWins: 3 }), agg("b", { giantKillerWins: 7 })],
      directory,
      [],
    );

    expect(awards.giantKiller!.player.playerId).toBe("b");
    expect(awards.giantKiller!.value).toBe(7);
  });

  it("awards the biggest upset on the widest gap overturned in one match", () => {
    const feat = (gap: number, delta: number) => ({
      matchId: `m-${gap}`,
      playedAt: new Date(),
      opponentId: "c",
      mmrDelta: delta,
      mmrGap: gap,
      teamSize: 2,
      opponentTeamSize: 2,
    });

    const awards = computeCombatAwards(
      [agg("a", { biggestUpsetGap: feat(120, 90) }), agg("b", { biggestUpsetGap: feat(342, 20) })],
      directory,
      [],
    );

    expect(awards.biggestUpset!.player.playerId).toBe("b");
    expect(awards.biggestUpset!.value).toBe(342);
    expect(awards.biggestUpset!.opponent!.playerId).toBe("c");
    // The format travels with the award: a gap only reads next to it.
    expect(awards.biggestUpset!.format).toEqual({ teamSize: 2, opponentTeamSize: 2 });
  });

  it("ranks the leader hunter on wins against the standing #1", () => {
    const awards = computeCombatAwards([agg("a", { winsVsRank1: 4 }), agg("b", { winsVsRank1: 1 })], directory, []);

    expect(awards.leaderHunter!.player.playerId).toBe("a");
  });

  it("returns no award when nobody scored on the metric", () => {
    const awards = computeCombatAwards([agg("a"), agg("b")], directory, []);
    expect(awards.giantKiller).toBeNull();
    expect(awards.leaderHunter).toBeNull();
  });
});

describe("computeRivalry", () => {
  const directory = directoryOf("a", "b", "c", "d");

  it("picks the most played duel", () => {
    const rivalry = computeRivalry([tally("a", "b", { matches: 8 }), tally("c", "d", { matches: 20 })], directory);

    expect(rivalry!.players.map((p) => p.playerId)).toEqual(["c", "d"]);
    expect(rivalry!.matchesPlayed).toBe(20);
  });

  it("ignores duels below the minimum", () => {
    expect(computeRivalry([tally("a", "b", { matches: 4 })], directory)).toBeNull();
  });

  it("reports the record from the first player's point of view", () => {
    const rivalry = computeRivalry([tally("a", "b", { matches: 10, aWins: 7, aLosses: 2, draws: 1 })], directory);

    expect(rivalry).toMatchObject({ wins: 7, losses: 2, draws: 1 });
  });
});

describe("countNemesisVictims", () => {
  it("scores a player for each opponent holding a losing record against them", () => {
    // a loses to c, b loses to c: c is everyone's problem.
    const scores = countNemesisVictims([
      tally("a", "c", { aWins: 2, aLosses: 8 }),
      tally("b", "c", { aWins: 3, aLosses: 7 }),
      tally("a", "b", { aWins: 5, aLosses: 5 }),
    ]);

    expect(scores.get("c")).toBe(2);
    expect(scores.has("a")).toBe(false);
  });

  it("ignores pairs that have not met often enough to mean anything", () => {
    const scores = countNemesisVictims([tally("a", "b", { matches: 4, aWins: 0, aLosses: 4 })]);
    expect(scores.size).toBe(0);
  });

  it("scores nobody on an even record", () => {
    const scores = countNemesisVictims([tally("a", "b", { aWins: 5, aLosses: 5 })]);
    expect(scores.size).toBe(0);
  });
});

describe("cooperation awards", () => {
  const directory = directoryOf("a", "b", "c", "d");

  it("requires 10 matches together for the duo award", () => {
    expect(computeDuoAward([tally("a", "b", { matches: 9, aWins: 9 })], directory)).toBeNull();
    expect(computeDuoAward([tally("a", "b", { matches: 10, aWins: 9 })], directory)).not.toBeNull();
  });

  it("weights the win rate by sample size so a short hot streak does not win", () => {
    const duo = computeDuoAward(
      [
        tally("a", "b", { matches: 10, aWins: 10, aLosses: 0 }),
        tally("c", "d", { matches: 60, aWins: 54, aLosses: 6 }),
      ],
      directory,
    );

    expect(duo!.players.map((p) => p.playerId)).toEqual(["c", "d"]);
    expect(duo!.winRate).toBe(90);
  });

  it("counts a best partner for each teammate with a winning record", () => {
    const scores = countPartnerFans([
      tally("a", "b", { aWins: 8, aLosses: 2 }),
      tally("a", "c", { aWins: 7, aLosses: 3 }),
    ]);

    expect(scores.get("a")).toBe(2);
    expect(scores.get("b")).toBe(1);
  });

  it("exposes both cooperation awards together", () => {
    const awards = computeCooperationAwards([agg("a"), agg("b")], directory, [
      tally("a", "b", { aWins: 8, aLosses: 2 }),
    ]);

    expect(awards.duo!.players.map((p) => p.playerId)).toEqual(["a", "b"]);
    expect(awards.bestPartner).not.toBeNull();
  });
});

describe("endurance awards", () => {
  const directory = directoryOf("a", "b");

  it("ranks top residency in matches", () => {
    const awards = computeEnduranceAwards(
      [agg("a", { matchesInTop1: 12, matchesInTop5: 40 }), agg("b", { matchesInTop1: 30, matchesInTop5: 35 })],
      directory,
    );

    expect(awards.topOneKing!.player.playerId).toBe("b");
    expect(awards.topFiveKing!.player.playerId).toBe("a");
  });

  it("ranks the marathon on matches played and the streak on consecutive wins", () => {
    const awards = computeEnduranceAwards(
      [agg("a", { matchesPlayed: 247, bestWinStreak: 4 }), agg("b", { matchesPlayed: 90, bestWinStreak: 11 })],
      directory,
    );

    expect(awards.marathon!.value).toBe(247);
    expect(awards.longestStreak!.player.playerId).toBe("b");
  });
});

describe("tie-breaks", () => {
  const directory = directoryOf("a", "b");

  it("prefers the player with more matches on an equal value", () => {
    const awards = computeEnduranceAwards(
      [agg("a", { bestWinStreak: 5, matchesPlayed: 20 }), agg("b", { bestWinStreak: 5, matchesPlayed: 60 })],
      directory,
    );

    expect(awards.longestStreak!.player.playerId).toBe("b");
  });

  it("then prefers more wins", () => {
    const awards = computeEnduranceAwards(
      [
        agg("a", { bestWinStreak: 5, matchesPlayed: 40, wins: 10 }),
        agg("b", { bestWinStreak: 5, matchesPlayed: 40, wins: 31 }),
      ],
      directory,
    );

    expect(awards.longestStreak!.player.playerId).toBe("b");
  });

  it("then prefers the higher final MMR, and then the higher peak", () => {
    const base = { bestWinStreak: 5, matchesPlayed: 40, wins: 20 };
    const byFinal = computeEnduranceAwards(
      [agg("a", { ...base, finalMmr: 1100 }), agg("b", { ...base, finalMmr: 1400 })],
      directory,
    );
    expect(byFinal.longestStreak!.player.playerId).toBe("b");

    const byPeak = computeEnduranceAwards(
      [agg("a", { ...base, finalMmr: 1200, peakMmr: 1600 }), agg("b", { ...base, finalMmr: 1200, peakMmr: 1250 })],
      directory,
    );
    expect(byPeak.longestStreak!.player.playerId).toBe("a");
  });

  it("falls back to the lower player id once no result separates them", () => {
    const aggregates = [
      agg("b", { bestWinStreak: 5, matchesPlayed: 20 }),
      agg("a", { bestWinStreak: 5, matchesPlayed: 20 }),
    ];

    expect(computeEnduranceAwards(aggregates, directory).longestStreak!.player.playerId).toBe("a");
    // Same input in the opposite order must still crown the same player.
    expect(computeEnduranceAwards([...aggregates].reverse(), directory).longestStreak!.player.playerId).toBe("a");
  });

  it("ignores display names, so renaming a player never moves an award", () => {
    const aggregates = [agg("a", { bestWinStreak: 5 }), agg("b", { bestWinStreak: 5 })];
    const rename = (a: string, b: string) =>
      new Map([
        ["a", { playerId: "a", displayName: a, shortName: a.slice(0, 3) }],
        ["b", { playerId: "b", displayName: b, shortName: b.slice(0, 3) }],
      ]);

    // "a" wins on the id. Handing "b" a name that sorts first must not move it.
    expect(computeEnduranceAwards(aggregates, rename("Zoe", "Alice")).longestStreak!.player.playerId).toBe("a");
    expect(computeEnduranceAwards(aggregates, rename("Alice", "Zoe")).longestStreak!.player.playerId).toBe("a");
  });

  it("orders tied rivalries on both ids, not on the first alone", () => {
    // Same aId, same match count: without the second id the winner is whichever
    // tally the map happened to yield first.
    const tallies = [tally("a", "z", { matches: 8 }), tally("a", "b", { matches: 8 })];
    const pairOf = (input: PairTally[]) =>
      computeRivalry(input, directoryOf("a", "b", "z"))!.players.map((p) => p.playerId);

    expect(pairOf(tallies)).toEqual(["a", "b"]);
    expect(pairOf([...tallies].reverse())).toEqual(["a", "b"]);
  });

  it("orders duos with an identical score the same way every time", () => {
    // Identical records, so identical rate × √matches: the id chain decides.
    const tallies = [
      tally("b", "c", { matches: 12, aWins: 9, aLosses: 3 }),
      tally("a", "d", { matches: 12, aWins: 9, aLosses: 3 }),
    ];
    const pairOf = (input: PairTally[]) =>
      computeDuoAward(input, directoryOf("a", "b", "c", "d"))!.players.map((p) => p.playerId);

    expect(pairOf(tallies)).toEqual(["a", "d"]);
    expect(pairOf([...tallies].reverse())).toEqual(["a", "d"]);
  });
});

describe("percentileEntry", () => {
  it("puts the best value in the top slice and the worst at 100", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentileEntry(values, 100)).toEqual({ topPercent: 10, rank: 1, poolSize: 10 });
    expect(percentileEntry(values, 10)).toEqual({ topPercent: 100, rank: 10, poolSize: 10 });
  });

  it("gives tied players the same standing", () => {
    const values = [50, 50, 10];
    expect(percentileEntry(values, 50)).toEqual({ topPercent: 33, rank: 1, poolSize: 3 });
  });

  it("never claims better than top 1 %", () => {
    expect(percentileEntry([5], 5).topPercent).toBe(100);
    expect(
      percentileEntry(
        Array.from({ length: 500 }, (_, i) => i),
        499,
      ),
    ).toEqual({ topPercent: 1, rank: 1, poolSize: 500 });
  });

  it("stays on the first position when it has nobody to compare against", () => {
    expect(percentileEntry([], 5)).toEqual({ topPercent: 100, rank: 1, poolSize: 0 });
  });
});

describe("computePercentiles", () => {
  it("reports where a player sits on each metric", () => {
    const aggregates = [
      agg("a", { matchesPlayed: 100, wins: 90, initialMmr: 1000, finalMmr: 1500, bestWinStreak: 12 }),
      agg("b", { matchesPlayed: 50, wins: 10, initialMmr: 1000, finalMmr: 900, bestWinStreak: 2 }),
    ];

    const first = { topPercent: 50, rank: 1, poolSize: 2 };
    const top = computePercentiles(aggregates, aggregates[0]!);
    expect(top).toEqual({
      matchesPlayed: first,
      winRate: first,
      progression: first,
      winStreak: first,
    });

    const bottom = computePercentiles(aggregates, aggregates[1]!);
    expect(bottom.winRate).toEqual({ topPercent: 100, rank: 2, poolSize: 2 });
  });

  it("keeps one-match players out of the rate percentiles", () => {
    const regulars = Array.from({ length: 4 }, (_, i) => agg(`r${i}`, { matchesPlayed: 40, wins: 20 + i }));
    const target = regulars[3]!;

    // A perfect 1-0 record would otherwise sit above every season regular.
    const withRookie = [...regulars, agg("rookie", { matchesPlayed: 1, wins: 1 })];
    expect(computePercentiles(withRookie, target).winRate).toEqual(computePercentiles(regulars, target).winRate);
  });

  it("compares against the whole field when almost nobody clears the threshold", () => {
    // A short season: dropping everyone would leave the target ranked alone.
    const aggregates = [agg("a", { matchesPlayed: 6, wins: 5 }), agg("b", { matchesPlayed: 4, wins: 1 })];

    expect(computePercentiles(aggregates, aggregates[0]!).winRate).toEqual({
      topPercent: 50,
      rank: 1,
      poolSize: 2,
    });
    expect(computePercentiles(aggregates, aggregates[1]!).winRate).toEqual({
      topPercent: 100,
      rank: 2,
      poolSize: 2,
    });
  });

  it("ranks a player below the threshold inside the pool it compares them to", () => {
    const regulars = Array.from({ length: 3 }, (_, i) => agg(`r${i}`, { matchesPlayed: 40, wins: 30 }));
    const rookie = agg("rookie", { matchesPlayed: 2, wins: 0 });

    // The rookie is not eligible but must still be counted in their own ranking.
    expect(computePercentiles([...regulars, rookie], rookie).winRate).toEqual({
      topPercent: 100,
      rank: 4,
      poolSize: 4,
    });
  });
});

describe("awardsWonBy", () => {
  const directory = directoryOf("a", "b", "c");

  function groups() {
    return {
      performance: computePerformanceAwards(
        [agg("a", { matchesPlayed: REWIND_MIN_MATCHES_SNIPER, wins: 20, finalMmr: 1500 })],
        directory,
        ["a"],
      ),
      combat: computeCombatAwards([agg("a", { giantKillerWins: 5 })], directory, []),
      endurance: computeEnduranceAwards([agg("a", { matchesPlayed: 40 })], directory),
      cooperation: computeCooperationAwards([agg("a"), agg("b")], directory, [
        tally("a", "b", { aWins: 9, aLosses: 1 }),
      ]),
    };
  }

  it("lists every award the player holds", () => {
    const won = awardsWonBy("a", groups());
    expect(won).toContain("king");
    expect(won).toContain("sniper");
    expect(won).toContain("giantKiller");
    expect(won).toContain("marathon");
  });

  it("credits both members of a pair award", () => {
    expect(awardsWonBy("b", groups())).toContain("duo");
  });

  it("returns nothing for a player who won none", () => {
    expect(awardsWonBy("c", groups())).toEqual([]);
  });
});
