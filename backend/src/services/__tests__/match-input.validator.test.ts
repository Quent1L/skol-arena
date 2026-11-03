/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { matchInputValidator } from "../validators/match-input.validator";
import { participantRepository } from "../../repository/participant.repository";
import { userRepository } from "../../repository/user.repository";
import { BadRequestError, ErrorCode } from "../../types/errors";
import type { CreateMatchRequestData } from "@skol-arena/shared/types/index";

let statuses: Record<string, string>;

const tournament = (mode: string) =>
  ({ id: "t-1", mode, teamMode: "flex", minTeamSize: 1, maxTeamSize: 1 }) as any;

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
