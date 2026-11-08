import { describe, it, expect } from "bun:test";

import {
  MATCH_COUNT_FACT,
  createRuleSchema,
  matchCountLeaves,
  ruleConditionsSchema,
  usesDisciplineWindow,
  usesMatchCount,
  badgeActionSchema,
  messageActionSchema,
  updateRuleSchema,
} from "../src/types/rules-engine";

const leaf = (fact: string, extra: Record<string, unknown> = {}) => ({ fact, operator: "equal", value: 1, ...extra }) as never;
const counter = (window?: "season" | "discipline") =>
  leaf(MATCH_COUNT_FACT, { params: { conditions: { all: [] }, ...(window ? { window } : {}) } });

describe("season counters in a condition tree", () => {
  it("finds counters at any depth and ignores ordinary facts", () => {
    const tree = { all: [leaf("scoreA"), { any: [counter(), { all: [counter("discipline")] }] }] } as never;
    expect(matchCountLeaves(tree)).toHaveLength(2);
    expect(matchCountLeaves(leaf("scoreA"))).toEqual([]);
    expect(matchCountLeaves(counter())).toHaveLength(1);
  });

  it("knows when a counter spans several seasons", () => {
    expect(usesDisciplineWindow({ all: [counter("discipline")] } as never)).toBe(true);
    expect(usesDisciplineWindow({ all: [counter("season"), counter()] } as never)).toBe(false);
    expect(usesDisciplineWindow(leaf("scoreA"))).toBe(false);
  });

  it("detects any use of the counter, tolerating no conditions at all", () => {
    expect(usesMatchCount(null)).toBe(false);
    expect(usesMatchCount(undefined)).toBe(false);
    expect(usesMatchCount(leaf("scoreA"))).toBe(false);
    expect(usesMatchCount(counter())).toBe(true);
    expect(usesMatchCount({ all: [leaf("a"), { any: [counter()] }] } as never)).toBe(true);
    expect(usesMatchCount({ any: [leaf("a")] } as never)).toBe(false);
  });
});

describe("rule schemas", () => {
  const base = {
    triggerEvent: "match_submitted",
    type: "badge",
    scope: "global",
    name: "Champion",
    conditions: { all: [leaf("winner")] },
    action: { type: "badge", icon: "star", label: "Champion", description: "Won it all" },
  };

  it("accepts a badge rule and fills the defaults", () => {
    const parsed = createRuleSchema.parse(base);
    expect(parsed).toMatchObject({ priority: 0, isActive: true });
    expect((parsed.action as { recurrence: string }).recurrence).toBe("per_season");
  });

  it("accepts a message rule with up to ten variants", () => {
    const message = { ...base, type: "message", action: { type: "message", variants: ["Well played"] } };
    expect(createRuleSchema.safeParse(message).success).toBe(true);
    expect(messageActionSchema.safeParse({ type: "message", variants: Array(11).fill("x") }).success).toBe(false);
    expect(messageActionSchema.safeParse({ type: "message", variants: [] }).success).toBe(false);
    expect(messageActionSchema.safeParse({ type: "message", variants: [""] }).success).toBe(false);
  });

  it("refuses incomplete or oversized rules", () => {
    expect(createRuleSchema.safeParse({ ...base, name: "x" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...base, triggerEvent: "other" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...base, disciplineId: "not-a-uuid" }).success).toBe(false);
    expect(badgeActionSchema.safeParse({ type: "badge", icon: "", label: "L", description: "D" }).success).toBe(false);
    expect(badgeActionSchema.safeParse({ type: "badge", icon: "i", label: "L".repeat(61), description: "D" }).success).toBe(false);
    expect(badgeActionSchema.safeParse({ type: "badge", icon: "i", label: "L", description: "D", recurrence: "weekly" }).success).toBe(false);
  });

  it("validates nested conditions", () => {
    expect(ruleConditionsSchema.safeParse({ all: [{ any: [leaf("a")] }, leaf("b")] }).success).toBe(true);
    expect(ruleConditionsSchema.safeParse({ all: [{ fact: "", operator: "equal", value: 1 }] }).success).toBe(false);
    expect(ruleConditionsSchema.safeParse(counter("discipline")).success).toBe(true);
  });

  it("lets an update carry any subset of fields", () => {
    expect(updateRuleSchema.safeParse({}).success).toBe(true);
    expect(updateRuleSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(updateRuleSchema.safeParse({ name: "x" }).success).toBe(false);
  });
});
