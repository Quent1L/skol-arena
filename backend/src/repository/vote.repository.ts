import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from "../config/database";
import {
  appUsers,
  fairPlayVotes,
  matchResults,
  matchSides,
  matchSpectators,
  matches,
  mvpVotes,
  playerVotePromptStates,
  tournamentEntryPlayers,
  votePrompts,
} from "../db/schema";
import type { FairPlayTag, FairPlayVoteValue, MvpBallot, VotePromptOutcome } from "@skol-arena/shared/types/index";

export interface VoteMatchPlayer {
  id: string;
  position: number;
  displayName: string;
  shortName: string;
}

export interface VoteMatch {
  id: string;
  tournamentId: string;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  /** When the result was entered: a match scheduled ahead is created long before. */
  enteredAt: Date;
  playedAt: Date;
  winnerSide: string | null;
  players: VoteMatchPlayer[];
}

export class VoteRepository {
  async getMatch(matchId: string): Promise<VoteMatch | null> {
    const [match] = await db
      .select({
        id: matches.id,
        tournamentId: matches.tournamentId,
        status: matches.status,
        createdBy: matches.createdBy,
        createdAt: matches.createdAt,
        reportedAt: matchResults.reportedAt,
        playedAt: matches.playedAt,
        winnerSide: matches.winnerSide,
      })
      .from(matches)
      .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
      .where(eq(matches.id, matchId));
    if (!match) return null;
    const { reportedAt, ...rest } = match;
    return { ...rest, enteredAt: reportedAt ?? match.createdAt, players: await this.getMatchPlayers(matchId) };
  }

  async getMatchPlayers(matchId: string): Promise<VoteMatchPlayer[]> {
    return await db
      .select({
        id: appUsers.id,
        position: matchSides.position,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
      })
      .from(matchSides)
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntryPlayers.entryId, matchSides.entryId))
      .innerJoin(appUsers, eq(appUsers.id, tournamentEntryPlayers.playerId))
      .where(eq(matchSides.matchId, matchId))
      .orderBy(matchSides.position, appUsers.displayName);
  }

  // ── Fair-play ─────────────────────────────────────────────────────────

  async listFairPlayVotesBy(matchId: string, voterId: string) {
    return await db
      .select({ targetId: fairPlayVotes.targetId, value: fairPlayVotes.value, tags: fairPlayVotes.tags })
      .from(fairPlayVotes)
      .where(and(eq(fairPlayVotes.matchId, matchId), eq(fairPlayVotes.voterId, voterId)));
  }

  async upsertFairPlayVotes(
    matchId: string,
    voterId: string,
    votes: { targetId: string; value: FairPlayVoteValue; tags: FairPlayTag[] | null }[],
  ): Promise<void> {
    if (votes.length === 0) return;
    await db
      .insert(fairPlayVotes)
      .values(votes.map((v) => ({ matchId, voterId, ...v })))
      .onConflictDoUpdate({
        target: [fairPlayVotes.matchId, fairPlayVotes.voterId, fairPlayVotes.targetId],
        set: { value: sql`excluded.value`, tags: sql`excluded.tags`, updatedAt: new Date() },
      });
  }

  async deleteFairPlayVote(matchId: string, voterId: string, targetId: string): Promise<void> {
    await db
      .delete(fairPlayVotes)
      .where(
        and(
          eq(fairPlayVotes.matchId, matchId),
          eq(fairPlayVotes.voterId, voterId),
          eq(fairPlayVotes.targetId, targetId),
        ),
      );
  }

  /** 👎 a player received in a tournament since a date, on matches not cancelled. */
  async countDownsReceived(tournamentId: string, targetId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(fairPlayVotes)
      .innerJoin(matches, eq(matches.id, fairPlayVotes.matchId))
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          ne(matches.status, "cancelled"),
          eq(fairPlayVotes.targetId, targetId),
          eq(fairPlayVotes.value, "down"),
          gte(fairPlayVotes.updatedAt, since),
        ),
      );
    return row?.n ?? 0;
  }

  // ── Spectators ────────────────────────────────────────────────────────

  async isSpectator(matchId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ userId: matchSpectators.userId })
      .from(matchSpectators)
      .where(and(eq(matchSpectators.matchId, matchId), eq(matchSpectators.userId, userId)));
    return !!row;
  }

  async countSpectators(matchId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(matchSpectators)
      .where(eq(matchSpectators.matchId, matchId));
    return row?.n ?? 0;
  }

  async addSpectator(matchId: string, userId: string): Promise<void> {
    await db.insert(matchSpectators).values({ matchId, userId }).onConflictDoNothing();
  }

  /** Withdrawing the declaration takes the MVP vote it allowed with it. */
  async removeSpectator(matchId: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(mvpVotes)
        .where(and(eq(mvpVotes.matchId, matchId), eq(mvpVotes.voterId, userId), eq(mvpVotes.voterRole, "spectator")));
      await tx
        .delete(matchSpectators)
        .where(and(eq(matchSpectators.matchId, matchId), eq(matchSpectators.userId, userId)));
    });
  }

  // ── MVP ───────────────────────────────────────────────────────────────

  async getMvpVoteBy(matchId: string, voterId: string): Promise<string | null> {
    const [row] = await db
      .select({ targetId: mvpVotes.targetId })
      .from(mvpVotes)
      .where(and(eq(mvpVotes.matchId, matchId), eq(mvpVotes.voterId, voterId)));
    return row?.targetId ?? null;
  }

  async upsertMvpVote(
    matchId: string,
    voterId: string,
    targetId: string,
    voterRole: MvpBallot["voterRole"],
  ): Promise<void> {
    await db
      .insert(mvpVotes)
      .values({ matchId, voterId, targetId, voterRole })
      .onConflictDoUpdate({
        target: [mvpVotes.matchId, mvpVotes.voterId],
        set: { targetId, voterRole, updatedAt: new Date() },
      });
  }

  async deleteMvpVote(matchId: string, voterId: string): Promise<void> {
    await db.delete(mvpVotes).where(and(eq(mvpVotes.matchId, matchId), eq(mvpVotes.voterId, voterId)));
  }

  async listMvpBallots(matchId: string): Promise<MvpBallot[]> {
    return await db
      .select({ targetId: mvpVotes.targetId, voterRole: mvpVotes.voterRole })
      .from(mvpVotes)
      .where(eq(mvpVotes.matchId, matchId));
  }

  /** Players this voter picked as MVP elsewhere in the tournament since a date. */
  async recentMvpTargets(
    tournamentId: string,
    voterId: string,
    excludeMatchId: string,
    since: Date,
  ): Promise<string[]> {
    const rows = await db
      .selectDistinct({ targetId: mvpVotes.targetId })
      .from(mvpVotes)
      .innerJoin(matches, eq(matches.id, mvpVotes.matchId))
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(mvpVotes.voterId, voterId),
          ne(mvpVotes.matchId, excludeMatchId),
          gte(mvpVotes.updatedAt, since),
        ),
      );
    return rows.map((r) => r.targetId);
  }

  /** MVP ballots of several matches at once, for list views. */
  async listMvpBallotsFor(matchIds: string[]) {
    if (matchIds.length === 0) return [];
    return await db
      .select({ matchId: mvpVotes.matchId, targetId: mvpVotes.targetId, voterRole: mvpVotes.voterRole })
      .from(mvpVotes)
      .where(inArray(mvpVotes.matchId, matchIds));
  }

  /** A cancelled match takes every vote cast on it along. */
  async deleteAllForMatch(matchId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(fairPlayVotes).where(eq(fairPlayVotes.matchId, matchId));
      await tx.delete(mvpVotes).where(eq(mvpVotes.matchId, matchId));
      await tx.delete(matchSpectators).where(eq(matchSpectators.matchId, matchId));
    });
  }

  async hasVoted(matchId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .execute<{ voted: boolean }>(
        sql`
      SELECT EXISTS (
        SELECT 1 FROM ${fairPlayVotes} WHERE ${fairPlayVotes.matchId} = ${matchId} AND ${fairPlayVotes.voterId} = ${userId}
        UNION ALL
        SELECT 1 FROM ${mvpVotes} WHERE ${mvpVotes.matchId} = ${matchId} AND ${mvpVotes.voterId} = ${userId}
      ) AS voted
    `,
      )
      .then((r) => r.rows);
    return !!row?.voted;
  }

  // ── Prompts ───────────────────────────────────────────────────────────

  /** The user's most recent match as a player, whatever its state. */
  async getLatestMatchIdOf(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(matchSides, eq(matchSides.matchId, matches.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntryPlayers.entryId, matchSides.entryId))
      // A cancelled match was never played: it must not hide the real latest one.
      .where(and(eq(tournamentEntryPlayers.playerId, userId), notInArray(matches.status, ["scheduled", "cancelled"])))
      .orderBy(desc(matches.playedAt), desc(matches.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  async hasPrompt(matchId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ matchId: votePrompts.matchId })
      .from(votePrompts)
      .where(and(eq(votePrompts.matchId, matchId), eq(votePrompts.userId, userId)));
    return !!row;
  }

  /** Records the first outcome only: a prompt is shown once per match. */
  async recordPrompt(matchId: string, userId: string, outcome: VotePromptOutcome): Promise<boolean> {
    const inserted = await db
      .insert(votePrompts)
      .values({ matchId, userId, outcome })
      .onConflictDoNothing()
      .returning({ matchId: votePrompts.matchId });
    return inserted.length > 0;
  }

  /** Sets how a prompt ended, unless a vote already settled it. Whether it changed. */
  async settlePrompt(matchId: string, userId: string, outcome: VotePromptOutcome): Promise<boolean> {
    const updated = await db
      .update(votePrompts)
      .set({ outcome })
      .where(and(eq(votePrompts.matchId, matchId), eq(votePrompts.userId, userId), ne(votePrompts.outcome, "voted")))
      .returning({ matchId: votePrompts.matchId });
    return updated.length > 0;
  }

  async markPromptVoted(matchId: string, userId: string): Promise<void> {
    await db
      .update(votePrompts)
      .set({ outcome: "voted" })
      .where(and(eq(votePrompts.matchId, matchId), eq(votePrompts.userId, userId)));
  }

  async getPromptState(userId: string) {
    const [row] = await db.select().from(playerVotePromptStates).where(eq(playerVotePromptStates.userId, userId));
    return row ?? null;
  }

  async savePromptState(userId: string, consecutiveIgnored: number, snoozedUntil: Date | null) {
    await db.insert(playerVotePromptStates).values({ userId, consecutiveIgnored, snoozedUntil }).onConflictDoUpdate({
      target: playerVotePromptStates.userId,
      set: { consecutiveIgnored, snoozedUntil },
    });
  }
}

export const voteRepository = new VoteRepository();
