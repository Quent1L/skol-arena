import { describe, it, expect } from "bun:test";
import {
  calculateMatchMmr,
  calculateMultiSideMmr,
  calculateScoreMultiplier,
  MIN_MMR,
  type EnginePlayer,
  type EngineSide,
  type MatchMmrInput,
  type MatchResult,
  type PlayerMmrDelta,
} from "../mmr-engine";
import type { TeamInteractionMode } from "@skol-arena/shared";

function p(id: string, mmr: number, isPlacement = false): EnginePlayer {
  return { id, mmr, isPlacement };
}

function side(players: EnginePlayer[], result: MatchResult, score: number | null = null): EngineSide {
  return { players, result, score };
}

function run(sides: [EngineSide, EngineSide], overrides: Partial<Omit<MatchMmrInput, "sides">> = {}): PlayerMmrDelta[] {
  return calculateMatchMmr({
    sides,
    kFactor: 32,
    scoreCountsForMmr: true,
    mmrMultiplier: 1,
    teamInteractionMode: "COLLABORATIVE",
    ...overrides,
  });
}

function deltaOf(results: PlayerMmrDelta[], id: string): number {
  return results.find((r) => r.playerId === id)!.mmrDelta;
}

function totalDelta(results: PlayerMmrDelta[]): number {
  return results.reduce((sum, r) => sum + r.mmrDelta, 0);
}

const MODES: TeamInteractionMode[] = ["COLLABORATIVE", "SHARED_RESOURCE", "INDIVIDUAL"];

// ── Conservation ────────────────────────────────────────────────────────────

describe("MMR conservation", () => {
  it("1v1 → sum of deltas is zero, in all 3 modes", () => {
    for (const mode of MODES) {
      const results = run([side([p("a", 1000)], 1), side([p("b", 1300)], 0)], { teamInteractionMode: mode });
      expect(totalDelta(results)).toBe(0);
    }
  });

  it("2v2 with heterogeneous teams → sum of deltas is zero, in all 3 modes", () => {
    for (const mode of MODES) {
      const results = run([side([p("a", 900), p("b", 1400)], 0), side([p("c", 1150), p("d", 1150)], 1)], {
        teamInteractionMode: mode,
      });
      expect(totalDelta(results)).toBe(0);
    }
  });

  it("asymmetric 1v2 match → sum of deltas is zero", () => {
    const results = run([side([p("solo", 1200)], 1), side([p("x", 1000), p("y", 1000)], 0)]);
    expect(totalDelta(results)).toBe(0);
  });

  it("3v3 with extreme gaps → sum of deltas is zero", () => {
    const results = run(
      [side([p("a", 400), p("b", 1000), p("c", 2400)], 1), side([p("d", 800), p("e", 1200), p("f", 1600)], 0)],
      { teamInteractionMode: "SHARED_RESOURCE" },
    );
    expect(totalDelta(results)).toBe(0);
  });

  it("sweep: no line-up, mode, K or score creates or destroys MMR", () => {
    // Players inside a side are spread around the side's level, so the weighted
    // modes actually allocate unequal shares instead of degenerating to 1/n.
    const spread = (n: number, base: number, tag: string) =>
      Array.from({ length: n }, (_, i) => p(`${tag}${i}`, Math.max(MIN_MMR, base + (i - Math.floor(n / 2)) * 300)));

    for (const [sizeA, sizeB] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [5, 5],
      [1, 2],
      [2, 3],
      [1, 7],
    ]) {
      for (const mode of MODES) {
        for (const kFactor of [8, 32, 128]) {
          for (const [mmrA, mmrB] of [
            [1000, 1000],
            [900, 1400],
            [40, 2400],
            [1, 1000],
            [300, 300],
          ]) {
            for (const [scoreA, scoreB] of [
              [null, null],
              [10, 0],
              [7, 6],
            ] as [number | null, number | null][]) {
              const results = run(
                [side(spread(sizeA, mmrA, "a"), 1, scoreA), side(spread(sizeB, mmrB, "b"), 0, scoreB)],
                { teamInteractionMode: mode, kFactor },
              );
              expect(totalDelta(results)).toBe(0);
              expect(results.every((r) => r.newMmr >= MIN_MMR)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("uneven draw → sum of deltas is zero", () => {
    const results = run([side([p("a", 1000), p("b", 1000)], 0.5), side([p("c", 1400), p("d", 1400)], 0.5)]);
    expect(totalDelta(results)).toBe(0);
  });
});

// ── Invariance 1v1 ──────────────────────────────────────────────────────────

describe("1v1 invariance", () => {
  it("all 3 modes give exactly the same result", () => {
    const deltas = MODES.map((mode) =>
      run([side([p("a", 900)], 1), side([p("b", 1400)], 0)], { teamInteractionMode: mode }).map((r) => r.mmrDelta),
    );
    expect(deltas[1]).toEqual(deltas[0]);
    expect(deltas[2]).toEqual(deltas[0]);
  });

  it("upset 900 vs 1400 → pure Elo, the ratio no longer applies", () => {
    const results = run([side([p("a", 900)], 1), side([p("b", 1400)], 0)]);
    // K × (1 − E) with E ≈ 0.0533 → ≈ 30, not 47 as with the old ratio.
    expect(deltaOf(results, "a")).toBe(30);
    expect(deltaOf(results, "b")).toBe(-30);
  });
});

// ── Format invariance ───────────────────────────────────────────────────────

describe("format invariance", () => {
  /** Same match-up, same result, played 1v1 / 2v2 / 3v3 with equal-level teams. */
  function evenFormat(size: number): PlayerMmrDelta[] {
    const winners = Array.from({ length: size }, (_, i) => p(`w${i}`, 1000));
    const losers = Array.from({ length: size }, (_, i) => p(`l${i}`, 1200));
    return run([side(winners, 1), side(losers, 0)]);
  }

  it("a player moves by the same amount whatever the team size", () => {
    const solo = deltaOf(evenFormat(1), "w0");
    for (const size of [2, 3, 4]) {
      const results = evenFormat(size);
      for (const r of results.filter((x) => x.playerId.startsWith("w"))) {
        expect(r.mmrDelta).toBe(solo);
      }
      expect(totalDelta(results)).toBe(0);
    }
  });

  it("uneven sides → no scaling, one Elo delta split within each side", () => {
    const results = run([side([p("solo", 1000)], 1), side([p("x", 1000), p("y", 1000)], 0)]);
    expect(deltaOf(results, "solo")).toBe(16);
    expect(deltaOf(results, "x")).toBe(-8);
    expect(deltaOf(results, "y")).toBe(-8);
    expect(totalDelta(results)).toBe(0);
  });

  it("an uneven line-up never moves anyone past the 1v1 delta", () => {
    for (const size of [2, 3, 5, 11]) {
      // 900, 1100, 1300… averages to 900 + 100 × (size − 1), so the same match-up
      // can be posed as a 1v1 and gives the bound to hold everyone under.
      const opponents = Array.from({ length: size }, (_, i) => 900 + i * 200);
      const oneOnOne = deltaOf(run([side([p("solo", 1000)], 1), side([p("l0", 900 + 100 * (size - 1))], 0)]), "solo");

      for (const mode of MODES) {
        const results = run(
          [
            side([p("solo", 1000)], 1),
            side(
              opponents.map((mmr, i) => p(`l${i}`, mmr)),
              0,
            ),
          ],
          { teamInteractionMode: mode },
        );
        expect(deltaOf(results, "solo")).toBe(oneOnOne);
        for (const r of results) {
          expect(Math.abs(r.mmrDelta)).toBeLessThanOrEqual(oneOnOne);
        }
        expect(totalDelta(results)).toBe(0);
      }
    }
  });

  it("a 1v11 blowout stakes one Elo delta, not eleven", () => {
    // Scaling on the larger side would stake 11 × kEff here — more than the solo
    // player owns, so one match would wipe them out. An unscaled pot keeps the
    // risk at what a 1v1 already carries.
    const results = run(
      [
        side([p("solo", 300)], 0, 0),
        side(
          Array.from({ length: 11 }, (_, i) => p(`w${i}`, 300)),
          1,
          10,
        ),
      ],
      { kFactor: 128 },
    );
    expect(deltaOf(results, "solo")).toBe(-128); // kEff 256 × (0 − 0.5), once
    expect(totalDelta(results)).toBe(0);
  });
});

// ── The MMR floor ───────────────────────────────────────────────────────────

describe("the MMR floor withholds instead of minting", () => {
  /** Everyone one loss away from the floor: the losers cannot pay their share. */
  function atTheFloor(size: number, mode: TeamInteractionMode = "COLLABORATIVE") {
    return run(
      [
        side(
          Array.from({ length: size }, (_, i) => p(`w${i}`, 120)),
          1,
          10,
        ),
        side(
          Array.from({ length: size }, (_, i) => p(`l${i}`, 120)),
          0,
          0,
        ),
      ],
      { kFactor: 128, teamInteractionMode: mode },
    );
  }

  it("the winners collect what was actually paid, not the full pot", () => {
    const results = atTheFloor(4);
    // kEff 256 → a 128 share each, but a player at 120 can only pay 119.
    expect(deltaOf(results, "l0")).toBe(-119);
    expect(results.find((r) => r.playerId === "l0")!.newMmr).toBe(MIN_MMR);
    expect(deltaOf(results, "w0")).toBe(119);
    expect(totalDelta(results)).toBe(0);
  });

  it("nothing is created in any format or mode", () => {
    for (const size of [1, 2, 3, 4, 7]) {
      for (const mode of MODES) {
        expect(totalDelta(atTheFloor(size, mode))).toBe(0);
      }
    }
  });

  it("a side already at the floor has nothing left to give", () => {
    const results = run([side([p("w", 1000)], 1, 10), side([p("l", MIN_MMR)], 0, 0)]);
    expect(deltaOf(results, "l")).toBe(0);
    expect(deltaOf(results, "w")).toBe(0);
  });
});

// ── Distribution by mode ────────────────────────────────────────────────────

describe("distribution based on teamInteractionMode", () => {
  const weak = "weak";
  const strong = "strong";

  function team2v2(result: MatchResult, mode: TeamInteractionMode): PlayerMmrDelta[] {
    return run(
      [side([p(weak, 900), p(strong, 1400)], result), side([p("c", 1150), p("d", 1150)], result === 1 ? 0 : 1)],
      { teamInteractionMode: mode },
    );
  }

  it("COLLABORATIVE → strictly equal shares, in both win and loss", () => {
    const win = team2v2(1, "COLLABORATIVE");
    expect(deltaOf(win, weak)).toBe(deltaOf(win, strong));

    const loss = team2v2(0, "COLLABORATIVE");
    expect(deltaOf(loss, weak)).toBe(deltaOf(loss, strong));
  });

  it("SHARED_RESOURCE → the lower-ranked player moves more in both directions", () => {
    const win = team2v2(1, "SHARED_RESOURCE");
    expect(deltaOf(win, weak)).toBeGreaterThan(deltaOf(win, strong));

    const loss = team2v2(0, "SHARED_RESOURCE");
    expect(deltaOf(loss, weak)).toBeLessThan(deltaOf(loss, strong));
  });

  it("INDIVIDUAL → the weak player gains more and loses less, the strong one the opposite", () => {
    const win = team2v2(1, "INDIVIDUAL");
    expect(deltaOf(win, weak)).toBeGreaterThan(deltaOf(win, strong));

    const loss = team2v2(0, "INDIVIDUAL");
    expect(deltaOf(loss, weak)).toBeGreaterThan(deltaOf(loss, strong));
  });

  it("INDIVIDUAL and SHARED_RESOURCE oppose each other on a loss", () => {
    const individual = team2v2(0, "INDIVIDUAL");
    const shared = team2v2(0, "SHARED_RESOURCE");
    expect(deltaOf(individual, strong)).toBeLessThan(deltaOf(shared, strong));
    expect(deltaOf(individual, weak)).toBeGreaterThan(deltaOf(shared, weak));
  });

  it("one side's shares sum to 1", () => {
    const results = team2v2(1, "INDIVIDUAL");
    const shareWeak = results.find((r) => r.playerId === weak)!.share;
    const shareStrong = results.find((r) => r.playerId === strong)!.share;
    expect(shareWeak + shareStrong).toBeCloseTo(1, 10);
  });
});

// ── Bornes ──────────────────────────────────────────────────────────────────

describe("ratio bounds", () => {
  it("a player at MMR 1 who wins can no longer overflow", () => {
    const results = run([side([p("a", 1)], 1), side([p("b", 1000)], 0)]);
    expect(deltaOf(results, "a")).toBeLessThanOrEqual(32);
  });

  it("the clamp caps the share spread of a very heterogeneous team", () => {
    const results = run([side([p("tiny", 100), p("huge", 2400)], 1), side([p("c", 1200), p("d", 1200)], 0)], {
      teamInteractionMode: "INDIVIDUAL",
    });
    const shareTiny = results.find((r) => r.playerId === "tiny")!.share;
    const shareHuge = results.find((r) => r.playerId === "huge")!.share;
    // Ratios clamped to [0.75, 1.25] → maximum share 1.25 / (1.25 + 0.75) = 62.5%.
    expect(shareTiny).toBeLessThanOrEqual(0.625 + 1e-9);
    expect(shareHuge).toBeGreaterThanOrEqual(0.375 - 1e-9);
  });
});

// ── Arrondi ─────────────────────────────────────────────────────────────────

describe("deterministic rounding", () => {
  it("the sum of one side equals exactly the team delta", () => {
    const results = run(
      [side([p("a", 900), p("b", 1100), p("c", 1400)], 1), side([p("d", 1150), p("e", 1150), p("f", 1150)], 0)],
      { teamInteractionMode: "SHARED_RESOURCE" },
    );
    const winners = results.filter((r) => ["a", "b", "c"].includes(r.playerId));
    const losers = results.filter((r) => ["d", "e", "f"].includes(r.playerId));
    expect(totalDelta(winners) + totalDelta(losers)).toBe(0);
  });

  it("input player order doesn't change any delta (tie-broken by playerId)", () => {
    // An even-sided match always divides exactly, so the tie-break needs uneven
    // sides: kFactor 30 and E = 0.5 → an unscaled pot of 15 split over the two
    // players of side A. Both remainders are tied at .5, only the id tie-break
    // decides who receives the remaining unit.
    const sides = (first: string, second: string) =>
      [side([p(first, 1000), p(second, 1000)], 1), side([p("c", 1000), p("d", 1000), p("e", 1000)], 0)] as [
        EngineSide,
        EngineSide,
      ];

    const forward = run(sides("a", "b"), { kFactor: 30 });
    const reversed = run(sides("b", "a"), { kFactor: 30 });

    expect(deltaOf(forward, "a")).toBe(deltaOf(reversed, "a"));
    expect(deltaOf(forward, "b")).toBe(deltaOf(reversed, "b"));
    expect(deltaOf(forward, "a")).toBe(8);
    expect(deltaOf(forward, "b")).toBe(7);
    expect(totalDelta(forward)).toBe(0);
  });
});

// ── Short-circuits and multipliers ──────────────────────────────────────────

describe("short-circuits", () => {
  it("scoreCountsForMmr = false → all deltas at 0", () => {
    const results = run([side([p("a", 1000)], 1, 10), side([p("b", 1000)], 0, 0)], {
      scoreCountsForMmr: false,
    });
    expect(results.every((r) => r.mmrDelta === 0)).toBe(true);
    expect(results.every((r) => r.kEffective === 0)).toBe(true);
  });

  it("mmrMultiplier = 0 → all deltas at 0", () => {
    const results = run([side([p("a", 1000)], 1), side([p("b", 1000)], 0)], { mmrMultiplier: 0 });
    expect(results.every((r) => r.mmrDelta === 0)).toBe(true);
  });

  it("mmrMultiplier = 2 → delta doubled", () => {
    const base = run([side([p("a", 1000)], 1), side([p("b", 1000)], 0)]);
    const doubled = run([side([p("a", 1000)], 1), side([p("b", 1000)], 0)], { mmrMultiplier: 2 });
    expect(deltaOf(doubled, "a")).toBe(deltaOf(base, "a") * 2);
  });

  it("an empty side → no delta", () => {
    const results = run([side([], 1), side([p("b", 1000)], 0)]);
    expect(results.every((r) => r.mmrDelta === 0)).toBe(true);
  });
});

describe("amplification by score", () => {
  it("10-0 doubles K, 5-5 leaves it unchanged", () => {
    expect(calculateScoreMultiplier(10, 0)).toBe(2);
    expect(calculateScoreMultiplier(5, 5)).toBe(1);
    expect(calculateScoreMultiplier(0, 0)).toBe(1);
    expect(calculateScoreMultiplier(6, 4)).toBeCloseTo(1.2, 10);
  });

  it("a blowout moves more MMR than a close match", () => {
    const close = run([side([p("a", 1000)], 1, 5), side([p("b", 1000)], 0, 5)]);
    const blowout = run([side([p("a", 1000)], 1, 10), side([p("b", 1000)], 0, 0)]);
    expect(deltaOf(blowout, "a")).toBeGreaterThan(deltaOf(close, "a"));
    expect(totalDelta(blowout)).toBe(0);
  });
});

// ── Draw ────────────────────────────────────────────────────────────────────

describe("draw match", () => {
  it("the weaker team gains MMR against a favored team", () => {
    const results = run([side([p("a", 1000), p("b", 1000)], 0.5), side([p("c", 1400), p("d", 1400)], 0.5)]);
    expect(deltaOf(results, "a")).toBeGreaterThan(0);
    expect(deltaOf(results, "c")).toBeLessThan(0);
  });

  it("a draw between equally-matched teams changes nothing", () => {
    const results = run([side([p("a", 1000), p("b", 1200)], 0.5), side([p("c", 1100), p("d", 1100)], 0.5)]);
    expect(results.every((r) => r.mmrDelta === 0)).toBe(true);
  });

  it("the draw is distributed by mode, more evenly", () => {
    // The level gap has to be wide enough for the share difference to survive the
    // integer allocation: on a near-even team the two shares round to one delta.
    const results = run([side([p("weak", 300), p("strong", 1700)], 0.5), side([p("c", 1400), p("d", 1400)], 0.5)], {
      teamInteractionMode: "SHARED_RESOURCE",
    });
    expect(deltaOf(results, "weak")).toBeGreaterThan(deltaOf(results, "strong"));
  });
});

// ── Documented exceptions ───────────────────────────────────────────────────

describe("exceptions to conservation", () => {
  it("placement → delta doubled only for the player concerned", () => {
    const results = run([side([p("a", 1000, true)], 1), side([p("b", 1000)], 0)]);
    expect(deltaOf(results, "a")).toBe(32);
    expect(deltaOf(results, "b")).toBe(-16);
    expect(results.find((r) => r.playerId === "a")!.kEffective).toBe(64);
    expect(results.find((r) => r.playerId === "b")!.kEffective).toBe(32);
  });

  it("floor at 1 → the delta is truncated, never below", () => {
    const results = run([side([p("a", 5)], 0), side([p("b", 5)], 1)]);
    expect(results.find((r) => r.playerId === "a")!.newMmr).toBe(1);
    expect(deltaOf(results, "a")).toBe(-4);
  });
});

describe("calculateMultiSideMmr", () => {
  const base = {
    kFactor: 32,
    scoreCountsForMmr: true,
    mmrMultiplier: 1,
    teamInteractionMode: "COLLABORATIVE" as TeamInteractionMode,
  };
  const ranked = (players: EnginePlayer[], rank: number, score: number | null = null) => ({
    players,
    rank,
    score,
  });

  it("prices a duel exactly like calculateMatchMmr", () => {
    const multi = calculateMultiSideMmr({
      ...base,
      sides: [ranked([p("a", 1100), p("b", 950)], 2, 3), ranked([p("c", 1000), p("d", 1020)], 1, 5)],
    });
    const duel = run([side([p("a", 1100), p("b", 950)], 0, 3), side([p("c", 1000), p("d", 1020)], 1, 5)]);
    expect(multi).toEqual(duel);
  });

  it("reads a shared rank in a duel as a draw", () => {
    const multi = calculateMultiSideMmr({
      ...base,
      sides: [ranked([p("a", 1100)], 1), ranked([p("b", 900)], 1)],
    });
    expect(multi).toEqual(run([side([p("a", 1100)], 0.5), side([p("b", 900)], 0.5)]));
  });

  it("averages the duels of a 1v1v1 between equal players", () => {
    const results = calculateMultiSideMmr({
      ...base,
      sides: [ranked([p("a", 1000)], 1), ranked([p("b", 1000)], 2), ranked([p("c", 1000)], 3)],
    });
    // Each duel between equals moves 16: the winner wins two, the middle one splits
    expect(deltaOf(results, "a")).toBe(16);
    expect(deltaOf(results, "b")).toBe(0);
    expect(deltaOf(results, "c")).toBe(-16);
    expect(totalDelta(results)).toBe(0);
  });

  it("lets two sides sharing first place draw their duel", () => {
    const results = calculateMultiSideMmr({
      ...base,
      sides: [ranked([p("a", 1000)], 1), ranked([p("b", 1000)], 1), ranked([p("c", 1000)], 3)],
    });
    expect(deltaOf(results, "a")).toBe(8);
    expect(deltaOf(results, "b")).toBe(8);
    expect(deltaOf(results, "c")).toBe(-16);
  });

  it("applies the placement multiplier once, on the average", () => {
    const results = calculateMultiSideMmr({
      ...base,
      sides: [ranked([p("a", 1000, true)], 1), ranked([p("b", 1000)], 2), ranked([p("c", 1000)], 3)],
    });
    expect(deltaOf(results, "a")).toBe(32);
  });

  it("never takes a player below the MMR floor", () => {
    const results = calculateMultiSideMmr({
      ...base,
      sides: [ranked([p("a", 1000)], 1), ranked([p("b", 1000)], 2), ranked([p("c", MIN_MMR)], 3)],
    });
    expect(results.find((r) => r.playerId === "c")!.newMmr).toBe(MIN_MMR);
  });

  it("splits a team side's share of every duel in a 2v2v2", () => {
    const team = (x: string, y: string) => [p(x, 1000), p(y, 1000)];
    const results = calculateMultiSideMmr({
      ...base,
      sides: [ranked(team("a1", "a2"), 1), ranked(team("b1", "b2"), 2), ranked(team("c1", "c2"), 3)],
    });
    expect(deltaOf(results, "a1")).toBe(16);
    expect(deltaOf(results, "c2")).toBe(-16);
    expect(totalDelta(results)).toBe(0);
  });
});
