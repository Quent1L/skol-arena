import { describe, it, expect } from "bun:test";
import { rulesEvaluationService, interpolate, resolveDisplay } from "../rules-evaluation.service";
import type { BadgeAction, MessageAction, RuleConditions } from "@skol-arena/shared";

describe("interpolate", () => {
  it("replaces {{var}} placeholders with context values", () => {
    expect(interpolate("You gain {{mmrDelta}} MMR", { mmrDelta: 18 })).toBe("You gain 18 MMR");
  });

  it("handles spacing inside braces and multiple variables", () => {
    expect(interpolate("{{ winStreak }} wins for {{name}}", { winStreak: 3, name: "Bob" })).toBe("3 wins for Bob");
  });

  it("replaces unknown/undefined variables with empty string", () => {
    expect(interpolate("a{{missing}}b", {})).toBe("ab");
  });
});

describe("resolveDisplay", () => {
  const names = new Map([
    ["alice", "Alice"],
    ["bob", "Bob"],
    ["carl", "Carl"],
  ]);

  it("renders scalar player facts as display names", () => {
    const out = resolveDisplay({ playerId: "alice" }, names);
    expect(interpolate("{{playerId}} plays", out)).toBe("Alice plays");
  });

  it("renders player list facts as a comma-separated name list", () => {
    const out = resolveDisplay({ teammateIds: ["bob", "carl"], opponentIds: [] }, names);
    expect(interpolate("With {{teammateIds}}", out)).toBe("With Bob, Carl");
    expect(interpolate("Against {{opponentIds}}", out)).toBe("Against ");
  });

  it("keeps ids that have no known display name", () => {
    const out = resolveDisplay({ teammateIds: ["bob", "ghost"] }, names);
    expect(out.teammateIds).toBe("Bob, ghost");
  });
});

describe("RulesEvaluationService.simulate", () => {
  const winStreak3: RuleConditions = { all: [{ fact: "winStreak", operator: "greaterThanInclusive", value: 3 }] };
  const messageAction: MessageAction = { type: "message", variants: ["Win streak of {{winStreak}}!"] };
  const badgeAction: BadgeAction = {
    type: "badge",
    icon: "fa fa-fire",
    label: "Unstoppable",
    description: "5 wins",
    recurrence: "per_season",
  };

  it("returns matched=true and interpolated message when conditions pass", async () => {
    const result = await rulesEvaluationService.simulate(winStreak3, messageAction, { winStreak: 5 });
    expect(result.matched).toBe(true);
    expect(result.output).toEqual({ type: "message", message: "Win streak of 5!" });
  });

  it("returns matched=false when conditions fail", async () => {
    const result = await rulesEvaluationService.simulate(winStreak3, messageAction, { winStreak: 1 });
    expect(result.matched).toBe(false);
    expect(result.output).toBeUndefined();
  });

  it("returns a badge output when a badge rule matches", async () => {
    const result = await rulesEvaluationService.simulate(winStreak3, badgeAction, { winStreak: 5 });
    expect(result.matched).toBe(true);
    expect(result.output).toEqual({
      type: "badge",
      badge: { ruleId: "test", icon: "fa fa-fire", label: "Unstoppable", description: "5 wins" },
    });
  });

  it("supports nested any/all groups", async () => {
    const conditions: RuleConditions = {
      any: [
        { fact: "rankUp", operator: "equal", value: true },
        { all: [{ fact: "mmrDelta", operator: "greaterThan", value: 30 }] },
      ],
    };
    const matched = await rulesEvaluationService.simulate(conditions, messageAction, { rankUp: false, mmrDelta: 40 });
    expect(matched.matched).toBe(true);

    const notMatched = await rulesEvaluationService.simulate(conditions, messageAction, {
      rankUp: false,
      mmrDelta: 10,
    });
    expect(notMatched.matched).toBe(false);
  });

  it("treats undefined facts as non-matching (allowUndefinedFacts)", async () => {
    const result = await rulesEvaluationService.simulate(winStreak3, messageAction, {});
    expect(result.matched).toBe(false);
  });

  it("matches a match-hour time window (e.g. night match 2h-4h)", async () => {
    const nightWindow: RuleConditions = {
      all: [
        { fact: "matchHour", operator: "greaterThanInclusive", value: 2 },
        { fact: "matchHour", operator: "lessThanInclusive", value: 4 },
      ],
    };
    const badge: BadgeAction = {
      type: "badge",
      icon: "fa fa-moon",
      label: "Night owl",
      description: "Night match",
      recurrence: "per_season",
    };

    expect((await rulesEvaluationService.simulate(nightWindow, badge, { matchHour: 3 })).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(nightWindow, badge, { matchHour: 12 })).matched).toBe(false);
  });

  it("matches a minute-precise time window (02:30 → 04:15 via matchMinuteOfDay)", async () => {
    const window: RuleConditions = {
      all: [
        { fact: "matchMinuteOfDay", operator: "greaterThanInclusive", value: 150 }, // 02:30
        { fact: "matchMinuteOfDay", operator: "lessThanInclusive", value: 255 }, // 04:15
      ],
    };
    expect((await rulesEvaluationService.simulate(window, messageAction, { matchMinuteOfDay: 200 })).matched).toBe(
      true,
    );
    expect((await rulesEvaluationService.simulate(window, messageAction, { matchMinuteOfDay: 149 })).matched).toBe(
      false,
    );
  });

  it("matches weekend days via matchDayOfWeek in [6,7]", async () => {
    const weekend: RuleConditions = { all: [{ fact: "matchDayOfWeek", operator: "in", value: [6, 7] }] };
    expect((await rulesEvaluationService.simulate(weekend, messageAction, { matchDayOfWeek: 7 })).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(weekend, messageAction, { matchDayOfWeek: 3 })).matched).toBe(false);
  });

  it("targets a single recipient via playerId", async () => {
    const forAlice: RuleConditions = { all: [{ fact: "playerId", operator: "equal", value: "alice" }] };
    expect((await rulesEvaluationService.simulate(forAlice, messageAction, { playerId: "alice" })).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(forAlice, messageAction, { playerId: "bob" })).matched).toBe(false);
  });

  it("matches 'teammate of X' via teammateIds contains", async () => {
    const withBob: RuleConditions = { all: [{ fact: "teammateIds", operator: "contains", value: "bob" }] };
    expect((await rulesEvaluationService.simulate(withBob, messageAction, { teammateIds: ["bob"] })).matched).toBe(
      true,
    );
    expect((await rulesEvaluationService.simulate(withBob, messageAction, { teammateIds: ["carl"] })).matched).toBe(
      false,
    );
    expect((await rulesEvaluationService.simulate(withBob, messageAction, { teammateIds: [] })).matched).toBe(false);
  });

  it("matches 'against X' via opponentIds contains", async () => {
    const vsBob: RuleConditions = { all: [{ fact: "opponentIds", operator: "contains", value: "bob" }] };
    expect(
      (await rulesEvaluationService.simulate(vsBob, messageAction, { opponentIds: ["bob", "carl"] })).matched,
    ).toBe(true);
    expect((await rulesEvaluationService.simulate(vsBob, messageAction, { opponentIds: ["carl"] })).matched).toBe(
      false,
    );
  });

  it("matches an outcome type by id, the exact form for a discipline-scoped rule", async () => {
    const byForfeit: RuleConditions = { all: [{ fact: "outcomeType", operator: "equal", value: "ot-forfeit" }] };
    expect(
      (await rulesEvaluationService.simulate(byForfeit, messageAction, { outcomeType: "ot-forfeit" })).matched,
    ).toBe(true);
    expect(
      (await rulesEvaluationService.simulate(byForfeit, messageAction, { outcomeType: "ot-normal" })).matched,
    ).toBe(false);
  });

  it("matches an outcome type by name, the form that spans disciplines", async () => {
    const byName: RuleConditions = {
      all: [{ fact: "outcomeTypeName", operator: "in", value: ["Forfeit", "Walkover"] }],
    };
    expect((await rulesEvaluationService.simulate(byName, messageAction, { outcomeTypeName: "Forfeit" })).matched).toBe(
      true,
    );
    expect((await rulesEvaluationService.simulate(byName, messageAction, { outcomeTypeName: "Regular" })).matched).toBe(
      false,
    );
  });

  it("separates a special outcome from the regular one via isDefaultOutcome", async () => {
    const special: RuleConditions = { all: [{ fact: "isDefaultOutcome", operator: "equal", value: false }] };
    const badge: BadgeAction = {
      type: "badge",
      icon: "fa fa-ban",
      label: "No mercy",
      description: "Special result",
      recurrence: "per_season",
    };
    expect((await rulesEvaluationService.simulate(special, badge, { isDefaultOutcome: false })).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(special, badge, { isDefaultOutcome: true })).matched).toBe(false);
  });

  it("narrows an outcome down to its reason", async () => {
    const injury: RuleConditions = {
      all: [
        { fact: "outcomeTypeName", operator: "equal", value: "Forfeit" },
        { fact: "outcomeReasonName", operator: "equal", value: "Injury" },
      ],
    };
    const facts = { outcomeTypeName: "Forfeit", outcomeReasonName: "Injury" };
    expect((await rulesEvaluationService.simulate(injury, messageAction, facts)).matched).toBe(true);
    expect(
      (await rulesEvaluationService.simulate(injury, messageAction, { ...facts, outcomeReasonName: "No-show" }))
        .matched,
    ).toBe(false);
  });

  it("interpolates the outcome name into a message variant", async () => {
    const action: MessageAction = { type: "message", variants: ["Won by {{outcomeTypeName}}!"] };
    const conditions: RuleConditions = { all: [{ fact: "isDefaultOutcome", operator: "equal", value: false }] };
    const result = await rulesEvaluationService.simulate(conditions, action, {
      isDefaultOutcome: false,
      outcomeTypeName: "Forfeit",
    });
    expect(result.output).toEqual({ type: "message", message: "Won by Forfeit!" });
  });

  it("matches a substring on a string fact — the stock operator is Array-only", async () => {
    const gold: RuleConditions = { all: [{ fact: "newRank", operator: "contains", value: "old" }] };
    expect((await rulesEvaluationService.simulate(gold, messageAction, { newRank: "gold" })).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(gold, messageAction, { newRank: "silver" })).matched).toBe(false);
  });

  it("makes doesNotContain mean what it says on a string fact", async () => {
    const notGold: RuleConditions = { all: [{ fact: "newRank", operator: "doesNotContain", value: "old" }] };
    expect((await rulesEvaluationService.simulate(notGold, messageAction, { newRank: "silver" })).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(notGold, messageAction, { newRank: "gold" })).matched).toBe(false);
  });

  it("keeps contains as membership on a list fact", async () => {
    const withBob: RuleConditions = { all: [{ fact: "teammateIds", operator: "contains", value: "bob" }] };
    const facts = { teammateIds: ["alice", "bob"] };
    expect((await rulesEvaluationService.simulate(withBob, messageAction, facts)).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(withBob, messageAction, { teammateIds: ["alice"] })).matched).toBe(
      false,
    );
  });

  it("matches every listed player via containsAll", async () => {
    const duo: RuleConditions = { all: [{ fact: "teammateIds", operator: "containsAll", value: ["alice", "bob"] }] };
    expect((await rulesEvaluationService.simulate(duo, messageAction, { teammateIds: ["alice", "bob"] })).matched).toBe(
      true,
    );
    // A larger list still contains the pair.
    expect(
      (await rulesEvaluationService.simulate(duo, messageAction, { teammateIds: ["alice", "bob", "carl"] })).matched,
    ).toBe(true);
    expect((await rulesEvaluationService.simulate(duo, messageAction, { teammateIds: ["alice"] })).matched).toBe(false);
  });

  it("requires the exact membership via containsExactly, order aside", async () => {
    const only: RuleConditions = {
      all: [{ fact: "teammateIds", operator: "containsExactly", value: ["alice", "bob"] }],
    };
    expect(
      (await rulesEvaluationService.simulate(only, messageAction, { teammateIds: ["bob", "alice"] })).matched,
    ).toBe(true);
    expect(
      (await rulesEvaluationService.simulate(only, messageAction, { teammateIds: ["alice", "bob", "carl"] })).matched,
    ).toBe(false);
  });

  it("matches any member via containsAny and its negation via containsNone", async () => {
    const facts = { teammateIds: ["alice", "bob"] };
    const any: RuleConditions = { all: [{ fact: "teammateIds", operator: "containsAny", value: ["bob", "dana"] }] };
    const none: RuleConditions = { all: [{ fact: "teammateIds", operator: "containsNone", value: ["carl", "dana"] }] };

    expect((await rulesEvaluationService.simulate(any, messageAction, facts)).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(any, messageAction, { teammateIds: ["carl"] })).matched).toBe(false);
    expect((await rulesEvaluationService.simulate(none, messageAction, facts)).matched).toBe(true);
    expect((await rulesEvaluationService.simulate(none, messageAction, { teammateIds: ["dana"] })).matched).toBe(false);
  });

  it("leaves list operators false on an undefined fact rather than throwing", async () => {
    const conditions: RuleConditions = { all: [{ fact: "teammateIds", operator: "containsAll", value: ["alice"] }] };
    expect((await rulesEvaluationService.simulate(conditions, messageAction, {})).matched).toBe(false);
  });

  it("matches a whole team via containsAll on the winning line-up", async () => {
    const agds: RuleConditions = { all: [{ fact: "winnerIds", operator: "containsAll", value: ["alice", "bob"] }] };
    expect((await rulesEvaluationService.simulate(agds, messageAction, { winnerIds: ["alice", "bob"] })).matched).toBe(
      true,
    );
    expect((await rulesEvaluationService.simulate(agds, messageAction, { winnerIds: ["alice"] })).matched).toBe(false);
  });

  it("requires the exact winning line-up via containsExactly", async () => {
    const onlyAgds: RuleConditions = {
      all: [{ fact: "winnerIds", operator: "containsExactly", value: ["alice", "bob"] }],
    };
    expect(
      (await rulesEvaluationService.simulate(onlyAgds, messageAction, { winnerIds: ["bob", "alice"] })).matched,
    ).toBe(true);
    // One extra player is no longer that exact team.
    expect(
      (await rulesEvaluationService.simulate(onlyAgds, messageAction, { winnerIds: ["alice", "bob", "carl"] })).matched,
    ).toBe(false);
  });

  it("reserves a team message to the winners via isWinner", async () => {
    const conditions: RuleConditions = {
      all: [
        { fact: "winnerIds", operator: "containsExactly", value: ["alice", "bob"] },
        { fact: "isWinner", operator: "equal", value: true },
      ],
    };
    const winnerIds = ["alice", "bob"];
    expect(
      (await rulesEvaluationService.simulate(conditions, messageAction, { winnerIds, isWinner: true })).matched,
    ).toBe(true);
    // A loser sees the same match-level winnerIds, but is not on that side.
    expect(
      (await rulesEvaluationService.simulate(conditions, messageAction, { winnerIds, isWinner: false })).matched,
    ).toBe(false);
  });

  it("gates a rule on randomRoll so base messages can still show up", async () => {
    const thirtyPercent: RuleConditions = { all: [{ fact: "randomRoll", operator: "lessThan", value: 30 }] };
    expect((await rulesEvaluationService.simulate(thirtyPercent, messageAction, { randomRoll: 10 })).matched).toBe(
      true,
    );
    expect((await rulesEvaluationService.simulate(thirtyPercent, messageAction, { randomRoll: 50 })).matched).toBe(
      false,
    );
  });
});
