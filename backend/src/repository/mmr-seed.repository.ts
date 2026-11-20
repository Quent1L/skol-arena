import { and, eq } from "drizzle-orm";
import { db } from "../config/database";
import { seasonMmrSeeds } from "../db/schema";

export interface MmrSeedRow {
  playerId: string;
  seedMmr: number;
}

export class MmrSeedRepository {
  /**
   * Replaces the whole seed set of a season in one transaction. The seeds are
   * derived from a finished season, so recomputing them always yields the same
   * result — replacing beats merging and keeps the table free of players who
   * dropped out of the source season's eligible set.
   */
  async replaceForSeason(seasonId: string, sourceSeasonId: string, rows: MmrSeedRow[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(seasonMmrSeeds).where(eq(seasonMmrSeeds.seasonId, seasonId));
      if (rows.length === 0) return;
      await tx.insert(seasonMmrSeeds).values(
        rows.map((row) => ({
          seasonId,
          playerId: row.playerId,
          seedMmr: row.seedMmr,
          sourceSeasonId,
        })),
      );
    });
  }

  async deleteBySeason(seasonId: string): Promise<void> {
    await db.delete(seasonMmrSeeds).where(eq(seasonMmrSeeds.seasonId, seasonId));
  }

  /** playerId -> entry MMR. Empty for a season without carry-over. */
  async getMapBySeason(seasonId: string): Promise<Map<string, number>> {
    const rows = await db
      .select({ playerId: seasonMmrSeeds.playerId, seedMmr: seasonMmrSeeds.seedMmr })
      .from(seasonMmrSeeds)
      .where(eq(seasonMmrSeeds.seasonId, seasonId));
    return new Map(rows.map((row) => [row.playerId, row.seedMmr]));
  }

  async getSeedMmr(seasonId: string, playerId: string): Promise<number | null> {
    const row = await db.query.seasonMmrSeeds.findFirst({
      where: and(eq(seasonMmrSeeds.seasonId, seasonId), eq(seasonMmrSeeds.playerId, playerId)),
      columns: { seedMmr: true },
    });
    return row?.seedMmr ?? null;
  }
}

export const mmrSeedRepository = new MmrSeedRepository();
