import { Engine, Operator } from "json-rules-engine";

/**
 * Custom operators layered on top of json-rules-engine's defaults.
 *
 * Two reasons they exist:
 *
 * 1. The stock `contains` / `doesNotContain` are declared with `Array.isArray` as
 *    their fact-value validator, and `Operator.evaluate` short-circuits on it. On a
 *    string fact they therefore always return false — no error, no warning — which
 *    makes `doesNotContain` read as the exact opposite of what it does. Both are
 *    redefined here to fall back to substring matching.
 * 2. The builder needs to compare a whole line-up against several players at once
 *    (`containsAll` and friends), which the stock single-value operators cannot do.
 */

type Haystack = string | unknown[];

const isListOrText = (value: unknown): boolean => Array.isArray(value) || typeof value === "string";

/** The rule side of the comparison; the builder always serializes it as an array. */
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const includes = (haystack: Haystack, needle: unknown): boolean =>
  typeof haystack === "string" ? haystack.includes(String(needle)) : haystack.includes(needle);

/** Set equality: order and duplicates are irrelevant for a line-up. */
const sameMembers = (actual: unknown[], expected: unknown): boolean => {
  const wanted = new Set(asList(expected));
  const got = new Set(actual);
  return wanted.size === got.size && [...wanted].every((value) => got.has(value));
};

export const RULE_OPERATORS: Operator[] = [
  new Operator<Haystack, unknown>("contains", includes, isListOrText),
  new Operator<Haystack, unknown>("doesNotContain", (a, b) => !includes(a, b), isListOrText),

  new Operator<unknown[], unknown>(
    "containsAll",
    (a, b) => asList(b).every((value) => a.includes(value)),
    Array.isArray,
  ),
  new Operator<unknown[], unknown>(
    "containsAny",
    (a, b) => asList(b).some((value) => a.includes(value)),
    Array.isArray,
  ),
  new Operator<unknown[], unknown>(
    "containsNone",
    (a, b) => !asList(b).some((value) => a.includes(value)),
    Array.isArray,
  ),
  new Operator<unknown[], unknown>("containsExactly", sameMembers, Array.isArray),
] as Operator[];

/** An empty engine set up the one way rules are evaluated: live, replayed or counted. */
export function createRulesEngine(): Engine {
  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const operator of RULE_OPERATORS) engine.addOperator(operator);
  return engine;
}
