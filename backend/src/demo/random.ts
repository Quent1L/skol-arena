/**
 * Seeded randomness for the generated data sets.
 *
 * Every "random" draw of a seed goes through one of these, so re-running it on an
 * empty database reproduces the same standings, the same ladder and the same
 * history. The LCG constants are the ones the screenshot seed has always used:
 * changing them would reshuffle the published screenshots.
 */
export type Random = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(minInclusive: number, maxInclusive: number): number;
  /** In-place Fisher-Yates shuffle, returns the same array. */
  shuffle<T>(items: T[]): T[];
};

export function createRandom(seed: number): Random {
  let state = seed;

  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const int = (minInclusive: number, maxInclusive: number) =>
    minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));

  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  };

  return { next, int, shuffle };
}

/**
 * Every pair of `ids` once per round, `meetings` rounds, in a shuffled order so the
 * chronology of a generated competition stays unpredictable.
 */
export function buildPairings<T>(random: Random, ids: T[], meetings: number): [T, T][] {
  const pairs: [T, T][] = [];
  for (let round = 0; round < meetings; round++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs.push([ids[i]!, ids[j]!]);
      }
    }
  }
  return random.shuffle(pairs);
}

/**
 * Whether side A wins, drawn from the two hidden strengths (0..1): a logistic on the
 * gap, so a gap of 0.3 wins about three times out of four. Standings end up ordered,
 * but not perfectly.
 */
export function favouredWins(random: Random, strengthA: number, strengthB: number): boolean {
  const pA = 1 / (1 + Math.exp(-(strengthA - strengthB) * 6));
  return random.next() < pA;
}
