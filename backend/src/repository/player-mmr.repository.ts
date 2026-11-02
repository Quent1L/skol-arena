import { eq, and, or, desc, asc, sql, inArray, lt, gte, gt } from "drizzle-orm";
import { db } from "../config/database";
import { playerMmr, mmrHistory, matches, matchSides, appUsers } from "../db/schema";
import { STRONGER_OPPONENT_MMR_GAP } from "@skol-arena/shared";
import type { MmrHistoryOutcome, OpponentQualityStats, WeeklyMmrLeader } from "@skol-arena/shared";

export interface UpsertPlayerMmrData {
  seasonId: string;
  playerId: string;
  currentMmr: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws?: number;
  winStreak: number;
  maxWinStreak: number;
  lossStreak: number;
  maxLossStreak: number;
}

export interface CreateMmrHistoryData {
  seasonId: string;
  playerId: string;
  matchId: string;
  mmrBefore: number;
  mmrAfter: number;
  mmrDelta: number;
  kEffective: number;
  opponentAvgMmr: number;
  isPlacement: boolean;
  outcome?: MmrHistoryOutcome | null;
  // Player state AFTER this match (for historical badge replay)
  winStreakAfter: number;
  lossStreakAfter: number;
  matchesPlayedAfter: number;
}

export interface SeasonMmrStatsRow {
  playerId: string;
  peakMmr: number;
  avgMmr: number;
  matchesPlayed: number;
}

type SeasonMmrStatsRawRow = {
  player_id: string;
  peak_mmr: number;
  avg_mmr: number;
  matches_played: number;
};

/** The same aggregates as `SeasonMmrStatsRow`, transposed: one player, every season. */
export interface PlayerCareerMmrStatsRow {
  seasonId: string;
  peakMmr: number;
  avgMmr: number;
  entryMmr: number;
  matchesPlayed: number;
}

type PlayerCareerMmrStatsRawRow = {
  season_id: string;
  peak_mmr: number;
  avg_mmr: number;
  entry_mmr: number;
  matches_played: number;
};

export class PlayerMmrRepository {
  async getBySeasonAndPlayer(seasonId: string, playerId: string) {
    return await db.query.playerMmr.findFirst({
      where: and(
        eq(playerMmr.seasonId, seasonId),
        eq(playerMmr.playerId, playerId),
      ),
    });
  }

  async getBySeasonOrdered(seasonId: string) {
    return db.transaction(async (tx) => {
      const players = await tx.query.playerMmr.findMany({
        where: eq(playerMmr.seasonId, seasonId),
        with: { player: true },
        // Player id as a tie-break: equal MMR is common at the start of a season
        // and an unordered tie makes the final ranking — and the rewind awards
        // derived from it — differ between two reads of the same data.
        orderBy: (p, { asc, desc }) => [desc(p.currentMmr), asc(p.playerId)],
      });

      if (players.length === 0) return players;

      const recentRows = await tx.execute(sql`
        SELECT player_id, outcome, mmr_delta
        FROM (
          SELECT mh.player_id, mh.outcome, mh.mmr_delta,
            ROW_NUMBER() OVER (PARTITION BY mh.player_id ORDER BY m.played_at DESC) AS rn
          FROM mmr_history mh
          INNER JOIN matches m ON m.id = mh.match_id
          WHERE mh.season_id = ${seasonId}
        ) sub
        WHERE rn <= 5
      `);

      const resultsByPlayer = new Map<string, { outcome: 'win' | 'loss' | 'draw' }[]>();
      for (const row of recentRows.rows as { player_id: string; outcome: string | null; mmr_delta: number }[]) {
        const list = resultsByPlayer.get(row.player_id) ?? [];
        let outcome: 'win' | 'loss' | 'draw';
        if (row.outcome === 'win' || row.outcome === 'loss' || row.outcome === 'draw') {
          outcome = row.outcome;
        } else {
          // Legacy rows without a stored outcome: fall back to delta sign
          const delta = Number(row.mmr_delta);
          outcome = delta > 0 ? 'win' : delta < 0 ? 'loss' : 'draw';
        }
        list.push({ outcome });
        resultsByPlayer.set(row.player_id, list);
      }

      return players.map((p) => ({
        ...p,
        recentResults: (resultsByPlayer.get(p.playerId) ?? []).slice().reverse(),
      }));
    });
  }

  async upsert(data: UpsertPlayerMmrData) {
    const existing = await this.getBySeasonAndPlayer(
      data.seasonId,
      data.playerId,
    );
    if (existing) {
      const [updated] = await db
        .update(playerMmr)
        .set({
          currentMmr: data.currentMmr,
          matchesPlayed: data.matchesPlayed,
          wins: data.wins,
          losses: data.losses,
          draws: data.draws ?? 0,
          winStreak: data.winStreak,
          maxWinStreak: data.maxWinStreak,
          lossStreak: data.lossStreak,
          maxLossStreak: data.maxLossStreak,
        })
        .where(eq(playerMmr.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(playerMmr)
      .values(data)
      .returning();
    return created;
  }

  async getMmrHistory(seasonId: string, playerId: string, limit = 10, offset = 0) {
    return await db
      .select({
        id: mmrHistory.id,
        seasonId: mmrHistory.seasonId,
        playerId: mmrHistory.playerId,
        matchId: mmrHistory.matchId,
        mmrBefore: mmrHistory.mmrBefore,
        mmrAfter: mmrHistory.mmrAfter,
        mmrDelta: mmrHistory.mmrDelta,
        kEffective: mmrHistory.kEffective,
        opponentAvgMmr: mmrHistory.opponentAvgMmr,
        isPlacement: mmrHistory.isPlacement,
        match: {
          id: matches.id,
          playedAt: matches.playedAt,
          status: matches.status,
        },
        teamSizeA: sql<number>`(
          SELECT COUNT(*) FROM tournament_entry_players tep
          JOIN match_sides ms ON ms.entry_id = tep.entry_id
          WHERE ms.match_id = ${matches.id} AND ms.position = 1
        )`.mapWith(Number),
        teamSizeB: sql<number>`(
          SELECT COUNT(*) FROM tournament_entry_players tep
          JOIN match_sides ms ON ms.entry_id = tep.entry_id
          WHERE ms.match_id = ${matches.id} AND ms.position = 2
        )`.mapWith(Number),
      })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          eq(mmrHistory.playerId, playerId),
        ),
      )
      .orderBy(desc(matches.playedAt))
      .limit(limit)
      .offset(offset);
  }

  async getMmrChartSeries(seasonId: string, playerId: string) {
    return await db
      .select({
        mmrBefore: mmrHistory.mmrBefore,
        mmrAfter: mmrHistory.mmrAfter,
        mmrDelta: mmrHistory.mmrDelta,
        outcome: mmrHistory.outcome,
        playedAt: matches.playedAt,
      })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          eq(mmrHistory.playerId, playerId),
        ),
      )
      .orderBy(asc(matches.playedAt));
  }

  async getMmrHistoryOrdered(seasonId: string, playerId: string) {
    return await db
      .select({
        id: mmrHistory.id,
        seasonId: mmrHistory.seasonId,
        playerId: mmrHistory.playerId,
        matchId: mmrHistory.matchId,
        mmrBefore: mmrHistory.mmrBefore,
        mmrAfter: mmrHistory.mmrAfter,
        mmrDelta: mmrHistory.mmrDelta,
        kEffective: mmrHistory.kEffective,
        opponentAvgMmr: mmrHistory.opponentAvgMmr,
        isPlacement: mmrHistory.isPlacement,
        match: {
          id: matches.id,
          playedAt: matches.playedAt,
          status: matches.status,
        },
      })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          eq(mmrHistory.playerId, playerId),
        ),
      )
      .orderBy(asc(matches.playedAt));
  }

  // Multi-player variant of getMmrHistoryOrdered: one query for a whole cascade.
  // Returns playerId -> history rows (ascending by playedAt).
  async getMmrHistoryOrderedForPlayers(
    seasonId: string,
    playerIds: string[],
  ): Promise<Map<string, { matchId: string; mmrBefore: number; mmrAfter: number; mmrDelta: number }[]>> {
    const result = new Map<string, { matchId: string; mmrBefore: number; mmrAfter: number; mmrDelta: number }[]>();
    if (playerIds.length === 0) return result;
    const rows = await db
      .select({
        playerId: mmrHistory.playerId,
        matchId: mmrHistory.matchId,
        mmrBefore: mmrHistory.mmrBefore,
        mmrAfter: mmrHistory.mmrAfter,
        mmrDelta: mmrHistory.mmrDelta,
      })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          inArray(mmrHistory.playerId, playerIds),
        ),
      )
      .orderBy(asc(matches.playedAt));
    for (const r of rows) {
      const list = result.get(r.playerId) ?? [];
      list.push({ matchId: r.matchId, mmrBefore: r.mmrBefore, mmrAfter: r.mmrAfter, mmrDelta: r.mmrDelta });
      result.set(r.playerId, list);
    }
    return result;
  }

  async createMmrHistory(data: CreateMmrHistoryData) {
    const [created] = await db
      .insert(mmrHistory)
      .values(data)
      .returning();
    return created;
  }

  async getMatchPlayersForHistory(matchIds: string[]) {
    if (matchIds.length === 0) return [];
    return await db.query.matchSides.findMany({
      where: inArray(matchSides.matchId, matchIds),
      with: {
        entry: {
          with: {
            players: {
              with: { player: true },
            },
          },
        },
      },
    });
  }

  /** Distinct finalized-match ids of a season that have MMR history, oldest first. */
  async getSeasonMatchIdsOrdered(seasonId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ matchId: mmrHistory.matchId, playedAt: matches.playedAt })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(eq(mmrHistory.seasonId, seasonId))
      .orderBy(asc(matches.playedAt));
    return rows.map((r) => r.matchId);
  }

  /** Matches of several seasons in one chronological order, optionally one player's only. */
  async getSeasonsMatchesOrdered(
    seasonIds: string[],
    playerId?: string,
  ): Promise<{ matchId: string; seasonId: string }[]> {
    if (seasonIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ matchId: mmrHistory.matchId, seasonId: mmrHistory.seasonId, playedAt: matches.playedAt })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          inArray(mmrHistory.seasonId, seasonIds),
          eq(matches.status, "finalized"),
          playerId ? eq(mmrHistory.playerId, playerId) : undefined,
        ),
      )
      .orderBy(asc(matches.playedAt));
    return rows.map(({ matchId, seasonId }) => ({ matchId, seasonId }));
  }

  async getMmrHistoryForPlayerAndMatch(seasonId: string, playerId: string, matchId: string) {
    return await db.query.mmrHistory.findFirst({
      where: and(
        eq(mmrHistory.seasonId, seasonId),
        eq(mmrHistory.playerId, playerId),
        eq(mmrHistory.matchId, matchId),
      ),
    });
  }

  async deleteMmrHistoryForPlayer(seasonId: string, playerId: string, fromPlayedAt?: Date) {
    if (fromPlayedAt) {
      const matchIds = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.tournamentId, seasonId), gte(matches.playedAt, fromPlayedAt)));
      const ids = matchIds.map((r) => r.id);
      if (ids.length === 0) return;
      await db
        .delete(mmrHistory)
        .where(
          and(
            eq(mmrHistory.seasonId, seasonId),
            eq(mmrHistory.playerId, playerId),
            inArray(mmrHistory.matchId, ids),
          ),
        );
    } else {
      await db
        .delete(mmrHistory)
        .where(
          and(
            eq(mmrHistory.seasonId, seasonId),
            eq(mmrHistory.playerId, playerId),
          ),
        );
    }
  }

  async getCheckpointState(
    seasonId: string,
    playerId: string,
    beforePlayedAt: Date,
  ): Promise<{ mmr: number; wins: number; losses: number; draws: number; winStreak: number; maxWinStreak: number; lossStreak: number; maxLossStreak: number } | null> {
    const rows = await db
      .select({ mmrAfter: mmrHistory.mmrAfter, outcome: mmrHistory.outcome })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          eq(mmrHistory.playerId, playerId),
          lt(matches.playedAt, beforePlayedAt),
        ),
      )
      .orderBy(asc(matches.playedAt));

    if (rows.length === 0) return null;

    let wins = 0, losses = 0, draws = 0, winStreak = 0, maxWinStreak = 0, lossStreak = 0, maxLossStreak = 0;
    for (const row of rows) {
      if (row.outcome === 'win') {
        wins++; winStreak++; maxWinStreak = Math.max(maxWinStreak, winStreak); lossStreak = 0;
      } else if (row.outcome === 'loss') {
        losses++; winStreak = 0; lossStreak++; maxLossStreak = Math.max(maxLossStreak, lossStreak);
      } else if (row.outcome === 'draw') {
        draws++;
      }
    }

    return { mmr: rows[rows.length - 1].mmrAfter, wins, losses, draws, winStreak, maxWinStreak, lossStreak, maxLossStreak };
  }

  async preloadOpponentHistories(
    seasonId: string,
    matchIds: string[],
    opponentIds: string[],
  ): Promise<Map<string, number>> {
    if (matchIds.length === 0 || opponentIds.length === 0) return new Map();
    const rows = await db
      .select({ playerId: mmrHistory.playerId, matchId: mmrHistory.matchId, mmrBefore: mmrHistory.mmrBefore })
      .from(mmrHistory)
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          inArray(mmrHistory.matchId, matchIds),
          inArray(mmrHistory.playerId, opponentIds),
        ),
      );
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(`${row.playerId}:${row.matchId}`, row.mmrBefore);
    }
    return map;
  }

  async getPlayerCurrentMmrs(
    seasonId: string,
    playerIds: string[],
  ): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();
    const rows = await db.query.playerMmr.findMany({
      where: and(eq(playerMmr.seasonId, seasonId), inArray(playerMmr.playerId, playerIds)),
    });
    return new Map(rows.map((r) => [r.playerId, r.currentMmr]));
  }

  async deleteBySeasonAndPlayer(seasonId: string, playerId: string): Promise<void> {
    await db
      .delete(playerMmr)
      .where(and(eq(playerMmr.seasonId, seasonId), eq(playerMmr.playerId, playerId)));
  }

  async getAllPlayersBySeasonId(seasonId: string) {
    return await db.query.playerMmr.findMany({
      where: eq(playerMmr.seasonId, seasonId),
    });
  }

  /**
   * Keyset-paginated page of finalized season matches, ordered deterministically
   * (playedAt asc, id asc as tiebreaker for identical timestamps). Used by the
   * full-season deterministic recalc to stream matches without loading the
   * whole season into memory at once.
   */
  async getFinalizedMatchesPageForSeason(
    seasonId: string,
    cursor: { playedAt: Date; id: string } | undefined,
    pageSize: number,
  ) {
    const baseCond = and(eq(matches.tournamentId, seasonId), eq(matches.status, "finalized"));
    const whereCond = cursor
      ? and(
          baseCond,
          or(
            gt(matches.playedAt, cursor.playedAt),
            and(eq(matches.playedAt, cursor.playedAt), gt(matches.id, cursor.id)),
          ),
        )
      : baseCond;

    return await db.query.matches.findMany({
      where: whereCond,
      orderBy: (m, { asc }) => [asc(m.playedAt), asc(m.id)],
      limit: pageSize,
      // outcomeTypeId travels alone: what it was worth comes from the season's
      // ruleset snapshot, so the live outcome_types row is never joined here.
      columns: { id: true, playedAt: true, winnerSide: true, outcomeTypeId: true },
      with: {
        sides: {
          orderBy: (s, { asc }) => [asc(s.position)],
          with: { entry: { with: { players: true } } },
        },
      },
    });
  }

  async deleteAllMmrHistoryForSeason(seasonId: string): Promise<void> {
    await db.delete(mmrHistory).where(eq(mmrHistory.seasonId, seasonId));
  }

  async createMmrHistoryBatch(rows: CreateMmrHistoryData[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(mmrHistory).values(rows);
  }

  // Net MMR variation per player over a time window. mmr_history has no timestamp
  // of its own, so the window is applied on matches.playedAt through the join.
  async getMmrDeltasSince(seasonId: string, from: Date): Promise<WeeklyMmrLeader[]> {
    return await db
      .select({
        playerId: mmrHistory.playerId,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
        mmrGained: sql<number>`SUM(${mmrHistory.mmrDelta})::int`,
        matchesPlayed: sql<number>`COUNT(*)::int`,
      })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .innerJoin(appUsers, eq(mmrHistory.playerId, appUsers.id))
      .where(and(eq(mmrHistory.seasonId, seasonId), gte(matches.playedAt, from)))
      .groupBy(mmrHistory.playerId, appUsers.displayName, appUsers.shortName);
  }

  // Season-wide MMR aggregates, seeded with the player's entry MMR (the mmr_before of
  // their first match) so a player who only ever lost still peaks at their entry level
  // — same convention as the client-side getPeakMmr. mmr_history has no timestamp, so
  // "first match" is resolved through the join on matches.
  async getSeasonMmrStats(seasonId: string, minMatches: number): Promise<SeasonMmrStatsRow[]> {
    const result = await db.execute(sql`
      WITH ordered AS (
        SELECT mh.player_id, mh.mmr_before, mh.mmr_after,
               ROW_NUMBER() OVER (PARTITION BY mh.player_id
                                  ORDER BY m.played_at ASC, m.id ASC) AS rn
        FROM mmr_history mh
        INNER JOIN matches m ON m.id = mh.match_id
        WHERE mh.season_id = ${seasonId}
      ),
      seed AS (SELECT player_id, mmr_before FROM ordered WHERE rn = 1)
      SELECT o.player_id,
             GREATEST(MAX(o.mmr_after), MIN(s.mmr_before))::int AS peak_mmr,
             ROUND((SUM(o.mmr_after) + MIN(s.mmr_before))::numeric / (COUNT(*) + 1))::int AS avg_mmr,
             COUNT(*)::int AS matches_played
      FROM ordered o
      JOIN seed s ON s.player_id = o.player_id
      GROUP BY o.player_id
      HAVING COUNT(*) >= ${minMatches}
    `);

    return (result.rows as SeasonMmrStatsRawRow[]).map((row) => ({
      playerId: row.player_id,
      peakMmr: Number(row.peak_mmr),
      avgMmr: Number(row.avg_mmr),
      matchesPlayed: Number(row.matches_played),
    }));
  }

  // The same aggregates as getSeasonMmrStats above, partitioned by season instead
  // of by player. The seeding convention is repeated verbatim on purpose: a career
  // row and a season leaderboard row for the same (player, season) have to agree,
  // and an integration test asserts that parity.
  //
  // No HAVING here: a season the player never finished their placements in still
  // belongs to their career, and the service marks it instead of hiding it.
  async getPlayerCareerMmrStats(playerId: string): Promise<PlayerCareerMmrStatsRow[]> {
    const result = await db.execute(sql`
      WITH ordered AS (
        SELECT mh.season_id, mh.mmr_before, mh.mmr_after,
               ROW_NUMBER() OVER (PARTITION BY mh.season_id
                                  ORDER BY m.played_at ASC, m.id ASC) AS rn
        FROM mmr_history mh
        INNER JOIN matches m ON m.id = mh.match_id
        WHERE mh.player_id = ${playerId}
      ),
      seed AS (SELECT season_id, mmr_before FROM ordered WHERE rn = 1)
      SELECT o.season_id,
             GREATEST(MAX(o.mmr_after), MIN(s.mmr_before))::int AS peak_mmr,
             ROUND((SUM(o.mmr_after) + MIN(s.mmr_before))::numeric / (COUNT(*) + 1))::int AS avg_mmr,
             MIN(s.mmr_before)::int AS entry_mmr,
             COUNT(*)::int AS matches_played
      FROM ordered o
      JOIN seed s ON s.season_id = o.season_id
      GROUP BY o.season_id
    `);

    return (result.rows as PlayerCareerMmrStatsRawRow[]).map((row) => ({
      seasonId: row.season_id,
      peakMmr: Number(row.peak_mmr),
      avgMmr: Number(row.avg_mmr),
      entryMmr: Number(row.entry_mmr),
      matchesPlayed: Number(row.matches_played),
    }));
  }

  /** Every `player_mmr` row of one player, all seasons — the closing state of each run. */
  async getByPlayerAcrossSeasons(playerId: string) {
    return await db.query.playerMmr.findMany({
      where: eq(playerMmr.playerId, playerId),
    });
  }

  async getOpponentQualityStats(seasonId: string, playerId: string): Promise<OpponentQualityStats> {
    const emptyBucket = () => ({ wins: 0, losses: 0, draws: 0, matchesPlayed: 0, winRate: 0 });
    const result = { vsStronger: emptyBucket(), vsEqual: emptyBucket(), vsWeaker: emptyBucket() };

    const rows = await db
      .select({ mmrBefore: mmrHistory.mmrBefore, opponentAvgMmr: mmrHistory.opponentAvgMmr, outcome: mmrHistory.outcome })
      .from(mmrHistory)
      .where(and(eq(mmrHistory.seasonId, seasonId), eq(mmrHistory.playerId, playerId)));

    for (const row of rows) {
      const diff = row.opponentAvgMmr - row.mmrBefore;
      let bucket = result.vsEqual;
      if (diff > STRONGER_OPPONENT_MMR_GAP) bucket = result.vsStronger;
      else if (diff < -STRONGER_OPPONENT_MMR_GAP) bucket = result.vsWeaker;
      bucket.matchesPlayed++;
      if (row.outcome === 'win') bucket.wins++;
      else if (row.outcome === 'loss') bucket.losses++;
      else bucket.draws++;
    }

    for (const b of [result.vsStronger, result.vsEqual, result.vsWeaker]) {
      b.winRate = b.matchesPlayed > 0 ? Math.round((b.wins / b.matchesPlayed) * 100) : 0;
    }

    return result;
  }
}

export const playerMmrRepository = new PlayerMmrRepository();
