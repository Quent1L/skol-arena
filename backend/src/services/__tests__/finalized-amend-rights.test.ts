import { describe, it, expect } from "bun:test";
import { getFinalizedAmendRights, hasOpposingPostDispute, type FinalizedAmendContext } from "@skol-arena/shared";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-07T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * HOUR);

const match = (overrides: Partial<FinalizedAmendContext> = {}): FinalizedAmendContext => ({
  status: "finalized",
  mode: "ranked",
  finalizationReason: "trust_score",
  finalizedAt: hoursAgo(1),
  reportedBy: "author",
  hasOpenPostDispute: false,
  ...overrides,
});
const author = { userId: "author", canManage: false };
const organizer = { userId: "admin", canManage: true };

describe("getFinalizedAmendRights", () => {
  it("lets the author amend a self-validated result within 48h", () => {
    expect(getFinalizedAmendRights(match(), author, now)).toEqual({
      canCorrect: true,
      canCancel: true,
      isArbitration: false,
      denial: null,
    });
    expect(getFinalizedAmendRights(match({ finalizationReason: "auto_validation", finalizedAt: hoursAgo(47) }), author, now).canCorrect).toBe(true);
  });

  it("closes the author's window after 48h without a contestation", () => {
    const rights = getFinalizedAmendRights(match({ finalizedAt: hoursAgo(49) }), author, now);
    expect(rights.canCorrect).toBe(false);
    expect(rights.denial).toBe("window_expired");
  });

  it("stretches the author's window to the dispute window while someone contests", () => {
    const contested = { hasOpenPostDispute: true };
    expect(getFinalizedAmendRights(match({ ...contested, finalizedAt: hoursAgo(6 * 24) }), author, now).canCancel).toBe(true);
    expect(getFinalizedAmendRights(match({ ...contested, finalizedAt: hoursAgo(8 * 24) }), author, now).canCancel).toBe(false);
  });

  it("refuses the author on a result someone else signed", () => {
    for (const finalizationReason of ["consensus", "admin_override"] as const) {
      expect(getFinalizedAmendRights(match({ finalizationReason }), author, now).denial).toBe("not_amendable");
    }
  });

  it("refuses anyone but the author", () => {
    const rights = getFinalizedAmendRights(match(), { userId: "opponent", canManage: false }, now);
    expect(rights.canCorrect).toBe(false);
    expect(rights.denial).toBe("not_author");
  });

  it("lets an organizer amend any finalized result, whatever its age or reason", () => {
    const old = match({ finalizationReason: "consensus", finalizedAt: hoursAgo(365 * 24) });
    expect(getFinalizedAmendRights(old, organizer, now)).toEqual({
      canCorrect: true,
      canCancel: true,
      isArbitration: true,
      denial: null,
    });
  });

  it("leaves bracket matches and unfinalized matches alone, organizers included", () => {
    expect(getFinalizedAmendRights(match({ mode: "bracket" }), organizer, now).canCorrect).toBe(false);
    expect(getFinalizedAmendRights(match({ status: "reported" }), organizer, now).canCorrect).toBe(false);
  });

  it("covers championship as well as ranked", () => {
    expect(getFinalizedAmendRights(match({ mode: "championship" }), author, now).canCorrect).toBe(true);
  });
});

describe("hasOpposingPostDispute", () => {
  const sides = [
    { players: [{ id: "author" }, { id: "mate" }] },
    { players: [{ id: "opp1" }, { id: "opp2" }] },
  ];
  const contest = (playerId: string, isPostFinalization = true) => ({
    playerId,
    isContested: true,
    isPostFinalization,
  });

  it("counts a contestation from the other side", () => {
    expect(hasOpposingPostDispute([contest("opp2")], sides, "author")).toBe(true);
  });

  it("ignores the author's own side, so they cannot stretch their window", () => {
    expect(hasOpposingPostDispute([contest("author"), contest("mate")], sides, "author")).toBe(false);
  });

  it("ignores contestations filed before finalization", () => {
    expect(hasOpposingPostDispute([contest("opp1", false)], sides, "author")).toBe(false);
  });

  it("counts every player when the author is not one (kiosk, organizer)", () => {
    expect(hasOpposingPostDispute([contest("mate")], sides, "kiosk")).toBe(true);
  });
});
