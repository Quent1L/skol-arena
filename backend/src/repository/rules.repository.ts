import { and, eq, inArray, isNull, or, desc, countDistinct, sql } from "drizzle-orm";
import { db } from "../config/database";
import { badgeReconciliationState, playerBadges, rules } from "../db/schema";
import { RULES_ENGINE_VERSION } from "@skol-arena/shared";
import { newId } from "../utils/uuid";
import type { BadgeRecurrence, RuleAction, RuleConditions, RuleScope, RuleType } from "@skol-arena/shared";

export interface CreateRuleData {
  triggerEvent: string;
  type: RuleType;
  scope: RuleScope;
  disciplineId?: string | null;
  priority?: number;
  name: string;
  description?: string | null;
  conditions: RuleConditions;
  action: RuleAction;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateRuleData {
  triggerEvent?: string;
  type?: RuleType;
  scope?: RuleScope;
  disciplineId?: string | null;
  priority?: number;
  name?: string;
  description?: string | null;
  conditions?: RuleConditions;
  action?: RuleAction;
  isActive?: boolean;
}

export interface RuleListFilters {
  type?: RuleType;
  triggerEvent?: string;
  scope?: RuleScope;
  isActive?: boolean;
}

export class RulesRepository {
  async create(data: CreateRuleData) {
    // Authored against the running engine, so it needs no patch. The column default
    // is 1 for the sake of pre-versioning rows, hence the explicit stamp here.
    const [rule] = await db
      .insert(rules)
      .values({ ...data, engineVersion: RULES_ENGINE_VERSION })
      .returning();
    return rule;
  }

  async getById(id: string) {
    return await db.query.rules.findFirst({ where: eq(rules.id, id) });
  }

  async list(filters: RuleListFilters = {}) {
    const conditions = [];
    if (filters.type) conditions.push(eq(rules.type, filters.type));
    if (filters.triggerEvent) conditions.push(eq(rules.triggerEvent, filters.triggerEvent));
    if (filters.scope) conditions.push(eq(rules.scope, filters.scope));
    if (filters.isActive !== undefined) conditions.push(eq(rules.isActive, filters.isActive));

    return await db.query.rules.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: [desc(rules.priority), desc(rules.createdAt)],
    });
  }

  /**
   * Active rules for an event, filtered by scope (global, or
   * matching discipline).
   */
  async listActiveByTrigger(triggerEvent: string, disciplineId: string | null) {
    const scopeFilter = disciplineId
      ? or(eq(rules.scope, "global"), and(eq(rules.scope, "discipline"), eq(rules.disciplineId, disciplineId)))
      : eq(rules.scope, "global");

    return await db.query.rules.findMany({
      where: and(eq(rules.triggerEvent, triggerEvent), eq(rules.isActive, true), scopeFilter),
      orderBy: [desc(rules.priority)],
    });
  }

  async update(id: string, data: UpdateRuleData) {
    // A save only gets here once validateRule accepted the merged rule against the
    // CURRENT catalog, so the row is by definition expressed in the current shape:
    // stamp it, and drop any deactivation reason the patch chain had left behind.
    const [updated] = await db
      .update(rules)
      .set({ ...data, engineVersion: RULES_ENGINE_VERSION, disabledReason: null })
      .where(eq(rules.id, id))
      .returning();
    return updated;
  }

  async delete(id: string) {
    await db.delete(rules).where(eq(rules.id, id));
  }

  // ---- Badges ----

  /**
   * Awards a badge, returning null when the player already holds it.
   *
   * The two recurrences need two different notions of "already holds it", and only
   * one of them is expressible as a unique index: `per_season` collides within a
   * season and rides the partial index, while `once` has to look across every season
   * at insert time. Both stay a single statement so a concurrent award loses the race
   * rather than producing a duplicate.
   */
  async awardBadge(
    playerId: string,
    ruleId: string,
    matchId: string | null,
    seasonId: string | null,
    recurrence: BadgeRecurrence,
    // Omitted for a live award (now). A retroactive one passes the match's playedAt,
    // or every badge replayed by the nightly pass would be dated from that night.
    awardedAt?: Date,
  ): Promise<{ id: string } | null> {
    if (recurrence === "once") {
      const result = await db.execute<{ id: string }>(sql`
        INSERT INTO player_badges (id, player_id, rule_id, match_id, season_id, awarded_at)
        SELECT ${newId()}::uuid, ${playerId}::uuid, ${ruleId}::uuid, ${matchId}::uuid, ${seasonId}::uuid,
          COALESCE(${awardedAt?.toISOString() ?? null}::timestamptz, now())
        WHERE NOT EXISTS (
          SELECT 1 FROM player_badges
          WHERE player_id = ${playerId}::uuid AND rule_id = ${ruleId}::uuid
        )
        RETURNING id
      `);
      return (result.rows[0] as { id: string } | undefined) ?? null;
    }

    const [badge] = await db
      .insert(playerBadges)
      .values({ playerId, ruleId, matchId, seasonId, ...(awardedAt && { awardedAt }) })
      // `where` is the partial index's predicate, not a row filter: it is what tells
      // Postgres which of the two unique indexes this conflict target refers to.
      .onConflictDoNothing({
        target: [playerBadges.playerId, playerBadges.ruleId, playerBadges.seasonId],
        where: sql`${playerBadges.seasonId} IS NOT NULL`,
      })
      .returning({ id: playerBadges.id });
    return badge ?? null;
  }

  async listBadgesByPlayer(playerId: string) {
    return await db.query.playerBadges.findMany({
      where: eq(playerBadges.playerId, playerId),
      orderBy: [desc(playerBadges.awardedAt)],
      with: { rule: true, season: { columns: { name: true, organizationId: true } } },
    });
  }

  /** Unviewed badges (for the reveal animation) for a player in a given season. */
  async getUnviewedBadgesForSeason(playerId: string, seasonId: string) {
    return await db.query.playerBadges.findMany({
      where: and(
        eq(playerBadges.playerId, playerId),
        isNull(playerBadges.viewedAt),
        eq(playerBadges.seasonId, seasonId),
      ),
      orderBy: [desc(playerBadges.awardedAt)],
      with: { rule: true },
    });
  }

  async markBadgesViewed(ids: string[], playerId: string): Promise<void> {
    if (ids.length === 0) return;
    await db.update(playerBadges)
      .set({ viewedAt: new Date() })
      .where(and(inArray(playerBadges.id, ids), eq(playerBadges.playerId, playerId)));
  }

  // ---- Badge lifecycle (reconciliation / revocation) ----

  /**
   * Remove a player's badge for a given rule.
   *
   * `seasonId` narrows the revocation to one season's award — what a seasonal badge
   * needs, since the player's other seasons are none of this pass's business. Omit it
   * to drop every award of the rule (lifetime badges, rule deletion). Passing `null`
   * explicitly targets the awards whose season is unknown.
   */
  async revokeBadge(playerId: string, ruleId: string, seasonId?: string | null): Promise<void> {
    const seasonFilter =
      seasonId === undefined
        ? undefined
        : seasonId === null
          ? isNull(playerBadges.seasonId)
          : eq(playerBadges.seasonId, seasonId);

    await db
      .delete(playerBadges)
      .where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.ruleId, ruleId), seasonFilter));
  }

  /** Badges a player was awarded during the given season. */
  async listBadgesByPlayerAndSeason(playerId: string, seasonId: string) {
    return await db.query.playerBadges.findMany({
      where: and(eq(playerBadges.playerId, playerId), eq(playerBadges.seasonId, seasonId)),
      with: { rule: true },
    });
  }

  /**
   * Every badge awarded in a season, all players at once. The rewind generator
   * needs one deck per player and would otherwise fire one query per player.
   */
  async listBadgesBySeason(seasonId: string) {
    return await db.query.playerBadges.findMany({
      where: eq(playerBadges.seasonId, seasonId),
      with: { rule: true, season: { columns: { name: true } } },
    });
  }

  /** Number of players currently holding the badge produced by a rule. */
  async countBadgeHolders(ruleId: string): Promise<number> {
    // Distinct players, not awards: a seasonal badge held across three seasons is
    // three rows but one holder, and this figure is what the delete confirmation shows.
    const [row] = await db
      .select({ value: countDistinct(playerBadges.playerId) })
      .from(playerBadges)
      .where(eq(playerBadges.ruleId, ruleId));
    return row?.value ?? 0;
  }

  /** Player ids currently holding the badge produced by a rule. */
  async listBadgeHolderPlayerIds(ruleId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ playerId: playerBadges.playerId })
      .from(playerBadges)
      .where(eq(playerBadges.ruleId, ruleId));
    return rows.map((r) => r.playerId);
  }

  /**
   * Every award of a rule, season included. Reconciliation compares this against the
   * set it recomputes, which for a seasonal badge is keyed per season rather than per
   * player — `listBadgeHolderPlayerIds` cannot answer that.
   */
  async listBadgeAwards(ruleId: string): Promise<{ playerId: string; seasonId: string | null }[]> {
    return await db
      .select({ playerId: playerBadges.playerId, seasonId: playerBadges.seasonId })
      .from(playerBadges)
      .where(eq(playerBadges.ruleId, ruleId));
  }

  // ---- Nightly reconciliation state (dirty flag) ----

  /** Read the singleton reconciliation state, creating it if absent. */
  async getReconciliationState(): Promise<{ dirty: boolean; silentNextRun: boolean; lastRunAt: Date | null }> {
    const existing = await db.query.badgeReconciliationState.findFirst();
    const row = existing ?? (await db.insert(badgeReconciliationState).values({}).returning())[0];
    return { dirty: row.dirty, silentNextRun: row.silentNextRun, lastRunAt: row.lastRunAt };
  }

  /** Flag that a badge rule changed and a reconciliation is needed. */
  async markBadgeRulesDirty(): Promise<void> {
    await this.getReconciliationState(); // ensure the row exists
    await db.update(badgeReconciliationState).set({ dirty: true });
  }

  /**
   * Clear the dirty flag and stamp the run time (called when a run starts). The
   * silent flag is consumed here too: it belongs to one catch-up pass, and every
   * pass after it notifies normally.
   */
  async clearDirtyAndStampRun(): Promise<void> {
    await this.getReconciliationState();
    await db
      .update(badgeReconciliationState)
      .set({ dirty: false, silentNextRun: false, lastRunAt: new Date() });
  }
}

export const rulesRepository = new RulesRepository();
