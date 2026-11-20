import { MIN_WEIGHTED_RATE_MATCHES } from "@skol-arena/shared";

// The threshold lives in the shared package: the cards have to explain it to the reader,
// and two copies of the number would eventually disagree.
export { MIN_WEIGHTED_RATE_MATCHES };

/** How many entries a weighted-rate ranking keeps. */
export const TOP_WEIGHTED_RATE = 3;

/**
 * Weighted rates are floating point, so two mathematically equal scores can
 * differ in their last bits. Comparing them exactly would send such a pair to
 * the tie-break only by luck.
 */
export const SCORE_EPSILON = 1e-9;

/** How many rows a leaderboard shows before falling back to a "+N tied" line. */
export const MAX_LEADER_ROWS = 6;

/** How many distinct ranks a leaderboard shows — a podium, ties expanded. */
export const MAX_DISTINCT_RANKS = 3;

/** How many names an honour roll lists when no ranking separates anyone. */
export const MAX_HONOUR_ROLL = 12;

/**
 * Ranks entries by success rate weighted by sample size (rate × √matches), so a single
 * lucky match never outranks a long, consistently good record. Entries below minMatches
 * are dropped entirely rather than advertising a statistic nobody should trust.
 *
 * Pass minMatches = 0 to rank without the threshold — used as a fallback when the
 * threshold would leave the list empty and showing nothing is worse than showing a
 * clearly labelled small sample.
 *
 * `breakTie` separates entries the rate and the sample size cannot. Without it the
 * winner is decided by the order the entries happened to be built in, which is
 * reproducible but explicable to nobody.
 */
export function rankByWeightedRate<T>(
  items: T[],
  rateOf: (item: T) => number,
  countOf: (item: T) => number,
  minMatches: number = MIN_WEIGHTED_RATE_MATCHES,
  breakTie: (a: T, b: T) => number = () => 0,
  limit: number = TOP_WEIGHTED_RATE,
): T[] {
  return items
    .filter((item) => countOf(item) >= minMatches)
    .map((item) => ({ item, score: weightedScore(rateOf(item), countOf(item)) }))
    .sort(
      (a, b) =>
        (Math.abs(a.score - b.score) > SCORE_EPSILON ? b.score - a.score : 0) ||
        countOf(b.item) - countOf(a.item) ||
        breakTie(a.item, b.item),
    )
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * The same ranking, but never empty-handed: a tournament whose players have not
 * yet reached the threshold gets the unfiltered ranking rather than a blank
 * card. Callers show the sample size next to each rate, so a small one is
 * visible rather than hidden — which is the whole point of not dropping it.
 */
/** The score `rankByWeightedRate` sorts on, exposed so callers can test two entries for equality. */
export function weightedScore(rate: number, count: number): number {
  return rate * Math.sqrt(count);
}

/**
 * The tie predicate matching `rankByWeightedRate`: same weighted score *and* same sample
 * size. The sample size is a real criterion there, so two entries that differ on it are
 * ranked apart, not tied.
 */
export function weightedRateTie<T>(rateOf: (item: T) => number, countOf: (item: T) => number): (a: T, b: T) => boolean {
  return (a, b) =>
    Math.abs(weightedScore(rateOf(a), countOf(a)) - weightedScore(rateOf(b), countOf(b))) <= SCORE_EPSILON &&
    countOf(a) === countOf(b);
}

export interface RankedEntry<T> {
  item: T;
  /** Competition rank (1,1,1,4): entries no criterion separates share a rank. */
  rank: number;
  /** How many entries share this rank, this one included. */
  tiedCount: number;
}

/**
 * Turns an already-sorted list into competition ranks. `isTied` must answer "do the
 * ranking criteria consider these two equal?" — it is deliberately not the sort
 * comparator, whose last term is a uuid that separates everything and would report a
 * tie as a difference.
 */
export function assignCompetitionRanks<T>(sorted: T[], isTied: (a: T, b: T) => boolean): RankedEntry<T>[] {
  const ranked: RankedEntry<T>[] = [];
  let start = 0;

  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && isTied(sorted[start]!, sorted[end]!)) end++;
    for (let i = start; i < end; i++) {
      ranked.push({ item: sorted[i]!, rank: start + 1, tiedCount: end - start });
    }
    start = end;
  }

  return ranked;
}

/**
 * Keeps the top of a ranking without ever splitting a tied group: showing two of three
 * players with the same record and hiding the third is exactly the unfairness ranks are
 * meant to fix. The rest is returned ranked, because "cut for space" and "tied with the
 * last row shown" are different things and only the second one is an ex aequo.
 */
export function cutWholeRankGroups<T>(
  ranked: RankedEntry<T>[],
  maxRanks: number,
  maxRows: number,
): { shown: RankedEntry<T>[]; omitted: RankedEntry<T>[] } {
  const shown: RankedEntry<T>[] = [];
  let cursor = 0;

  // Compare against the entry's actual competition rank, not the number of groups
  // visited: a tie at rank 1 consumes two rank *slots*, so the next group already
  // starts at rank 3 — counting groups instead would let it through as if it were
  // still within the top 3.
  while (cursor < ranked.length && ranked[cursor]!.rank <= maxRanks) {
    const size = ranked[cursor]!.tiedCount;
    if (shown.length + size > maxRows) break;
    shown.push(...ranked.slice(cursor, cursor + size));
    cursor += size;
  }

  // A first group wider than the cap still has to show something rather than nothing.
  if (shown.length === 0 && maxRanks > 0 && ranked.length > 0) {
    cursor = Math.min(maxRows, ranked.length);
    shown.push(...ranked.slice(0, cursor));
  }

  return { shown, omitted: ranked.slice(cursor) };
}

/**
 * The entries a cut left out *of the last rank it showed* — the only ones the reader is
 * owed an "and N tied" for. Everyone further down simply did not make the podium.
 */
export function omittedTiedWithLast<T>(shown: RankedEntry<T>[], omitted: RankedEntry<T>[]): T[] {
  const lastRank = shown.at(-1)?.rank;
  if (lastRank === undefined) return [];
  return omitted.filter((entry) => entry.rank === lastRank).map((entry) => entry.item);
}

/**
 * True when the ranking separates nobody: everyone shares rank 1. A lone entry is not
 * flat — being the only one to pull something off is an achievement, not a tie.
 */
export function isFlatRanking<T>(ranked: RankedEntry<T>[]): boolean {
  return ranked.length >= 2 && ranked[0]!.tiedCount === ranked.length;
}

export function rankByWeightedRateOrFallback<T>(
  items: T[],
  rateOf: (item: T) => number,
  countOf: (item: T) => number,
  breakTie: (a: T, b: T) => number = () => 0,
  limit: number = TOP_WEIGHTED_RATE,
): T[] {
  const ranked = rankByWeightedRate(items, rateOf, countOf, MIN_WEIGHTED_RATE_MATCHES, breakTie, limit);
  if (ranked.length > 0) return ranked;
  return rankByWeightedRate(items, rateOf, countOf, 0, breakTie, limit);
}
