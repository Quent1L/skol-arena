/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { NotFoundError, InternalServerError, ErrorCode } from "../../types/errors";

let rewindError: Error | null = null;
const warnings: any[] = [];

mock.module("../../services/season-rewind.service", () => ({
  seasonRewindService: {
    generateForSeason: mock(async () => {
      if (rewindError) throw rewindError;
    }),
    refreshPlayerIdentities: mock(async () => {}),
  },
}));

mock.module("../../utils/logger", () => ({
  logger: {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock((payload: any, msg: string) => warnings.push({ payload, msg })),
  },
}));

const stub = (name: string) => ({ [name]: new Proxy({}, { get: () => mock(async () => undefined) }) });

mock.module("../../services/mmr-calculation.service", () => stub("mmrCalculationService"));
mock.module("../../services/mmr-animation-event.service", () => stub("mmrAnimationEventService"));
mock.module("../../services/ranked-season.service", () => stub("rankedSeasonService"));
mock.module("../../services/websocket.service", () => stub("webSocketService"));
mock.module("../../services/rules-evaluation.service", () => stub("rulesEvaluationService"));
mock.module("../../services/badge-reconciliation.service", () => stub("badgeReconciliationService"));
mock.module("../../services/rules-match-history.service", () => stub("rulesMatchHistoryService"));
mock.module("../../services/mmr-job-queue.service", () => ({
  enqueueSeasonRewindGeneration: mock(async () => {}),
}));
mock.module("../../repository/ranked-season.repository", () => stub("rankedSeasonRepository"));
mock.module("../../repository/player-mmr.repository", () => stub("playerMmrRepository"));
mock.module("../../repository/tournament.repository", () => stub("tournamentRepository"));
mock.module("../../repository/tournament-ruleset.repository", () => stub("tournamentRulesetRepository"));

const { taskList } = await import("../mmr-recalculation.worker");

const runRewind = () =>
  (taskList.generate_season_rewind as any)({ seasonId: "gone" }, {} as any);

describe("worker task guard", () => {
  beforeEach(() => {
    rewindError = null;
    warnings.length = 0;
  });

  it("drops a job whose season no longer exists instead of retrying it", async () => {
    rewindError = new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);

    await runRewind();

    expect(warnings).toHaveLength(1);
    expect(warnings[0].payload.task).toBe("generate_season_rewind");
    expect(warnings[0].payload.payload).toEqual({ seasonId: "gone" });
  });

  it("still lets a transient failure through so graphile retries it", async () => {
    rewindError = new InternalServerError(ErrorCode.UNKNOWN);

    await expect(runRewind()).rejects.toThrow(InternalServerError);
    expect(warnings).toHaveLength(0);
  });
});
