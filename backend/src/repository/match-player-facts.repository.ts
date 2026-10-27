import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../config/database";
import { matches, matchPlayerFacts, mmrHistory } from "../db/schema";

export interface MatchPlayerFactsRow {
  matchId: string;
  playerId: string;
  seasonId: string;
  playedAt: Date;
  facts: Record<string, unknown>;
}

export class MatchPlayerFactsRepository {
  /** Insert or refresh the snapshots: a replay rewrites what an earlier pass froze. */
  async upsertMany(rows: MatchPlayerFactsRow[]): Promise<void> {
    if (rows.length === 0) return;
    await db
      .insert(matchPlayerFacts)
      .values(rows)
      .onConflictDoUpdate({
        target: [matchPlayerFacts.matchId, matchPlayerFacts.playerId],
        set: {
          seasonId: sql`excluded.season_id`,
          playedAt: sql`excluded.played_at`,
          facts: sql`excluded.facts`,
        },
      });
  }

  /**
   * The player's snapshots for the season, oldest first, up to `upTo` included.
   * Only finalized matches count: a cancelled match keeps its row (the match itself
   * is not deleted) but drops out of every count.
   */
  async listForPlayerSeason(seasonId: string, playerId: string, upTo: Date): Promise<Record<string, unknown>[]> {
    const rows = await db
      .select({ facts: matchPlayerFacts.facts })
      .from(matchPlayerFacts)
      .innerJoin(matches, eq(matchPlayerFacts.matchId, matches.id))
      .where(
        and(
          eq(matchPlayerFacts.seasonId, seasonId),
          eq(matchPlayerFacts.playerId, playerId),
          eq(matches.status, "finalized"),
          lte(matches.playedAt, upTo),
        ),
      )
      .orderBy(asc(matches.playedAt));
    return rows.map((r) => r.facts as Record<string, unknown>);
  }

  /** The player's ranked matches of the season, up to `upTo`, that have no snapshot yet. */
  async listMissingMatchIds(seasonId: string, playerId: string, upTo: Date): Promise<string[]> {
    const rows = await db
      .select({ matchId: mmrHistory.matchId })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .leftJoin(
        matchPlayerFacts,
        and(eq(matchPlayerFacts.matchId, mmrHistory.matchId), eq(matchPlayerFacts.playerId, mmrHistory.playerId)),
      )
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          eq(mmrHistory.playerId, playerId),
          eq(matches.status, "finalized"),
          lte(matches.playedAt, upTo),
          isNull(matchPlayerFacts.matchId),
        ),
      )
      .orderBy(asc(matches.playedAt));
    return rows.map((r) => r.matchId);
  }
}

export const matchPlayerFactsRepository = new MatchPlayerFactsRepository();
