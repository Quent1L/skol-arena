import { describe, it, expect, beforeAll, beforeEach, afterAll, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { voteService, VOTE_STATS_NOTIFY_DELAY_MS } from "../../vote.service";
import { voteStatsService } from "../../vote-stats.service";
import { notificationService } from "../../notification.service";
import { webSocketService } from "../../websocket.service";
import {
  appUsers,
  fairPlayVotes,
  matchResults,
  matchSides,
  matches,
  mvpVotes,
  playerVotePromptStates,
  tournamentAdmins,
  tournamentEntries,
  tournamentEntryPlayers,
  tournamentParticipants,
  tournamentVoteConfigs,
  tournaments,
  votePrompts,
  user as betterAuthUser,
} from "../../../db/schema";

async function createUser(name: string) {
  const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [authUser] = await testDb
    .insert(betterAuthUser)
    .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
    .returning();
  const [appUser] = await testDb
    .insert(appUsers)
    .values({ displayName: name, shortName: name.slice(0, 3).toUpperCase(), externalId: authUser.id })
    .returning();
  return appUser.id;
}

async function createTournament(createdBy: string) {
  const [row] = await testDb
    .insert(tournaments)
    .values({
      name: `Votes ${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "ongoing",
      createdBy,
    })
    .returning();
  return row.id;
}

const HOUR = 3_600_000;

describe("Fair-play & MVP votes (integration)", () => {
  let admin: string, alice: string, bob: string, carol: string, dave: string, member: string, outsider: string;
  let tournamentId: string;

  async function entry(players: string[]) {
    const [e] = await testDb.insert(tournamentEntries).values({ tournamentId, entryType: "TEAM" }).returning();
    await testDb.insert(tournamentEntryPlayers).values(players.map((playerId) => ({ entryId: e.id, playerId })));
    return e.id;
  }

  /** Alice & Bob (side A) vs Carol & Dave (side B), entered by Alice `ageHours` ago. */
  async function match2v2(ageHours = 0, sideB = [carol, dave]) {
    const at = new Date(Date.now() - ageHours * HOUR);
    const [m] = await testDb
      .insert(matches)
      .values({ tournamentId, status: "reported", winnerSide: "A", createdBy: alice, createdAt: at, playedAt: at })
      .returning();
    await testDb.insert(matchSides).values([
      { matchId: m.id, entryId: await entry([alice, bob]), position: 1, score: 2 },
      { matchId: m.id, entryId: await entry(sideB), position: 2, score: 1 },
    ]);
    return m.id;
  }

  async function setConfig(values: Partial<typeof tournamentVoteConfigs.$inferInsert>) {
    await testDb
      .insert(tournamentVoteConfigs)
      .values({ tournamentId, ...values })
      .onConflictDoUpdate({ target: tournamentVoteConfigs.tournamentId, set: values });
  }

  beforeAll(async () => {
    admin = await createUser("Admin");
    [alice, bob, carol, dave, member, outsider] = await Promise.all(
      ["Alice", "Bob", "Carol", "Dave", "Member", "Outsider"].map(createUser),
    );
    tournamentId = await createTournament(admin);
    await testDb.insert(tournamentAdmins).values({ tournamentId, userId: admin, role: "owner" });
    await testDb.insert(tournamentParticipants).values(
      [alice, bob, carol, dave, member].map((userId) => ({ tournamentId, userId, status: "active" as const })),
    );
  });

  beforeEach(async () => {
    await testDb.delete(fairPlayVotes);
    await testDb.delete(mvpVotes);
    await testDb.delete(votePrompts);
    await testDb.delete(playerVotePromptStates);
    await setConfig({
      fairPlayEnabled: true,
      mvpEnabled: true,
      mvpMinVotes: 2,
      mvpSameTargetLimit: "none",
      fairPlayAlertThreshold: 3,
    });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe("fair-play", () => {
    it("lets a player rate an opponent, never a teammate", async () => {
      const id = await match2v2();
      const votes = await voteService.castFairPlay(id, alice, carol, { value: "down", tags: ["attitude"] });
      expect(votes.fairPlay?.opponentIds.sort()).toEqual([carol, dave].sort());
      expect(votes.fairPlay?.myVotes).toEqual([{ targetId: carol, value: "down", tags: ["attitude"] }]);
      await expect(voteService.castFairPlay(id, alice, bob, { value: "up" })).rejects.toThrow("VOTE_NOT_ALLOWED");
      await expect(voteService.castFairPlay(id, member, carol, { value: "up" })).rejects.toThrow("VOTE_NOT_ALLOWED");
    });

    it("never shows a player the votes cast on them", async () => {
      const id = await match2v2();
      await voteService.castFairPlay(id, alice, carol, { value: "down" });
      const seenByCarol = await voteService.getMatchVotes(id, carol);
      expect(seenByCarol.fairPlay?.myVotes).toEqual([]);
    });

    it("gives every opponent a 👍 with the team shortcut", async () => {
      const id = await match2v2();
      const votes = await voteService.castFairPlayTeamUp(id, alice);
      expect(votes.fairPlay?.myVotes.map((v) => v.value)).toEqual(["up", "up"]);
    });

    it("refuses votes once the 48h window closed", async () => {
      const id = await match2v2(49);
      await expect(voteService.castFairPlay(id, alice, carol, { value: "up" })).rejects.toThrow("VOTING_CLOSED");
    });

    it("refuses votes when fair-play is off", async () => {
      await setConfig({ fairPlayEnabled: false });
      const id = await match2v2();
      await expect(voteService.castFairPlay(id, alice, carol, { value: "up" })).rejects.toThrow("VOTING_DISABLED");
    });

    it("alerts the admins once a player reaches the 👎 threshold", async () => {
      await setConfig({ fairPlayAlertThreshold: 2 });
      const send = spyOn(notificationService, "send").mockResolvedValue(undefined as never);
      await voteService.castFairPlay(await match2v2(), alice, carol, { value: "down" });
      expect(send).not.toHaveBeenCalled();
      await voteService.castFairPlay(await match2v2(), bob, carol, { value: "down" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toMatchObject({ userId: admin, type: "FAIR_PLAY_ALERT" });
      send.mockRestore();
    });
  });

  describe("MVP", () => {
    it("designates the MVP from player votes", async () => {
      const id = await match2v2();
      await voteService.castMvp(id, alice, bob);
      const votes = await voteService.castMvp(id, carol, bob);
      expect(votes.mvp?.mvpPlayerIds).toEqual([bob]);
      expect(votes.mvp?.myVote).toBe(bob);
    });

    it("sends the members the new MVP, never the votes behind it", async () => {
      const send = spyOn(webSocketService, "send").mockReturnValue(true);
      const id = await match2v2();
      await voteService.castMvp(id, alice, bob);
      await voteService.castMvp(id, carol, bob);
      await Bun.sleep(20);
      const calls = send.mock.calls.filter(([, msg]) => (msg as { event: string }).event === "match_votes_updated");
      expect(calls.map(([userId]) => userId)).toContain(member);
      // First vote: below the threshold, no MVP yet. Second: Bob. No voter ever listed.
      expect(calls[0]?.[1]).toEqual({ event: "match_votes_updated", data: { matchId: id, mvpPlayerIds: [] } });
      expect(calls.at(-1)?.[1]).toEqual({ event: "match_votes_updated", data: { matchId: id, mvpPlayerIds: [bob] } });
      send.mockRestore();
    });

    it("refuses a vote for yourself and in a 1v1", async () => {
      const id = await match2v2();
      await expect(voteService.castMvp(id, alice, alice)).rejects.toThrow("VOTE_NOT_ALLOWED");
      const [m] = await testDb
        .insert(matches)
        .values({ tournamentId, status: "reported", createdBy: alice })
        .returning();
      await testDb.insert(matchSides).values([
        { matchId: m.id, entryId: await entry([alice]), position: 1 },
        { matchId: m.id, entryId: await entry([carol]), position: 2 },
      ]);
      await expect(voteService.castMvp(m.id, alice, carol)).rejects.toThrow("VOTING_DISABLED");
    });

    it("lets a member vote once declared spectator, and withdraws the vote with the declaration", async () => {
      const id = await match2v2();
      await expect(voteService.castMvp(id, member, bob)).rejects.toThrow("VOTE_NOT_ALLOWED");
      await expect(voteService.declareSpectator(id, outsider)).rejects.toThrow("VOTE_NOT_ALLOWED");
      await voteService.declareSpectator(id, member);
      const votes = await voteService.castMvp(id, member, bob);
      expect(votes.role).toBe("spectator");
      expect(votes.mvp?.spectatorCount).toBe(1);
      await voteService.withdrawSpectator(id, member);
      expect(await testDb.select().from(mvpVotes).where(eq(mvpVotes.voterId, member))).toEqual([]);
    });

    it("opens the vote window when the result is entered, not when a scheduled match was created", async () => {
      const id = await match2v2(72);
      // Created 72h ago (drawn ahead), result entered just now.
      await testDb.insert(matchResults).values({ matchId: id, reportedBy: alice, reportedAt: new Date() });
      const votes = await voteService.castMvp(id, alice, bob);
      expect(votes.isOpen).toBe(true);
      expect(votes.mvp?.myVote).toBe(bob);
    });

    it("never lets a player drop their own ballot through the spectator withdrawal", async () => {
      const id = await match2v2();
      await voteService.castMvp(id, alice, bob);
      await expect(voteService.withdrawSpectator(id, alice)).rejects.toThrow("VOTE_NOT_ALLOWED");
      expect(await testDb.select().from(mvpVotes).where(eq(mvpVotes.voterId, alice))).toHaveLength(1);
    });

    it("blocks a second vote for the same player within the week", async () => {
      await setConfig({ mvpSameTargetLimit: "weekly" });
      await voteService.castMvp(await match2v2(), alice, bob);
      const id = await match2v2();
      expect((await voteService.getMatchVotes(id, alice)).mvp?.blockedTargetIds).toEqual([bob]);
      await expect(voteService.castMvp(id, alice, bob)).rejects.toThrow("MVP_SAME_TARGET_LIMIT");
    });

    it("flags the MVP on list views straight from the votes", async () => {
      const id = await match2v2();
      expect((await voteService.mvpOfMatches([{ id, tournamentId }])).has(id)).toBe(false);
      await voteService.castMvp(id, alice, bob);
      await voteService.castMvp(id, dave, bob);
      expect((await voteService.mvpOfMatches([{ id, tournamentId }])).get(id)).toEqual([bob]);
    });

    it("drops every vote of a cancelled match", async () => {
      const id = await match2v2();
      await voteService.castMvp(id, alice, bob);
      await voteService.castFairPlay(id, alice, carol, { value: "up" });
      await voteService.onMatchCancelled(id);
      expect(await testDb.select().from(mvpVotes).where(eq(mvpVotes.matchId, id))).toEqual([]);
      expect(await testDb.select().from(fairPlayVotes).where(eq(fairPlayVotes.matchId, id))).toEqual([]);
    });
  });

  describe("stats", () => {
    async function finalize(id: string) {
      await testDb.update(matches).set({ status: "finalized" }).where(eq(matches.id, id));
    }

    it("counts finalized matches only and keeps 👎 out of the public figures", async () => {
      await setConfig({ fairPlayMinVotes: 1 });
      const pending = await match2v2();
      await voteService.castFairPlay(pending, alice, carol, { value: "down" });
      const done = await match2v2();
      await voteService.castFairPlay(done, alice, carol, { value: "up" });
      await voteService.castFairPlay(done, bob, carol, { value: "down", tags: ["bad_faith"] });
      await voteService.castFairPlay(done, alice, dave, { value: "up" });
      await finalize(done);

      const pub = await voteStatsService.getPublicStats(tournamentId);
      expect(pub.totals.votes).toBe(3);
      expect(pub.fairPlayRanking[0]?.player.id).toBe(dave);
      expect(JSON.stringify(pub)).not.toContain("bad_faith");

      const mine = await voteStatsService.getMyStats(tournamentId, carol);
      expect(mine.fairPlay).toMatchObject({ up: 1, down: 1, tags: [{ tag: "bad_faith", count: 1 }] });
    });

    it("tells the tournament's viewers once per burst, on validated matches only", async () => {
      const spy = spyOn(webSocketService, "broadcastToTournament");
      const event = JSON.stringify({ event: "vote_stats_updated", data: { tournamentId } });
      const sent = () => spy.mock.calls.filter(([, data]) => JSON.stringify(data) === event).length;
      const pending = await match2v2();
      await voteService.castFairPlay(pending, alice, carol, { value: "up" });
      await Bun.sleep(VOTE_STATS_NOTIFY_DELAY_MS + 100);
      expect(sent()).toBe(0);
      const done = await match2v2();
      await finalize(done);
      await voteService.castFairPlay(done, alice, carol, { value: "up" });
      await voteService.castFairPlay(done, bob, dave, { value: "up" });
      await Bun.sleep(VOTE_STATS_NOTIFY_DELAY_MS + 100);
      expect(sent()).toBe(1);
      spy.mockRestore();
    });

    it("names every player tied for fair-play of the week", async () => {
      await setConfig({ fairPlayMinVotes: 1 });
      const id = await match2v2();
      await voteService.castFairPlay(id, alice, carol, { value: "up" });
      await voteService.castFairPlay(id, alice, dave, { value: "up" });
      await voteService.castFairPlay(id, bob, carol, { value: "up" });
      await voteService.castFairPlay(id, bob, dave, { value: "up" });
      await finalize(id);
      const pub = await voteStatsService.getPublicStats(tournamentId);
      const tied = pub.fairPlayOfTheWeek?.players.map((p) => p.id);
      expect(tied).toContain(carol);
      expect(tied).toContain(dave);
    });

    it("ranks fair-play on the last 30 days only", async () => {
      await setConfig({ fairPlayMinVotes: 1 });
      const id = await match2v2();
      await voteService.castFairPlay(id, alice, carol, { value: "up" });
      await finalize(id);
      const before = await voteStatsService.getPublicStats(tournamentId);
      expect(before.fairPlayRanking.map((r) => r.player.id)).toContain(carol);
      await testDb
        .update(fairPlayVotes)
        .set({ createdAt: new Date(Date.now() - 31 * 24 * HOUR) })
        .where(eq(fairPlayVotes.matchId, id));
      const pub = await voteStatsService.getPublicStats(tournamentId);
      expect(pub.fairPlayRanking.map((r) => r.player.id)).not.toContain(carol);
    });

    it("counts MVP titles as soon as the match is validated, and team matches", async () => {
      const id = await match2v2();
      await voteService.castMvp(id, alice, bob);
      await voteService.castMvp(id, carol, bob);
      expect(await voteStatsService.mvpTitles(tournamentId)).toEqual([]);
      await finalize(id);
      expect(await voteStatsService.mvpTitles(tournamentId)).toEqual([{ playerId: bob, titles: 1 }]);
      const mine = await voteStatsService.getMyStats(tournamentId, bob);
      expect(mine.mvp.titles).toBeGreaterThanOrEqual(1);
      expect(mine.mvp.teamMatches).toBeGreaterThanOrEqual(1);
      const pub = await voteStatsService.getPublicStats(tournamentId);
      expect(pub.mvpRanking[0]?.player.id).toBe(bob);
      expect(pub.mvpOfTheWeek?.titles).toBe(1);
      expect(pub.mvpOfTheWeek?.players.map((p) => p.id)).toContain(bob);
    });

    it("ranks MVP titles on the last 30 days only", async () => {
      const id = await match2v2();
      await voteService.castMvp(id, alice, dave);
      await voteService.castMvp(id, carol, dave);
      await finalize(id);
      await testDb
        .update(matches)
        .set({ createdAt: new Date(Date.now() - 31 * 24 * HOUR) })
        .where(eq(matches.id, id));
      const pub = await voteStatsService.getPublicStats(tournamentId);
      expect(pub.mvpRanking.map((r) => r.player.id)).not.toContain(dave);
      expect(await voteStatsService.mvpTitles(tournamentId)).toContainEqual({ playerId: dave, titles: 1 });
    });

    it("lets only organizers reveal 👎 voters, and logs every reveal", async () => {
      const id = await match2v2();
      await voteService.castFairPlay(id, bob, carol, { value: "down" });
      await expect(voteStatsService.revealVoters(tournamentId, alice, carol)).rejects.toThrow(
        "INSUFFICIENT_PERMISSIONS",
      );
      const voters = await voteStatsService.revealVoters(tournamentId, admin, carol);
      expect(voters.map((v) => v.voter.id)).toContain(bob);
      const view = await voteStatsService.getAdminStats(tournamentId, admin);
      expect(view.revealLog[0]).toMatchObject({ admin: { id: admin }, target: { id: carol } });
      expect(view.received.find((r) => r.player.id === carol)?.down).toBeGreaterThan(0);
    });
  });

  describe("vote prompts", () => {
    async function promptState(userId: string) {
      const [state] = await testDb
        .select()
        .from(playerVotePromptStates)
        .where(eq(playerVotePromptStates.userId, userId));
      return state;
    }

    it("never counts an explicit skip, nor the 'shown' record, toward the snooze", async () => {
      for (let i = 0; i < 3; i++) {
        const id = await match2v2();
        await voteService.recordPrompt(id, carol, "expired"); // shown
        await voteService.recordPrompt(id, carol, "skipped");
      }
      expect((await promptState(carol))?.snoozedUntil ?? null).toBeNull();
      expect((await promptState(carol))?.consecutiveIgnored ?? 0).toBe(0);
    });

    it("keeps a prompt answered by a vote as voted, whatever the card sends next", async () => {
      const id = await match2v2();
      await voteService.recordPrompt(id, carol, "expired"); // shown
      await voteService.castMvp(id, carol, bob);
      await voteService.recordPrompt(id, carol, "dismissed");
      const [row] = await testDb.select().from(votePrompts).where(eq(votePrompts.matchId, id));
      expect(row?.outcome).toBe("voted");
      expect((await promptState(carol))?.consecutiveIgnored ?? 0).toBe(0);
    });

    it("offers the author a prompt for a fresh match, once", async () => {
      const id = await match2v2();
      const prompt = await voteService.getPromptForMatch(id, alice);
      expect(prompt?.mvpCandidateIds.sort()).toEqual([bob, carol, dave].sort());
      expect(prompt?.fairPlayTargetIds.sort()).toEqual([carol, dave].sort());
      await voteService.recordPrompt(id, alice, "skipped");
      expect(await voteService.getPromptForMatch(id, alice)).toBeNull();
    });

    it("offers nothing for a match older than the max age", async () => {
      expect(await voteService.getPromptForMatch(await match2v2(2), alice)).toBeNull();
    });

    it("offers the other players their latest match on app open, not the author", async () => {
      const id = await match2v2(0, [carol, outsider]);
      expect((await voteService.getPendingPrompt(outsider))?.matchId).toBe(id);
      expect(await voteService.getPendingPrompt(alice)).toBeNull();
    });

    it("snoozes prompts for a week after three ignored in a row", async () => {
      for (let i = 0; i < 3; i++) {
        const id = await match2v2();
        await voteService.recordPrompt(id, carol, "expired"); // shown
        await voteService.recordPrompt(id, carol, "dismissed");
      }
      const [state] = await testDb
        .select()
        .from(playerVotePromptStates)
        .where(eq(playerVotePromptStates.userId, carol));
      expect(state?.snoozedUntil?.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * HOUR);
      expect(await voteService.getPromptForMatch(await match2v2(), carol)).toBeNull();
    });
  });
});
