import type { Almanac, Engine } from "json-rules-engine";
import { MATCH_COUNT_FACT, type MatchCountParams, type RuleConditions } from "@skol-arena/shared";
import { createRulesEngine } from "./rules-operators";

type Facts = Record<string, unknown>;

type MatchCounter = (history: Facts[], conditions: RuleConditions) => Promise<number>;

/**
 * Runtime fact carrying the evaluated player's facts for every match of the season
 * so far, the current one included, oldest first. Internal: never in the catalog.
 */
export const MATCH_HISTORY_FACT = "__matchHistory";

/** The same, over every season of the match's discipline. Only for `window: "discipline"`. */
export const DISCIPLINE_HISTORY_FACT = "__disciplineHistory";

/**
 * A counter remembering each match's verdict per sub-condition: a replay counts over
 * a history growing by one match at a time, and would otherwise re-evaluate all of it
 * at every step. Keyed on the facts object, so a verdict lives as long as its history.
 */
export function createMatchCounter(): MatchCounter {
  const engines = new Map<string, Engine>();
  const verdicts = new WeakMap<Facts, Map<string, boolean>>();

  const engineFor = (key: string, conditions: RuleConditions): Engine => {
    let engine = engines.get(key);
    if (!engine) {
      engine = createRulesEngine();
      engine.addRule({ conditions: conditions as never, event: { type: "counted" } });
      engines.set(key, engine);
    }
    return engine;
  };

  const meets = async (facts: Facts, key: string, conditions: RuleConditions): Promise<boolean> => {
    const known = verdicts.get(facts) ?? new Map<string, boolean>();
    verdicts.set(facts, known);
    let verdict = known.get(key);
    if (verdict === undefined) {
      verdict = (await engineFor(key, conditions).run(facts)).events.length > 0;
      known.set(key, verdict);
    }
    return verdict;
  };

  return async (history, conditions) => {
    const key = JSON.stringify(conditions);
    let count = 0;
    for (const facts of history) {
      if (await meets(facts, key, conditions)) count += 1;
    }
    return count;
  };
}

/**
 * Teaches an engine the `matchCount` fact: it counts, in the history handed to the
 * run for the leaf's window, the matches meeting the leaf's `params.conditions`.
 * A run without a history (the simulator) counts nothing unless the caller passes
 * `matchCount` itself, which then wins as a plain runtime fact.
 */
export function registerMatchCountFact(engine: Engine): void {
  const count = createMatchCounter();
  engine.addFact(MATCH_COUNT_FACT, async (params: unknown, almanac: Almanac) => {
    const { conditions, window } = (params as Partial<MatchCountParams> | undefined) ?? {};
    if (!conditions) return 0;
    const fact = window === "discipline" ? DISCIPLINE_HISTORY_FACT : MATCH_HISTORY_FACT;
    const history = (await almanac.factValue<Facts[]>(fact).catch(() => undefined)) ?? [];
    return count(history, conditions);
  });
}
