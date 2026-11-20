import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import {
  MmrAnimationEventRepository,
  type UpsertMmrAnimationEventData,
} from "../../../repository/mmr-animation-event.repository";
import { makeSeeder } from "../helpers/db-seed";

const repo = new MmrAnimationEventRepository();
const seed = makeSeeder(testDb);

describe("mmrAnimationEventRepository (integration)", () => {
  let ann: string;
  let bob: string;
  let cat: string;
  let seasonId: string;
  let matchA: string;
  let matchB: string;

  const event = (
    playerId: string,
    matchId: string,
    extra: Partial<UpsertMmrAnimationEventData> = {},
  ): UpsertMmrAnimationEventData => ({
    playerId,
    seasonId,
    matchId,
    eventType: "official",
    reason: "match_finalized",
    mmrBefore: 1000,
    mmrAfter: 1020,
    mmrDelta: 20,
    displayDelta: 20,
    tierBeforeLevel: 1,
    tierAfterLevel: 1,
    tierBeforeName: "Bronze",
    tierAfterName: "Bronze",
    rankChanged: false,
    ...extra,
  });

  beforeAll(async () => {
    const admin = await seed.createUser("Admin");
    [ann, bob, cat] = (await Promise.all(["Ann", "Bob", "Cat"].map((n) => seed.createUser(n)))) as [
      string,
      string,
      string,
    ];
    seasonId = await seed.createTournament(admin, { mode: "ranked" });
    const [eAB, eC, eB, eA] = await Promise.all([
      seed.createEntry(seasonId, [ann, bob]),
      seed.createEntry(seasonId, [cat]),
      seed.createEntry(seasonId, [bob]),
      seed.createEntry(seasonId, [ann]),
    ]);
    matchA = await seed.createMatch({ tournamentId: seasonId, entryA: eAB, entryB: eC });
    matchB = await seed.createMatch({ tournamentId: seasonId, entryA: eA, entryB: eB });
  });

  it("upserts an event and resets it when the same one is re-emitted", async () => {
    const first = await repo.upsert(event(ann, matchA, { message: "hello" }));
    expect(first?.viewedAt).toBeNull();
    await repo.markViewed([first!.id], ann);

    const again = await repo.upsert(event(ann, matchA, { mmrDelta: 30, mmrAfter: 1030 }));
    expect(again?.id).toBe(first!.id);
    expect(again).toMatchObject({ mmrDelta: 30, viewedAt: null, message: "hello" });
  });

  it("bulk upserts, ignoring an empty batch", async () => {
    expect(await repo.bulkUpsert([])).toEqual([]);
    const rows = await repo.bulkUpsert([event(bob, matchA), event(cat, matchA, { mmrDelta: -20, mmrAfter: 980 })]);
    expect(rows).toHaveLength(2);
    const updated = await repo.bulkUpsert([event(bob, matchA, { mmrDelta: 25 })]);
    expect(updated[0]!.mmrDelta).toBe(25);
  });

  it("returns a player's pending events with opponents and teammates", async () => {
    const pending = await repo.getPendingForPlayer(ann, seasonId);
    expect(pending).toHaveLength(1);
    const [row] = pending as Array<{ teammates: { id: string }[]; opponents: { id: string }[]; playedAt?: Date }>;
    expect(row!.teammates.map((p) => p.id)).toEqual([bob]);
    expect(row!.opponents.map((p) => p.id)).toEqual([cat]);
    expect(row!.playedAt).toBeInstanceOf(Date);
    expect(await repo.getPendingForPlayer(ann, "00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("builds match context for several matches at once", async () => {
    const context = await repo.getMatchContext(ann, [matchA, matchA, matchB]);
    expect(context(matchA).teammates).toHaveLength(1);
    expect(context(matchB).opponents.map((p) => p.id)).toEqual([bob]);
    const empty = await repo.getMatchContext(ann, []);
    expect(empty("x")).toEqual({ opponents: [], teammates: [], playedAt: undefined });
  });

  it("reads official deltas for one player and for many", async () => {
    await repo.upsert(event(ann, matchB, { eventType: "provisional" }));
    const mine = await repo.getOfficialEventDeltasByPlayer(seasonId, ann);
    expect([...mine.keys()]).toEqual([matchA]);

    expect((await repo.getOfficialEventDeltasForPlayers(seasonId, [])).size).toBe(0);
    const many = await repo.getOfficialEventDeltasForPlayers(seasonId, [ann, bob]);
    expect(many.get(bob)?.get(matchA)).toMatchObject({ mmrDelta: 25, viewed: false });
  });

  it("marks events viewed, which records the delta the player has seen", async () => {
    await repo.markViewed([], bob);
    const [pending] = await repo.getPendingForPlayer(bob, seasonId);
    await repo.markViewed([pending!.id], bob);
    expect(await repo.getPendingForPlayer(bob, seasonId)).toEqual([]);
    const seen = (await repo.getOfficialEventDeltasForPlayers(seasonId, [bob])).get(bob)?.get(matchA);
    expect(seen).toMatchObject({ seenDelta: 25, viewed: true });
  });

  it("clears the message of a match's events", async () => {
    await repo.clearMessageForMatch(seasonId, matchA, []);
    await repo.clearMessageForMatch(seasonId, matchA, [ann]);
    const [row] = await repo.getPendingForPlayer(ann, seasonId);
    expect(row!.message).toBeNull();
  });

  it("retires unseen events of a cancelled match, but not the ones already seen", async () => {
    await repo.retireUnseenForMatch(seasonId, matchA, []);
    await repo.retireUnseenForMatch(seasonId, matchA, [ann, bob, cat]);

    // ann had already seen part of this delta: that event stays, only never-seen ones retire.
    expect((await repo.getPendingForPlayer(ann, seasonId)).map((e) => e.matchId).sort()).toEqual(
      [matchA, matchB].sort(),
    );
    expect(await repo.getPendingForPlayer(cat, seasonId)).toEqual([]);
    const bobEvent = (await repo.getOfficialEventDeltasForPlayers(seasonId, [bob])).get(bob)?.get(matchA);
    expect(bobEvent?.seenDelta).toBe(25);
  });
});
