import { describe, it, expect, mock, beforeEach } from "bun:test";

const broadcasts: Array<{ tournamentId: string; data: unknown }> = [];
mock.module("../websocket.service", () => ({
  webSocketService: {
    broadcastToTournament: (tournamentId: string, data: unknown) => {
      broadcasts.push({ tournamentId, data });
    },
  },
}));

const { notifyRankingChanged } = await import("../ranking-notifier");

describe("notifyRankingChanged", () => {
  beforeEach(() => {
    broadcasts.length = 0;
  });

  it("a ranked season reuses leaderboard_updated, which its page already refreshes on", () => {
    notifyRankingChanged({ id: "s1", mode: "ranked" });
    expect(broadcasts).toEqual([
      { tournamentId: "s1", data: { event: "leaderboard_updated", data: { seasonId: "s1" } } },
    ]);
  });

  it("a championship gets standings_updated", () => {
    notifyRankingChanged({ id: "t1", mode: "championship" });
    expect(broadcasts).toEqual([
      { tournamentId: "t1", data: { event: "standings_updated", data: { tournamentId: "t1" } } },
    ]);
  });

  it("a bracket has no ranking to refresh", () => {
    notifyRankingChanged({ id: "b1", mode: "bracket" });
    expect(broadcasts).toEqual([]);
  });
});
