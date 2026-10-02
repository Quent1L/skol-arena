/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach } from "bun:test";
import { GameRulesService } from "../game-rules.service";
import { rankedSeasonService } from "../ranked-season.service";
import { userRepository } from "../../repository/user.repository";
import { gameRulesRepository } from "../../repository/game-rules.repository";
import { ForbiddenError } from "../../types/errors";

const gameRulesService = new GameRulesService();

function signedInAs(role: string) {
  (userRepository as any).getById = async (id: string) => ({ id, role });
}

afterEach(() => {
  delete (userRepository as any).getById;
  delete (gameRulesRepository as any).create;
});

/**
 * Game rules and ranked seasons are shared across every tournament: the screens that
 * manage them are reserved to super admins, and so is the API behind them.
 */
describe("shared admin content", () => {
  it("refuses a tournament admin writing a game rule", async () => {
    signedInAs("tournament_admin");
    await expect(
      gameRulesService.createGameRule({ title: "t", content: "<p>c</p>", createdBy: "u-1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a super admin write a game rule, sanitized", async () => {
    signedInAs("super_admin");
    let stored = "";
    (gameRulesRepository as any).create = async (data: { content: string }) => {
      stored = data.content;
      return data;
    };
    await gameRulesService.createGameRule({
      title: "t",
      content: "<p>c</p><script>x</script>",
      createdBy: "u-1",
    });
    expect(stored).toBe("<p>c</p>");
  });

  it("refuses a tournament admin managing ranked seasons", async () => {
    signedInAs("tournament_admin");
    await expect(rankedSeasonService.assertCanManage("u-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
