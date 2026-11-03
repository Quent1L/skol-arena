import type { Engine } from "json-rules-engine";
import { rulesRepository } from "../repository/rules.repository";
import { rulesContextService } from "./rules-context.service";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { createRulesEngine } from "./rules-operators";
import { notificationService } from "./notification.service";
import { webSocketService } from "./websocket.service";
import { logger } from "../utils/logger";
import { DISCIPLINE_HISTORY_FACT, MATCH_HISTORY_FACT, registerMatchCountFact } from "./rules-match-count";
import {
  usesDisciplineWindow,
  type BadgeAction,
  type BadgeRecurrence,
  type MatchSubmittedContext,
  type RuleConditions,
} from "@skol-arena/shared";

type Facts = Record<string, unknown>;

interface BadgeRule {
  id: string;
  conditions: RuleConditions;
  label: string;
  recurrence: BadgeRecurrence;
}

/** The match that earned an award: the badge is dated from when it was played. */
interface EarningMatch {
  matchId: string;
  playedAt?: Date;
}

/** The award a replay says should exist, and the match that earned it. */
interface DesiredAward extends EarningMatch {
  playerId: string;
  seasonId: string;
}

/**
 * What "the same award" means, which is the whole difference between the two
 * recurrences: a seasonal badge is one award per player per season, a lifetime one
 * is a single award per player whatever the season.
 */
function awardKey(recurrence: BadgeRecurrence, playerId: string, seasonId: string | null): string {
  return recurrence === "per_season" ? `${seasonId}:${playerId}` : playerId;
}

function appendTo(histories: Map<string, Facts[]>, key: string, facts: Facts): Facts[] {
  const history = histories.get(key) ?? [];
  history.push(facts);
  histories.set(key, history);
  return history;
}

function toBadgeRule(rule: { id: string; conditions: unknown; action: unknown }): BadgeRule {
  const action = rule.action as BadgeAction;
  return {
    id: rule.id,
    conditions: rule.conditions as RuleConditions,
    label: action.label,
    recurrence: action.recurrence ?? "per_season",
  };
}

/**
 * Keeps `player_badges` in sync with the current match history + active badge
 * rules. Two entry points:
 *  - `reconcilePlayers` — after an MMR cascade (match cancellation), re-evaluate
 *    every badge for the affected players in that season.
 *  - `reconcileRule` — after a badge rule is created/updated/reactivated,
 *    retroactively award it where it now matches and revoke it where it no
 *    longer does, across all ranked seasons.
 *
 * Badge facts are read in `historical` mode (per-match snapshot) so past matches
 * replay with the streak/MMR state they had at the time. Award-all semantics
 * (each badge rule evaluated independently) make this deterministic.
 */
export class BadgeReconciliationService {
  private buildEngine(rules: BadgeRule[]): Engine {
    const engine = createRulesEngine();
    registerMatchCountFact(engine);
    for (const rule of rules) {
      engine.addRule({
        conditions: rule.conditions as never,
        event: { type: "rule_matched", params: { ruleId: rule.id } },
      });
    }
    return engine;
  }

  /**
   * `history` is the player's replayed season up to this match, included: the
   * `matchCount` condition counts over it, as the live evaluation does over the
   * stored snapshots. `disciplineHistory` is the same across seasons.
   */
  private async matchedRuleIds(
    engine: Engine,
    context: MatchSubmittedContext,
    history: Facts[],
    disciplineHistory: Facts[] = [],
  ): Promise<Set<string>> {
    const { events } = await engine.run({
      ...(context as unknown as Facts),
      [MATCH_HISTORY_FACT]: history,
      [DISCIPLINE_HISTORY_FACT]: disciplineHistory,
    });
    const ids = new Set<string>();
    for (const event of events) {
      const ruleId = event.params?.ruleId as string | undefined;
      if (ruleId) ids.add(ruleId);
    }
    return ids;
  }

  /** Reconcile all badges for the given players within a single season. */
  async reconcilePlayers(seasonId: string, playerIds: string[]): Promise<void> {
    if (playerIds.length === 0) return;
    const season = await rankedSeasonRepository.getSeasonWithConfig(seasonId);
    if (!season) return;

    const active = await rulesRepository.listActiveByTrigger("match_submitted", season.disciplineId ?? null);
    const badgeRules: BadgeRule[] = active.filter((r) => r.type === "badge").map(toBadgeRule);
    // No active badge rules → nothing to award; inactive-rule badges are kept.
    if (badgeRules.length === 0) return;

    const seasonRules = badgeRules.filter((r) => !usesDisciplineWindow(r.conditions));
    const engine = this.buildEngine(seasonRules);

    for (const playerId of seasonRules.length > 0 ? playerIds : []) {
      await this.reconcileOnePlayer(seasonId, playerId, engine, seasonRules).catch((err) =>
        logger.error({ err, seasonId, playerId }, "[BadgeReconcile] player failed"),
      );
    }

    const disciplineRules = badgeRules.filter((r) => usesDisciplineWindow(r.conditions));
    if (disciplineRules.length > 0 && season.disciplineId) {
      await this.reconcileDisciplineRules(season.disciplineId, playerIds, disciplineRules);
    }
  }

  /** A discipline-wide count spans seasons: one season's replay cannot decide it. */
  private async reconcileDisciplineRules(disciplineId: string, playerIds: string[], rules: BadgeRule[]): Promise<void> {
    const seasons = await rankedSeasonRepository.listSeasons({ disciplineId });
    const engine = this.buildEngine(rules);
    for (const playerId of playerIds) {
      await this.reconcileDisciplinePlayer(seasons.map((s) => s.id), playerId, engine, rules).catch((err) =>
        logger.error({ err, disciplineId, playerId }, "[BadgeReconcile] discipline player failed"),
      );
    }
  }

  private async reconcileDisciplinePlayer(
    seasonIds: string[],
    playerId: string,
    engine: Engine,
    rules: BadgeRule[],
  ): Promise<void> {
    const ruleById = new Map(rules.map((r) => [r.id, r]));
    const desired = new Map<string, EarningMatch & { seasonId: string }>();
    const bySeason = new Map<string, Facts[]>();
    const all: Facts[] = [];
    for (const { matchId, seasonId } of await playerMmrRepository.getSeasonsMatchesOrdered(seasonIds, playerId)) {
      const { contexts, playedAt } = await rulesContextService.buildMatchSubmittedContexts(matchId, true);
      const ctx = contexts.find((c) => c.playerId === playerId);
      if (!ctx) continue;
      const facts = ctx.context as unknown as Facts;
      all.push(facts);
      const seasonHistory = [...(bySeason.get(seasonId) ?? []), facts];
      bySeason.set(seasonId, seasonHistory);
      for (const ruleId of await this.matchedRuleIds(engine, ctx.context, seasonHistory, all)) {
        if (!desired.has(ruleId)) desired.set(ruleId, { matchId, playedAt, seasonId });
      }
    }

    const held = (await rulesRepository.listBadgesByPlayer(playerId)).filter((b) => ruleById.has(b.ruleId));
    for (const badge of held) {
      if (desired.has(badge.ruleId)) continue;
      await this.revoke(playerId, badge.ruleId, undefined, ruleById.get(badge.ruleId)!.label);
    }
    const heldRuleIds = new Set(held.map((b) => b.ruleId));
    for (const [ruleId, earning] of desired) {
      if (!heldRuleIds.has(ruleId)) await this.award(playerId, ruleId, earning, earning.seasonId, ruleById.get(ruleId)!);
    }
  }

  private async reconcileOnePlayer(
    seasonId: string,
    playerId: string,
    engine: Engine,
    badgeRules: BadgeRule[],
  ): Promise<void> {
    const ruleById = new Map(badgeRules.map((r) => [r.id, r]));
    // Desired set: ruleId -> earliest matching match (chronological).
    const ordered = await playerMmrRepository.getMmrHistoryOrdered(seasonId, playerId);
    const desired = new Map<string, EarningMatch>();
    const history: Facts[] = [];
    for (const row of ordered) {
      const { contexts, playedAt } = await rulesContextService.buildMatchSubmittedContexts(row.matchId, true);
      const ctx = contexts.find((c) => c.playerId === playerId);
      if (!ctx) continue;
      history.push(ctx.context as unknown as Facts);
      for (const ruleId of await this.matchedRuleIds(engine, ctx.context, history)) {
        if (!desired.has(ruleId)) desired.set(ruleId, { matchId: row.matchId, playedAt });
      }
    }

    // Only badges from this season whose rule is still active are in scope; a
    // deactivated rule's badges are intentionally kept.
    const current = await rulesRepository.listBadgesByPlayerAndSeason(playerId, seasonId);
    // `ruleById` leaves discipline-wide badges out: their own pass decides those.
    const currentActive = current.filter((b) => b.rule.isActive && b.rule.type === "badge" && ruleById.has(b.ruleId));
    const heldRuleIds = new Set(currentActive.map((b) => b.ruleId));

    for (const badge of currentActive) {
      if (desired.has(badge.ruleId)) continue;
      // Scoped to this season: whatever the player earned in their other seasons was
      // replayed by its own pass and is none of this one's business.
      await this.revoke(playerId, badge.ruleId, seasonId, (badge.rule.action as BadgeAction).label);
    }

    for (const [ruleId, earning] of desired) {
      if (heldRuleIds.has(ruleId)) continue;
      const rule = ruleById.get(ruleId);
      if (!rule) continue;
      // A lifetime badge already won in an earlier season is silently declined by
      // awardBadge, so no branch is needed here.
      await this.award(playerId, ruleId, earning, seasonId, rule);
    }
  }

  /** Reconcile a single badge rule across all ranked seasons (create/update/reactivate). */
  async reconcileRule(ruleId: string, silent = false): Promise<void> {
    const rule = await rulesRepository.getById(ruleId);
    if (!rule || rule.type !== "badge" || !rule.isActive) return;

    const badgeRule = toBadgeRule(rule);
    const engine = this.buildEngine([badgeRule]);

    const seasons = await rankedSeasonRepository.listSeasons(
      rule.scope === "discipline" && rule.disciplineId ? { disciplineId: rule.disciplineId } : undefined,
    );

    const desired = await this.desiredAwards(badgeRule, engine, seasons.map((s) => s.id));

    const existing = new Map(
      (await rulesRepository.listBadgeAwards(rule.id)).map((award) => [
        awardKey(badgeRule.recurrence, award.playerId, award.seasonId),
        award,
      ]),
    );

    for (const [key, award] of desired) {
      if (existing.has(key)) continue;
      await this.award(award.playerId, rule.id, award, award.seasonId, badgeRule, silent);
    }
    for (const [key, award] of existing) {
      if (desired.has(key)) continue;
      // A lifetime badge is revoked outright; a seasonal one only loses the season
      // whose replay stopped matching.
      await this.revoke(
        award.playerId,
        rule.id,
        badgeRule.recurrence === "per_season" ? award.seasonId : undefined,
        badgeRule.label,
        silent,
      );
    }
  }

  /**
   * The awards a replay says should exist, keyed the way this recurrence defines
   * sameness: a seasonal badge is earned once per season, a lifetime one once ever.
   * In both cases the earliest matching match under that key is the one that earned it.
   */
  private async desiredAwards(rule: BadgeRule, engine: Engine, seasonIds: string[]): Promise<Map<string, DesiredAward>> {
    const desired = new Map<string, DesiredAward>();
    const seasonHistories = new Map<string, Facts[]>();
    const disciplineHistories = new Map<string, Facts[]>();
    for (const { matchId, seasonId } of await this.replayOrder(rule, seasonIds)) {
      const { contexts, playedAt } = await rulesContextService.buildMatchSubmittedContexts(matchId, true);
      for (const ctx of contexts) {
        const facts = ctx.context as unknown as Facts;
        const seasonHistory = appendTo(seasonHistories, `${seasonId}:${ctx.playerId}`, facts);
        const disciplineHistory = appendTo(disciplineHistories, ctx.playerId, facts);
        const key = awardKey(rule.recurrence, ctx.playerId, seasonId);
        if (desired.has(key)) continue;
        if ((await this.matchedRuleIds(engine, ctx.context, seasonHistory, disciplineHistory)).has(rule.id)) {
          desired.set(key, { playerId: ctx.playerId, seasonId, matchId, playedAt });
        }
      }
    }
    return desired;
  }

  /** A discipline-wide count needs true chronology across seasons, which may overlap. */
  private async replayOrder(rule: BadgeRule, seasonIds: string[]): Promise<{ matchId: string; seasonId: string }[]> {
    if (usesDisciplineWindow(rule.conditions)) return playerMmrRepository.getSeasonsMatchesOrdered(seasonIds);
    const order: { matchId: string; seasonId: string }[] = [];
    for (const seasonId of seasonIds) {
      const matchIds = await playerMmrRepository.getSeasonMatchIdsOrdered(seasonId);
      order.push(...matchIds.map((matchId) => ({ matchId, seasonId })));
    }
    return order;
  }

  /** Reconcile every active badge rule (full nightly pass). */
  async reconcileAllActiveBadgeRules(silent = false): Promise<void> {
    const badgeRules = await rulesRepository.list({ type: "badge", isActive: true });
    for (const rule of badgeRules) {
      await this.reconcileRule(rule.id, silent).catch((err) =>
        logger.error({ err, ruleId: rule.id }, "[BadgeReconcile] rule failed"),
      );
    }
  }

  /**
   * Entry point for the nightly cron and the manual admin trigger. Runs a full
   * reconciliation only when a badge rule changed since the last run (dirty), or
   * when forced. The dirty flag is cleared at the start so edits made during the
   * run are picked up by the next pass.
   */
  async runPendingReconciliation(force = false): Promise<{ ran: boolean }> {
    const state = await rulesRepository.getReconciliationState();
    if (!force && !state.dirty) {
      logger.info("[BadgeReconcile] nightly run skipped — no badge rule changes");
      return { ran: false };
    }
    // Read before clearing: the flag belongs to this pass, and a migration that
    // changed what the rules mean sets it so the catch-up does not bury players
    // under notifications for badges they earned months ago.
    const silent = state.silentNextRun;
    await rulesRepository.clearDirtyAndStampRun();
    logger.info({ force, silent }, "[BadgeReconcile] full reconciliation start");
    await this.reconcileAllActiveBadgeRules(silent);
    logger.info("[BadgeReconcile] full reconciliation done");
    return { ran: true };
  }

  /** Notify holders then let the FK cascade remove the badges (hard delete of a rule). */
  async notifyHoldersBeforeDelete(ruleId: string): Promise<void> {
    const rule = await rulesRepository.getById(ruleId);
    if (!rule || rule.type !== "badge") return;
    const label = (rule.action as BadgeAction).label;
    const holders = await rulesRepository.listBadgeHolderPlayerIds(ruleId);
    for (const playerId of holders) {
      await this.notifyRevoked(playerId, label);
      webSocketService.send(playerId, { event: "badge_revoked", data: {} });
    }
  }

  private async award(
    playerId: string,
    ruleId: string,
    earning: EarningMatch,
    seasonId: string,
    rule: BadgeRule,
    silent = false,
  ): Promise<void> {
    const awarded = await rulesRepository.awardBadge(
      playerId,
      ruleId,
      earning.matchId,
      seasonId,
      rule.recurrence,
      earning.playedAt,
    );
    if (!awarded) return;
    // Retroactive awards do not trigger the reveal animation — mark as viewed.
    await rulesRepository.markBadgesViewed([awarded.id], playerId);
    if (silent) return;
    await notificationService
      .send({
        userId: playerId,
        type: "BADGE_AWARDED",
        titleKey: "notifications.BADGE_AWARDED_TITLE",
        messageKey: "notifications.BADGE_AWARDED_MESSAGE",
        translationParams: { badgeLabel: rule.label },
        requiresAction: false,
      })
      .catch((err) => logger.error({ err, playerId }, "[BadgeReconcile] award notify failed"));
    webSocketService.send(playerId, { event: "badge_awarded", data: { ruleId } });
  }

  /**
   * Removes an award and tells the player only when they actually lost the badge.
   * A seasonal badge revoked in one season is still held from the others, and a
   * revocation another pass already made removes nothing: neither is a loss.
   */
  private async revoke(
    playerId: string,
    ruleId: string,
    seasonId: string | null | undefined,
    label: string,
    silent = false,
  ): Promise<void> {
    const removed = await rulesRepository.revokeBadge(playerId, ruleId, seasonId);
    if (removed === 0) return;
    // The season's badge list changed either way: the open screens refetch.
    webSocketService.send(playerId, { event: "badge_revoked", data: {} });
    if (await rulesRepository.holdsBadge(playerId, ruleId)) return;
    await this.notifyRevoked(playerId, label, silent);
  }

  private async notifyRevoked(playerId: string, label: string, silent = false): Promise<void> {
    if (silent) return;
    await notificationService
      .send({
        userId: playerId,
        type: "BADGE_REVOKED",
        titleKey: "notifications.BADGE_REVOKED_TITLE",
        messageKey: "notifications.BADGE_REVOKED_MESSAGE",
        translationParams: { badgeLabel: label },
        requiresAction: false,
      })
      .catch((err) => logger.error({ err, playerId }, "[BadgeReconcile] revoke notify failed"));
  }
}

export const badgeReconciliationService = new BadgeReconciliationService();
