import {
  matchCountLeaves,
  usesDisciplineWindow,
  type BadgeCounterProgress,
  type BadgeProgress,
  type ConditionLeaf,
  type RuleConditions,
} from "@skol-arena/shared";
import { rulesRepository } from "../repository/rules.repository";
import { createMatchCounter } from "./rules-match-count";
import { rulesMatchHistoryService } from "./rules-match-history.service";

/**
 * The count a counter needs to be met, or null when it is not something a player
 * progresses towards: `matchCount < 5` is met from the start and only ever lost.
 */
export function counterTarget({ operator, value }: ConditionLeaf): number | null {
  if (typeof value !== "number") return null;
  if (operator === "greaterThan") return value + 1;
  return operator === "greaterThanInclusive" || operator === "equal" ? value : null;
}

/**
 * How far a player is along the counters of the badges earnable in a season. Only
 * counters have a progress to show: any other condition is met or not on a given match.
 */
type Facts = Record<string, unknown>;
type MatchCounter = ReturnType<typeof createMatchCounter>;

interface TrackedRule {
  ruleId: string;
  conditions: RuleConditions;
}

export class BadgeProgressService {
  async forPlayer(
    tournament: { id: string; disciplineId: string | null; mode: string },
    playerId: string,
  ): Promise<BadgeProgress[]> {
    if (tournament.mode !== "ranked") return [];
    const tracked = await this.trackedRules(tournament.disciplineId);
    if (tracked.length === 0) return [];

    const now = new Date();
    const season = await rulesMatchHistoryService.loadSeason(tournament.id, playerId, now);
    const discipline =
      tournament.disciplineId && tracked.some((r) => usesDisciplineWindow(r.conditions))
        ? await rulesMatchHistoryService.loadDiscipline(tournament.disciplineId, playerId, now)
        : [];

    const count = createMatchCounter();
    const progress: BadgeProgress[] = [];
    for (const { ruleId, conditions } of tracked) {
      progress.push({ ruleId, counters: await this.counters(conditions, { season, discipline }, count) });
    }
    return progress;
  }

  /** Active badge rules with at least one counter a player can progress towards. */
  private async trackedRules(disciplineId: string | null): Promise<TrackedRule[]> {
    const rules = await rulesRepository.listActiveByTrigger("match_submitted", disciplineId);
    return rules
      .filter((r) => r.type === "badge")
      .map((r) => ({ ruleId: r.id, conditions: r.conditions as RuleConditions }))
      .filter((r) => matchCountLeaves(r.conditions).some((leaf) => counterTarget(leaf) !== null));
  }

  private async counters(
    conditions: RuleConditions,
    histories: { season: Facts[]; discipline: Facts[] },
    count: MatchCounter,
  ): Promise<BadgeCounterProgress[]> {
    const counters: BadgeCounterProgress[] = [];
    for (const leaf of matchCountLeaves(conditions)) {
      const target = counterTarget(leaf);
      if (target === null || !leaf.params) continue;
      const window = leaf.params.window ?? "season";
      const current = await count(histories[window], leaf.params.conditions);
      counters.push({ current, target, window });
    }
    return counters;
  }
}

export const badgeProgressService = new BadgeProgressService();
