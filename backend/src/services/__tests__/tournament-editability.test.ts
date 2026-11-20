import { describe, it, expect } from "bun:test";
import {
  resolveEditableFields,
  resolveFieldEditability,
  updateTriggersRecalculation,
  policyFieldFor,
  type EditabilityContext,
} from "@skol-arena/shared/types/index";

/**
 * The policy this exercises is what the API enforces and what the admin form
 * disables from — one table, two consumers. There used to be three copies of
 * this list and they disagreed, so fields were rendered disabled that the server
 * would have accepted.
 */
function ctx(overrides: Partial<EditabilityContext> = {}): EditabilityContext {
  return {
    status: "ongoing",
    mode: "championship",
    teamMode: "flex",
    enteredMatchCount: 0,
    ...overrides,
  };
}

describe("tournament editability", () => {
  it("leaves a draft entirely open", () => {
    const draft = ctx({ status: "draft", enteredMatchCount: 0 });

    for (const field of ["mode", "teamMode", "disciplineId", "scoreEnabled", "name"]) {
      expect(resolveFieldEditability(field, draft)).toBe("always");
    }
    expect(resolveEditableFields(draft).locked).toEqual([]);
  });

  it("keeps metadata editable however far along the competition is", () => {
    const late = ctx({ status: "finished", enteredMatchCount: 200 });

    for (const field of ["name", "description", "startDate", "endDate", "rulesId"]) {
      expect(resolveFieldEditability(field, late)).toBe("always");
    }
  });

  it("never reopens the structural fields", () => {
    for (const field of ["mode", "teamMode", "disciplineId"]) {
      expect(resolveFieldEditability(field, ctx())).toBe("locked");
    }
  });

  it("locks the scoring semantics at the first entered result", () => {
    expect(resolveFieldEditability("scoreEnabled", ctx({ enteredMatchCount: 0 }))).toBe("always");
    expect(resolveFieldEditability("scoreEnabled", ctx({ enteredMatchCount: 1 }))).toBe("locked");
  });

  it("keeps the points scale editable, at the price of a recalculation", () => {
    // The one knob `recalculatePointsInternal` was built for.
    expect(resolveFieldEditability("scoringConfig", ctx({ enteredMatchCount: 50 }))).toBe("recalculates");
    expect(updateTriggersRecalculation(["scoringConfig"], ctx())).toBe(true);
    expect(updateTriggersRecalculation(["name", "description"], ctx())).toBe(false);
  });

  it("allows team sizes to move in flex but not in static", () => {
    const flex = ctx({ teamMode: "flex", enteredMatchCount: 10 });
    const stat = ctx({ teamMode: "static", enteredMatchCount: 10 });

    // A flex side is resolved per match, so a wider range only affects new ones.
    expect(resolveFieldEditability("maxTeamSize", flex)).toBe("always");
    // In static the sizes are already materialised as team rows.
    expect(resolveFieldEditability("maxTeamSize", stat)).toBe("locked");
  });

  it("restricts the per-mode configs to the modes that have them", () => {
    expect(resolveFieldEditability("championshipConfig", ctx({ mode: "championship" }))).toBe("recalculates");
    // A bracket generates its own matches and never validates against caps.
    expect(resolveFieldEditability("championshipConfig", ctx({ mode: "bracket" }))).toBe("locked");
    // Ranked runs on MMR, not points.
    expect(resolveFieldEditability("scoringConfig", ctx({ mode: "ranked" }))).toBe("locked");
  });

  it("resolves the form's flat config names onto the nested policy", () => {
    expect(policyFieldFor("pointPerVictory")).toBe("scoringConfig");
    expect(policyFieldFor("maxMatchesPerPlayer")).toBe("championshipConfig");
    expect(policyFieldFor("name")).toBe("name");

    // The form works in flat names, so they must resolve identically.
    expect(resolveFieldEditability("pointPerVictory", ctx())).toBe("recalculates");
    expect(resolveEditableFields(ctx()).editable).toContain("pointPerVictory");
  });

  it("fails closed on a field nobody gave a policy to", () => {
    expect(resolveFieldEditability("somethingNewInTheSchema", ctx())).toBe("locked");
  });

  it("splits the fields into what the form needs to render", () => {
    const { editable, recalculating, locked } = resolveEditableFields(ctx({ enteredMatchCount: 4 }));

    expect(editable).toContain("name");
    expect(recalculating).toContain("scoringConfig");
    expect(locked).toContain("mode");
    expect(locked).toContain("scoreEnabled");
    // `recalculating` is a subset of `editable`: those fields are still accepted.
    for (const field of recalculating) expect(editable).toContain(field);
    for (const field of locked) expect(editable).not.toContain(field);
  });
});
