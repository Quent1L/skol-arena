import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../config/database";
import { matches, matchPlayerFacts, mmrHistory, tournaments } from "../db/schema";

export interface MatchPlayerFactsRow {
  matchId: string;
  playerId: string;
  seasonId: string;
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

  /** Like `listForPlayerSeason`, over every season of a discipline. */
  async listForPlayerDiscipline(disciplineId: string, playerId: string, upTo: Date): Promise<Record<string, unknown>[]> {
    const rows = await db
      .select({ facts: matchPlayerFacts.facts })
      .from(matchPlayerFacts)
      .innerJoin(matches, eq(matchPlayerFacts.matchId, matches.id))
      .innerJoin(tournaments, eq(matchPlayerFacts.seasonId, tournaments.id))
      .where(
        and(
          eq(tournaments.disciplineId, disciplineId),
          eq(matchPlayerFacts.playerId, playerId),
          eq(matches.status, "finalized"),
          lte(matches.playedAt, upTo),
        ),
      )
      .orderBy(asc(matches.playedAt));
    return rows.map((r) => r.facts as Record<string, unknown>);
  }

  /** Like `listMissingMatchIds`, over every season of a discipline. */
  async listMissingForDiscipline(
    disciplineId: string,
    playerId: string,
    upTo: Date,
  ): Promise<{ matchId: string; seasonId: string }[]> {
    return db
      .select({ matchId: mmrHistory.matchId, seasonId: mmrHistory.seasonId })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .innerJoin(tournaments, eq(mmrHistory.seasonId, tournaments.id))
      .leftJoin(
        matchPlayerFacts,
        and(eq(matchPlayerFacts.matchId, mmrHistory.matchId), eq(matchPlayerFacts.playerId, mmrHistory.playerId)),
      )
      .where(
        and(
          eq(tournaments.disciplineId, disciplineId),
          eq(mmrHistory.playerId, playerId),
          eq(matches.status, "finalized"),
          lte(matches.playedAt, upTo),
          isNull(matchPlayerFacts.matchId),
        ),
      )
      .orderBy(asc(matches.playedAt));
  }

  /** Drops the players' season snapshots of the matches played from `from` on, included. */
  async deleteForPlayersFrom(seasonId: string, playerIds: string[], from: Date): Promise<void> {
    if (playerIds.length === 0) return;
    await db
      .delete(matchPlayerFacts)
      .where(
        and(
          eq(matchPlayerFacts.seasonId, seasonId),
          inArray(matchPlayerFacts.playerId, playerIds),
          inArray(
            matchPlayerFacts.matchId,
            db.select({ id: matches.id }).from(matches).where(gte(matches.playedAt, from)),
          ),
        ),
      );
  }

  /** Those of the players with a finalized match after `since` in the season's discipline. */
  async listPlayersActiveInDisciplineSince(seasonId: string, playerIds: string[], since: Date): Promise<string[]> {
    if (playerIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ playerId: mmrHistory.playerId })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .innerJoin(tournaments, eq(mmrHistory.seasonId, tournaments.id))
      .where(
        and(
          sql`${tournaments.disciplineId} = (select t.discipline_id from tournaments t where t.id = ${seasonId})`,
          inArray(mmrHistory.playerId, playerIds),
          eq(matches.status, "finalized"),
          gt(matches.playedAt, since),
        ),
      );
    return rows.map((r) => r.playerId);
  }

  /** The players' finalized ranked matches of the season, from `from` included when given. */
  async listPlayersMatches(
    seasonId: string,
    playerIds: string[],
    from?: Date,
  ): Promise<{ matchId: string; playerId: string }[]> {
    if (playerIds.length === 0) return [];
    return db
      .select({ matchId: mmrHistory.matchId, playerId: mmrHistory.playerId })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(
        and(
          eq(mmrHistory.seasonId, seasonId),
          inArray(mmrHistory.playerId, playerIds),
          eq(matches.status, "finalized"),
          from ? gte(matches.playedAt, from) : undefined,
        ),
      )
      .orderBy(asc(matches.playedAt));
  }
}

export const matchPlayerFactsRepository = new MatchPlayerFactsRepository();
