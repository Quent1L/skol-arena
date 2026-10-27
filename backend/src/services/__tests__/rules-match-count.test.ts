import { describe, it, expect } from "bun:test";
import { Engine } from "json-rules-engine";
import {
  MATCH_HISTORY_FACT,
  countMatching,
  registerMatchCountFact,
  usesMatchCount,
} from "../rules-match-count";
import type { RuleConditions } from "@skol-arena/shared";

const GOLD_WIN: RuleConditions = {
  all: [
    { fact: "isWinner", operator: "equal", value: true },
    { fact: "newRank", operator: "equal", value: "gold" },
  ],
};

const HISTORY = [
  { isWinner: true, newRank: "silver" },
  { isWinner: true, newRank: "gold" },
  { isWinner: false, newRank: "gold" },
  { isWinner: true, newRank: "gold" },
];

describe("countMatching", () => {
  it("counts the matches meeting every sub-condition", async () => {
    expect(await countMatching(HISTORY, GOLD_WIN)).toBe(2);
  });

  it("supports any-groups and the custom operators", async () => {
    const conditions: RuleConditions = {
      any: [
        { fact: "newRank", operator: "contains", value: "silv" },
        { fact: "isWinner", operator: "equal", value: false },
      ],
    };
    expect(await countMatching(HISTORY, conditions)).toBe(2);
  });

  it("counts nothing over an empty history", async () => {
    expect(await countMatching([], GOLD_WIN)).toBe(0);
  });
});

describe("usesMatchCount", () => {
  it("finds a counter nested in groups", () => {
    const leaf = { fact: "matchCount", params: { conditions: GOLD_WIN }, operator: "equal", value: 1 };
    expect(usesMatchCount({ all: [{ any: [leaf] }] })).toBe(true);
    expect(usesMatchCount(GOLD_WIN)).toBe(false);
  });
});

describe("registerMatchCountFact", () => {
  async function fires(facts: Record<string, unknown>, atLeast: number): Promise<boolean> {
    const engine = new Engine([], { allowUndefinedFacts: true });
    registerMatchCountFact(engine);
    engine.addRule({
      conditions: {
        all: [{ fact: "matchCount", params: { conditions: GOLD_WIN }, operator: "greaterThanInclusive", value: atLeast }],
      } as never,
      event: { type: "hit" },
    });
    return (await engine.run(facts)).events.length > 0;
  }

  it("compares the count over the run's history", async () => {
    expect(await fires({ [MATCH_HISTORY_FACT]: HISTORY }, 2)).toBe(true);
    expect(await fires({ [MATCH_HISTORY_FACT]: HISTORY }, 3)).toBe(false);
  });

  it("counts zero without a history", async () => {
    expect(await fires({}, 1)).toBe(false);
  });

  it("lets a runtime matchCount win, as the simulator passes it", async () => {
    expect(await fires({ matchCount: 5 }, 3)).toBe(true);
  });
});
