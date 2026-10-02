import {
  EVENT_FACT_CATALOG,
  NON_DETERMINISTIC_FACTS,
  OPERATORS_BY_TYPE,
  TRIGGER_EVENTS,
  type AvailableBadge,
  type BadgeAction,
  type CreateRuleData,
  type FactDefinition,
  type RuleAction,
  type RuleConditions,
  type RuleFiringDetail,
  type RuleFiringStatsRow,
  type RuleFiringTotals,
  type TriggerEvent,
  type UpdateRuleData,
} from "@skol-arena/shared";
import {
  rulesRepository,
  type RuleListFilters,
  type CreateRuleData as CreateRuleRow,
} from "../repository/rules.repository";
import {
  ruleFiringRepository,
  type RuleFiringTotals as RuleFiringTotalsRow,
} from "../repository/rule-firing.repository";
import { rulesEvaluationService } from "./rules-evaluation.service";
import { badgeReconciliationService } from "./badge-reconciliation.service";
import { enqueueBadgeReconciliation } from "./mmr-job-queue.service";
import { BadRequestError, NotFoundError, ErrorCode } from "../types/errors";
import { isOrganizationVisible, visibleOrganizationIdsFor } from "./visibility";

function isTriggerEvent(value: string): value is TriggerEvent {
  return (TRIGGER_EVENTS as readonly string[]).includes(value);
}

/** Maps DB counters onto the wire shape, and stands in for a rule that never fired. */
function toTotals(row: RuleFiringTotalsRow | undefined): RuleFiringTotals {
  return {
    fired: row?.firedCount ?? 0,
    distinctPlayers: row?.distinctPlayers ?? 0,
    selected: row?.selectedCount ?? 0,
    superseded: row?.supersededCount ?? 0,
    awarded: row?.awardedCount ?? 0,
    delivered: row?.deliveredCount ?? 0,
    neverDelivered: row?.neverDeliveredCount ?? 0,
    seen: row?.seenCount ?? 0,
    recap: row?.recapCount ?? 0,
    lastFiredAt: row?.lastFiredAt?.toISOString() ?? null,
  };
}

/** Flattens the condition tree down to its leaves, for catalog checking. */
function collectLeaves(conditions: RuleConditions, acc: { fact: string; operator: string }[]): void {
  if ("all" in conditions) conditions.all.forEach((c) => collectLeaves(c, acc));
  else if ("any" in conditions) conditions.any.forEach((c) => collectLeaves(c, acc));
  else acc.push({ fact: conditions.fact, operator: conditions.operator });
}

export class RulesService {
  list(filters: RuleListFilters) {
    return rulesRepository.list(filters);
  }

  async getById(id: string) {
    const rule = await rulesRepository.getById(id);
    if (!rule) throw new NotFoundError(ErrorCode.NOT_FOUND);
    return rule;
  }

  async create(data: CreateRuleData, createdBy: string) {
    this.validateRule(data.triggerEvent, data.conditions, data.scope, data.disciplineId ?? null, data.type);
    const rule = await rulesRepository.create({ ...(data as CreateRuleRow), createdBy });
    // Do NOT recompute now: a reconciliation pass can be long and the admin may
    // keep editing. Just flag it dirty — the nightly cron (or a manual trigger)
    // runs the actual recompute.
    if (rule.type === "badge" && rule.isActive) await rulesRepository.markBadgeRulesDirty();
    return rule;
  }

  async update(id: string, data: UpdateRuleData) {
    const existing = await this.getById(id);
    // Validate the MERGED rule: a partial PATCH (e.g. switching type to `badge`
    // without resending conditions) must not sneak past the fact checks.
    this.validateRule(
      data.triggerEvent ?? existing.triggerEvent,
      data.conditions ?? (existing.conditions as RuleConditions),
      data.scope ?? existing.scope,
      // `??` would be wrong here: clearing the discipline is sent as an explicit
      // null, which must not fall back to the stored one.
      data.disciplineId !== undefined ? data.disciplineId : existing.disciplineId,
      data.type ?? existing.type,
    );
    const rule = await rulesRepository.update(id, data);
    // Flag dirty for the nightly/manual recompute (deactivation keeps badges, so skip).
    if (rule.type === "badge" && rule.isActive) await rulesRepository.markBadgeRulesDirty();
    return rule;
  }

  async delete(id: string) {
    const rule = await this.getById(id);
    // Inform current holders before the FK cascade removes their badges.
    if (rule.type === "badge") await badgeReconciliationService.notifyHoldersBeforeDelete(id);
    await rulesRepository.delete(id);
  }

  /** Number of players currently holding the badge produced by a rule (delete confirm). */
  getBadgeCount(id: string) {
    return rulesRepository.countBadgeHolders(id);
  }

  /**
   * Firing counters for every rule, in two queries rather than one per rule.
   * Rules that have never fired are absent from the aggregate and filled in at
   * zero here — that row, not a missing one, is what identifies a dead rule.
   */
  async listFiringStats(): Promise<RuleFiringStatsRow[]> {
    const [rules, totals] = await Promise.all([rulesRepository.list({}), ruleFiringRepository.totalsByRule()]);
    const byRule = new Map(totals.map((t) => [t.ruleId, t]));
    return rules.map((rule) => ({
      ruleId: rule.id,
      name: rule.name,
      type: rule.type,
      isActive: rule.isActive,
      ...toTotals(byRule.get(rule.id)),
    }));
  }

  /** Everything the per-rule panel shows: totals, variants, timeline, recipients. */
  async getFiringDetail(id: string, days: number): Promise<RuleFiringDetail> {
    const rule = await this.getById(id);
    const [totals, variants, timeline, recipients] = await Promise.all([
      ruleFiringRepository.totalsForRule(id),
      ruleFiringRepository.variantBreakdown(id),
      ruleFiringRepository.dailyTimeline(id, days),
      ruleFiringRepository.recentRecipients(id),
    ]);

    const action = rule.action as RuleAction;
    // The wordings the rule carries TODAY, by text. A firing whose template is not
    // among them was sent under a variant that has since been edited or removed —
    // it keeps its own count rather than being folded into whatever replaced it.
    const currentVariants = action.type === "message" ? action.variants : [];
    const positionByText = new Map(currentVariants.map((text, index) => [text, index]));

    return {
      ruleId: id,
      totals: toTotals(totals),
      variants: variants
        .map((v) => {
          const position = v.variantText === null ? undefined : positionByText.get(v.variantText);
          return {
            text: v.variantText,
            current: position !== undefined,
            position: position ?? null,
            fired: v.firedCount,
            seen: v.seenCount,
          };
        })
        // Live wordings first, in the rule's own order; retired ones after, busiest
        // first, so an edit does not bury the variant that carries all the history.
        .sort((a, b) => {
          if (a.current !== b.current) return a.current ? -1 : 1;
          if (a.current && b.current) return a.position! - b.position!;
          return b.fired - a.fired;
        }),
      timeline: timeline.map((d) => ({
        day: d.day,
        fired: d.firedCount,
        seen: d.seenCount,
        recap: d.recapCount,
      })),
      recipients: recipients.map((r) => ({
        ...r,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        seenAt: r.seenAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Active badge rules earnable for a discipline (global + that discipline). */
  async listAvailableBadges(disciplineId: string | null): Promise<AvailableBadge[]> {
    const rules = await rulesRepository.listActiveByTrigger("match_submitted", disciplineId);
    return rules
      .filter((r) => r.type === "badge")
      .map((r) => {
        const action = r.action as BadgeAction;
        return {
          ruleId: r.id,
          icon: action.icon,
          label: action.label,
          description: action.description,
          recurrence: action.recurrence ?? "per_season",
          scope: r.scope,
        };
      });
  }

  /** Current state of the nightly badge reconciliation (admin UI). */
  getReconciliationState() {
    return rulesRepository.getReconciliationState();
  }

  /** Manually queue a full badge reconciliation now (admin button). */
  triggerReconciliation() {
    return enqueueBadgeReconciliation(true);
  }

  getCatalog(triggerEvent: string): { facts: (FactDefinition & { operators: string[] })[] } {
    if (!isTriggerEvent(triggerEvent)) throw new BadRequestError(ErrorCode.VALIDATION_ERROR);
    const facts = EVENT_FACT_CATALOG[triggerEvent].map((f) => ({ ...f, operators: OPERATORS_BY_TYPE[f.type] }));
    return { facts };
  }

  test(conditions: RuleConditions, action: RuleAction, context: Record<string, unknown>) {
    return rulesEvaluationService.simulate(conditions, action, context);
  }

  /**
   * One entry per award, season included — a seasonal badge won three times comes
   * back three times. Collapsing them into a single badge with a count is the
   * client's job, and it needs the individual seasons to show the breakdown.
   */
  /** Badges earned in a season of an organization the viewer is not part of are left out. */
  async getPlayerBadges(playerId: string, viewerId: string | null) {
    const [allRows, visibleOrganizationIds] = await Promise.all([
      rulesRepository.listBadgesByPlayer(playerId),
      visibleOrganizationIdsFor(viewerId),
    ]);
    const rows = allRows.filter((row) =>
      isOrganizationVisible(row.season?.organizationId, visibleOrganizationIds),
    );
    return rows.map((row) => {
      const action = row.rule.action as RuleAction;
      const badge =
        action.type === "badge"
          ? action
          : { icon: "", label: row.rule.name, description: "", recurrence: "per_season" as const };
      return {
        id: row.id,
        playerId: row.playerId,
        ruleId: row.ruleId,
        icon: badge.icon,
        label: badge.label,
        description: badge.description,
        recurrence: badge.recurrence ?? "per_season",
        awardedAt: row.awardedAt,
        matchId: row.matchId,
        seasonId: row.seasonId,
        seasonName: row.season?.name ?? null,
      };
    });
  }

  /** Pending (unviewed) badge animations for a player in a season. */
  async getPendingBadges(playerId: string, seasonId: string) {
    const rows = await rulesRepository.getUnviewedBadgesForSeason(playerId, seasonId);
    return rows.map((row) => {
      const action = row.rule.action as RuleAction;
      const badge = action.type === "badge" ? action : { icon: "", label: row.rule.name, description: "" };
      return {
        id: row.id,
        matchId: row.matchId,
        seasonId,
        icon: badge.icon,
        label: badge.label,
        description: badge.description,
        createdAt: row.awardedAt.toISOString(),
      };
    });
  }

  markBadgesViewed(ids: string[], playerId: string) {
    return rulesRepository.markBadgesViewed(ids, playerId);
  }

  private validateRule(
    triggerEvent: string,
    conditions: RuleConditions,
    scope: string,
    disciplineId: string | null,
    type: string,
  ): void {
    if (!isTriggerEvent(triggerEvent)) throw new BadRequestError(ErrorCode.VALIDATION_ERROR);
    if (scope === "discipline" && !disciplineId) throw new BadRequestError(ErrorCode.VALIDATION_ERROR);

    const catalog = new Map(EVENT_FACT_CATALOG[triggerEvent].map((f) => [f.key, f]));
    const leaves: { fact: string; operator: string }[] = [];
    collectLeaves(conditions, leaves);
    for (const { fact, operator } of leaves) {
      const definition = catalog.get(fact);
      if (!definition) throw new BadRequestError(ErrorCode.VALIDATION_ERROR);
      // Badge awards are replayed by the nightly reconciliation: a random fact
      // would grant/revoke badges at every pass.
      if (type === "badge" && (NON_DETERMINISTIC_FACTS as readonly string[]).includes(fact)) {
        throw new BadRequestError(ErrorCode.RANDOM_NOT_ALLOWED_ON_BADGE);
      }
      // An operator the fact's type does not support evaluates to false forever,
      // which reads as "my rule never fires" rather than as an error. Reject it.
      if (!OPERATORS_BY_TYPE[definition.type].includes(operator)) {
        throw new BadRequestError(ErrorCode.INVALID_OPERATOR_FOR_FACT);
      }
    }
  }
}

export const rulesService = new RulesService();
