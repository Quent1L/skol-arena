import { Engine } from "json-rules-engine";
import { rulesRepository } from "../repository/rules.repository";
import { firingKey, ruleFiringRepository, type RuleFiringDraft } from "../repository/rule-firing.repository";
import { rulesContextService } from "./rules-context.service";
import { RULE_OPERATORS } from "./rules-operators";
import { logger } from "../utils/logger";
import {
  EVENT_FACT_CATALOG,
  RULES_ENGINE_VERSION,
  type BadgeAction,
  type MatchSubmittedContext,
  type MessageAction,
  type PlayerRulesOutput,
  type RuleAction,
  type RuleConditions,
  type TestRuleResult,
} from "@skol-arena/shared";

type Facts = Record<string, unknown>;

interface EvaluableRule {
  id: string;
  type: "message" | "badge";
  priority: number;
  action: RuleAction;
  conditions: RuleConditions;
  engineVersion: number;
}

/** The match being evaluated, as every player's evaluation needs it. */
interface EvaluatedMatch {
  matchId: string;
  seasonId: string | null;
  playedAt?: Date;
}

/** A player's outcome plus the firings it produced, before they are persisted. */
interface PlayerEvaluation {
  output: PlayerRulesOutput;
  firings: RuleFiringDraft[];
}

/**
 * Replaces {{key}} variables in a template with values from the context.
 */
export function interpolate(template: string, facts: Facts): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = facts[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Selects the winning rule: highest priority, random draw
 * on tie.
 */
function selectWinner<T extends { priority: number }>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  const maxPriority = Math.max(...candidates.map((c) => c.priority));
  const top = candidates.filter((c) => c.priority === maxPriority);
  return top[Math.floor(Math.random() * top.length)];
}

/** Returns the index too: the stats panel reports which variant actually went out. */
function pickVariant(action: MessageAction): { index: number; template: string } {
  const index = Math.floor(Math.random() * action.variants.length);
  return { index, template: action.variants[index] };
}

const PLAYER_FACT_KEYS = EVENT_FACT_CATALOG.match_submitted.filter((f) => f.ref === "player").map((f) => f.key);

/**
 * For message interpolation, player-reference facts (winnerId/loserId) render
 * the player's displayName instead of the raw UUID.
 */
export function resolveDisplay(facts: Facts, displayNames: Map<string, string>): Facts {
  if (displayNames.size === 0) return facts;
  const out: Facts = { ...facts };
  for (const key of PLAYER_FACT_KEYS) {
    const value = facts[key];
    // List facts (teammateIds/opponentIds) render as a comma-separated name list.
    if (Array.isArray(value)) {
      out[key] = value.map((id) => (typeof id === "string" ? displayNames.get(id) ?? id : id)).join(", ");
    } else if (typeof value === "string" && displayNames.has(value)) {
      out[key] = displayNames.get(value);
    }
  }
  return out;
}

export class RulesEvaluationService {
  /**
   * Evaluates `match_submitted` rules for a finalized match (one pass per
   * player). Assigns badges (uniqueness) and returns, per player, the message
   * and badge produced. Broadcasting (message injected into the MMR animation,
   * animated badge) is handled by mmr-animation-event.service.
   */
  async evaluateMatchSubmitted(matchId: string, seasonId?: string): Promise<Map<string, PlayerRulesOutput>> {
    const result = new Map<string, PlayerRulesOutput>();
    const { contexts, displayNames, playedAt } = await rulesContextService.buildMatchSubmittedContexts(matchId);
    if (contexts.length === 0) return result;

    const disciplineId = contexts[0].context.discipline || null;
    const rules = await rulesRepository.listActiveByTrigger("match_submitted", disciplineId);
    // A null disciplineId means the tournament carries none, and discipline-scoped
    // rules are then filtered out before evaluation — the single likeliest reason
    // for a rule that "never fires".
    logger.debug({ matchId, disciplineId, candidates: rules.length }, "[Rules] match_submitted candidates");
    if (rules.length === 0) return result;

    const evaluable: EvaluableRule[] = rules.map((r) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      action: r.action as RuleAction,
      conditions: r.conditions as RuleConditions,
      engineVersion: r.engineVersion,
    }));

    const engineBundle = this.buildEngine(evaluable);

    const firings: RuleFiringDraft[] = [];
    // Which rule produced each player's message, so the persisted firing id can be
    // handed back once the whole batch is written.
    const messageRuleByPlayer = new Map<string, string>();

    for (const { playerId, context } of contexts) {
      const evaluation = await this.evaluateForPlayer(
        { matchId, seasonId: seasonId ?? null, playedAt },
        playerId,
        context,
        engineBundle,
        displayNames,
      ).catch((err) => {
        logger.error({ err, matchId, playerId }, "[Rules] player evaluation failed");
        return null;
      });
      if (!evaluation) continue;

      firings.push(...evaluation.firings);
      const selected = evaluation.firings.find((f) => f.result === "selected");
      if (selected) messageRuleByPlayer.set(playerId, selected.ruleId);

      const { output } = evaluation;
      if (output.message || output.badges?.length) result.set(playerId, output);
    }

    await this.recordFirings(matchId, firings, messageRuleByPlayer, result);
    return result;
  }

  /**
   * Persists the whole match's firings in one insert and threads the resulting ids
   * back into the outputs. A failure here loses statistics, never the message: the
   * outputs are already built and the caller carries on regardless.
   */
  private async recordFirings(
    matchId: string,
    firings: RuleFiringDraft[],
    messageRuleByPlayer: Map<string, string>,
    outputs: Map<string, PlayerRulesOutput>,
  ): Promise<void> {
    if (firings.length === 0) return;
    try {
      const ids = await ruleFiringRepository.recordMany(firings);
      for (const [playerId, ruleId] of messageRuleByPlayer) {
        const output = outputs.get(playerId);
        if (!output) continue;
        output.messageFiringId = ids.get(firingKey(ruleId, playerId, matchId));
      }
    } catch (err) {
      logger.error({ err, matchId, firings: firings.length }, "[Rules] recording firings failed");
    }
  }

  private async evaluateForPlayer(
    { matchId, seasonId, playedAt }: EvaluatedMatch,
    playerId: string,
    context: MatchSubmittedContext,
    engineBundle: { engine: Engine; byId: Map<string, EvaluableRule> },
    displayNames: Map<string, string>,
  ): Promise<PlayerEvaluation> {
    // `randomRoll` is drawn here rather than in the context service: that service
    // must stay deterministic so badge reconciliation can replay past matches.
    const facts: Facts = { ...(context as unknown as Facts), randomRoll: Math.floor(Math.random() * 100) };
    const matched = await this.runEngine(engineBundle, facts);
    const output: PlayerRulesOutput = {};
    const firings: RuleFiringDraft[] = [];
    const draft = (rule: EvaluableRule): Omit<RuleFiringDraft, "result"> => ({
      ruleId: rule.id,
      ruleType: rule.type,
      engineVersion: rule.engineVersion,
      triggerEvent: "match_submitted",
      playerId,
      matchId,
      seasonId,
    });

    const messageRules = matched.filter((r) => r.type === "message");
    const messageRule = selectWinner(messageRules);
    if (messageRule) {
      const { index, template } = pickVariant(messageRule.action as MessageAction);
      output.message = interpolate(template, resolveDisplay(facts, displayNames));
      firings.push({
        ...draft(messageRule),
        result: "selected",
        variantIndex: index,
        // The template, not the rendered message: the stats group on it, and a
        // later edit to the rule must not move this firing under the new wording.
        variantText: template,
        message: output.message,
      });
    }
    // The rules that matched but lost the single-winner draw. They are the reason a
    // rule can look dead in the stats while its conditions fire constantly, so they
    // are recorded rather than discarded.
    for (const rule of messageRules) {
      if (rule.id === messageRule?.id) continue;
      firings.push({ ...draft(rule), result: "superseded" });
    }

    // Badges are awarded independently (no single-winner): every matching badge
    // rule grants its badge. This keeps awards order-independent so they can be
    // recomputed deterministically during reconciliation.
    const badgeRules = matched.filter((r) => r.type === "badge");
    for (const badgeRule of badgeRules) {
      const badge = badgeRule.action as BadgeAction;
      // Returns null when the player already holds the badge — for a seasonal badge
      // that means "already won it THIS season", so the next season awards it again.
      const awarded = await rulesRepository.awardBadge(
        playerId,
        badgeRule.id,
        matchId,
        seasonId,
        badge.recurrence ?? "per_season",
        // Dated from the match, like a replayed award: a result entered days later
        // must not make the badge look won on the day it was approved.
        playedAt,
      );
      firings.push({ ...draft(badgeRule), result: awarded ? "awarded" : "already_held" });
      if (!awarded) continue;
      (output.badges ??= []).push({
        badgeId: awarded.id,
        ruleId: badgeRule.id,
        icon: badge.icon,
        label: badge.label,
        description: badge.description,
      });
    }

    return { output, firings };
  }

  private buildEngine(rules: EvaluableRule[]): { engine: Engine; byId: Map<string, EvaluableRule> } {
    const engine = new Engine([], { allowUndefinedFacts: true });
    for (const operator of RULE_OPERATORS) engine.addOperator(operator);
    const byId = new Map<string, EvaluableRule>();
    for (const rule of rules) {
      byId.set(rule.id, rule);
      engine.addRule({ conditions: rule.conditions as never, event: { type: "rule_matched", params: { ruleId: rule.id } } });
    }
    return { engine, byId };
  }

  private async runEngine(
    { engine, byId }: { engine: Engine; byId: Map<string, EvaluableRule> },
    facts: Facts,
  ): Promise<EvaluableRule[]> {
    const { events } = await engine.run(facts);
    const matched: EvaluableRule[] = [];
    for (const event of events) {
      const ruleId = event.params?.ruleId as string | undefined;
      const rule = ruleId ? byId.get(ruleId) : undefined;
      if (rule) matched.push(rule);
    }
    return matched;
  }

  /**
   * Simulator (admin editor "Test" button): evaluates an ephemeral rule
   * against a provided context, without writing to DB.
   */
  async simulate(conditions: RuleConditions, action: RuleAction, context: Facts): Promise<TestRuleResult> {
    const ephemeral: EvaluableRule = {
      id: "test",
      type: action.type,
      priority: 0,
      action,
      conditions,
      engineVersion: RULES_ENGINE_VERSION,
    };
    const matched = await this.runEngine(this.buildEngine([ephemeral]), context);
    if (matched.length === 0) return { matched: false };

    if (action.type === "message") {
      return {
        matched: true,
        output: { type: "message", message: interpolate(pickVariant(action).template, context) },
      };
    }
    return {
      matched: true,
      output: {
        type: "badge",
        badge: { ruleId: "test", icon: action.icon, label: action.label, description: action.description },
      },
    };
  }
}

export const rulesEvaluationService = new RulesEvaluationService();
