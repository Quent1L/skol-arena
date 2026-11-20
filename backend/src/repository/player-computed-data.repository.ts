import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/database";
import { playerComputedData } from "../db/schema";
import type { PlayerDetailStats } from "@skol-arena/shared";

class PlayerComputedDataRepository {
  async get(playerId: string, key: string): Promise<PlayerDetailStats | null> {
    const row = await db.query.playerComputedData.findFirst({
      where: and(eq(playerComputedData.playerId, playerId), eq(playerComputedData.key, key)),
    });
    if (!row) return null;
    return row.data as PlayerDetailStats;
  }

  async set(playerId: string, key: string, data: PlayerDetailStats): Promise<void> {
    await db
      .insert(playerComputedData)
      .values({ playerId, key, data, computedAt: new Date() })
      .onConflictDoUpdate({
        target: [playerComputedData.playerId, playerComputedData.key],
        set: { data, computedAt: new Date() },
      });
  }

  async deleteMany(playerIds: string[]): Promise<void> {
    if (playerIds.length === 0) return;
    await db.delete(playerComputedData).where(inArray(playerComputedData.playerId, playerIds));
  }
}

export const playerComputedDataRepository = new PlayerComputedDataRepository();
