import { describe, it, expect } from "bun:test";
import { automationTerm, closeInstant, seasonTerm } from "../ranked-season.service";
import {
  renderSeasonName,
  SEASON_NUMBER_PLACEHOLDER,
  rankedSeasonAutomationInputSchema,
} from "@skol-arena/shared/types/index";

describe("seasonTerm", () => {
  it("lands the end date `durationDays` after the start", () => {
    expect(seasonTerm("2026-01-01", 30).endDate).toBe("2026-01-31");
  });

  it("gives a one-day season its whole day rather than expiring at midnight", () => {
    const { endDate, rolloverAt } = seasonTerm("2026-03-10", 1);
    expect(endDate).toBe("2026-03-11");
    expect(rolloverAt.toISOString()).toBe("2026-03-11T00:00:00.000Z");
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(seasonTerm("2028-02-20", 10).endDate).toBe("2028-03-01");
  });

  it("crosses a year boundary", () => {
    expect(seasonTerm("2026-12-20", 20).endDate).toBe("2027-01-09");
  });
});

describe("closeInstant", () => {
  it("lets the end date be played in full before closing", () => {
    expect(closeInstant("2026-06-30").toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("crosses a year boundary", () => {
    expect(closeInstant("2026-12-31").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("automationTerm", () => {
  const season = { startDate: "2026-01-01", endDate: "2026-03-15" };

  it("counts a chain's term from the start and ignores the typed end date", () => {
    expect(automationTerm({ mode: "chain", durationDays: 30 }, season).endDate).toBe(
      "2026-01-31",
    );
  });

  it("keeps a close-only season on the end date the admin chose", () => {
    const term = automationTerm({ mode: "close", durationDays: 30 }, season);
    expect(term.endDate).toBe("2026-03-15");
    expect(term.rolloverAt.toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });
});

describe("renderSeasonName", () => {
  it("substitutes the season number", () => {
    expect(renderSeasonName(`Saison ${SEASON_NUMBER_PLACEHOLDER}`, 4)).toBe("Saison 4");
  });

  it("replaces every occurrence, not just the first", () => {
    const template = `S${SEASON_NUMBER_PLACEHOLDER} — Ligue ${SEASON_NUMBER_PLACEHOLDER}`;
    expect(renderSeasonName(template, 7)).toBe("S7 — Ligue 7");
  });

  it("leaves a template without the placeholder untouched", () => {
    // The schema rejects this shape; the renderer stays total rather than guessing.
    expect(renderSeasonName("Saison", 3)).toBe("Saison");
  });
});

describe("rankedSeasonAutomationInputSchema", () => {
  const valid = {
    enabled: true,
    mode: "chain" as const,
    durationDays: 30,
    nameTemplate: `Saison ${SEASON_NUMBER_PLACEHOLDER}`,
    carryParticipants: true,
    participantsMinMatches: 0,
    carryTiers: true,
    tierScalingMode: "keep" as const,
    carryMmr: true,
    softResetFactor: 0.5,
  };

  it("accepts a well-formed chain", () => {
    expect(rankedSeasonAutomationInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a close-only automation", () => {
    expect(
      rankedSeasonAutomationInputSchema.safeParse({ ...valid, mode: "close" }).success,
    ).toBe(true);
  });

  it("rejects an unknown mode", () => {
    expect(
      rankedSeasonAutomationInputSchema.safeParse({ ...valid, mode: "pause" }).success,
    ).toBe(false);
  });

  it("rejects a name template without the placeholder", () => {
    // `tournaments.name` is UNIQUE, so such a template would collide on the first rollover.
    const result = rankedSeasonAutomationInputSchema.safeParse({
      ...valid,
      nameTemplate: "Saison",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duration outside 1..365 days", () => {
    for (const durationDays of [0, -5, 366]) {
      expect(
        rankedSeasonAutomationInputSchema.safeParse({ ...valid, durationDays }).success,
      ).toBe(false);
    }
  });

  it("rejects a soft reset factor outside 0..1", () => {
    expect(
      rankedSeasonAutomationInputSchema.safeParse({ ...valid, softResetFactor: 1.5 }).success,
    ).toBe(false);
  });
});
