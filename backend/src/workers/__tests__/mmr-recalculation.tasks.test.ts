/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";

mock.module("../../utils/logger", () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}) },
}));

const calls: Record<string, any[][]> = {};
const record = (name: string, result?: (...args: any[]) => unknown) =>
  mock(async (...args: any[]) => {
    (calls[name] ??= []).push(args);
    return result?.(...args);
  });
const count = (name: string) => calls[name]?.length ?? 0;

let rankedConfig: any = { baseMmr: 1000 };
let matchRow: any = { playedAt: new Date("2026-02-01"), status: "finalized" };
let season: any = { disciplineId: "d1" };
let countsMatches = false;
let tournamentStatus = "ongoing";
let finalizeChanges = new Map<string, any>();
let cancelChanges = new Map<string, any>();
let failing = new Set<string>();

const maybeFail = (name: string) => {
  if (failing.has(name)) throw new Error(`${name} failed`);
};
const rec = (name: string, result?: (...a: any[]) => unknown) =>
  record(name, (...a) => {
    maybeFail(name);
    return result?.(...a);
  });

mock.module("../../services/mmr-calculation.service", () => ({
  mmrCalculationService: {
    processMatchFinalization: rec("finalize", () => finalizeChanges),
    cascadeRecalculateAfterCancellation: rec("cancel", () => cancelChanges),
    recalculateSeasonMmrDeterministic: rec("recalc"),
  },
}));
mock.module("../../services/mmr-animation-event.service", () => ({
  mmrAnimationEventService: {
    createOfficialEventsAndBroadcast: rec("official"),
    persistRecalcEvents: rec("recalcEvents"),
    persistCancellationEvents: rec("cancellationEvents"),
  },
}));
mock.module("../../services/rules-evaluation.service", () => ({
  rulesEvaluationService: {
    evaluateMatchSubmitted: rec("rules", () => new Map()),
    seasonCountsMatches: mock(async () => countsMatches),
  },
}));
mock.module("../../services/badge-reconciliation.service", () => ({
  badgeReconciliationService: {
    reconcilePlayers: rec("badges"),
    runPendingReconciliation: rec("pending", () => ({ ran: true })),
  },
}));
mock.module("../../services/rules-match-history.service", () => ({
  rulesMatchHistoryService: {
    refreshAfterBackdatedMatch: rec("refreshAfter", () => ["moved"]),
    dropAfterBackdatedMatch: rec("dropAfter"),
    refreshPlayers: rec("facts"),
  },
}));
mock.module("../../services/ranked-season.service", () => ({
  rankedSeasonService: {
    computeAndCacheOfficial: rec("cacheOfficial"),
    computeAndCacheProvisional: rec("cacheProvisional"),
  },
}));
mock.module("../../services/websocket.service", () => ({
  webSocketService: {
    broadcastToTournament: record("broadcast"),
    send: record("send"),
    isSubscribedToTournament: mock(() => true),
  },
}));
mock.module("../../services/season-rewind.service", () => ({
  seasonRewindService: {
    generateForSeason: record("rewind"),
    refreshPlayerIdentities: record("identities"),
  },
}));
mock.module("../../services/mmr-job-queue.service", () => ({
  enqueueSeasonRewindGeneration: record("enqueueRewind"),
}));
mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: {
    getConfigByTournamentId: mock(async () => rankedConfig),
    getSeasonWithConfig: mock(async () => season),
  },
}));
mock.module("../../repository/player-mmr.repository", () => ({
  playerMmrRepository: { getAllPlayersBySeasonId: mock(async () => [{ playerId: "p1" }, { playerId: "p2" }]) },
}));
mock.module("../../repository/tournament.repository", () => ({
  tournamentRepository: { getById: mock(async () => ({ status: tournamentStatus })) },
}));
mock.module("../../repository/match.repository", () => ({
  matchRepository: { getByIdSimple: mock(async () => matchRow) },
}));
mock.module("../../repository/tournament-ruleset.repository", () => ({
  tournamentRulesetRepository: { setRecalcPending: rec("recalcPending") },
}));

const { taskList } = await import("../mmr-recalculation.worker");
const run = (name: keyof typeof taskList, payload: any) => (taskList[name] as any)(payload, {} as any);
const events = () => (calls.broadcast ?? []).map(([, message]) => message.event);

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  rankedConfig = { baseMmr: 1000 };
  matchRow = { playedAt: new Date("2026-02-01"), status: "finalized" };
  season = { disciplineId: "d1" };
  countsMatches = false;
  tournamentStatus = "ongoing";
  finalizeChanges = new Map([
    ["p1", { reason: "direct" }],
    ["p2", { reason: "direct" }],
  ]);
  cancelChanges = new Map([["p1", { reason: "cancelled" }]]);
  failing = new Set();
});

describe("finalize_match_mmr", () => {
  const payload = { matchId: "m1", tournamentId: "t1" };

  it("scores the match, writes the animation, refreshes the caches and tells the clients", async () => {
    await run("finalize_match_mmr", payload);

    expect(calls.finalize[0]).toEqual(["m1"]);
    expect(calls.rules[0]).toEqual(["m1", "t1"]);
    expect(calls.official[0].slice(0, 2)).toEqual(["m1", "t1"]);
    expect(count("recalcEvents")).toBe(0);
    expect(count("cacheOfficial")).toBe(1);
    expect(count("cacheProvisional")).toBe(1);
    expect(events()).toEqual(["leaderboard_updated"]);
  });

  it("drops stale match history when no rule counts matches", async () => {
    await run("finalize_match_mmr", payload);

    expect(count("dropAfter")).toBe(1);
    expect(count("refreshAfter")).toBe(0);
    expect(calls.badges[0][1]).toEqual([]);
  });

  it("refreshes the history and reconciles the moved players when a rule counts matches", async () => {
    countsMatches = true;

    await run("finalize_match_mmr", payload);

    expect(count("refreshAfter")).toBe(1);
    expect(calls.badges[0][1]).toEqual(["moved"]);
  });

  it("gives cascade-only players their animation and badge pass too", async () => {
    finalizeChanges = new Map([
      ["p1", { reason: "direct" }],
      ["p3", { reason: "cascade" }],
    ]);

    await run("finalize_match_mmr", payload);

    expect(calls.recalcEvents[0]).toEqual(["t1", ["p3"]]);
    expect(calls.badges[0][1]).toEqual(["p3"]);
  });

  it("skips the history sync when the match has no played date or nobody moved", async () => {
    matchRow = { playedAt: null };
    await run("finalize_match_mmr", payload);
    expect(count("dropAfter")).toBe(0);
    expect(count("refreshAfter")).toBe(0);

    delete calls.badges;
    finalizeChanges = new Map();
    await run("finalize_match_mmr", payload);
    expect(count("badges")).toBe(0);
  });

  it("carries on when a side effect fails, but not when the scoring itself fails", async () => {
    failing = new Set(["rules", "official", "refreshAfter", "badges", "cacheOfficial", "cacheProvisional"]);
    countsMatches = true;

    await run("finalize_match_mmr", payload);
    expect(events()).toEqual(["leaderboard_updated"]);

    failing = new Set(["finalize"]);
    await expect(run("finalize_match_mmr", payload)).rejects.toThrow("finalize failed");
  });
});

describe("cancel_match_mmr", () => {
  const payload = { matchId: "m1", tournamentId: "t1", cancelledMatchPlayedAt: "2026-02-01T10:00:00.000Z" };

  it("replays the season after the cancelled match and sends one grouped recap", async () => {
    await run("cancel_match_mmr", payload);

    expect(calls.cancel[0][2]).toEqual(new Date("2026-02-01T10:00:00.000Z"));
    expect(calls.cancellationEvents[0].slice(0, 2)).toEqual(["m1", "t1"]);
    expect(calls.recalcEvents[0]).toEqual(["t1", ["p1"]]);
    expect(calls.facts[0].slice(0, 2)).toEqual(["t1", ["p1"]]);
    expect(count("badges")).toBe(1);
    expect(events()).toEqual(["mmr_recap_ready", "leaderboard_updated"]);
  });

  it("does nothing for a tournament that is not a ranked season", async () => {
    rankedConfig = null;

    await run("cancel_match_mmr", payload);

    expect(count("cancel")).toBe(0);
    expect(count("broadcast")).toBe(0);
  });

  it("survives failing side effects", async () => {
    failing = new Set(["cancellationEvents", "recalcEvents", "facts", "badges"]);

    await run("cancel_match_mmr", payload);

    expect(events()).toEqual(["mmr_recap_ready", "leaderboard_updated"]);
  });
});

describe("recalculate_season_mmr", () => {
  const payload = { tournamentId: "t1" };

  it("replays the season, refreshes the caches and always clears the pending marker", async () => {
    await run("recalculate_season_mmr", payload);

    expect(count("recalc")).toBe(1);
    expect(calls.facts[0].slice(0, 2)).toEqual(["t1", ["p1", "p2"]]);
    expect(calls.recalcEvents[0]).toEqual(["t1", ["p1", "p2"]]);
    expect(events()).toEqual(["mmr_recap_ready", "leaderboard_updated"]);
    expect(calls.recalcPending[0]).toEqual(["t1", null]);
    expect(count("enqueueRewind")).toBe(0);
  });

  it("rebuilds the rewind of a season that is already finished", async () => {
    tournamentStatus = "finished";

    await run("recalculate_season_mmr", payload);

    expect(calls.enqueueRewind[0]).toEqual(["t1"]);
  });

  it("clears the marker even when the replay fails", async () => {
    failing = new Set(["recalc"]);

    await expect(run("recalculate_season_mmr", payload)).rejects.toThrow("recalc failed");

    expect(count("recalcPending")).toBe(1);
  });

  it("only clears the marker for a season without a ranked config", async () => {
    rankedConfig = null;

    await run("recalculate_season_mmr", payload);

    expect(count("recalc")).toBe(0);
    expect(calls.recalcPending[0]).toEqual(["t1", null]);
  });

  it("does not fail the job when clearing the marker fails", async () => {
    failing = new Set(["recalcPending"]);

    await expect(run("recalculate_season_mmr", payload)).resolves.toBeUndefined();
  });
});

describe("the remaining tasks", () => {
  it("reconciles pending badges, forcing only on request", async () => {
    await run("reconcile_pending_badges", { force: true });
    await run("reconcile_pending_badges", undefined);

    expect(calls.pending.map(([force]) => force)).toEqual([true, false]);
  });

  it("generates a rewind then announces it", async () => {
    await run("generate_season_rewind", { seasonId: "s1" });

    expect(calls.rewind[0]).toEqual(["s1"]);
    expect(calls.broadcast[0][1]).toEqual({ event: "rewind_ready", data: { seasonId: "s1" } });
  });

  it("refreshes the identities frozen in rewinds", async () => {
    await run("refresh_rewind_identities", { playerIds: ["p1", "p2"] });

    expect(calls.identities[0]).toEqual([["p1", "p2"]]);
  });
});
