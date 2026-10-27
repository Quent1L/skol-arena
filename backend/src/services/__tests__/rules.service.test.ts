/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { CreateRuleData, RuleConditions } from "@skol-arena/shared";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRulesRepo = {
  getById: mock((_id: any) => Promise.resolve({ id: "rule-1", type: "badge" } as any)),
  create: mock((data: any) => Promise.resolve({ ...data, id: "rule-1" })),
  update: mock((id: any, data: any) => Promise.resolve({ id, ...data })),
  markBadgeRulesDirty: mock(() => Promise.resolve()),
};
mock.module("../../repository/rules.repository", () => ({ rulesRepository: mockRulesRepo }));

const { rulesService } = await import("../rules.service");

const randomCondition: RuleConditions = { all: [{ fact: "randomRoll", operator: "lessThan", value: 30 }] };
const streakCondition: RuleConditions = { all: [{ fact: "winStreak", operator: "greaterThanInclusive", value: 3 }] };

function baseRule(overrides: Partial<CreateRuleData> = {}): CreateRuleData {
  return {
    triggerEvent: "match_submitted",
    type: "message",
    scope: "global",
    disciplineId: null,
    priority: 0,
    name: "Test rule",
    description: null,
    conditions: streakCondition,
    action: { type: "message", variants: ["ok"] },
    isActive: true,
    ...overrides,
  } as CreateRuleData;
}

beforeEach(() => {
  mockRulesRepo.getById.mockClear();
  mockRulesRepo.create.mockClear();
  mockRulesRepo.update.mockClear();
});

describe("RulesService — non-deterministic facts", () => {
  it("accepts randomRoll on a message rule", async () => {
    const rule = await rulesService.create(baseRule({ conditions: randomCondition }), "admin-1");
    expect(rule.id).toBe("rule-1");
    expect(mockRulesRepo.create).toHaveBeenCalled();
  });

  it("rejects randomRoll on a badge rule (reconciliation must stay deterministic)", async () => {
    const badgeRule = baseRule({
      type: "badge",
      conditions: randomCondition,
      action: { type: "badge", icon: "fa fa-dice", label: "Chanceux", description: "Coup de bol", recurrence: "per_season" },
    });
    await expect(rulesService.create(badgeRule, "admin-1")).rejects.toThrow("RANDOM_NOT_ALLOWED_ON_BADGE");
    expect(mockRulesRepo.create).not.toHaveBeenCalled();
  });

  it("rejects randomRoll on update when the stored rule is a badge and type is omitted", async () => {
    await expect(
      rulesService.update("rule-1", { triggerEvent: "match_submitted", conditions: randomCondition }),
    ).rejects.toThrow("RANDOM_NOT_ALLOWED_ON_BADGE");
    expect(mockRulesRepo.update).not.toHaveBeenCalled();
  });

  it("rejects a partial PATCH that switches an existing randomRoll rule to badge", async () => {
    mockRulesRepo.getById.mockImplementationOnce(() =>
      Promise.resolve({
        id: "rule-1",
        type: "message",
        triggerEvent: "match_submitted",
        scope: "global",
        disciplineId: null,
        conditions: randomCondition,
      } as never),
    );
    await expect(rulesService.update("rule-1", { type: "badge" })).rejects.toThrow("RANDOM_NOT_ALLOWED_ON_BADGE");
    expect(mockRulesRepo.update).not.toHaveBeenCalled();
  });

  it("accepts the new line-up facts on a badge rule", async () => {
    const badgeRule = baseRule({
      type: "badge",
      conditions: { all: [{ fact: "teammateIds", operator: "contains", value: "player-1" }] },
      action: { type: "badge", icon: "fa fa-users", label: "Duo", description: "With this player", recurrence: "per_season" },
    });
    await rulesService.create(badgeRule, "admin-1");
    expect(mockRulesRepo.create).toHaveBeenCalled();
  });

  it("exposes every outcome fact in the catalog", async () => {
    const keys = rulesService.getCatalog("match_submitted").facts.map((f) => f.key);
    expect(keys).toContain("outcomeType");
    expect(keys).toContain("outcomeTypeName");
    expect(keys).toContain("isDefaultOutcome");
    expect(keys).toContain("outcomeReason");
    expect(keys).toContain("outcomeReasonName");
  });

  it("accepts outcome facts on a badge rule (they are read from the match row, so deterministic)", async () => {
    const badgeRule = baseRule({
      type: "badge",
      conditions: {
        all: [
          { fact: "outcomeType", operator: "equal", value: "ot-forfeit" },
          { fact: "isDefaultOutcome", operator: "equal", value: false },
          { fact: "outcomeReasonName", operator: "equal", value: "Injury" },
        ],
      },
      action: { type: "badge", icon: "fa fa-ban", label: "No mercy", description: "Won by forfeit", recurrence: "per_season" },
    });
    await rulesService.create(badgeRule, "admin-1");
    expect(mockRulesRepo.create).toHaveBeenCalled();
  });

  it("rejects an operator the fact's type does not support", async () => {
    // A list operator on a scalar fact: json-rules-engine would evaluate it to
    // false forever, which surfaces as "my rule never fires".
    const rule = baseRule({
      conditions: { all: [{ fact: "playerId", operator: "containsAll", value: ["p1", "p2"] }] },
    });
    await expect(rulesService.create(rule, "admin-1")).rejects.toThrow("INVALID_OPERATOR_FOR_FACT");
    expect(mockRulesRepo.create).not.toHaveBeenCalled();
  });

  it("accepts the set operators on a line-up fact", async () => {
    const rule = baseRule({
      conditions: { all: [{ fact: "winnerIds", operator: "containsExactly", value: ["p1", "p2"] }] },
    });
    await rulesService.create(rule, "admin-1");
    expect(mockRulesRepo.create).toHaveBeenCalled();
  });

  describe("matchCount", () => {
    const counter = (overrides: Record<string, unknown> = {}): RuleConditions => ({
      all: [
        {
          fact: "matchCount",
          params: { conditions: streakCondition },
          operator: "greaterThanInclusive",
          value: 10,
          ...overrides,
        },
      ],
    });

    it("accepts a counter over catalog facts", async () => {
      await rulesService.create(baseRule({ type: "badge", conditions: counter() }), "admin-1");
      expect(mockRulesRepo.create).toHaveBeenCalled();
    });

    it("rejects a counter without sub-conditions", async () => {
      const rule = baseRule({ conditions: counter({ params: { conditions: { all: [] } } }) });
      await expect(rulesService.create(rule, "admin-1")).rejects.toThrow("INVALID_MATCH_COUNT");
    });

    it("rejects a counter without a whole number to compare with", async () => {
      const rule = baseRule({ conditions: counter({ value: "ten" }) });
      await expect(rulesService.create(rule, "admin-1")).rejects.toThrow("INVALID_MATCH_COUNT");
    });

    it("rejects a non-numeric operator on a counter", async () => {
      const rule = baseRule({ conditions: counter({ operator: "contains" }) });
      await expect(rulesService.create(rule, "admin-1")).rejects.toThrow("INVALID_OPERATOR_FOR_FACT");
    });

    it("checks the sub-conditions against the catalog, random gating included", async () => {
      const unknown = baseRule({
        conditions: counter({ params: { conditions: { all: [{ fact: "nope", operator: "equal", value: 1 }] } } }),
      });
      await expect(rulesService.create(unknown, "admin-1")).rejects.toThrow();
      const random = baseRule({ type: "badge", conditions: counter({ params: { conditions: randomCondition } }) });
      await expect(rulesService.create(random, "admin-1")).rejects.toThrow("RANDOM_NOT_ALLOWED_ON_BADGE");
    });
  });

  it("exposes the line-up facts in the catalog", async () => {
    const facts = rulesService.getCatalog("match_submitted").facts;
    const winnerIds = facts.find((f) => f.key === "winnerIds");
    expect(winnerIds?.type).toBe("stringList");
    expect(winnerIds?.operators).toContain("containsExactly");
    expect(facts.map((f) => f.key)).toContain("isWinner");
  });

  it("refuses to save a rule still expressed against a retired fact", async () => {
    // What an admin hits when opening a rule the patch chain deactivated: it cannot
    // be saved back until the condition is rewritten in the current vocabulary.
    const rule = baseRule({ conditions: { all: [{ fact: "winnerId", operator: "equal", value: "p1" }] } });
    await expect(rulesService.create(rule, "admin-1")).rejects.toThrow();
    expect(mockRulesRepo.create).not.toHaveBeenCalled();
  });

  it("still rejects facts absent from the catalog", async () => {
    const rule = baseRule({ conditions: { all: [{ fact: "notAFact", operator: "equal", value: 1 }] } });
    await expect(rulesService.create(rule, "admin-1")).rejects.toThrow();
    expect(mockRulesRepo.create).not.toHaveBeenCalled();
  });
});
