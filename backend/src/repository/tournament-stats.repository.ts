import { eq, and, sql } from "drizzle-orm";
import { db } from "../config/database";
import { matches, tournaments, computedData } from "../db/schema";
import type { TournamentStats } from "@skol-arena/shared";

/**
 * Cached stats are returned verbatim, so a change to the TournamentStats shape must come
 * with a migration flushing this key — otherwise every already-computed tournament keeps
 * serving the previous shape. The cache is read-through, so a flush costs one recompute.
 */
const STATS_CACHE_KEY = "stats";

export class TournamentStatsRepository {
  async getTournamentMode(tournamentId: string) {
    return db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
      columns: { mode: true, teamMode: true, startDate: true, endDate: true, allowDraw: true },
      with: { rankedConfig: { columns: { allowAsymmetricMatches: true } } },
    });
  }

  /**
   * Counts per outcome type id only. The name and the default flag are resolved
   * from the competition's ruleset snapshot, so a renamed outcome does not
   * retroactively relabel the stats of a competition that is already over.
   */
  async getOutcomeDistribution(tournamentId: string) {
    return db
      .select({
        outcomeTypeId: matches.outcomeTypeId,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(matches)
      .where(
        and(eq(matches.tournamentId, tournamentId), eq(matches.status, "finalized"))
      )
      .groupBy(matches.outcomeTypeId);
  }

  async getMatchesWithSidesAndPlayers(tournamentId: string) {
    return db.query.matches.findMany({
      where: and(
        eq(matches.tournamentId, tournamentId),
        eq(matches.status, "finalized")
      ),
      columns: {
        id: true,
        winnerSide: true,
        playedAt: true,
        outcomeTypeId: true,
      },
      with: {
        sides: {
          columns: { position: true, entryId: true },
          with: {
            entry: {
              columns: { id: true },
              with: {
                players: {
                  columns: { playerId: true },
                  with: {
                    player: {
                      columns: { id: true, displayName: true, shortName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getMomentum(tournamentId: string) {
    return db
      .select({
        date: sql<string>`DATE(${matches.playedAt})`,
        matchCount: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(matches)
      .where(
        and(eq(matches.tournamentId, tournamentId), eq(matches.status, "finalized"))
      )
      .groupBy(sql`DATE(${matches.playedAt})`)
      .orderBy(sql`DATE(${matches.playedAt})`);
  }

  async getComputedStats(tournamentId: string): Promise<TournamentStats | null> {
    const row = await db.query.computedData.findFirst({
      where: and(
        eq(computedData.tournamentId, tournamentId),
        eq(computedData.key, STATS_CACHE_KEY),
      ),
    });
    if (!row) return null;
    return row.data as TournamentStats;
  }

  async setComputedStats(tournamentId: string, data: TournamentStats): Promise<void> {
    await db
      .insert(computedData)
      .values({ tournamentId, key: STATS_CACHE_KEY, data, computedAt: new Date() })
      .onConflictDoUpdate({
        target: [computedData.tournamentId, computedData.key],
        set: { data, computedAt: new Date() },
      });
  }

  async deleteComputedStats(tournamentId: string): Promise<void> {
    await db
      .delete(computedData)
      .where(
        and(eq(computedData.tournamentId, tournamentId), eq(computedData.key, STATS_CACHE_KEY)),
      );
  }
}

export const tournamentStatsRepository = new TournamentStatsRepository();
