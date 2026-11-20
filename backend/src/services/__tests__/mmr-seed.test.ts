import { describe, it, expect } from "bun:test";
import { medianMmr, computeSoftResetMmr, computePercentileLadder } from "../ranked-season.service";

describe("medianMmr", () => {
  it("returns the middle value of an odd-sized set", () => {
    expect(medianMmr([1500, 900, 1200])).toBe(1200);
  });

  it("averages the two middle values of an even-sized set", () => {
    expect(medianMmr([800, 1000, 1200, 1500])).toBe(1100);
  });

  it("is immune to a runaway outlier, unlike the mean", () => {
    // mean would be 1100; the median stays where the pack actually is.
    expect(medianMmr([900, 950, 1000, 3000])).toBe(975);
  });

  it("does not mutate its input", () => {
    const values = [1500, 900, 1200];
    medianMmr(values);
    expect(values).toEqual([1500, 900, 1200]);
  });

  it("returns null for an empty season", () => {
    expect(medianMmr([])).toBeNull();
  });
});

describe("computeSoftResetMmr", () => {
  const base = { anchor: 1240, baseMmr: 1000, factor: 0.5 };

  it("re-centres the median of the source season on the new baseMmr", () => {
    expect(computeSoftResetMmr({ ...base, mmr: 1240 })).toBe(1000);
  });

  it("halves the distance to the median, above and below it", () => {
    expect(computeSoftResetMmr({ ...base, mmr: 1600 })).toBe(1180);
    expect(computeSoftResetMmr({ ...base, mmr: 900 })).toBe(830);
  });

  it("factor 0 collapses everyone onto baseMmr", () => {
    expect(computeSoftResetMmr({ ...base, mmr: 1600, factor: 0 })).toBe(1000);
    expect(computeSoftResetMmr({ ...base, mmr: 400, factor: 0 })).toBe(1000);
  });

  it("factor 1 keeps the whole spread, only shifting it onto baseMmr", () => {
    expect(computeSoftResetMmr({ ...base, mmr: 1600, factor: 1 })).toBe(1360);
    expect(computeSoftResetMmr({ ...base, mmr: 900, factor: 1 })).toBe(660);
  });

  it("preserves the ordering of the source season", () => {
    const seeds = [1600, 1240, 900, 400].map((mmr) => computeSoftResetMmr({ ...base, mmr }));
    expect(seeds).toEqual([...seeds].sort((a, b) => b - a));
  });

  it("never seeds below 1, however far under the median the player was", () => {
    expect(computeSoftResetMmr({ anchor: 3000, baseMmr: 100, factor: 1, mmr: 200 })).toBe(1);
  });

  it("rounds to an integer — MMR is stored as one", () => {
    expect(computeSoftResetMmr({ anchor: 1000, baseMmr: 1000, factor: 0.5, mmr: 1003 })).toBe(1002);
  });
});

describe("computePercentileLadder", () => {
  const tiers = [
    { level: 1, percentile: 0 },
    { level: 2, percentile: 0.4 },
    { level: 3, percentile: 0.9 },
  ];
  const identity = (mmr: number) => mmr;
  // 10 values, so a percentile maps to a readable index.
  const values = [700, 800, 850, 900, 950, 1000, 1050, 1100, 1200, 1400];

  it("cuts each tier at its percentile of the distribution", () => {
    const ladder = computePercentileLadder(tiers, values, 1000, identity);
    // index floor(10 * 0.4) = 4 → 950 ; floor(10 * 0.9) = 9 → 1400
    expect(ladder.get(2)).toBe(950);
    expect(ladder.get(3)).toBe(1400);
  });

  it("floors the bottom tier under the weakest value and under floorBase", () => {
    expect(computePercentileLadder(tiers, values, 1000, identity).get(1)).toBe(700);
    // A newcomer entering at 600 must still land somewhere.
    expect(computePercentileLadder(tiers, values, 600, identity).get(1)).toBe(600);
  });

  it("applies the transform to every threshold", () => {
    const ladder = computePercentileLadder(tiers, values, 1000, (mmr) => mmr - 100);
    expect(ladder.get(1)).toBe(600);
    expect(ladder.get(2)).toBe(850);
    expect(ladder.get(3)).toBe(1300);
  });

  it("never puts a threshold below the floor, however hard the transform squeezes", () => {
    const ladder = computePercentileLadder(tiers, values, 500, () => 200);
    expect([...ladder.values()].every((minMmr) => minMmr >= 200)).toBe(true);
  });

  it("keeps the thresholds ordered like the tiers", () => {
    const ladder = computePercentileLadder(tiers, values, 1000, identity);
    expect(ladder.get(1)!).toBeLessThanOrEqual(ladder.get(2)!);
    expect(ladder.get(2)!).toBeLessThanOrEqual(ladder.get(3)!);
  });

  it("does not mutate the distribution it reads", () => {
    const input = [1400, 700, 950];
    computePercentileLadder(tiers, input, 1000, identity);
    expect(input).toEqual([1400, 700, 950]);
  });

  it("returns nothing for an empty distribution, so the caller keeps its ladder", () => {
    expect(computePercentileLadder(tiers, [], 1000, identity).size).toBe(0);
  });

  it("clamps a percentile of 1 onto the highest value instead of falling off the end", () => {
    const ladder = computePercentileLadder([{ level: 1, percentile: 1 }], values, 1000, identity);
    expect(ladder.get(1)).toBe(1400);
  });
});
