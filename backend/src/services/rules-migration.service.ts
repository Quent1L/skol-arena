import { lt, eq, sql } from "drizzle-orm";
import { db } from "../config/database";
import { rules } from "../db/schema";
import { logger } from "../utils/logger";
import { rulesRepository } from "../repository/rules.repository";
import {
  RULES_ENGINE_VERSION,
  type BadgeAction,
  type BadgeRecurrence,
  type RuleAction,
  type RuleConditions,
} from "@skol-arena/shared";

/**
 * Forward-only migration of stored rules.
 *
 * Rules are data in our own database, so the engine never interprets more than the
 * current shape: anything older is rewritten once, here, and evaluation stays
 * single-shape. This mirrors how Drizzle handles the schema — same reason, same
 * timing (startup, before anything reads).
 *
 * The same chain is what an import must run on incoming rules, which is why
 * `migrateRule` is a pure function taking an explicit `from` version.
 */

/** The parts of a rule a patch is allowed to rewrite. */
export interface MigratableRule {
  conditions: RuleConditions;
  action: RuleAction;
}

/** A patch either produces the next-version rule, or gives up with a reason. */
export type PatchResult = MigratableRule | { disable: string };

export interface RulePatch {
  /** Version this patch produces. Patches apply in ascending order. */
  to: number;
  describe: string;
  apply(rule: MigratableRule): PatchResult;
}

function isGiveUp(result: PatchResult): result is { disable: string } {
  return "disable" in result;
}

// ─── v1 → v2 ────────────────────────────────────────────────────────────────
// `winnerId` / `loserId` held only the FIRST player of a side, which on a team
// match depends on entry insertion order. They are replaced by the full line-ups.

const SIDE_FACT_RENAME: Record<string, string> = { winnerId: "winnerIds", loserId: "loserIds" };

/** Scalar-on-string operator → equivalent operator against the list of players. */
const SIDE_OPERATOR_REMAP: Record<string, string> = {
  equal: "contains",
  notEqual: "doesNotContain",
  in: "containsAny",
  notIn: "containsNone",
};

function migrateChildren(nodes: RuleConditions[]): RuleConditions[] | { disable: string } {
  const children: RuleConditions[] = [];
  for (const child of nodes) {
    const migrated = migrateSideConditions(child);
    if (typeof migrated === "object" && "disable" in migrated) return migrated;
    children.push(migrated);
  }
  return children;
}

function migrateSideConditions(node: RuleConditions): RuleConditions | { disable: string } {
  if ("all" in node) {
    const children = migrateChildren(node.all);
    return "disable" in children ? children : { all: children };
  }
  if ("any" in node) {
    const children = migrateChildren(node.any);
    return "disable" in children ? children : { any: children };
  }

  const fact = SIDE_FACT_RENAME[node.fact];
  if (!fact) return node;

  const operator = SIDE_OPERATOR_REMAP[node.operator];
  if (!operator) {
    // `contains`/`doesNotContain` meant substring matching on a UUID — no faithful
    // equivalent against a list, and no sane rule relies on it.
    return { disable: `operator "${node.operator}" on "${node.fact}" has no line-up equivalent` };
  }
  return { fact, operator, value: node.value };
}

/** `{{winnerId}}` rendered one display name; `{{winnerIds}}` renders the whole side. */
function migrateSideVariables(action: RuleAction): RuleAction {
  if (action.type !== "message") return action;
  const variants = action.variants.map((variant) =>
    variant.replace(/\{\{\s*(winnerId|loserId)\s*\}\}/g, (_, key: string) => `{{${SIDE_FACT_RENAME[key]}}}`),
  );
  return { ...action, variants };
}

const sideLineUpPatch: RulePatch = {
  to: 2,
  describe: "winnerId/loserId → winnerIds/loserIds",
  apply(rule) {
    const conditions = migrateSideConditions(rule.conditions);
    if (typeof conditions === "object" && "disable" in conditions) return conditions;
    return { conditions, action: migrateSideVariables(rule.action) };
  },
};

// ─── v2 → v3 ────────────────────────────────────────────────────────────────
// A badge is no longer a lifetime trophy but a season one, which the action now
// states explicitly. Rules written before this had no recurrence to state, so they
// take the new default and become seasonal — the breaking half of the change.

const badgeRecurrencePatch: RulePatch = {
  to: 3,
  describe: "badge action gains recurrence (default per_season)",
  apply(rule) {
    if (rule.action.type !== "badge") return rule;
    // `BadgeAction` describes the CURRENT shape, in which recurrence is mandatory;
    // a stored v2 action simply has no such key. Hence the widening cast.
    const action = rule.action as Omit<BadgeAction, "recurrence"> & { recurrence?: BadgeRecurrence };
    if (action.recurrence) return rule;
    return { ...rule, action: { ...action, recurrence: "per_season" } };
  },
};

/** Ordered by `to`. Never reorder or rewrite a released patch. */
export const RULE_PATCHES: RulePatch[] = [sideLineUpPatch, badgeRecurrencePatch];

// ─── Chain ──────────────────────────────────────────────────────────────────

export interface MigrationOutcome {
  rule: MigratableRule;
  version: number;
  /** Set when a patch gave up; the caller decides what to do (deactivate, reject…). */
  disabled?: string;
}

/**
 * Runs every patch above `from` in order. Pure — no database access — so an import
 * can reuse it on a payload that has never been stored.
 */
export function migrateRule(rule: MigratableRule, from: number): MigrationOutcome {
  let current = rule;
  let version = from;
  for (const patch of RULE_PATCHES) {
    if (patch.to <= version) continue;
    const result = patch.apply(current);
    if (isGiveUp(result)) return { rule: current, version, disabled: `${patch.describe}: ${result.disable}` };
    current = result;
    version = patch.to;
  }
  return { rule: current, version };
}

/**
 * Brings every stored rule up to `RULES_ENGINE_VERSION`. Idempotent: the version
 * column is the cursor, so a rerun is a no-op.
 *
 * Must run before anything reads rules — validation rejects facts absent from the
 * current catalog, so an un-migrated rule cannot even be saved from the admin UI.
 */
export async function migrateStoredRules(): Promise<void> {
  // Two instances booting together must not both rewrite the same rows.
  const lockResult = await db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(4919283) AS locked`,
  );
  if (lockResult.rows[0]?.locked !== true) {
    logger.info("[RulesMigration] another instance holds the lock, skipping");
    return;
  }

  try {
    const stale = await db.select().from(rules).where(lt(rules.engineVersion, RULES_ENGINE_VERSION));
    if (stale.length === 0) return;

    logger.info({ count: stale.length, to: RULES_ENGINE_VERSION }, "[RulesMigration] upgrading stored rules");
    let disabledCount = 0;
    let badgeTouched = false;

    for (const row of stale) {
      const outcome = migrateRule(
        { conditions: row.conditions as RuleConditions, action: row.action as RuleAction },
        row.engineVersion,
      );

      if (outcome.disabled) {
        // Left at its old version on purpose: a later patch may know how to handle it,
        // and the row keeps the shape a human needs in order to rewrite it by hand.
        disabledCount += 1;
        await db
          .update(rules)
          .set({ isActive: false, disabledReason: outcome.disabled })
          .where(eq(rules.id, row.id));
        logger.warn({ ruleId: row.id, name: row.name, reason: outcome.disabled }, "[RulesMigration] rule deactivated");
        if (row.type === "badge") badgeTouched = true;
        continue;
      }

      await db
        .update(rules)
        .set({
          conditions: outcome.rule.conditions,
          action: outcome.rule.action,
          engineVersion: outcome.version,
          // A later patch may rescue a rule an earlier one gave up on; the stale
          // reason must not outlive the problem. Reactivating stays the admin's call.
          disabledReason: null,
        })
        .where(eq(rules.id, row.id));
      if (row.type === "badge") badgeTouched = true;
    }

    // Rewritten conditions change which badges are owed, and a deactivated badge rule
    // stops owing its own — the nightly reconciliation has to replay either way.
    if (badgeTouched) await rulesRepository.markBadgeRulesDirty();

    logger.info(
      { migrated: stale.length - disabledCount, disabled: disabledCount },
      "[RulesMigration] done",
    );
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(4919283)`);
  }
}
