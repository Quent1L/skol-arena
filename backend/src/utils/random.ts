import { randomInt } from "node:crypto";

/** Uniform integer in [0, bound). */
export function randomBelow(bound: number): number {
  return randomInt(bound);
}

/** Unbiased Fisher-Yates shuffle; returns a new array. */
export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
