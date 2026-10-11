import { describe, it, expect } from "bun:test";
import { createMatchSchema, updateMatchSchema } from "@skol-arena/shared";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const sides = [
  { position: 1, playerIds: ["22222222-2222-4222-8222-222222222222"] },
  { position: 2, playerIds: ["33333333-3333-4333-8333-333333333333"] },
];

describe("match input schemas", () => {
  it("only lets a client write the scheduled and reported statuses", () => {
    for (const status of ["finalized", "confirmed", "cancelled", "disputed"]) {
      expect(createMatchSchema.safeParse({ tournamentId, sides, status }).success).toBe(false);
      expect(updateMatchSchema.safeParse({ status, playedAt: new Date().toISOString() }).success).toBe(false);
    }
    expect(createMatchSchema.safeParse({ tournamentId, sides, status: "reported" }).success).toBe(true);
  });

  it("requires 2 to 8 sides at positions 1..N, each once", () => {
    const parse = (s: unknown) => createMatchSchema.safeParse({ tournamentId, sides: s }).success;
    const side = (position: number) => ({ position, playerIds: [] });

    expect(parse(sides)).toBe(true);
    expect(parse([...sides, side(3)])).toBe(true);
    expect(parse([1, 2, 3, 4, 5, 6, 7, 8].map(side))).toBe(true);
    expect(parse([side(1)])).toBe(false);
    expect(parse([1, 2, 3, 4, 5, 6, 7, 8, 9].map(side))).toBe(false);
    expect(parse([sides[0], { ...sides[1], position: 1 }])).toBe(false);
    expect(parse([sides[0], { ...sides[1], position: 3 }])).toBe(false);
    expect(parse([...sides, { position: 2, playerIds: [] }])).toBe(false);
  });

  it("accepts per-side ranks only when every side has one and they form a ranking", () => {
    const parse = (ranks: (number | undefined)[]) =>
      createMatchSchema.safeParse({
        tournamentId,
        sides: ranks.map((rank, i) => ({ position: i + 1, playerIds: [], rank })),
      }).success;

    expect(parse([2, 1, 3])).toBe(true);
    expect(parse([1, 1, 3])).toBe(true);
    expect(parse([1, 1, 2])).toBe(false);
    expect(parse([2, 3, 4])).toBe(false);
    expect(parse([1, undefined, 2])).toBe(false);
  });

  it("only names side 1 or 2 as the winner", () => {
    expect(createMatchSchema.safeParse({ tournamentId, sides, winnerPosition: 3 }).success).toBe(false);
  });

  it("validates per-side results on an update", () => {
    const playedAt = new Date().toISOString();
    const parse = (sideResults: unknown) => updateMatchSchema.safeParse({ playedAt, sideResults }).success;

    expect(
      parse([
        { position: 1, rank: 2, score: 4 },
        { position: 2, rank: 1, score: 9 },
        { position: 3, rank: 3, score: null },
      ]),
    ).toBe(true);
    expect(
      parse([
        { position: 1, rank: 1 },
        { position: 1, rank: 2 },
      ]),
    ).toBe(false);
    expect(
      parse([
        { position: 1, rank: 1 },
        { position: 2, rank: 3 },
      ]),
    ).toBe(false);
  });
});
