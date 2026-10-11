/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { matchInputValidator } from "../validators/match-input.validator";
import { participantRepository } from "../../repository/participant.repository";
import { userRepository } from "../../repository/user.repository";
import { BadRequestError, ErrorCode } from "../../types/errors";
import type { CreateMatchRequestData } from "@skol-arena/shared/types/index";

let statuses: Record<string, string>;

const tournament = (mode: string) => ({ id: "t-1", mode, teamMode: "flex", minTeamSize: 1, maxTeamSize: 1 }) as any;

const input = {
  tournamentId: "t-1",
  sides: [
    { position: 1, playerIds: ["alice"] },
    { position: 2, playerIds: ["bob"] },
  ],
} as CreateMatchRequestData;

async function rejection(mode: string): Promise<BadRequestError | null> {
  try {
    await matchInputValidator.validateMatchInput(input, tournament(mode));
    return null;
  } catch (error) {
    if (error instanceof BadRequestError) return error;
    throw error;
  }
}

beforeEach(() => {
  statuses = { alice: "active", bob: "active" };
  (participantRepository as any).findStatuses = async (_t: string, ids: string[]) =>
    new Map(ids.filter((id) => statuses[id]).map((id) => [id, statuses[id]]));
  (userRepository as any).getById = async (id: string) => ({ id, displayName: id.toUpperCase() });
});

afterEach(() => {
  delete (participantRepository as any).findStatuses;
  delete (userRepository as any).getById;
});

describe("MatchInputValidator player registrations", () => {
  it("accepts players who all hold an active registration", async () => {
    expect(await rejection("championship")).toBeNull();
  });

  it("refuses, with a translated reason, a player who left a championship", async () => {
    statuses.bob = "withdrawn";

    const error = await rejection("championship");

    expect(error?.code).toBe(ErrorCode.MATCH_PLAYER_NOT_REGISTERED);
    expect(error?.details).toEqual({ playerName: "BOB" });
  });

  it("refuses a player who never registered for a championship", async () => {
    delete statuses.bob;
    expect((await rejection("championship"))?.code).toBe(ErrorCode.MATCH_PLAYER_NOT_REGISTERED);
  });

  it("lets a ranked match bring back a player who left, or register a newcomer", async () => {
    statuses.alice = "withdrawn";
    delete statuses.bob;
    expect(await rejection("ranked")).toBeNull();
  });

  it("refuses a player an organizer removed, ranked season included", async () => {
    statuses.bob = "removed";

    for (const mode of ["championship", "ranked"]) {
      const error = await rejection(mode);
      expect(error?.code).toBe(ErrorCode.MATCH_PLAYER_REMOVED);
      expect(error?.details).toEqual({ playerName: "BOB" });
    }
  });

  it("reports the refusal as a message in the dry run instead of throwing", async () => {
    statuses.bob = "removed";
    const errors: string[] = [];

    await matchInputValidator.validateMatchInputForValidation(input, tournament("ranked"), errors);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("BOB");
  });
});

describe("matchInputValidator.validateSideResults", () => {
  const scored = { scoreEnabled: true, minScore: null, maxScore: 10, allowDraw: false };
  const unscored = { scoreEnabled: false, minScore: null, maxScore: null, allowDraw: true };

  const codeOf = (fn: () => void): string | undefined => {
    try {
      fn();
      return undefined;
    } catch (error) {
      return (error as BadRequestError).code;
    }
  };

  it("accepts a ranking backed by in-range scores", () => {
    const results = [
      { position: 1, score: 3, rank: 2 },
      { position: 2, score: 7, rank: 1 },
      { position: 3, score: 1, rank: 3 },
    ];
    expect(codeOf(() => matchInputValidator.validateSideResults(results, scored))).toBeUndefined();
  });

  it("requires a score on every side when the competition keeps scores", () => {
    const results = [
      { position: 1, score: 3 },
      { position: 2, score: null },
      { position: 3, score: 1 },
    ];
    expect(codeOf(() => matchInputValidator.validateSideResults(results, scored))).toBe(ErrorCode.MATCH_INVALID_SCORE);
  });

  it("refuses a score above the competition's maximum", () => {
    const results = [
      { position: 1, score: 11 },
      { position: 2, score: 2 },
      { position: 3, score: 1 },
    ];
    expect(codeOf(() => matchInputValidator.validateSideResults(results, scored))).toBe(
      ErrorCode.MATCH_SCORE_OUT_OF_RANGE,
    );
  });

  it("requires a rank on every side when the competition keeps no score", () => {
    const results = [{ position: 1, rank: 1 }, { position: 2, rank: 2 }, { position: 3 }];
    expect(codeOf(() => matchInputValidator.validateSideResults(results, unscored))).toBe(
      ErrorCode.MATCH_RANKING_REQUIRED,
    );
  });

  it("treats a shared first place as a draw", () => {
    const results = [
      { position: 1, score: 5 },
      { position: 2, score: 5 },
      { position: 3, score: 1 },
    ];
    expect(codeOf(() => matchInputValidator.validateSideResults(results, scored))).toBe(
      ErrorCode.MATCH_DRAW_NOT_ALLOWED,
    );
    expect(
      codeOf(() => matchInputValidator.validateSideResults(results, { ...scored, allowDraw: true })),
    ).toBeUndefined();
  });

  it("caps the number of sides at the competition's setting", () => {
    expect(codeOf(() => matchInputValidator.validateSideCount(4, 3))).toBe(ErrorCode.MATCH_TOO_MANY_SIDES);
    expect(codeOf(() => matchInputValidator.validateSideCount(3, 3))).toBeUndefined();
  });
});
