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
      expect(
        updateMatchSchema.safeParse({ status, playedAt: new Date().toISOString() }).success,
      ).toBe(false);
    }
    expect(createMatchSchema.safeParse({ tournamentId, sides, status: "reported" }).success).toBe(
      true,
    );
  });

  it("requires exactly one side at position 1 and one at position 2", () => {
    const parse = (s: unknown) => createMatchSchema.safeParse({ tournamentId, sides: s }).success;

    expect(parse(sides)).toBe(true);
    expect(parse([sides[0], { ...sides[1], position: 1 }])).toBe(false);
    expect(parse([sides[0], { ...sides[1], position: 3 }])).toBe(false);
    expect(parse([...sides, { position: 2, playerIds: [] }])).toBe(false);
  });

  it("only names side 1 or 2 as the winner", () => {
    expect(createMatchSchema.safeParse({ tournamentId, sides, winnerPosition: 3 }).success).toBe(
      false,
    );
  });
});
