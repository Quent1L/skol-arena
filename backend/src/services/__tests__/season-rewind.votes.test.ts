import { describe, it, expect } from "bun:test";
import { resolveVoteConfig, type RewindPlayerRef } from "@skol-arena/shared/types/index";
import { buildAwards } from "../season-rewind.votes";

const ref = (id: string): RewindPlayerRef => ({ playerId: id, displayName: id, shortName: id });
const directory = new Map(["a", "b", "c", "d"].map((id) => [id, ref(id)]));
const config = resolveVoteConfig({ fairPlayEnabled: true, mvpEnabled: true, fairPlayMinVotes: 2 });

const data = {
  received: [
    { playerId: "a", up: 6, down: 0 },
    { playerId: "b", up: 3, down: 3 },
    { playerId: "c", up: 1, down: 0 }, // below the threshold
  ],
  cast: [
    { playerId: "a", up: 5, down: 0 },
    { playerId: "b", up: 1, down: 5 },
    { playerId: "d", up: 2, down: 0 }, // too few to be rated
  ],
  mvpCast: [{ playerId: "d", n: 9 }],
  titles: [{ playerId: "b", titles: 2 }],
  spectated: [{ playerId: "c", n: 3 }],
  tags: [
    { playerId: "b", tag: "attitude" as const, count: 2 },
    { playerId: "b", tag: "other" as const, count: 1 },
  ],
};

describe("season rewind vote awards", () => {
  it("hands out the positive and voter awards", () => {
    const awards = buildAwards(data, config, directory);
    expect(awards.fairPlayPrize?.player.playerId).toBe("a");
    expect(awards.fairPlayPodium.map((x) => x.player.playerId)).toEqual(["a", "b"]);
    expect(awards.teamCarrier?.player.playerId).toBe("b");
    expect(awards.mostInvolved?.player.playerId).toBe("d");
    expect(awards.kindest?.player.playerId).toBe("a");
    expect(awards.strictestJudge?.player.playerId).toBe("b");
    expect(awards.topSupporter?.player.playerId).toBe("c");
    expect(awards.totals).toEqual({ votes: 22, positiveRate: 77, topTag: "attitude" });
  });

  it("keeps the negative award off unless opted in, and voter awards when disabled", () => {
    expect(buildAwards(data, config, directory).fairPlayWorst).toBeNull();
    const opted = buildAwards(data, { ...config, fairPlayPublicNegativeAward: true }, directory);
    expect(opted.fairPlayWorst?.player.playerId).toBe("b");
    const noVoters = buildAwards(data, { ...config, rewindVoterAwards: false }, directory);
    expect([noVoters.mostInvolved, noVoters.kindest, noVoters.strictestJudge]).toEqual([null, null, null]);
  });

  it("shows the real rate and ranks on rate × √votes", () => {
    const received = [
      { playerId: "a", up: 6, down: 0 }, // 100 % over 6 → 2.45
      { playerId: "b", up: 18, down: 2 }, // 90 % over 20 → 4.02
    ];
    const awards = buildAwards({ ...data, received }, { ...config, fairPlayPublicNegativeAward: true }, directory);
    expect(awards.fairPlayPodium.map((x) => [x.player.playerId, x.value])).toEqual([
      ["b", 90],
      ["a", 100],
    ]);
    expect(awards.fairPlayWorst?.player.playerId).toBe("b"); // a has no 👎 to be worst on
  });
});
