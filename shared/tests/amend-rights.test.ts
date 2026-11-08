import { describe, it, expect } from "bun:test";

import {
  getFinalizedAmendRights,
  hasOpposingPostDispute,
  isSelfValidatedReason,
  SELF_AMEND_WINDOW_HOURS,
  POST_FINALIZATION_DISPUTE_DAYS,
} from "../src/types/match";

const NOW = new Date("2025-06-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const base = {
  status: "finalized",
  mode: "ranked",
  finalizationReason: "auto_validation",
  finalizedAt: hoursAgo(1),
  reportedBy: "author",
  hasOpenPostDispute: false,
} as never;
const author = { userId: "author", canManage: false };

describe("isSelfValidatedReason", () => {
  it("is true only for results settled without the other side", () => {
    expect(isSelfValidatedReason("auto_validation")).toBe(true);
    expect(isSelfValidatedReason("trust_score")).toBe(true);
    expect(isSelfValidatedReason("all_confirmed" as never)).toBe(false);
    expect(isSelfValidatedReason(null)).toBe(false);
  });
});

describe("hasOpposingPostDispute", () => {
  const sides = [{ players: [{ id: "author" }, { id: "mate" }] }, { players: [{ id: "rival" }] }];

  it("counts a contestation from the other side", () => {
    const c = [{ playerId: "rival", isContested: true, isPostFinalization: true }];
    expect(hasOpposingPostDispute(c, sides, "author")).toBe(true);
  });

  it("ignores the author's own side and pre-finalization contestations", () => {
    const own = [{ playerId: "mate", isContested: true, isPostFinalization: true }];
    const early = [{ playerId: "rival", isContested: true, isPostFinalization: false }];
    expect(hasOpposingPostDispute(own, sides, "author")).toBe(false);
    expect(hasOpposingPostDispute(early, sides, "author")).toBe(false);
  });

  it("tolerates missing data", () => {
    expect(hasOpposingPostDispute(undefined, undefined, null)).toBe(false);
  });
});

describe("getFinalizedAmendRights", () => {
  it("refuses everyone on a match that is not finalized or not amendable by mode", () => {
    expect(getFinalizedAmendRights({ ...base, status: "reported" }, author, NOW).denial).toBe("not_amendable");
    expect(getFinalizedAmendRights({ ...base, mode: "bracket" }, { ...author, canManage: true }, NOW).denial).toBe(
      "not_amendable",
    );
  });

  it("always lets an organizer arbitrate", () => {
    const rights = getFinalizedAmendRights({ ...base, finalizedAt: hoursAgo(9999) }, { userId: "x", canManage: true }, NOW);
    expect(rights).toEqual({ canCorrect: true, canCancel: true, isArbitration: true, denial: null });
  });

  it("lets the author amend a self-validated result inside the window", () => {
    const rights = getFinalizedAmendRights(base, author, NOW);
    expect(rights.canCorrect).toBe(true);
    expect(rights.isArbitration).toBe(false);
  });

  it("refuses the author on a result the other side signed or without a finalization date", () => {
    expect(getFinalizedAmendRights({ ...base, finalizationReason: "all_confirmed" }, author, NOW).denial).toBe("not_amendable");
    expect(getFinalizedAmendRights({ ...base, finalizedAt: null }, author, NOW).denial).toBe("not_amendable");
  });

  it("refuses somebody who is not the author", () => {
    expect(getFinalizedAmendRights(base, { userId: "other", canManage: false }, NOW).denial).toBe("not_author");
  });

  it("closes the self-amend window, and stretches it while the other side disputes", () => {
    const late = { ...base, finalizedAt: hoursAgo(SELF_AMEND_WINDOW_HOURS + 1) };
    expect(getFinalizedAmendRights(late, author, NOW).denial).toBe("window_expired");
    expect(getFinalizedAmendRights({ ...late, hasOpenPostDispute: true }, author, NOW).canCorrect).toBe(true);

    const veryLate = { ...base, hasOpenPostDispute: true, finalizedAt: hoursAgo(POST_FINALIZATION_DISPUTE_DAYS * 24 + 1) };
    expect(getFinalizedAmendRights(veryLate, author, NOW).denial).toBe("window_expired");
  });
});
