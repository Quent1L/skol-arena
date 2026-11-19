import { and, desc, eq, gte, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../config/database";
import {
  appUsers,
  fairPlayRevealLogs,
  fairPlayVotes,
  matchSides,
  matchSpectators,
  matches,
  mvpVotes,
  tournamentEntryPlayers,
} from "../db/schema";
import type { FairPlayTag, VoteStatPlayer } from "@skol-arena/shared/types/index";

const upCount = sql<number>`count(*) filter (where ${fairPlayVotes.value} = 'up')::int`;
const downCount = sql<number>`count(*) filter (where ${fairPlayVotes.value} = 'down')::int`;

/** Stats only count settled results: a disputed match's votes wait for its validation. */
const counted = (tournamentId: string): SQL =>
  and(eq(matches.tournamentId, tournamentId), eq(matches.status, "finalized")) as SQL;

/** Admin views also see votes on matches still being validated, never cancelled ones. */
const live = (tournamentId: string): SQL =>
  and(eq(matches.tournamentId, tournamentId), ne(matches.status, "cancelled")) as SQL;

export class VoteStatsRepository {
  /** 👍 / 👎 received per player. */
  async fairPlayReceived(tournamentId: string, since?: Date) {
    return await db
      .select({ playerId: fairPlayVotes.targetId, up: upCount, down: downCount })
      .from(fairPlayVotes)
      .innerJoin(matches, eq(matches.id, fairPlayVotes.matchId))
      .where(and(counted(tournamentId), since ? gte(fairPlayVotes.createdAt, since) : undefined))
      .groupBy(fairPlayVotes.targetId);
  }

  /** 👍 / 👎 cast per voter; `liveOnly` widens it to matches still being validated. */
  async fairPlayCast(tournamentId: string, liveOnly = false) {
    return await db
      .select({ playerId: fairPlayVotes.voterId, up: upCount, down: downCount })
      .from(fairPlayVotes)
      .innerJoin(matches, eq(matches.id, fairPlayVotes.matchId))
      .where(liveOnly ? live(tournamentId) : counted(tournamentId))
      .groupBy(fairPlayVotes.voterId);
  }

  /** Tag counts on the 👎 each player received. */
  async downTagsReceived(tournamentId: string, targetId?: string, liveOnly = false) {
    const tag = sql<FairPlayTag>`unnest(${fairPlayVotes.tags})`;
    return await db
      .select({ playerId: fairPlayVotes.targetId, tag, count: sql<number>`count(*)::int` })
      .from(fairPlayVotes)
      .innerJoin(matches, eq(matches.id, fairPlayVotes.matchId))
      .where(
        and(
          liveOnly ? live(tournamentId) : counted(tournamentId),
          eq(fairPlayVotes.value, "down"),
          targetId ? eq(fairPlayVotes.targetId, targetId) : undefined,
        ),
      )
      .groupBy(fairPlayVotes.targetId, tag);
  }

  /** 👎 received per player on live matches, optionally since a date. */
  async downsReceived(tournamentId: string, since?: Date) {
    return await db
      .select({ playerId: fairPlayVotes.targetId, down: sql<number>`count(*)::int` })
      .from(fairPlayVotes)
      .innerJoin(matches, eq(matches.id, fairPlayVotes.matchId))
      .where(
        and(
          live(tournamentId),
          eq(fairPlayVotes.value, "down"),
          since ? gte(fairPlayVotes.createdAt, since) : undefined,
        ),
      )
      .groupBy(fairPlayVotes.targetId);
  }

  /** MVP ballots of the counted matches, optionally only those entered since a date. */
  async mvpBallots(tournamentId: string, since?: Date) {
    return await db
      .select({ matchId: mvpVotes.matchId, targetId: mvpVotes.targetId, voterRole: mvpVotes.voterRole })
      .from(mvpVotes)
      .innerJoin(matches, eq(matches.id, mvpVotes.matchId))
      .where(and(counted(tournamentId), since ? gte(matches.createdAt, since) : undefined));
  }

  async mvpVotesCast(tournamentId: string, voterId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mvpVotes)
      .innerJoin(matches, eq(matches.id, mvpVotes.matchId))
      .where(and(counted(tournamentId), eq(mvpVotes.voterId, voterId)));
    return row?.n ?? 0;
  }

  /** Finalized matches the player played where one side had two players or more. */
  async teamMatchesPlayed(tournamentId: string, playerId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT count(DISTINCT m.id)::int AS n
      FROM ${matches} m
      JOIN ${matchSides} s ON s.match_id = m.id
      JOIN ${tournamentEntryPlayers} p ON p.entry_id = s.entry_id AND p.player_id = ${playerId}
      WHERE m.tournament_id = ${tournamentId} AND m.status = 'finalized'
        AND EXISTS (
          SELECT 1 FROM ${matchSides} s2
          JOIN ${tournamentEntryPlayers} p2 ON p2.entry_id = s2.entry_id
          WHERE s2.match_id = m.id GROUP BY s2.id HAVING count(*) >= 2
        )
    `);
    return Number((result.rows[0] as { n: number } | undefined)?.n ?? 0);
  }

  async spectatedCount(tournamentId: string, userId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(matchSpectators)
      .innerJoin(matches, eq(matches.id, matchSpectators.matchId))
      .where(and(counted(tournamentId), eq(matchSpectators.userId, userId)));
    return row?.n ?? 0;
  }

  /** MVP votes cast per voter. */
  async mvpVotesCastPerVoter(tournamentId: string) {
    return await db
      .select({ playerId: mvpVotes.voterId, n: sql<number>`count(*)::int` })
      .from(mvpVotes)
      .innerJoin(matches, eq(matches.id, mvpVotes.matchId))
      .where(counted(tournamentId))
      .groupBy(mvpVotes.voterId);
  }

  /** Matches watched per declared spectator. */
  async spectatedPerUser(tournamentId: string) {
    return await db
      .select({ playerId: matchSpectators.userId, n: sql<number>`count(*)::int` })
      .from(matchSpectators)
      .innerJoin(matches, eq(matches.id, matchSpectators.matchId))
      .where(counted(tournamentId))
      .groupBy(matchSpectators.userId);
  }

  async players(ids: string[]): Promise<Map<string, VoteStatPlayer>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select({ id: appUsers.id, displayName: appUsers.displayName, shortName: appUsers.shortName })
      .from(appUsers)
      .where(inArray(appUsers.id, ids));
    return new Map(rows.map((r) => [r.id, r]));
  }

  // ── Admin reveal ──────────────────────────────────────────────────────

  async downVotersOf(tournamentId: string, targetId: string) {
    return await db
      .select({
        voterId: fairPlayVotes.voterId,
        matchId: fairPlayVotes.matchId,
        tags: fairPlayVotes.tags,
        createdAt: fairPlayVotes.createdAt,
      })
      .from(fairPlayVotes)
      .innerJoin(matches, eq(matches.id, fairPlayVotes.matchId))
      .where(and(live(tournamentId), eq(fairPlayVotes.targetId, targetId), eq(fairPlayVotes.value, "down")))
      .orderBy(desc(fairPlayVotes.createdAt));
  }

  async logReveal(tournamentId: string, adminId: string, targetId: string): Promise<void> {
    await db.insert(fairPlayRevealLogs).values({ tournamentId, adminId, targetId });
  }

  async revealLog(tournamentId: string, limit = 100) {
    return await db
      .select({
        adminId: fairPlayRevealLogs.adminId,
        targetId: fairPlayRevealLogs.targetId,
        createdAt: fairPlayRevealLogs.createdAt,
      })
      .from(fairPlayRevealLogs)
      .where(eq(fairPlayRevealLogs.tournamentId, tournamentId))
      .orderBy(desc(fairPlayRevealLogs.createdAt))
      .limit(limit);
  }
}

export const voteStatsRepository = new VoteStatsRepository();
