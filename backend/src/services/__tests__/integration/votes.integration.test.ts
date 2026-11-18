import { describe, it, expect, beforeAll, beforeEach, afterAll, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { voteService } from "../../vote.service";
import { notificationService } from "../../notification.service";
import {
  appUsers,
  fairPlayVotes,
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
    it("designates a provisional MVP from player votes", async () => {
      const id = await match2v2();
      await voteService.castMvp(id, alice, bob);
      const votes = await voteService.castMvp(id, carol, bob);
      expect(votes.mvp?.mvpPlayerIds).toEqual([bob]);
      expect(votes.mvp?.isFinal).toBe(false);
      expect(votes.mvp?.myVote).toBe(bob);
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

    it("blocks a second vote for the same player within the week", async () => {
      await setConfig({ mvpSameTargetLimit: "weekly" });
      await voteService.castMvp(await match2v2(), alice, bob);
      const id = await match2v2();
      expect((await voteService.getMatchVotes(id, alice)).mvp?.blockedTargetIds).toEqual([bob]);
      await expect(voteService.castMvp(id, alice, bob)).rejects.toThrow("MVP_SAME_TARGET_LIMIT");
    });

    it("freezes the MVP once the window closed", async () => {
      const id = await match2v2(1);
      await voteService.castMvp(id, alice, bob);
      await voteService.castMvp(id, dave, bob);
      await voteService.freezeClosedMatches(new Date(Date.now() + 48 * HOUR));
      const [row] = await testDb.select({ mvp: matches.mvpPlayerIds }).from(matches).where(eq(matches.id, id));
      expect(row?.mvp).toEqual([bob]);
      expect((await voteService.getMatchVotes(id, alice)).mvp?.isFinal).toBe(true);
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

  describe("vote prompts", () => {
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
      for (let i = 0; i < 3; i++) await voteService.recordPrompt(await match2v2(), carol, "dismissed");
      const [state] = await testDb
        .select()
        .from(playerVotePromptStates)
        .where(eq(playerVotePromptStates.userId, carol));
      expect(state?.snoozedUntil?.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * HOUR);
      expect(await voteService.getPromptForMatch(await match2v2(), carol)).toBeNull();
    });
  });
});
