import { describe, it, expect } from "bun:test";

import {
  indexRulesetOutcomes,
  resolveRuleset,
  resolveRulesetInteractionMode,
  resolveRulesetOutcome,
  rulesetsEqual,
  selectableRulesetOutcomes,
} from "../src/types/tournament-ruleset";

const outcome = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, isDefault: false, reasons: [], ...extra }) as never;

const payload = (outcomeTypes: unknown[], discipline: unknown = null) =>
  ({ discipline, outcomeTypes }) as never;

describe("resolveRuleset", () => {
  it("falls back to an empty ruleset", () => {
    expect(resolveRuleset(null)).toEqual({ discipline: null, outcomeTypes: [] });
    expect(resolveRuleset(undefined).outcomeTypes).toEqual([]);
  });

  it("returns the payload itself when present", () => {
    const p = payload([]);
    expect(resolveRuleset(p)).toBe(p);
  });
});

describe("resolveRulesetInteractionMode", () => {
  it("uses the discipline's mode when set", () => {
    const p = payload([], { teamInteractionMode: "cooperative" });
    expect(resolveRulesetInteractionMode(p)).toBe("cooperative");
  });

  it("defaults when there is no discipline", () => {
    expect(resolveRulesetInteractionMode(null)).toBe(resolveRulesetInteractionMode(payload([])));
  });
});

describe("resolveRulesetOutcome", () => {
  it("finds an outcome by id", () => {
    const p = payload([outcome("a"), outcome("b")]);
    expect(resolveRulesetOutcome(p, "b").id).toBe("b");
  });

  it("answers the defaults for a null or unknown id", () => {
    expect(resolveRulesetOutcome(payload([outcome("a")]), null).id).toBe("default");
    expect(resolveRulesetOutcome(payload([outcome("a")]), "gone").id).toBe("gone");
    expect(resolveRulesetOutcome(null, "x").reasons).toEqual([]);
  });
});

describe("indexRulesetOutcomes / selectableRulesetOutcomes", () => {
  const p = payload([outcome("a"), outcome("b", { archivedAt: "2025-01-01" })]);

  it("indexes by id and tolerates a missing payload", () => {
    expect([...indexRulesetOutcomes(p).keys()]).toEqual(["a", "b"]);
    expect(indexRulesetOutcomes(null).size).toBe(0);
  });

  it("leaves archived outcomes out of the selectable list", () => {
    expect(selectableRulesetOutcomes(p).map((o) => o.id)).toEqual(["a"]);
    expect(selectableRulesetOutcomes(undefined)).toEqual([]);
  });
});

describe("rulesetsEqual", () => {
  it("ignores key order, as a jsonb round trip reorders keys", () => {
    const a = { discipline: null, outcomeTypes: [{ id: "x", name: "X" }] } as never;
    const b = { outcomeTypes: [{ name: "X", id: "x" }], discipline: null } as never;
    expect(rulesetsEqual(a, b)).toBe(true);
  });

  it("treats undefined fields as absent", () => {
    const a = { discipline: null, outcomeTypes: [], extra: undefined } as never;
    const b = { discipline: null, outcomeTypes: [] } as never;
    expect(rulesetsEqual(a, b)).toBe(true);
  });

  it("sees real differences, including array order", () => {
    expect(rulesetsEqual(payload([outcome("a"), outcome("b")]), payload([outcome("b"), outcome("a")]))).toBe(false);
    expect(rulesetsEqual(payload([]), null)).toBe(false);
  });

  it("considers null and undefined the same absence", () => {
    expect(rulesetsEqual(null, undefined)).toBe(true);
  });
});
