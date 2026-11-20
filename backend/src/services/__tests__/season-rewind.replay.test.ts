import { describe, it, expect, mock } from "bun:test";

mock.module("../../config/database", () => ({ db: {} }));

import { compareStanding, replaySeason, resolveOutcome, type StandingSource } from "../season-rewind.replay";
import type { SeasonHistoryRow, SeasonSideRow } from "../../repository/season-rewind.repository";

/**
 * Matches are built as 1v1 by default; playedAt increases with the match index
 * so the chronological order the replay relies on is unambiguous.
 */
let clock = 0;

interface MatchSpec {
  matchId: string;
  /** playerId -> [mmrBefore, mmrAfter] */
  sideA: Record<string, [number, number]>;
  sideB: Record<string, [number, number]>;
  winner: "A" | "B" | "draw";
  isPlacement?: boolean;
}

function build(specs: MatchSpec[]): {
  history: SeasonHistoryRow[];
  sides: SeasonSideRow[];
} {
  const history: SeasonHistoryRow[] = [];
  const sides: SeasonSideRow[] = [];
  clock = 0;

  for (const spec of specs) {
    const playedAt = new Date(Date.UTC(2026, 0, 1, 0, clock++));
    const avg = (team: Record<string, [number, number]>) => {
      const values = Object.values(team).map(([before]) => before);
      return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    };

    for (const [position, team, other] of [
      [1, spec.sideA, spec.sideB],
      [2, spec.sideB, spec.sideA],
    ] as const) {
      for (const [playerId, [mmrBefore, mmrAfter]] of Object.entries(team)) {
        sides.push({ matchId: spec.matchId, position, playerId });
        history.push({
          playerId,
          matchId: spec.matchId,
          mmrBefore,
          mmrAfter,
          mmrDelta: mmrAfter - mmrBefore,
          opponentAvgMmr: avg(other),
          isPlacement: spec.isPlacement ?? false,
          outcome: spec.winner === "draw" ? "draw" : (spec.winner === "A") === (position === 1) ? "win" : "loss",
          playedAt,
        });
      }
    }
  }
  return { history, sides };
}

function replay(specs: MatchSpec[]) {
  const { history, sides } = build(specs);
  return replaySeason(history, sides);
}

describe("resolveOutcome", () => {
  it("falls back to the delta sign for legacy rows without an outcome", () => {
    const base = {
      playerId: "a",
      matchId: "m",
      mmrBefore: 1000,
      opponentAvgMmr: 1000,
      isPlacement: false,
      outcome: null,
      playedAt: new Date(),
    };
    expect(resolveOutcome({ ...base, mmrAfter: 1016, mmrDelta: 16 })).toBe("win");
    expect(resolveOutcome({ ...base, mmrAfter: 984, mmrDelta: -16 })).toBe("loss");
  });

  it("refuses to read a zero delta as a draw", () => {
    // A decided match between very unequal players can round to zero: the row is
    // undecidable, not drawn.
    expect(
      resolveOutcome({
        playerId: "a",
        matchId: "m",
        mmrBefore: 1000,
        mmrAfter: 1000,
        mmrDelta: 0,
        opponentAvgMmr: 1000,
        isPlacement: false,
        outcome: null,
        playedAt: new Date(),
      }),
    ).toBeNull();
  });

  it("counts undecidable legacy rows without losing them from the totals", () => {
    const { history, sides } = build([
      { matchId: "m1", sideA: { a: [1000, 1000] }, sideB: { b: [1000, 1000] }, winner: "A" },
    ]);
    const result = replaySeason(
      history.map((row) => ({ ...row, outcome: null })),
      sides,
    );

    expect(result.unresolvedOutcomes).toBe(2);
    expect(result.aggregates.get("a")!).toMatchObject({ matchesPlayed: 1, draws: 1 });
  });
});

describe("replaySeason — per-player totals", () => {
  it("counts wins, losses and draws from the match outcomes", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1016] }, sideB: { b: [1000, 984] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1016, 1000] }, sideB: { b: [984, 1000] }, winner: "B" },
      { matchId: "m3", sideA: { a: [1000, 1000] }, sideB: { b: [1000, 1000] }, winner: "draw" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a).toMatchObject({ matchesPlayed: 3, wins: 1, losses: 1, draws: 1 });
    expect(a.initialMmr).toBe(1000);
    expect(a.finalMmr).toBe(1000);
  });

  it("tracks the peak MMR together with the match that produced it", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1100] }, sideB: { b: [1000, 900] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1100, 1050] }, sideB: { b: [900, 950] }, winner: "B" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a.peakMmr).toBe(1100);
    expect(a.peakMatchId).toBe("m1");
  });

  it("leaves the peak match null when a player never climbs above their start", () => {
    const result = replay([{ matchId: "m1", sideA: { a: [1000, 950] }, sideB: { b: [1000, 1050] }, winner: "B" }]);

    const a = result.aggregates.get("a")!;
    expect(a.peakMmr).toBe(1000);
    expect(a.peakMatchId).toBeNull();
  });
});

describe("replaySeason — streaks", () => {
  it("separates the win streak from the unbeaten streak, which draws extend", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1010] }, sideB: { b: [1000, 990] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1010, 1020] }, sideB: { b: [990, 980] }, winner: "A" },
      { matchId: "m3", sideA: { a: [1020, 1020] }, sideB: { b: [980, 980] }, winner: "draw" },
      { matchId: "m4", sideA: { a: [1020, 1030] }, sideB: { b: [980, 970] }, winner: "A" },
      { matchId: "m5", sideA: { a: [1030, 1010] }, sideB: { b: [970, 990] }, winner: "B" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a.bestWinStreak).toBe(2);
    expect(a.bestUnbeatenStreak).toBe(4);
    expect(a.worstLossStreak).toBe(1);
  });

  it("records the worst losing run even when it is not the last one", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 990] }, sideB: { b: [1000, 1010] }, winner: "B" },
      { matchId: "m2", sideA: { a: [990, 980] }, sideB: { b: [1010, 1020] }, winner: "B" },
      { matchId: "m3", sideA: { a: [980, 970] }, sideB: { b: [1020, 1030] }, winner: "B" },
      { matchId: "m4", sideA: { a: [970, 990] }, sideB: { b: [1030, 1010] }, winner: "A" },
      { matchId: "m5", sideA: { a: [990, 980] }, sideB: { b: [1010, 1020] }, winner: "B" },
    ]);

    expect(result.aggregates.get("a")!.worstLossStreak).toBe(3);
  });

  it("adds up what each run was worth in MMR", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1015] }, sideB: { b: [1000, 985] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1015, 1045] }, sideB: { b: [985, 955] }, winner: "A" },
      { matchId: "m3", sideA: { a: [1045, 1025] }, sideB: { b: [955, 975] }, winner: "B" },
      { matchId: "m4", sideA: { a: [1025, 1000] }, sideB: { b: [975, 1000] }, winner: "B" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a).toMatchObject({
      bestWinStreak: 2,
      bestWinStreakMmr: 45,
      worstLossStreak: 2,
      worstLossStreakMmr: -45,
    });
  });

  it("keeps the richest run when two are the same length", () => {
    const result = replay([
      // Two wins worth 20 in total…
      { matchId: "m1", sideA: { a: [1000, 1005] }, sideB: { b: [1000, 995] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1005, 1020] }, sideB: { b: [995, 980] }, winner: "A" },
      { matchId: "m3", sideA: { a: [1020, 1000] }, sideB: { b: [980, 1000] }, winner: "B" },
      // …then two worth 60, the run actually worth telling.
      { matchId: "m4", sideA: { a: [1000, 1030] }, sideB: { b: [1000, 970] }, winner: "A" },
      { matchId: "m5", sideA: { a: [1030, 1060] }, sideB: { b: [970, 940] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!).toMatchObject({
      bestWinStreak: 2,
      bestWinStreakMmr: 60,
    });
  });
});

describe("replaySeason — ranking residency", () => {
  it("counts time at the top in matches, not in days", () => {
    // a leads after m1 and never gives the lead back: 3 matches at rank 1.
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1100] }, sideB: { b: [1000, 900] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1100, 1200] }, sideB: { b: [900, 800] }, winner: "A" },
      { matchId: "m3", sideA: { a: [1200, 1300] }, sideB: { b: [800, 700] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!.matchesInTop1).toBe(3);
    expect(result.aggregates.get("b")!.matchesInTop1).toBe(0);
    // Only two players, so both sit inside the top 5 the whole way.
    expect(result.aggregates.get("b")!.matchesInTop5).toBe(3);
  });

  it("only credits residency to the players of the match being replayed", () => {
    // a takes the lead and stops playing; b and c keep the season alive. The top
    // spot a still holds must not pay for matches a did not play.
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1300] }, sideB: { b: [1000, 700] }, winner: "A" },
      { matchId: "m2", sideA: { b: [700, 800] }, sideB: { c: [1000, 900] }, winner: "A" },
      { matchId: "m3", sideA: { b: [800, 900] }, sideB: { c: [900, 800] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!.matchesInTop1).toBe(1);
    expect(result.aggregates.get("a")!.matchesPlayed).toBe(1);
  });

  it("never credits more residency than matches played", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1100] }, sideB: { b: [1000, 900] }, winner: "A" },
      { matchId: "m2", sideA: { b: [900, 950] }, sideB: { c: [1000, 950] }, winner: "A" },
    ]);

    for (const agg of result.aggregates.values()) {
      expect(agg.matchesInTop5).toBeLessThanOrEqual(agg.matchesPlayed);
    }
  });

  it("keeps players still in placement out of the standings", () => {
    // b sits on top of the ladder on an inflated provisional MMR. a is the
    // highest settled player, so a is rank 1 — the same answer the leader
    // lookup gives.
    const result = replay([
      {
        matchId: "m1",
        sideA: { b: [1000, 1400] },
        sideB: { c: [1000, 600] },
        winner: "A",
        isPlacement: true,
      },
      { matchId: "m2", sideA: { a: [1000, 1200] }, sideB: { d: [1000, 800] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!.bestRank).toBe(1);
    expect(result.aggregates.get("a")!.matchesInTop1).toBe(1);
    expect(result.aggregates.get("b")!.bestRank).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("remembers the best rank ever held, not the final one", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1200] }, sideB: { b: [1000, 800] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1200, 700] }, sideB: { b: [800, 1300] }, winner: "B" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a.bestRank).toBe(1);
    expect(result.aggregates.get("b")!.bestRank).toBe(1);
  });
});

describe("replaySeason — upsets and giant killing", () => {
  it("counts the wins over an opposition clearly above", () => {
    const result = replay([
      { matchId: "m1", sideA: { a: [900, 930] }, sideB: { b: [1200, 1170] }, winner: "A" },
      { matchId: "m2", sideA: { a: [930, 960] }, sideB: { b: [1170, 1140] }, winner: "A" },
      { matchId: "m3", sideA: { a: [960, 990] }, sideB: { c: [800, 770] }, winner: "A" },
    ]);

    // Only the first two beat someone rated above them.
    expect(result.aggregates.get("a")!.giantKillerWins).toBe(2);
  });

  it("leaves a win over a barely stronger side out of the count", () => {
    // 50 MMR above is not giant killing — the profile's opponent-level split
    // draws the same line at 100.
    const result = replay([{ matchId: "m1", sideA: { a: [1000, 1015] }, sideB: { b: [1050, 1035] }, winner: "A" }]);

    const a = result.aggregates.get("a")!;
    expect(a.giantKillerWins).toBe(0);
    // The record feat still keeps it: it reports the widest gap of the season.
    expect(a.biggestUpsetGap).toMatchObject({ matchId: "m1", mmrGap: 50 });
  });

  it("keeps the largest gap and the largest reward as separate feats", () => {
    const result = replay([
      // Huge gap, small reward.
      { matchId: "m1", sideA: { a: [900, 910] }, sideB: { b: [1400, 1390] }, winner: "A" },
      // Smaller gap, bigger reward.
      { matchId: "m2", sideA: { a: [910, 990] }, sideB: { c: [1000, 920] }, winner: "A" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a.biggestUpsetGap!.matchId).toBe("m1");
    expect(a.biggestUpsetGap!.mmrGap).toBe(500);
    expect(a.bestMmrGain!.matchId).toBe("m2");
    expect(a.bestMmrGain!.mmrDelta).toBe(80);
  });

  it("takes the best-paying match even when it was not an upset", () => {
    // An outcome type with a fat multiplier pays more against a weaker side than
    // a plain win against a stronger one.
    const result = replay([
      { matchId: "m1", sideA: { a: [1000, 1015] }, sideB: { b: [1300, 1285] }, winner: "A" },
      { matchId: "m2", sideA: { a: [1015, 1075] }, sideB: { c: [800, 740] }, winner: "A" },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a.bestMmrGain).toMatchObject({ matchId: "m2", mmrDelta: 60 });
    // That match is still not an upset: the opposition was rated below.
    expect(a.biggestUpsetGap!.matchId).toBe("m1");
  });

  it("ignores wins against a weaker opponent", () => {
    const result = replay([{ matchId: "m1", sideA: { a: [1200, 1210] }, sideB: { b: [900, 890] }, winner: "A" }]);

    const a = result.aggregates.get("a")!;
    expect(a.giantKillerWins).toBe(0);
    expect(a.biggestUpsetGap).toBeNull();
  });

  it("measures the gap between the two sides, not against a single rating", () => {
    // A beginner carried by the best player of the season: their own rating is
    // 500 below the opposition, but the two teams are evenly matched.
    const result = replay([
      {
        matchId: "m1",
        sideA: { weak: [700, 720], carry: [1700, 1720] },
        sideB: { x: [1200, 1180], y: [1200, 1180] },
        winner: "A",
      },
    ]);

    const weak = result.aggregates.get("weak")!;
    expect(weak.giantKillerWins).toBe(0);
    expect(weak.biggestUpsetGap).toBeNull();
  });

  it("still credits a team genuinely outrated as a whole, with the format", () => {
    const result = replay([
      {
        matchId: "m1",
        sideA: { a: [900, 930], b: [900, 930] },
        sideB: { x: [1300, 1270], y: [1300, 1270] },
        winner: "A",
      },
    ]);

    const a = result.aggregates.get("a")!;
    expect(a.giantKillerWins).toBe(1);
    expect(a.biggestUpsetGap).toMatchObject({
      mmrGap: 400,
      teamSize: 2,
      opponentTeamSize: 2,
    });
  });

  it("reports an asymmetric format as it was played", () => {
    const result = replay([
      {
        matchId: "m1",
        sideA: { solo: [1000, 1060] },
        sideB: { x: [1200, 1170], y: [1200, 1170] },
        winner: "A",
      },
    ]);

    expect(result.aggregates.get("solo")!.biggestUpsetGap).toMatchObject({
      mmrGap: 200,
      teamSize: 1,
      opponentTeamSize: 2,
    });
  });
});

describe("replaySeason — leader hunting", () => {
  it("credits a win against the player ranked #1 before the match", () => {
    const result = replay([
      // b climbs to the top.
      { matchId: "m1", sideA: { b: [1000, 1300] }, sideB: { c: [1000, 700] }, winner: "A" },
      // a then beats the standing leader.
      { matchId: "m2", sideA: { a: [1000, 1100] }, sideB: { b: [1300, 1200] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!.winsVsRank1).toBe(1);
  });

  it("does not credit the winner for the #1 spot they take with that very win", () => {
    // a wins the opening match and becomes #1; nobody was leader before it.
    const result = replay([{ matchId: "m1", sideA: { a: [1000, 1100] }, sideB: { b: [1000, 900] }, winner: "A" }]);

    expect(result.aggregates.get("a")!.winsVsRank1).toBe(0);
  });

  it("skips a leader who is still playing placement matches", () => {
    const result = replay([
      // b tops the ladder but every row is a placement row.
      {
        matchId: "m1",
        sideA: { b: [1000, 1300] },
        sideB: { c: [1000, 700] },
        winner: "A",
        isPlacement: true,
      },
      { matchId: "m2", sideA: { a: [1000, 1100] }, sideB: { b: [1300, 1200] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!.winsVsRank1).toBe(0);
  });

  it("hands the leader title to the best settled player when the top is unsettled", () => {
    const result = replay([
      // b tops the ladder on placement rows only — no title to hunt yet.
      {
        matchId: "m1",
        sideA: { b: [1000, 1400] },
        sideB: { c: [1000, 600] },
        winner: "A",
        isPlacement: true,
      },
      // d settles below b, becoming the highest established player.
      { matchId: "m2", sideA: { d: [1000, 1200] }, sideB: { e: [1000, 800] }, winner: "A" },
      // Beating d counts: the leaderboard that matters is the settled one.
      { matchId: "m3", sideA: { a: [1000, 1100] }, sideB: { d: [1200, 1100] }, winner: "A" },
    ]);

    expect(result.aggregates.get("a")!.winsVsRank1).toBe(1);
  });
});

describe("replaySeason — pair tallies", () => {
  it("records teammates as duos and the other side as rivalries", () => {
    const result = replay([
      {
        matchId: "m1",
        sideA: { a: [1000, 1010], b: [1000, 1010] },
        sideB: { c: [1000, 990], d: [1000, 990] },
        winner: "A",
      },
    ]);

    expect(result.duos).toHaveLength(2); // a+b and c+d
    expect(result.rivalries).toHaveLength(4); // every cross-side pair

    const ab = result.duos.find((t) => t.aId === "a" && t.bId === "b")!;
    expect(ab).toMatchObject({ matches: 1, aWins: 1, aLosses: 0 });
  });

  it("keeps a pair's record from the lexicographically first player's side", () => {
    const result = replay([
      { matchId: "m1", sideA: { z: [1000, 1010] }, sideB: { a: [1000, 990] }, winner: "A" },
      { matchId: "m2", sideA: { a: [990, 1000] }, sideB: { z: [1010, 1000] }, winner: "A" },
    ]);

    // Stored under a<z whichever side each player was on.
    const pair = result.rivalries.find((t) => t.aId === "a" && t.bId === "z")!;
    expect(pair).toMatchObject({ matches: 2, aWins: 1, aLosses: 1, draws: 0 });
  });

  it("gives teammates the same result whatever order their ids come in", () => {
    // z is listed first but sorts last: a duo shares its outcome, so the win
    // must not be mirrored the way an opponent's would be.
    const result = replay([
      {
        matchId: "m1",
        sideA: { z: [1000, 1010], a: [1000, 1010] },
        sideB: { c: [1000, 990], d: [1000, 990] },
        winner: "A",
      },
    ]);

    const az = result.duos.find((t) => t.aId === "a" && t.bId === "z")!;
    expect(az).toMatchObject({ matches: 1, aWins: 1, aLosses: 0 });

    // The losing duo is stored the same way, from the pair's point of view.
    const cd = result.duos.find((t) => t.aId === "c" && t.bId === "d")!;
    expect(cd).toMatchObject({ matches: 1, aWins: 0, aLosses: 1 });
  });

  it("counts a draw for both members of a pair", () => {
    const result = replay([{ matchId: "m1", sideA: { a: [1000, 1000] }, sideB: { b: [1000, 1000] }, winner: "draw" }]);

    expect(result.rivalries[0]).toMatchObject({ matches: 1, aWins: 0, aLosses: 0, draws: 1 });
  });
});

/**
 * The standings are maintained incrementally — players are spliced out and back
 * in around their match rather than the whole ladder being re-sorted. That is
 * only safe if it produces exactly what a full sort would, so this reference
 * re-sorts everything after every match and the two are compared over a randomly
 * built season.
 *
 * It calls the production comparator on purpose: what is under test here is the
 * splice-and-binary-search maintenance, not the tie-break rule, and a second
 * copy of that rule would only ever drift from the first.
 */
function referenceResidency(history: SeasonHistoryRow[]) {
  const counters = new Map<string, { bestRank: number; top1: number; top3: number; top5: number }>();
  const source: StandingSource = { currentMmr: new Map(), aggregates: new Map() };
  const settled = new Set<string>();

  for (const rows of groupRows(history)) {
    for (const row of rows) {
      counters.set(
        row.playerId,
        counters.get(row.playerId) ?? {
          bestRank: Number.MAX_SAFE_INTEGER,
          top1: 0,
          top3: 0,
          top5: 0,
        },
      );
      const record = source.aggregates.get(row.playerId) ?? {
        wins: 0,
        peakMmr: row.mmrBefore,
        matchesPlayed: 0,
      };
      record.matchesPlayed++;
      if (row.outcome === "win") record.wins++;
      record.peakMmr = Math.max(record.peakMmr, row.mmrAfter);
      source.aggregates.set(row.playerId, record);

      source.currentMmr.set(row.playerId, row.mmrAfter);
      if (!row.isPlacement) settled.add(row.playerId);
    }

    const ranking = [...source.currentMmr.keys()]
      .filter((playerId) => settled.has(playerId))
      .sort((a, b) => compareStanding(source, a, b));

    const participants = new Set(rows.map((row) => row.playerId));
    ranking.forEach((playerId, index) => {
      if (!participants.has(playerId)) return;
      const entry = counters.get(playerId)!;
      const rank = index + 1;
      entry.bestRank = Math.min(entry.bestRank, rank);
      if (rank <= 1) entry.top1++;
      if (rank <= 3) entry.top3++;
      if (rank <= 5) entry.top5++;
    });
  }
  return counters;
}

function groupRows(history: SeasonHistoryRow[]): SeasonHistoryRow[][] {
  const groups = new Map<string, SeasonHistoryRow[]>();
  for (const row of history) {
    groups.set(row.matchId, [...(groups.get(row.matchId) ?? []), row]);
  }
  return [...groups.values()];
}

describe("compareStanding", () => {
  function sourceOf(
    players: Record<string, { mmr: number; wins?: number; peakMmr?: number; matchesPlayed?: number }>,
  ): StandingSource {
    const entries = Object.entries(players);
    return {
      currentMmr: new Map(entries.map(([id, p]) => [id, p.mmr])),
      aggregates: new Map(
        entries.map(([id, p]) => [
          id,
          {
            wins: p.wins ?? 0,
            peakMmr: p.peakMmr ?? p.mmr,
            matchesPlayed: p.matchesPlayed ?? 0,
          },
        ]),
      ),
    };
  }

  /** Ids are deliberately ordered against the criterion under test each time. */
  it("ranks on MMR first", () => {
    const source = sourceOf({ z: { mmr: 1200 }, a: { mmr: 1100 } });
    expect(compareStanding(source, "z", "a")).toBeLessThan(0);
  });

  it("prefers more wins at equal MMR", () => {
    const source = sourceOf({ z: { mmr: 1000, wins: 20 }, a: { mmr: 1000, wins: 5 } });
    expect(compareStanding(source, "z", "a")).toBeLessThan(0);
  });

  it("then prefers the higher peak", () => {
    const source = sourceOf({
      z: { mmr: 1000, wins: 10, peakMmr: 1400 },
      a: { mmr: 1000, wins: 10, peakMmr: 1100 },
    });
    expect(compareStanding(source, "z", "a")).toBeLessThan(0);
  });

  it("then prefers whoever needed fewer matches for it", () => {
    const source = sourceOf({
      z: { mmr: 1000, wins: 10, peakMmr: 1200, matchesPlayed: 12 },
      a: { mmr: 1000, wins: 10, peakMmr: 1200, matchesPlayed: 40 },
    });
    expect(compareStanding(source, "z", "a")).toBeLessThan(0);
  });

  it("reaches the id only when every result matches", () => {
    const source = sourceOf({
      a: { mmr: 1000, wins: 4, peakMmr: 1050, matchesPlayed: 8 },
      z: { mmr: 1000, wins: 4, peakMmr: 1050, matchesPlayed: 8 },
    });
    expect(compareStanding(source, "a", "z")).toBeLessThan(0);
    expect(compareStanding(source, "z", "a")).toBeGreaterThan(0);
  });

  it("is a total order: no two distinct players ever compare equal", () => {
    const source = sourceOf({ a: { mmr: 1000 }, b: { mmr: 1000 } });
    expect(compareStanding(source, "a", "b")).not.toBe(0);
    expect(compareStanding(source, "a", "a")).toBe(0);
  });
});

describe("replaySeason — incremental standings", () => {
  it("credits exactly what a full re-sort would, over a randomly built season", () => {
    // Deterministic PRNG: a failure has to be reproducible.
    let seed = 20260806;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };

    const ids = Array.from({ length: 24 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const mmr = new Map(ids.map((id) => [id, 1000]));
    const specs: MatchSpec[] = [];

    for (let m = 0; m < 400; m++) {
      const roster = new Set<string>();
      while (roster.size < 4) roster.add(ids[rand(ids.length)]!);
      const [a1, a2, b1, b2] = [...roster] as [string, string, string, string];
      // Ties are the interesting case for the tie-break, so deltas are coarse.
      const delta = (rand(3) + 1) * 10;
      const winnerSide = rand(2) === 0 ? "A" : "B";

      const move = (id: string, sign: number): [number, number] => {
        const before = mmr.get(id)!;
        const after = before + sign * delta;
        mmr.set(id, after);
        return [before, after];
      };
      const aSign = winnerSide === "A" ? 1 : -1;
      specs.push({
        matchId: `m${m}`,
        sideA: { [a1]: move(a1, aSign), [a2]: move(a2, aSign) },
        sideB: { [b1]: move(b1, -aSign), [b2]: move(b2, -aSign) },
        winner: winnerSide,
        // A tenth of the season is still in placement: those players must stay
        // out of the standings entirely.
        isPlacement: m < 40,
      });
    }

    const { history, sides } = build(specs);
    const result = replaySeason(history, sides);
    const expected = referenceResidency(history);

    for (const [playerId, reference] of expected) {
      const agg = result.aggregates.get(playerId)!;
      expect({
        bestRank: agg.bestRank,
        top1: agg.matchesInTop1,
        top3: agg.matchesInTop3,
        top5: agg.matchesInTop5,
      }).toEqual(reference);
    }
    // Guards the guard: a season where nobody ever ranked would pass vacuously.
    expect([...expected.values()].some((entry) => entry.top1 > 0)).toBe(true);
  });
});

describe("replaySeason — determinism", () => {
  it("produces identical aggregates across two runs on the same data", () => {
    const specs: MatchSpec[] = [
      { matchId: "m1", sideA: { a: [1000, 1050] }, sideB: { b: [1000, 950] }, winner: "A" },
      { matchId: "m2", sideA: { b: [950, 1000] }, sideB: { c: [1000, 950] }, winner: "A" },
      { matchId: "m3", sideA: { a: [1050, 1000] }, sideB: { c: [950, 1000] }, winner: "B" },
    ];

    const first = replay(specs);
    const second = replay(specs);
    expect([...first.aggregates.entries()]).toEqual([...second.aggregates.entries()]);
    expect(first.rivalries).toEqual(second.rivalries);
  });

  it("handles a season nobody played", () => {
    const result = replaySeason([], []);
    expect(result.aggregates.size).toBe(0);
    expect(result.matchCount).toBe(0);
  });

  it("handles a player with a single match", () => {
    const result = replay([{ matchId: "m1", sideA: { a: [1000, 1016] }, sideB: { b: [1000, 984] }, winner: "A" }]);

    const a = result.aggregates.get("a")!;
    expect(a).toMatchObject({ matchesPlayed: 1, wins: 1, bestWinStreak: 1, bestRank: 1 });
    expect(a.points).toHaveLength(1);
  });
});
