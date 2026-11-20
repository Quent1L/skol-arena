import { describe, it, expect } from "bun:test";
import {
  indexRulesetOutcomes,
  resolveRuleset,
  resolveRulesetInteractionMode,
  resolveRulesetOutcome,
  rulesetsEqual,
  selectableRulesetOutcomes,
  RULESET_OUTCOME_DEFAULTS,
  type TournamentRulesetPayload,
} from "@skol-arena/shared/types/index";
import { DEFAULT_TEAM_INTERACTION_MODE } from "../mmr-engine";

/**
 * Moving the ruleset onto a snapshot has to be a no-op for data that already
 * exists. Every path that used to fall back to an inline literal now falls back
 * to RULESET_OUTCOME_DEFAULTS instead, so if those two ever drift the migration
 * silently rewrites historical points and MMR.
 *
 * The literals asserted here are the ones the redirected call sites used before:
 *   - mmr-calculation.service   FALLBACK_OUTCOME_TYPE  { scoreCountsForMmr: true, mmrMultiplier: 1 }
 *   - standings.service         outcomeInfo            { name: "Défaut", points: 3 }
 */
describe("ruleset defaults", () => {
  it("reproduces the fallbacks the live-read call sites used", () => {
    expect(RULESET_OUTCOME_DEFAULTS.scoreCountsForMmr).toBe(true);
    expect(RULESET_OUTCOME_DEFAULTS.mmrMultiplier).toBe(1);
    expect(RULESET_OUTCOME_DEFAULTS.name).toBe("Défaut");
    expect(RULESET_OUTCOME_DEFAULTS.points).toBe(3);
    expect(RULESET_OUTCOME_DEFAULTS.isDefault).toBe(false);
  });

  it("defaults the interaction mode to what the engine would have applied", () => {
    expect(resolveRulesetInteractionMode(null)).toBe(DEFAULT_TEAM_INTERACTION_MODE);
    expect(resolveRulesetInteractionMode({ discipline: null, outcomeTypes: [] })).toBe(DEFAULT_TEAM_INTERACTION_MODE);
    // A discipline that carries no explicit mode behaves like no discipline at all.
    expect(
      resolveRulesetInteractionMode({
        discipline: { id: "d", name: "D", teamInteractionMode: null },
        outcomeTypes: [],
      }),
    ).toBe(DEFAULT_TEAM_INTERACTION_MODE);
  });

  it("resolves a match with no outcome type to the defaults", () => {
    // The case that keeps matches orphaned before the restrict foreign keys working.
    const outcome = resolveRulesetOutcome({ discipline: null, outcomeTypes: [] }, null);
    expect(outcome.points).toBe(RULESET_OUTCOME_DEFAULTS.points);
    expect(outcome.mmrMultiplier).toBe(RULESET_OUTCOME_DEFAULTS.mmrMultiplier);
    expect(outcome.scoreCountsForMmr).toBe(RULESET_OUTCOME_DEFAULTS.scoreCountsForMmr);
  });

  it("resolves an id the snapshot never heard of to the defaults", () => {
    const payload: TournamentRulesetPayload = {
      discipline: null,
      outcomeTypes: [
        {
          id: "known",
          name: "Normal",
          points: 5,
          mmrMultiplier: 2,
          scoreCountsForMmr: false,
          isDefault: true,
          archivedAt: null,
          reasons: [],
        },
      ],
    };

    expect(resolveRulesetOutcome(payload, "known").points).toBe(5);
    expect(resolveRulesetOutcome(payload, "unknown").points).toBe(RULESET_OUTCOME_DEFAULTS.points);
  });

  it("keeps archived types resolvable but out of the entry list", () => {
    const payload: TournamentRulesetPayload = {
      discipline: null,
      outcomeTypes: [
        {
          id: "live",
          name: "Normal",
          points: 3,
          mmrMultiplier: 1,
          scoreCountsForMmr: true,
          isDefault: true,
          archivedAt: null,
          reasons: [],
        },
        {
          id: "gone",
          name: "Retiré",
          points: 1,
          mmrMultiplier: 0.5,
          scoreCountsForMmr: true,
          isDefault: false,
          archivedAt: "2026-01-01T00:00:00.000Z",
          reasons: [],
        },
      ],
    };

    // Still priced correctly for a match already played under it...
    expect(resolveRulesetOutcome(payload, "gone").points).toBe(1);
    // ...but never offered for a new one.
    expect(selectableRulesetOutcomes(payload).map((o) => o.id)).toEqual(["live"]);
  });

  it("indexes outcomes by id for the replay loops", () => {
    const payload = resolveRuleset({
      discipline: null,
      outcomeTypes: [
        {
          id: "a",
          name: "A",
          points: 3,
          mmrMultiplier: 1,
          scoreCountsForMmr: true,
          isDefault: false,
          archivedAt: null,
          reasons: [],
        },
      ],
    });

    const index = indexRulesetOutcomes(payload);
    expect(index.get("a")?.name).toBe("A");
    expect(index.get("missing")).toBeUndefined();
  });

  it("compares rulesets regardless of key order", () => {
    // A payload read back from the jsonb column comes with its keys reordered:
    // Postgres stores them sorted, not as written. Comparing the two as text
    // would report drift on every single read.
    const written: TournamentRulesetPayload = {
      discipline: { id: "d", name: "D", teamInteractionMode: "INDIVIDUAL" },
      outcomeTypes: [
        {
          id: "a",
          name: "A",
          points: 3,
          mmrMultiplier: 1,
          scoreCountsForMmr: true,
          isDefault: false,
          archivedAt: null,
          reasons: [],
        },
      ],
    };
    const readBack: TournamentRulesetPayload = {
      outcomeTypes: [
        {
          id: "a",
          name: "A",
          points: 3,
          reasons: [],
          isDefault: false,
          archivedAt: null,
          mmrMultiplier: 1,
          scoreCountsForMmr: true,
        },
      ],
      discipline: { name: "D", id: "d", teamInteractionMode: "INDIVIDUAL" },
    };

    expect(JSON.stringify(written)).not.toBe(JSON.stringify(readBack));
    expect(rulesetsEqual(written, readBack)).toBe(true);
  });

  it("still reports a genuine difference", () => {
    const base: TournamentRulesetPayload = { discipline: null, outcomeTypes: [] };
    const changed: TournamentRulesetPayload = {
      discipline: null,
      outcomeTypes: [
        {
          id: "a",
          name: "A",
          points: 3,
          mmrMultiplier: 1,
          scoreCountsForMmr: true,
          isDefault: false,
          archivedAt: null,
          reasons: [],
        },
      ],
    };

    expect(rulesetsEqual(base, changed)).toBe(false);
    expect(rulesetsEqual(base, base)).toBe(true);
    expect(rulesetsEqual(null, null)).toBe(true);
  });

  it("treats a missing ruleset as empty rather than throwing", () => {
    expect(resolveRuleset(null)).toEqual({ discipline: null, outcomeTypes: [] });
    expect(indexRulesetOutcomes(null).size).toBe(0);
    expect(selectableRulesetOutcomes(null)).toEqual([]);
  });
});
