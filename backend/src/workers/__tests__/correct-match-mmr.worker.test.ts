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
const stub = (name: string) => ({ [name]: new Proxy({}, { get: () => mock(async () => undefined) }) });

let matchRow: any = null;
let rankedConfig: any = { baseMmr: 1000 };
const sockets: { user: any[]; tournament: any[] } = { user: [], tournament: [] };
let subscribed = new Set<string>();

mock.module("../../repository/match.repository", () => ({
  matchRepository: { getByIdSimple: mock(async () => matchRow) },
}));
mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: { getConfigByTournamentId: mock(async () => rankedConfig) },
}));
mock.module("../../services/mmr-calculation.service", () => ({
  mmrCalculationService: {
    cascadeRecalculateAfterCorrection: record(
      "cascade",
      () =>
        new Map([
          ["p1", { mmrBefore: 1015, mmrAfter: 988, reason: "match_corrected" }],
          ["p2", { mmrBefore: 985, mmrAfter: 1012, reason: "match_corrected" }],
          ["p3", { mmrBefore: 1000, mmrAfter: 1003, reason: "cascade" }],
        ]),
    ),
  },
}));
mock.module("../../services/mmr-animation-event.service", () => ({
  mmrAnimationEventService: {
    persistCorrectionEvents: record("correctionEvents"),
    persistRecalcEvents: record("recalcEvents"),
  },
}));
mock.module("../../services/badge-reconciliation.service", () => ({
  badgeReconciliationService: { reconcilePlayers: record("badges") },
}));
mock.module("../../services/websocket.service", () => ({
  webSocketService: {
    send: mock((userId: string, msg: any) => sockets.user.push([userId, msg.event])),
    broadcastToTournament: mock((_t: string, msg: any) => sockets.tournament.push(msg.event)),
    isSubscribedToTournament: mock((_t: string, userId: string) => subscribed.has(userId)),
  },
}));
mock.module("../../services/ranked-season.service", () => stub("rankedSeasonService"));
mock.module("../../services/rules-evaluation.service", () => stub("rulesEvaluationService"));
mock.module("../../services/season-rewind.service", () => stub("seasonRewindService"));
mock.module("../../services/mmr-job-queue.service", () => ({
  enqueueSeasonRewindGeneration: mock(async () => {}),
}));
mock.module("../../repository/player-mmr.repository", () => stub("playerMmrRepository"));
mock.module("../../repository/tournament.repository", () => stub("tournamentRepository"));
mock.module("../../repository/tournament-ruleset.repository", () => stub("tournamentRulesetRepository"));

const { taskList } = await import("../mmr-recalculation.worker");
const run = () => (taskList.correct_match_mmr as any)({ matchId: "m1", tournamentId: "s1" }, {} as any);

describe("correct_match_mmr", () => {
  beforeEach(() => {
    for (const key of Object.keys(calls)) delete calls[key];
    sockets.user.length = 0;
    sockets.tournament.length = 0;
    subscribed = new Set();
    rankedConfig = { baseMmr: 1000 };
    matchRow = { id: "m1", status: "finalized", playedAt: new Date("2026-10-01T18:00:00Z") };
  });

  it("rewrites the match's own events, then resyncs every player the replay reached", async () => {
    await run();

    expect(calls.cascade).toEqual([["m1", "s1", matchRow.playedAt]]);
    expect(calls.correctionEvents).toEqual([["m1", "s1", ["p1", "p2"]]]);
    // The direct players' later matches moved too: they are resynced like the cascade.
    expect(calls.recalcEvents).toEqual([["s1", ["p1", "p2", "p3"]]]);
    expect(calls.badges).toEqual([["s1", ["p1", "p2", "p3"]]]);
  });

  it("pings the match's own players directly, not only the tournament subscribers", async () => {
    await run();

    expect(sockets.user).toEqual([
      ["p1", "mmr_recap_ready"],
      ["p2", "mmr_recap_ready"],
    ]);
    expect(sockets.tournament).toEqual(["mmr_recap_ready", "leaderboard_updated"]);
  });

  it("does not ping a subscribed direct player twice", async () => {
    subscribed = new Set(["p1"]);

    await run();

    expect(sockets.user).toEqual([["p2", "mmr_recap_ready"]]);
  });

  it("leaves a match cancelled since its correction to the cancellation job", async () => {
    matchRow = { ...matchRow, status: "cancelled" };

    await run();

    expect(calls.cascade).toBeUndefined();
  });
});
