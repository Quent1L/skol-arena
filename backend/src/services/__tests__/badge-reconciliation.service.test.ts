/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRulesRepo = {
  getById: mock((_id: any) => Promise.resolve(null as any)),
  list: mock((_f: any) => Promise.resolve([] as any[])),
  listActiveByTrigger: mock((_t: any, _d: any) => Promise.resolve([] as any[])),
  listBadgesByPlayerAndSeason: mock((_p: any, _s: any) => Promise.resolve([] as any[])),
  listBadgeHolderPlayerIds: mock((_r: any) => Promise.resolve([] as string[])),
  listBadgeAwards: mock((_r: any) => Promise.resolve([] as any[])),
  awardBadge: mock((_p: any, _r: any, _m: any, _s: any, _rec: any, _at?: any) => Promise.resolve({ id: "badge-1" } as any)),
  revokeBadge: mock((_p: any, _r: any, _s?: any) => Promise.resolve()),
  markBadgesViewed: mock((_ids: any, _p: any) => Promise.resolve()),
  getReconciliationState: mock(() =>
    Promise.resolve({ dirty: false, silentNextRun: false, lastRunAt: null } as any),
  ),
  clearDirtyAndStampRun: mock(() => Promise.resolve()),
};
mock.module("../../repository/rules.repository", () => ({ rulesRepository: mockRulesRepo }));

const mockContextService = {
  buildMatchSubmittedContexts: mock((_m: any, _h: any) => Promise.resolve({ contexts: [], displayNames: new Map() })),
};
mock.module("../rules-context.service", () => ({ rulesContextService: mockContextService }));

const mockPlayerMmrRepo = {
  getMmrHistoryOrdered: mock((_s: any, _p: any) => Promise.resolve([] as any[])),
  getSeasonMatchIdsOrdered: mock((_s: any) => Promise.resolve([] as string[])),
};
mock.module("../../repository/player-mmr.repository", () => ({ playerMmrRepository: mockPlayerMmrRepo }));

const mockRankedRepo = {
  getSeasonWithConfig: mock((_id: any) => Promise.resolve({ disciplineId: "d1" } as any)),
  listSeasons: mock((_f: any) => Promise.resolve([{ id: "season-1" }] as any[])),
};
mock.module("../../repository/ranked-season.repository", () => ({ rankedSeasonRepository: mockRankedRepo }));

const mockNotify = { send: mock((_d: any) => Promise.resolve({} as any)) };
mock.module("../notification.service", () => ({ notificationService: mockNotify }));

const mockWs = { send: mock((_u: any, _p: any) => true) };
mock.module("../websocket.service", () => ({ webSocketService: mockWs }));

import { BadgeReconciliationService } from "../badge-reconciliation.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STREAK_RULE = {
  id: "r1",
  type: "badge",
  isActive: true,
  scope: "global",
  disciplineId: null,
  conditions: { all: [{ fact: "winStreak", operator: "greaterThanInclusive", value: 3 }] },
  action: { type: "badge", icon: "fa fa-fire", label: "Unstoppable", description: "3 wins", recurrence: "per_season" },
};

/** Same rule, but a lifetime trophy: one award per player whatever the season. */
const LIFETIME_RULE = { ...STREAK_RULE, action: { ...STREAK_RULE.action, recurrence: "once" } };

const PLAYED_AT = new Date("2025-03-01T20:00:00Z");
const M2_PLAYED_AT = new Date("2025-03-08T20:00:00Z");

function ctx(playerId: string, winStreak: number, playedAt = PLAYED_AT) {
  return { contexts: [{ playerId, context: { winStreak } as any }], displayNames: new Map(), playedAt };
}

function resetAll() {
  for (const m of [
    mockRulesRepo.getById, mockRulesRepo.list, mockRulesRepo.listActiveByTrigger,
    mockRulesRepo.listBadgesByPlayerAndSeason, mockRulesRepo.listBadgeHolderPlayerIds,
    mockRulesRepo.listBadgeAwards,
    mockRulesRepo.awardBadge, mockRulesRepo.revokeBadge, mockRulesRepo.markBadgesViewed,
    mockRulesRepo.getReconciliationState, mockRulesRepo.clearDirtyAndStampRun,
    mockContextService.buildMatchSubmittedContexts,
    mockPlayerMmrRepo.getMmrHistoryOrdered, mockPlayerMmrRepo.getSeasonMatchIdsOrdered,
    mockRankedRepo.getSeasonWithConfig, mockRankedRepo.listSeasons, mockNotify.send, mockWs.send,
  ]) m.mockClear();
  mockRankedRepo.getSeasonWithConfig.mockResolvedValue({ disciplineId: "d1" } as any);
  mockRankedRepo.listSeasons.mockResolvedValue([{ id: "season-1" }] as any);
  mockRulesRepo.list.mockResolvedValue([] as any);
  mockRulesRepo.listBadgeAwards.mockResolvedValue([] as any);
  mockRulesRepo.awardBadge.mockResolvedValue({ id: "badge-1" } as any);
  mockRulesRepo.getReconciliationState.mockResolvedValue({
    dirty: false,
    silentNextRun: false,
    lastRunAt: null,
  } as any);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("BadgeReconciliationService.reconcilePlayers", () => {
  const service = new BadgeReconciliationService();
  beforeEach(resetAll);

  it("awards a badge on the earliest match where the player qualifies", async () => {
    mockRulesRepo.listActiveByTrigger.mockResolvedValue([STREAK_RULE] as any);
    mockPlayerMmrRepo.getMmrHistoryOrdered.mockResolvedValue([{ matchId: "m1" }, { matchId: "m2" }] as any);
    mockContextService.buildMatchSubmittedContexts
      .mockResolvedValueOnce(ctx("p1", 1) as any) // m1: no
      .mockResolvedValueOnce(ctx("p1", 3, M2_PLAYED_AT) as any); // m2: yes
    mockRulesRepo.listBadgesByPlayerAndSeason.mockResolvedValue([] as any);

    await service.reconcilePlayers("season-1", ["p1"]);

    expect(mockRulesRepo.awardBadge).toHaveBeenCalledTimes(1);
    expect(mockRulesRepo.awardBadge).toHaveBeenCalledWith("p1", "r1", "m2", "season-1", "per_season", M2_PLAYED_AT);
    expect(mockRulesRepo.revokeBadge).not.toHaveBeenCalled();
    // Retroactive award must not trigger the reveal animation.
    expect(mockRulesRepo.markBadgesViewed).toHaveBeenCalledWith(["badge-1"], "p1");
  });

  it("revokes a held badge when the player no longer qualifies", async () => {
    mockRulesRepo.listActiveByTrigger.mockResolvedValue([STREAK_RULE] as any);
    mockPlayerMmrRepo.getMmrHistoryOrdered.mockResolvedValue([{ matchId: "m1" }] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 1) as any);
    mockRulesRepo.listBadgesByPlayerAndSeason.mockResolvedValue([
      { ruleId: "r1", rule: STREAK_RULE },
    ] as any);

    await service.reconcilePlayers("season-1", ["p1"]);

    expect(mockRulesRepo.revokeBadge).toHaveBeenCalledWith("p1", "r1", "season-1");
    expect(mockRulesRepo.awardBadge).not.toHaveBeenCalled();
    expect(mockNotify.send).toHaveBeenCalledTimes(1);
  });

  it("keeps badges from deactivated rules (no active badge rules → early return)", async () => {
    mockRulesRepo.listActiveByTrigger.mockResolvedValue([] as any);

    await service.reconcilePlayers("season-1", ["p1"]);

    expect(mockRulesRepo.revokeBadge).not.toHaveBeenCalled();
    expect(mockRulesRepo.awardBadge).not.toHaveBeenCalled();
  });
});

describe("BadgeReconciliationService.reconcileRule", () => {
  const service = new BadgeReconciliationService();
  beforeEach(resetAll);

  it("awards qualifying players and revokes stale holders across seasons", async () => {
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    // p1 qualifies, p2 does not.
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue({
      contexts: [
        { playerId: "p1", context: { winStreak: 5 } },
        { playerId: "p2", context: { winStreak: 0 } },
      ],
      displayNames: new Map(),
      playedAt: PLAYED_AT,
    } as any);
    // p3 currently holds it but no longer qualifies anywhere.
    mockRulesRepo.listBadgeAwards.mockResolvedValue([{ playerId: "p3", seasonId: "season-1" }] as any);

    await service.reconcileRule("r1");

    expect(mockRulesRepo.awardBadge).toHaveBeenCalledWith("p1", "r1", "m1", "season-1", "per_season", PLAYED_AT);
    expect(mockRulesRepo.awardBadge).not.toHaveBeenCalledWith(
      "p2", "r1", expect.anything(), expect.anything(), expect.anything(), expect.anything(),
    );
    expect(mockRulesRepo.revokeBadge).toHaveBeenCalledWith("p3", "r1", "season-1");
  });

  it("awards a seasonal badge once in every season the player qualified", async () => {
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);
    mockRankedRepo.listSeasons.mockResolvedValue([{ id: "season-1" }, { id: "season-2" }] as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1", "m2"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 5) as any);

    await service.reconcileRule("r1");

    // Two seasons, two awards — but only the first qualifying match of each.
    expect(mockRulesRepo.awardBadge).toHaveBeenCalledTimes(2);
    expect(mockRulesRepo.awardBadge).toHaveBeenCalledWith("p1", "r1", "m1", "season-1", "per_season", PLAYED_AT);
    expect(mockRulesRepo.awardBadge).toHaveBeenCalledWith("p1", "r1", "m1", "season-2", "per_season", PLAYED_AT);
  });

  it("awards a lifetime badge only once across every season", async () => {
    mockRulesRepo.getById.mockResolvedValue(LIFETIME_RULE as any);
    mockRankedRepo.listSeasons.mockResolvedValue([{ id: "season-1" }, { id: "season-2" }] as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 5) as any);

    await service.reconcileRule("r1");

    expect(mockRulesRepo.awardBadge).toHaveBeenCalledTimes(1);
    expect(mockRulesRepo.awardBadge).toHaveBeenCalledWith("p1", "r1", "m1", "season-1", "once", PLAYED_AT);
  });

  it("leaves the seasons that still qualify alone when revoking one that no longer does", async () => {
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);
    mockRankedRepo.listSeasons.mockResolvedValue([{ id: "season-1" }] as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 5) as any);
    mockRulesRepo.listBadgeAwards.mockResolvedValue([
      { playerId: "p1", seasonId: "season-1" },
      { playerId: "p1", seasonId: "season-9" },
    ] as any);

    await service.reconcileRule("r1");

    expect(mockRulesRepo.awardBadge).not.toHaveBeenCalled();
    expect(mockRulesRepo.revokeBadge).toHaveBeenCalledTimes(1);
    expect(mockRulesRepo.revokeBadge).toHaveBeenCalledWith("p1", "r1", "season-9");
  });

  it("revokes a lifetime badge outright, not season by season", async () => {
    mockRulesRepo.getById.mockResolvedValue(LIFETIME_RULE as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 0) as any);
    mockRulesRepo.listBadgeAwards.mockResolvedValue([{ playerId: "p1", seasonId: "season-1" }] as any);

    await service.reconcileRule("r1");

    expect(mockRulesRepo.revokeBadge).toHaveBeenCalledWith("p1", "r1", undefined);
  });

  it("writes the award but sends nothing when the pass is silent", async () => {
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 5) as any);

    await service.reconcileRule("r1", true);

    expect(mockRulesRepo.awardBadge).toHaveBeenCalledTimes(1);
    expect(mockRulesRepo.markBadgesViewed).toHaveBeenCalledWith(["badge-1"], "p1");
    expect(mockNotify.send).not.toHaveBeenCalled();
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it("changes nothing on a second pass over an already reconciled rule", async () => {
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 5) as any);
    mockRulesRepo.listBadgeAwards.mockResolvedValue([{ playerId: "p1", seasonId: "season-1" }] as any);

    await service.reconcileRule("r1");

    expect(mockRulesRepo.awardBadge).not.toHaveBeenCalled();
    expect(mockRulesRepo.revokeBadge).not.toHaveBeenCalled();
  });

  it("does nothing for an inactive rule", async () => {
    mockRulesRepo.getById.mockResolvedValue({ ...STREAK_RULE, isActive: false } as any);

    await service.reconcileRule("r1");

    expect(mockRulesRepo.awardBadge).not.toHaveBeenCalled();
    expect(mockRulesRepo.revokeBadge).not.toHaveBeenCalled();
  });
});

describe("BadgeReconciliationService.runPendingReconciliation", () => {
  const service = new BadgeReconciliationService();
  beforeEach(resetAll);

  it("skips when not dirty and not forced", async () => {
    mockRulesRepo.getReconciliationState.mockResolvedValue({ dirty: false, silentNextRun: false, lastRunAt: null } as any);

    const result = await service.runPendingReconciliation(false);

    expect(result.ran).toBe(false);
    expect(mockRulesRepo.clearDirtyAndStampRun).not.toHaveBeenCalled();
    expect(mockRulesRepo.list).not.toHaveBeenCalled();
  });

  it("runs and clears the dirty flag when dirty", async () => {
    mockRulesRepo.getReconciliationState.mockResolvedValue({ dirty: true, silentNextRun: false, lastRunAt: null } as any);
    mockRulesRepo.list.mockResolvedValue([STREAK_RULE] as any);
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);

    const result = await service.runPendingReconciliation(false);

    expect(result.ran).toBe(true);
    expect(mockRulesRepo.clearDirtyAndStampRun).toHaveBeenCalledTimes(1);
    expect(mockRulesRepo.list).toHaveBeenCalledWith({ type: "badge", isActive: true });
  });

  it("carries the silent flag of the pass it belongs to, then clears it", async () => {
    mockRulesRepo.getReconciliationState.mockResolvedValue({
      dirty: true,
      silentNextRun: true,
      lastRunAt: null,
    } as any);
    mockRulesRepo.list.mockResolvedValue([STREAK_RULE] as any);
    mockRulesRepo.getById.mockResolvedValue(STREAK_RULE as any);
    mockPlayerMmrRepo.getSeasonMatchIdsOrdered.mockResolvedValue(["m1"] as any);
    mockContextService.buildMatchSubmittedContexts.mockResolvedValue(ctx("p1", 5) as any);

    await service.runPendingReconciliation(false);

    expect(mockRulesRepo.awardBadge).toHaveBeenCalledTimes(1);
    expect(mockNotify.send).not.toHaveBeenCalled();
    expect(mockRulesRepo.clearDirtyAndStampRun).toHaveBeenCalledTimes(1);
  });

  it("runs even when clean if forced", async () => {
    mockRulesRepo.getReconciliationState.mockResolvedValue({ dirty: false, silentNextRun: false, lastRunAt: null } as any);
    mockRulesRepo.list.mockResolvedValue([] as any);

    const result = await service.runPendingReconciliation(true);

    expect(result.ran).toBe(true);
    expect(mockRulesRepo.clearDirtyAndStampRun).toHaveBeenCalledTimes(1);
  });
});
