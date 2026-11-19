import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/database";
import { matchSides, matches } from "../db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema";

type DbTransaction = NodePgDatabase<typeof schema> | typeof db;

export type CreateSideData = {
  entryId: string;
  position: number;
  score: number | null;
  pointsAwarded?: number;
};

export type UpdateScoreData = {
  entryId: string;
  score: number | null;
};

export class MatchSidesRepository {
  /**
   * Get all sides for a match with eager-loaded entries and players
   */
  async getByMatchId(matchId: string) {
    const sides = await db.query.matchSides.findMany({
      where: eq(matchSides.matchId, matchId),
      orderBy: (matchSides, { asc }) => [asc(matchSides.position)],
      with: {
        entry: {
          with: {
            team: true,
            players: {
              with: {
                player: true,
              },
            },
          },
        },
      },
    });

    return sides;
  }

  /**
   * Get a specific side by matchId and entryId
   */
  async getByMatchAndEntry(matchId: string, entryId: string) {
    return await db.query.matchSides.findFirst({
      where: and(
        eq(matchSides.matchId, matchId),
        eq(matchSides.entryId, entryId)
      ),
      with: {
        entry: {
          with: {
            team: true,
            players: {
              with: {
                player: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Create multiple match sides
   */
  async createSides(matchId: string, sides: CreateSideData[], tx?: DbTransaction) {
    if (sides.length === 0) {
      throw new Error("At least one side is required");
    }

    const dbInstance = tx || db;

    const values = sides.map((side) => ({
      matchId,
      entryId: side.entryId,
      position: side.position,
      score: side.score,
      pointsAwarded: side.pointsAwarded ?? 0,
    }));

    const created = await dbInstance.insert(matchSides).values(values).returning();
    return created;
  }

  /**
   * Update score for a specific side
   */
  async updateScore(matchId: string, entryId: string, score: number | null) {
    const [updated] = await db
      .update(matchSides)
      .set({ score })
      .where(
        and(eq(matchSides.matchId, matchId), eq(matchSides.entryId, entryId))
      )
      .returning();

    return updated;
  }

  /**
   * Update scores for multiple sides
   */
  async updateScores(matchId: string, updates: UpdateScoreData[]) {
    const results = await Promise.all(
      updates.map((update) =>
        this.updateScore(matchId, update.entryId, update.score)
      )
    );
    return results;
  }

  /**
   * Update points awarded for a specific side
   */
  async updatePointsAwarded(
    matchId: string,
    entryId: string,
    pointsAwarded: number
  ) {
    const [updated] = await db
      .update(matchSides)
      .set({ pointsAwarded })
      .where(
        and(eq(matchSides.matchId, matchId), eq(matchSides.entryId, entryId))
      )
      .returning();

    return updated;
  }

  /**
   * Get the winning entry based on the persisted winnerSide on the match record.
   * Returns null if it's a draw (winnerSide is null).
   */
  async getWinnerEntry(matchId: string) {
    // Read winnerSide from the match record
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      columns: { winnerSide: true },
    });

    if (!match?.winnerSide) {
      return null;
    }

    const winnerPosition = match.winnerSide === "A" ? 1 : 2;

    const side = await db.query.matchSides.findFirst({
      where: and(
        eq(matchSides.matchId, matchId),
        eq(matchSides.position, winnerPosition),
      ),
      with: {
        entry: {
          with: {
            team: true,
            players: {
              with: {
                player: true,
              },
            },
          },
        },
      },
    });

    return side?.entry ?? null;
  }

  /**
   * Get side by position
   */
  async getByPosition(matchId: string, position: number) {
    return await db.query.matchSides.findFirst({
      where: and(
        eq(matchSides.matchId, matchId),
        eq(matchSides.position, position)
      ),
      with: {
        entry: {
          with: {
            team: true,
            players: {
              with: {
                player: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Delete all sides for a match
   */
  async deleteByMatchId(matchId: string) {
    await db.delete(matchSides).where(eq(matchSides.matchId, matchId));
  }

  /**
   * Get sides for multiple matches, with players. Used for batch match card assembly.
   */
  async getByMatchIds(matchIds: string[]) {
    if (matchIds.length === 0) return [];
    return db.query.matchSides.findMany({
      where: inArray(matchSides.matchId, matchIds),
      with: {
        entry: {
          with: {
            players: { with: { player: true } },
            team: { columns: { name: true } },
          },
        },
      },
    });
  }

  /**
   * Check if an entry is in a match
   */
  async isEntryInMatch(matchId: string, entryId: string) {
    const side = await db.query.matchSides.findFirst({
      where: and(
        eq(matchSides.matchId, matchId),
        eq(matchSides.entryId, entryId)
      ),
    });
    return !!side;
  }
}

export const matchSidesRepository = new MatchSidesRepository();
