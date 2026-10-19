import { and, count, desc, eq, gte, inArray, isNull, lt, max, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../config/database";
import { appUsers, ruleFirings, rules } from "../db/schema";
import type { RuleFiringResult, RuleFiringSurface, RuleType } from "@skol-arena/shared";

export interface RuleFiringDraft {
  ruleId: string;
  ruleType: RuleType;
  engineVersion: number;
  triggerEvent: string;
  playerId: string;
  matchId: string | null;
  seasonId: string | null;
  result: RuleFiringResult;
  variantIndex?: number | null;
  /** The variant's raw template, frozen so later edits cannot rewrite history. */
  variantText?: string | null;
  message?: string | null;
}

/** Aggregate counters for one rule. Every field is derived, never stored. */
export interface RuleFiringTotals {
  firedCount: number;
  distinctPlayers: number;
  selectedCount: number;
  supersededCount: number;
  awardedCount: number;
  deliveredCount: number;
  neverDeliveredCount: number;
  seenCount: number;
  recapCount: number;
  lastFiredAt: Date | null;
}

export interface RuleFiringTotalsRow extends RuleFiringTotals {
  ruleId: string;
}

/**
 * Shared aggregate projection. `filter (where …)` keeps the whole breakdown to a
 * single pass over the rule's rows instead of one query per counter.
 *
 * `seenCount` counts both reveal surfaces: skipping the animation still leaves the
 * message on screen at the end, whereas the recap never renders it at all.
 */
const TOTALS_SELECTION = {
  firedCount: count(),
  distinctPlayers: sql<number>`count(distinct ${ruleFirings.playerId})`.mapWith(Number),
  selectedCount: sql<number>`count(*) filter (where ${ruleFirings.result} = 'selected')`.mapWith(Number),
  supersededCount: sql<number>`count(*) filter (where ${ruleFirings.result} = 'superseded')`.mapWith(Number),
  awardedCount: sql<number>`count(*) filter (where ${ruleFirings.result} = 'awarded')`.mapWith(Number),
  deliveredCount: sql<number>`count(*) filter (where ${ruleFirings.deliveredAt} is not null)`.mapWith(Number),
  neverDeliveredCount: sql<number>`count(*) filter (where ${ruleFirings.deliveredAt} is null)`.mapWith(Number),
  seenCount:
    sql<number>`count(*) filter (where ${ruleFirings.seenSurface} in ('reveal', 'reveal_skipped'))`.mapWith(Number),
  recapCount: sql<number>`count(*) filter (where ${ruleFirings.seenSurface} = 'recap')`.mapWith(Number),
  lastFiredAt: max(ruleFirings.createdAt),
};

const EMPTY_TOTALS: RuleFiringTotals = {
  firedCount: 0,
  distinctPlayers: 0,
  selectedCount: 0,
  supersededCount: 0,
  awardedCount: 0,
  deliveredCount: 0,
  neverDeliveredCount: 0,
  seenCount: 0,
  recapCount: 0,
  lastFiredAt: null,
};

/** One firing as a recipient row. Callers join `appUsers` for the player's name. */
const RECIPIENT_SELECTION = {
  id: ruleFirings.id,
  playerId: ruleFirings.playerId,
  playerName: appUsers.displayName,
  matchId: ruleFirings.matchId,
  result: ruleFirings.result,
  message: ruleFirings.message,
  deliveredAt: ruleFirings.deliveredAt,
  seenAt: ruleFirings.seenAt,
  seenSurface: ruleFirings.seenSurface,
  createdAt: ruleFirings.createdAt,
};

export interface RuleFiringFeedQuery {
  /** `createdAt` is Postgres timestamptz text, see `feed()`. */
  cursor?: { createdAt: string; id: string };
  limit: number;
  type?: RuleType;
  ruleId?: string;
  result?: RuleFiringResult;
  /** Keeps `already_held` rows, left out by default. Ignored when `result` is set. */
  includeHeld?: boolean;
}

export interface RuleFiringFeedRow {
  id: string;
  playerId: string;
  playerName: string;
  matchId: string | null;
  result: RuleFiringResult;
  message: string | null;
  deliveredAt: Date | null;
  seenAt: Date | null;
  seenSurface: RuleFiringSurface | null;
  createdAt: Date;
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  /** The row's `createdAt` at full precision, for the next page's cursor. */
  cursorAt: string;
}

/** Daily buckets over the trailing window, optionally narrowed by `scope`. */
async function dailyBuckets(days: number, scope?: SQL) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const dayBucket = sql`date_trunc('day', ${ruleFirings.createdAt})`;
  return await db
    .select({
      day: sql<string>`to_char(${dayBucket}, 'YYYY-MM-DD')`,
      firedCount: count(),
      seenCount:
        sql<number>`count(*) filter (where ${ruleFirings.seenSurface} in ('reveal', 'reveal_skipped'))`.mapWith(Number),
      recapCount: sql<number>`count(*) filter (where ${ruleFirings.seenSurface} = 'recap')`.mapWith(Number),
      messageCount: sql<number>`count(*) filter (where ${ruleFirings.ruleType} = 'message')`.mapWith(Number),
      // Awarded only: a badge rule matching a player who already holds it is not news.
      badgeCount:
        sql<number>`count(*) filter (where ${ruleFirings.ruleType} = 'badge' and ${ruleFirings.result} = 'awarded')`.mapWith(
          Number,
        ),
    })
    .from(ruleFirings)
    .where(and(scope, gte(ruleFirings.createdAt, since)))
    .groupBy(dayBucket)
    .orderBy(dayBucket);
}

export class RuleFiringRepository {
  /**
   * Records every rule that evaluated true for a match, all players at once.
   *
   * Conflicts are updated rather than ignored: a match re-finalized after a
   * cancellation fires the rules again, and the second pass is the truth. The
   * delivery/seen columns are deliberately left out of the update set — resetting
   * them would erase a reading that did happen.
   */
  async recordMany(drafts: RuleFiringDraft[]): Promise<Map<string, string>> {
    if (drafts.length === 0) return new Map();

    const rows = await db
      .insert(ruleFirings)
      .values(drafts)
      .onConflictDoUpdate({
        target: [ruleFirings.ruleId, ruleFirings.playerId, ruleFirings.matchId],
        set: {
          ruleType: sql`excluded.rule_type`,
          engineVersion: sql`excluded.engine_version`,
          result: sql`excluded.result`,
          variantIndex: sql`excluded.variant_index`,
          variantText: sql`excluded.variant_text`,
          message: sql`excluded.message`,
          createdAt: sql`now()`,
        },
      })
      .returning({
        id: ruleFirings.id,
        ruleId: ruleFirings.ruleId,
        playerId: ruleFirings.playerId,
        matchId: ruleFirings.matchId,
      });

    // Keyed rather than positional: an upsert gives no ordering guarantee.
    return new Map(rows.map((r) => [firingKey(r.ruleId, r.playerId, r.matchId), r.id]));
  }

  /** Ties a firing to the animation event that carries its message. */
  async markDelivered(firingId: string, animationEventId: string): Promise<void> {
    await db
      .update(ruleFirings)
      .set({ deliveredAt: new Date(), animationEventId })
      .where(eq(ruleFirings.id, firingId));
  }

  /**
   * Stamps the surface the player read the message on. Only untouched rows are
   * written, so the first surface wins — re-marking an already-seen event (the
   * client re-sends ids it has not dropped yet) must not rewrite history.
   */
  async markSeen(animationEventIds: string[], surface: RuleFiringSurface): Promise<void> {
    if (animationEventIds.length === 0) return;
    await db
      .update(ruleFirings)
      .set({ seenAt: new Date(), seenSurface: surface })
      .where(and(inArray(ruleFirings.animationEventId, animationEventIds), isNull(ruleFirings.seenAt)));
  }

  /**
   * Totals for every rule that has ever fired, in one grouped pass. Rules with no
   * firing are absent — the caller fills them in at zero from the rule list.
   */
  async totalsByRule(): Promise<RuleFiringTotalsRow[]> {
    return await db
      .select({ ruleId: ruleFirings.ruleId, ...TOTALS_SELECTION })
      .from(ruleFirings)
      .groupBy(ruleFirings.ruleId);
  }

  async totalsForRule(ruleId: string): Promise<RuleFiringTotals> {
    const [row] = await db.select(TOTALS_SELECTION).from(ruleFirings).where(eq(ruleFirings.ruleId, ruleId));
    return row ?? { ...EMPTY_TOTALS };
  }

  /**
   * How each message variant fared. Only `selected` rows carry a variant, so a
   * variant that never won simply does not appear.
   *
   * Grouped on the frozen template, never on `variantIndex`: the index is a
   * position in the rule's array, and it shifts whenever a variant is inserted or
   * removed. Grouping on it folded a variant's history into whatever text later
   * took its slot. Ordering is the caller's job — it knows the rule's live order.
   */
  async variantBreakdown(ruleId: string) {
    return await db
      .select({
        variantText: ruleFirings.variantText,
        firedCount: count(),
        seenCount:
          sql<number>`count(*) filter (where ${ruleFirings.seenSurface} in ('reveal', 'reveal_skipped'))`.mapWith(
            Number,
          ),
      })
      .from(ruleFirings)
      .where(and(eq(ruleFirings.ruleId, ruleId), eq(ruleFirings.result, "selected")))
      .groupBy(ruleFirings.variantText);
  }

  /** Daily buckets over the trailing window, for the detail panel's timeline. */
  async dailyTimeline(ruleId: string, days: number) {
    return await dailyBuckets(days, eq(ruleFirings.ruleId, ruleId));
  }

  /** Daily buckets across every rule, split by the kind of rule that fired. */
  async globalDailyTimeline(days: number) {
    return await dailyBuckets(days);
  }

  /**
   * Totals across every rule. `since` narrows them to a trailing window; without it
   * they cover all time.
   */
  async globalTotals(since?: Date): Promise<RuleFiringTotals> {
    const [row] = await db
      .select(TOTALS_SELECTION)
      .from(ruleFirings)
      .where(since ? gte(ruleFirings.createdAt, since) : undefined);
    return row ?? { ...EMPTY_TOTALS };
  }

  /**
   * The latest firings of every rule, newest first, one page at a time.
   *
   * Walked with a keyset on (createdAt, id) rather than an offset: firings keep
   * arriving while an admin reads, and an offset would shift under them. The cursor
   * carries `createdAt` as Postgres text so it keeps its microseconds — a JS Date
   * would round them off and skip the rows sharing the truncated millisecond.
   */
  async feed(query: RuleFiringFeedQuery): Promise<RuleFiringFeedRow[]> {
    const { cursor, limit, type, ruleId, result, includeHeld } = query;
    const keyset = cursor
      ? or(
          lt(ruleFirings.createdAt, sql`${cursor.createdAt}::timestamptz`),
          and(
            eq(ruleFirings.createdAt, sql`${cursor.createdAt}::timestamptz`),
            lt(ruleFirings.id, cursor.id),
          ),
        )
      : undefined;

    return await db
      .select({
        ...RECIPIENT_SELECTION,
        ruleId: ruleFirings.ruleId,
        ruleName: rules.name,
        ruleType: ruleFirings.ruleType,
        cursorAt: sql<string>`${ruleFirings.createdAt}::text`,
      })
      .from(ruleFirings)
      .innerJoin(rules, eq(rules.id, ruleFirings.ruleId))
      .innerJoin(appUsers, eq(appUsers.id, ruleFirings.playerId))
      .where(
        and(
          keyset,
          type ? eq(ruleFirings.ruleType, type) : undefined,
          ruleId ? eq(ruleFirings.ruleId, ruleId) : undefined,
          resultFilter(result, includeHeld),
        ),
      )
      .orderBy(desc(ruleFirings.createdAt), desc(ruleFirings.id))
      .limit(limit);
  }

  /** Most recent recipients, for the "who got this" table. */
  async recentRecipients(ruleId: string, limit = 20) {
    return await db
      .select(RECIPIENT_SELECTION)
      .from(ruleFirings)
      .innerJoin(appUsers, eq(appUsers.id, ruleFirings.playerId))
      .where(eq(ruleFirings.ruleId, ruleId))
      .orderBy(desc(ruleFirings.createdAt))
      .limit(limit);
  }
}

/** An explicit result wins; otherwise `already_held` is dropped unless asked for. */
function resultFilter(result: RuleFiringResult | undefined, includeHeld: boolean | undefined): SQL | undefined {
  if (result) return eq(ruleFirings.result, result);
  return includeHeld ? undefined : ne(ruleFirings.result, "already_held");
}

/** Composite key of the unique constraint, used to map upserted rows back to drafts. */
export function firingKey(ruleId: string, playerId: string, matchId: string | null): string {
  return `${ruleId}:${playerId}:${matchId ?? ""}`;
}

export const ruleFiringRepository = new RuleFiringRepository();
