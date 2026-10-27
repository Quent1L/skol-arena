import { Engine, type Almanac } from "json-rules-engine";
import { MATCH_COUNT_FACT, type MatchCountParams, type RuleConditions } from "@skol-arena/shared";
import { RULE_OPERATORS } from "./rules-operators";

type Facts = Record<string, unknown>;

/**
 * Runtime fact carrying the evaluated player's facts for every match of the season
 * so far, the current one included, oldest first. Internal: never in the catalog.
 */
export const MATCH_HISTORY_FACT = "__matchHistory";

/** Whether a condition tree uses the season counter anywhere. */
export function usesMatchCount(conditions: RuleConditions): boolean {
  if ("all" in conditions) return conditions.all.some(usesMatchCount);
  if ("any" in conditions) return conditions.any.some(usesMatchCount);
  return conditions.fact === MATCH_COUNT_FACT;
}

/** Number of past matches whose facts meet `conditions`. */
export async function countMatching(history: Facts[], conditions: RuleConditions): Promise<number> {
  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const operator of RULE_OPERATORS) engine.addOperator(operator);
  engine.addRule({ conditions: conditions as never, event: { type: "counted" } });
  let count = 0;
  for (const facts of history) {
    const { events } = await engine.run(facts);
    if (events.length > 0) count += 1;
  }
  return count;
}

/**
 * Teaches an engine the `matchCount` fact: it counts, in the history handed to the
 * run as `__matchHistory`, the matches meeting the leaf's `params.conditions`.
 * A run without a history (the simulator) counts nothing unless the caller passes
 * `matchCount` itself, which then wins as a plain runtime fact.
 */
export function registerMatchCountFact(engine: Engine): void {
  engine.addFact(MATCH_COUNT_FACT, async (params: unknown, almanac: Almanac) => {
    const conditions = (params as Partial<MatchCountParams> | undefined)?.conditions;
    if (!conditions) return 0;
    const history = (await almanac.factValue<Facts[]>(MATCH_HISTORY_FACT).catch(() => undefined)) ?? [];
    return countMatching(history, conditions);
  });
}
