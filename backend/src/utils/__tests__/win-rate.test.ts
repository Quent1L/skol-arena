import { describe, it, expect } from "bun:test";
import { winRatePercent } from "../win-rate";

describe("winRatePercent", () => {
  it("divides wins by every match played", () => {
    expect(winRatePercent(3, 4)).toBe(75);
    expect(winRatePercent(1, 3)).toBe(33);
  });

  it("is zero without matches", () => {
    expect(winRatePercent(0, 0)).toBe(0);
  });
});
