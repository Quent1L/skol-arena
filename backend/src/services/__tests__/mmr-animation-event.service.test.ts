/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Mocks ───────────────────────────────────────────────────────────────────

mock.module("../../config/i18n", () => ({
  default: { t: (key: string) => key },
}));

// Chainable select() builder whose terminal await resolves to `_selectResult`.
// Used by getMatchPlayerIds (select.from.innerJoin.innerJoin.where).
let _selectResult: any[] = [];
function setSelectResult(rows: any[]) {
  _selectResult = rows;
}
function makeSelectChain(): any {
  const chain: any = {
    then: (resolve: any, reject: any) => Promise.resolve(_selectResult).then(resolve, reject),
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
  };
  return chain;
}

mock.module("../../config/database", () => ({
  db: {
    query: { matches: { findFirst: mock(() => Promise.resolve(null)) } },
    select: mock(() => makeSelectChain()),
  },
}));

const echoRow = (data: any) => ({ id: `evt-${data.matchId}`, createdAt: new Date(), message: null, ...data });

const mockAnimRepo = {
  upsert: mock((data: any) => Promise.resolve(echoRow(data))),
  bulkUpsert: mock((rows: any[]) => Promise.resolve(rows.map(echoRow))),
  getOfficialEventDeltasByPlayer: mock(() => Promise.resolve(new Map<string, { id: string; mmrDelta: number; seenDelta: number }>())),
  getOfficialEventDeltasForPlayers: mock(() => Promise.resolve(new Map<string, Map<string, { id: string; mmrDelta: number; seenDelta: number }>>())),
  getPendingForPlayer: mock(() => Promise.resolve([] as any[])),
  markViewed: mock(() => Promise.resolve()),
  retireUnseenForMatch: mock((_seasonId: string, _matchId: string, _playerIds: string[]) => Promise.resolve()),
  clearMessageForMatch: mock((_seasonId: string, _matchId: string, _playerIds: string[]) => Promise.resolve()),
};
mock.module("../../repository/mmr-animation-event.repository", () => ({
  mmrAnimationEventRepository: mockAnimRepo,
}));

const mockPlayerMmrRepo = {
  getMmrHistoryOrdered: mock(() => Promise.resolve([] as any[])),
  getMmrHistoryOrderedForPlayers: mock(() => Promise.resolve(new Map<string, any[]>())),
  getBySeasonAndPlayer: mock(() => Promise.resolve(null as any)),
};
mock.module("../../repository/player-mmr.repository", () => ({
  playerMmrRepository: mockPlayerMmrRepo,
}));

const mockRankedRepo = {
  getConfigByTournamentId: mock(() => Promise.resolve({ baseMmr: 1000, kFactor: 32, placementMatches: 3 } as any)),
  getRankTiers: mock(() => Promise.resolve([] as any[])),
};
mock.module("../../repository/ranked-season.repository", () => ({
  rankedSeasonRepository: mockRankedRepo,
}));

mock.module("../mmr-calculation.service", () => ({
  mmrCalculationService: {},
}));

const mockWs = { send: mock((_id: string, _msg: any) => undefined) };
mock.module("../websocket.service", () => ({ webSocketService: mockWs }));

// Imported AFTER mocks so the singleton picks them up.
const { mmrAnimationEventService } = await import("../mmr-animation-event.service");

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clearMock(m: ReturnType<typeof mock>) {
  m.mock.calls.length = 0;
  m.mock.results.length = 0;
}

function historyRow(matchId: string, mmrDelta: number) {
  const mmrBefore = 1000;
  return { matchId, mmrBefore, mmrAfter: mmrBefore + mmrDelta, mmrDelta };
}

beforeEach(() => {
  [...Object.values(mockAnimRepo), ...Object.values(mockPlayerMmrRepo), ...Object.values(mockRankedRepo), mockWs.send].forEach((m) => clearMock(m as any));
  mockRankedRepo.getConfigByTournamentId.mockImplementation(() => Promise.resolve({ baseMmr: 1000, kFactor: 32, placementMatches: 3 } as any));
  mockRankedRepo.getRankTiers.mockImplementation(() => Promise.resolve([]));
  mockAnimRepo.upsert.mockImplementation((data: any) => Promise.resolve(echoRow(data)));
  mockAnimRepo.bulkUpsert.mockImplementation((rows: any[]) => Promise.resolve(rows.map(echoRow)));
  setSelectResult([]);
});

// (matchId, reason) pairs from the single per-event upsert (finalize path)
function emitted() {
  return mockAnimRepo.upsert.mock.calls.map((c: any[]) => ({ matchId: c[0].matchId, reason: c[0].reason }));
}
// flattened rows passed to bulkUpsert (batch paths)
function bulkRows() {
  return mockAnimRepo.bulkUpsert.mock.calls.flatMap((c: any[]) => c[0]);
}

// ─── persistRecalcEvents (batch, persist-only) ──────────────────────────────────

describe("persistRecalcEvents", () => {
  it("persists a 'recalculated' event only for matches whose delta changed, no broadcast", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m1", 18), historyRow("m2", -5)]]])),
    );
    // m1 stored+seen delta differs (15 -> 18), m2 unchanged (-5).
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([
        ["p1", new Map([
          ["m1", { id: "evt-m1", mmrDelta: 15, seenDelta: 15 }],
          ["m2", { id: "evt-m2", mmrDelta: -5, seenDelta: -5 }],
        ])],
      ])),
    );

    const affected = await mmrAnimationEventService.persistRecalcEvents("season-1", ["p1"]);

    const rows = bulkRows();
    expect(rows.length).toBe(1);
    expect(rows[0].matchId).toBe("m1");
    expect(rows[0].reason).toBe("recalculated");
    expect(rows[0].mmrDelta).toBe(18); // full delta kept for sync
    expect(rows[0].displayDelta).toBe(3); // differential 18 - seen 15
    expect(affected).toEqual(["p1"]);
    expect(mockWs.send.mock.calls.length).toBe(0); // persist-only
  });

  it("stacked recalcs before viewing: displayDelta relative to the SEEN delta, not the last stored one", async () => {
    // Player saw +15. A 1st recalc brought it to +18 (stored, unseen), a 2nd
    // brings it to +20. The news since the last viewing = 20 - 15 = 5, not
    // 20 - 18 = 2 (what a base on the stored delta would give).
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m1", 20)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", new Map([["m1", { id: "evt-m1", mmrDelta: 18, seenDelta: 15 }]])]])),
    );

    await mmrAnimationEventService.persistRecalcEvents("season-1", ["p1"]);

    const rows = bulkRows();
    expect(rows.length).toBe(1);
    expect(rows[0].mmrDelta).toBe(20); // sync key = new full
    expect(rows[0].displayDelta).toBe(5); // 20 - seen 15, correct accumulation
  });

  it("empty bulkUpsert + no player affected when no delta changed", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m1", 15)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", new Map([["m1", { id: "evt-m1", mmrDelta: 15, seenDelta: 15 }]])]])),
    );

    const affected = await mmrAnimationEventService.persistRecalcEvents("season-1", ["p1"]);

    expect(bulkRows().length).toBe(0);
    expect(affected).toEqual([]);
    expect(mockWs.send.mock.calls.length).toBe(0);
  });

  it("nothing for a match with no pre-existing animation event", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m1", 18)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map()),
    );

    const affected = await mmrAnimationEventService.persistRecalcEvents("season-1", ["p1"]);

    expect(bulkRows().length).toBe(0);
    expect(affected).toEqual([]);
  });

  it("multi-player cascade: a SINGLE bulkUpsert, zero ws.send per event", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([
        ["p1", [historyRow("m1", 18)]],
        ["p2", [historyRow("m1", -3), historyRow("m2", 9)]],
      ])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([
        ["p1", new Map([["m1", { id: "e1", mmrDelta: 10, seenDelta: 10 }]])],   // changed
        ["p2", new Map([
          ["m1", { id: "e2", mmrDelta: -3, seenDelta: -3 }],                    // unchanged
          ["m2", { id: "e3", mmrDelta: 5, seenDelta: 5 }],                      // changed (5 -> 9)
        ])],
      ])),
    );

    const affected = await mmrAnimationEventService.persistRecalcEvents("season-1", ["p1", "p2"]);

    expect(mockAnimRepo.bulkUpsert.mock.calls.length).toBe(1); // single batch
    const rows = bulkRows();
    expect(rows.length).toBe(2); // p1/m1 + p2/m2
    expect(affected.sort()).toEqual(["p1", "p2"]);
    expect(mockWs.send.mock.calls.length).toBe(0);
  });

  it("does nothing when the player list is empty", async () => {
    const affected = await mmrAnimationEventService.persistRecalcEvents("season-1", []);
    expect(affected).toEqual([]);
    expect(mockRankedRepo.getConfigByTournamentId.mock.calls.length).toBe(0);
  });
});

// ─── persistCancellationEvents (batch, persist-only, guard delta-0) ──────────────

describe("persistCancellationEvents", () => {
  it("only persists direct players (match_cancelled), displayDelta = -seen delta; ignores the cascade", async () => {
    // p1 saw +12 for the cancelled match; the p2 cascade is covered by persistRecalcEvents.
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", new Map([["m-cancelled", { id: "evt", mmrDelta: 12, seenDelta: 12 }]])]])),
    );
    const changes = new Map<string, any>([
      ["p1", { mmrBefore: 1012, mmrAfter: 1000, reason: "match_cancelled" }],
      ["p2", { mmrBefore: 1000, mmrAfter: 985, reason: "cascade" }],
    ]);

    const affected = await mmrAnimationEventService.persistCancellationEvents("m-cancelled", "season-1", changes);

    const rows = bulkRows();
    expect(rows.length).toBe(1);
    expect(rows[0].playerId).toBe("p1");
    expect(rows[0].reason).toBe("match_cancelled");
    expect(rows[0].displayDelta).toBe(-12); // loss of SEEN points from the cancelled match
    expect(rows[0].rankChanged).toBe(false); // no misleading rank badge
    expect(rows[0].tierAfterName).toBeNull();
    expect(affected).toEqual(["p1"]);
    expect(mockWs.send.mock.calls.length).toBe(0); // persist-only
    expect(mockAnimRepo.retireUnseenForMatch.mock.calls).toEqual([["season-1", "m-cancelled", []]]);
  });

  it("retires the pending event of a direct player who never saw the match, instead of leaving it in the recap", async () => {
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() => Promise.resolve(new Map()));
    const changes = new Map<string, any>([
      ["p1", { mmrBefore: 1000, mmrAfter: 990, reason: "match_cancelled" }],
    ]);

    const affected = await mmrAnimationEventService.persistCancellationEvents("m-cancelled", "season-1", changes);

    expect(bulkRows().length).toBe(0);
    expect(affected).toEqual([]);
    expect(mockAnimRepo.retireUnseenForMatch.mock.calls).toEqual([["season-1", "m-cancelled", ["p1"]]]);
  });

  it("mixed: a seen player gets the removal row, an unseen one is retired", async () => {
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([
        ["p1", new Map([["m-cancelled", { id: "evt-1", mmrDelta: 12, seenDelta: 12 }]])],
        ["p3", new Map([["m-cancelled", { id: "evt-3", mmrDelta: -15, seenDelta: 0 }]])],
      ])),
    );
    const changes = new Map<string, any>([
      ["p1", { mmrBefore: 1012, mmrAfter: 1000, reason: "match_cancelled" }],
      ["p3", { mmrBefore: 985, mmrAfter: 1000, reason: "match_cancelled" }],
    ]);

    const affected = await mmrAnimationEventService.persistCancellationEvents("m-cancelled", "season-1", changes);

    expect(bulkRows().map((r: any) => [r.playerId, r.displayDelta])).toEqual([["p1", -12]]);
    expect(affected).toEqual(["p1"]);
    expect(mockAnimRepo.retireUnseenForMatch.mock.calls).toEqual([["season-1", "m-cancelled", ["p3"]]]);
  });
});

// ─── Flood theory (real finalization path, unchanged) ───────────────────
// Reproduces the bug: stale animation events (deltas != mmr_history) → finalizing
// a new match emits a "recalculated" for each desynced match.

describe("theory: flood on the next match when events are stale", () => {
  const HISTORY = [historyRow("m1", 18), historyRow("m2", -7), historyRow("m3", 12), historyRow("m4", 20)];

  beforeEach(() => {
    setSelectResult([{ playerId: "p1" }]); // getMatchPlayerIds(m4) → [p1]
    mockPlayerMmrRepo.getMmrHistoryOrdered.mockImplementation(() => Promise.resolve(HISTORY));
  });

  it("BUG: stale events on m1..m3 → finalizing m4 floods 3 'recalculated' + 1 'match_finalized'", async () => {
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 15, seenDelta: 15 }],
        ["m2", { id: "evt-m2", mmrDelta: -5, seenDelta: -5 }],
        ["m3", { id: "evt-m3", mmrDelta: 10, seenDelta: 10 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1");

    const ev = emitted();
    expect(ev).toContainEqual({ matchId: "m1", reason: "recalculated" });
    expect(ev).toContainEqual({ matchId: "m2", reason: "recalculated" });
    expect(ev).toContainEqual({ matchId: "m3", reason: "recalculated" });
    expect(ev).toContainEqual({ matchId: "m4", reason: "match_finalized" });
    expect(ev.length).toBe(4);
  });

  it("FIX: synchronized events → finalizing m4 only emits m4", async () => {
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 18, seenDelta: 18 }],
        ["m2", { id: "evt-m2", mmrDelta: -7, seenDelta: -7 }],
        ["m3", { id: "evt-m3", mmrDelta: 12, seenDelta: 12 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1");

    expect(emitted()).toEqual([{ matchId: "m4", reason: "match_finalized" }]);
    expect(mockWs.send.mock.calls.length).toBe(1);
  });

  it("partial desync: only m2 changed → finalization emits m2 (recalculated) + m4", async () => {
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 18, seenDelta: 18 }],
        ["m2", { id: "evt-m2", mmrDelta: -5, seenDelta: -5 }],
        ["m3", { id: "evt-m3", mmrDelta: 12, seenDelta: 12 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1");

    const ev = emitted();
    expect(ev).toContainEqual({ matchId: "m2", reason: "recalculated" });
    expect(ev).toContainEqual({ matchId: "m4", reason: "match_finalized" });
    expect(ev.length).toBe(2);
  });
});

// ─── Rules message attachment ──────────────────────────────────────────────

describe("createOfficialEventsAndBroadcast: rules-engine message", () => {
  const HISTORY = [historyRow("m1", 18), historyRow("m2", -7), historyRow("m4", 20)];
  const outputs = () => new Map([["p1", { message: "Blue team wins!" }]]);

  /** The message the client actually receives for a given match. */
  function broadcastMessage(matchId: string): string | undefined {
    const call = mockWs.send.mock.calls.find((c: any[]) => c[1]?.data?.matchId === matchId);
    return call?.[1]?.data?.encouragementMessage;
  }

  /** The message persisted with the row, as passed to upsert. */
  function upsertedMessage(matchId: string): unknown {
    const call = mockAnimRepo.upsert.mock.calls.find((c: any[]) => c[0].matchId === matchId);
    return call?.[0].message;
  }

  beforeEach(() => {
    setSelectResult([{ playerId: "p1" }]); // getMatchPlayerIds(m4) → [p1]
    mockPlayerMmrRepo.getMmrHistoryOrdered.mockImplementation(() => Promise.resolve(HISTORY));
  });

  it("attaches the message when the match is the only animation", async () => {
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 18, seenDelta: 18 }],
        ["m2", { id: "evt-m2", mmrDelta: -7, seenDelta: -7 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1", outputs() as never);

    // Written with the row, not by a follow-up UPDATE: the event is readable by
    // getPendingForPlayer as soon as it exists.
    expect(upsertedMessage("m4")).toBe("Blue team wins!");
    expect(broadcastMessage("m4")).toBe("Blue team wins!");
  });

  it("still attaches the message when the finalization replays recalculated matches too", async () => {
    // m2's stored delta is stale, so finalizing m4 also emits a "recalculated"
    // event. The rule message must still land on m4.
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 18, seenDelta: 18 }],
        ["m2", { id: "evt-m2", mmrDelta: -5, seenDelta: -5 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1", outputs() as never);

    expect(emitted().length).toBe(2);
    expect(upsertedMessage("m4")).toBe("Blue team wins!");
    expect(broadcastMessage("m4")).toBe("Blue team wins!");
    // The replayed match carries no message, so its stored one is left alone.
    expect(upsertedMessage("m2")).toBeUndefined();
    expect(broadcastMessage("m2")).not.toBe("Blue team wins!");
  });

  it("writes no message when no rule matched", async () => {
    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1");
    expect(upsertedMessage("m4")).toBeUndefined();
  });
});

// ─── displayDelta on the finalization path (collectOfficialEvents) ──────────

describe("createOfficialEventsAndBroadcast: displayDelta", () => {
  const HISTORY = [historyRow("m1", 18), historyRow("m2", -7), historyRow("m4", 20)];

  beforeEach(() => {
    setSelectResult([{ playerId: "p1" }]); // getMatchPlayerIds(m4) → [p1]
    mockPlayerMmrRepo.getMmrHistoryOrdered.mockImplementation(() => Promise.resolve(HISTORY));
  });

  // upsert payload for a given match (single per-event finalize path)
  function upsertFor(matchId: string) {
    return mockAnimRepo.upsert.mock.calls.map((c: any[]) => c[0]).find((d) => d.matchId === matchId);
  }

  it("current (new) match = full delta; recalculated = delta - seenDelta", async () => {
    // m1 was seen at +15, its real delta is now +18 (desync) → diff +3.
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 15, seenDelta: 15 }],
        ["m2", { id: "evt-m2", mmrDelta: -7, seenDelta: -7 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1");

    expect(upsertFor("m4").displayDelta).toBe(20); // new match → full
    expect(upsertFor("m4").mmrDelta).toBe(20);
    expect(upsertFor("m1").displayDelta).toBe(3); // 18 - seen 15
    expect(upsertFor("m1").mmrDelta).toBe(18); // full kept for sync
    expect(upsertFor("m1").reason).toBe("recalculated");
  });

  it("displayDelta is broadcast in the WS payload", async () => {
    mockAnimRepo.getOfficialEventDeltasByPlayer.mockImplementation(() =>
      Promise.resolve(new Map([
        ["m1", { id: "evt-m1", mmrDelta: 18, seenDelta: 18 }],
        ["m2", { id: "evt-m2", mmrDelta: -7, seenDelta: -7 }],
      ])),
    );

    await mmrAnimationEventService.createOfficialEventsAndBroadcast("m4", "season-1");

    // m1/m2 synced → only m4 broadcast
    const sent = mockWs.send.mock.calls.find((c: any[]) => c[1]?.data?.matchId === "m4");
    expect(sent?.[1].data.displayDelta).toBe(20);
  });
});

// ─── getPendingForPlayer: fallback displayDelta on legacy rows ──────────────

describe("getPendingForPlayer", () => {
  function pendingRow(matchId: string, mmrDelta: number, displayDelta: number | null) {
    return {
      id: `evt-${matchId}`,
      matchId,
      mmrDelta,
      displayDelta,
      eventType: "official",
      reason: "recalculated",
      rankChanged: false,
      message: null,
      opponents: [],
      teammates: [],
    };
  }

  it("returns displayDelta as-is, and falls back to mmrDelta when it's null (pre-migration row)", async () => {
    mockAnimRepo.getPendingForPlayer.mockImplementation(() =>
      Promise.resolve([pendingRow("m1", 12, null), pendingRow("m2", 9, 4)] as any),
    );

    const out = await mmrAnimationEventService.getPendingForPlayer("p1", "season-1", "fr");

    expect(out.find((e) => e.matchId === "m1")?.displayDelta).toBe(12); // null → fallback mmrDelta
    expect(out.find((e) => e.matchId === "m2")?.displayDelta).toBe(4); // preserved value
  });
});

// ─── persistCorrectionEvents (direct players of a corrected match) ───────────────

describe("persistCorrectionEvents", () => {
  it("re-queues a seen match as match_corrected, showing only the change since the view", async () => {
    // p1 saw +15 for m1; the corrected result now gives them -12.
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m0", 5), historyRow("m1", -12)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", new Map([["m1", { id: "e1", mmrDelta: 15, seenDelta: 15, viewed: true }]])]])),
    );

    const affected = await mmrAnimationEventService.persistCorrectionEvents("m1", "season-1", ["p1"]);

    const rows = bulkRows();
    expect(rows.length).toBe(1);
    expect(rows[0].matchId).toBe("m1");
    expect(rows[0].reason).toBe("match_corrected");
    expect(rows[0].mmrDelta).toBe(-12);
    expect(rows[0].displayDelta).toBe(-27);
    expect(affected).toEqual(["p1"]);
    expect(mockWs.send.mock.calls.length).toBe(0);
  });

  it("rewrites a never-seen reveal as a plain finalization with the corrected delta", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p2", [historyRow("m1", 12)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p2", new Map([["m1", { id: "e2", mmrDelta: -15, seenDelta: 0, viewed: false }]])]])),
    );

    await mmrAnimationEventService.persistCorrectionEvents("m1", "season-1", ["p2"]);

    const rows = bulkRows();
    expect(rows[0].reason).toBe("match_finalized");
    expect(rows[0].displayDelta).toBe(12);
  });

  it("writes no '+0 corrected' row when the player's delta did not move", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m1", 15)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", new Map([["m1", { id: "e1", mmrDelta: 15, seenDelta: 15, viewed: true }]])]])),
    );

    const affected = await mmrAnimationEventService.persistCorrectionEvents("m1", "season-1", ["p1"]);

    expect(bulkRows().length).toBe(0);
    expect(affected).toEqual([]);
  });

  it("drops the rules message of every direct player, seen or not: it describes the old result", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m1", -12)]], ["p2", [historyRow("m1", 12)]]])),
    );
    mockAnimRepo.getOfficialEventDeltasForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([
        ["p1", new Map([["m1", { id: "e1", mmrDelta: 15, seenDelta: 15, viewed: true }]])],
        ["p2", new Map([["m1", { id: "e2", mmrDelta: -15, seenDelta: 0, viewed: false }]])],
      ])),
    );

    await mmrAnimationEventService.persistCorrectionEvents("m1", "season-1", ["p1", "p2"]);

    expect(mockAnimRepo.clearMessageForMatch.mock.calls).toEqual([["season-1", "m1", ["p1", "p2"]]]);
  });

  it("skips a player whose history no longer holds the match", async () => {
    mockPlayerMmrRepo.getMmrHistoryOrderedForPlayers.mockImplementation(() =>
      Promise.resolve(new Map([["p1", [historyRow("m0", 5)]]])),
    );

    const affected = await mmrAnimationEventService.persistCorrectionEvents("m1", "season-1", ["p1"]);

    expect(bulkRows().length).toBe(0);
    expect(affected).toEqual([]);
  });
});
