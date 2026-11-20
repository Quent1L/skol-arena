import { eq, and } from "drizzle-orm";
import { db } from "../config/database";
import { bracketConfigs, bracketRounds, bracketSeeds, bracketMatchMetadata, matches } from "../db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema";

type DbTransaction = NodePgDatabase<typeof schema> | typeof db;

export class BracketRepository {
  // ============================================
  // Bracket Config Operations
  // ============================================

  /**
   * Create a new bracket configuration
   */
  async createConfig(
    data: {
      tournamentId: string;
      bracketType: "single_elimination" | "double_elimination";
      seedingType: "random" | "championship_based";
      sourceTournamentId?: string;
      totalParticipants: number;
      roundsCount: number;
      hasBronzeMatch: boolean;
    },
    tx?: DbTransaction,
  ) {
    const dbInstance = tx || db;
    const [config] = await dbInstance.insert(bracketConfigs).values(data).returning();
    return config;
  }

  /**
   * Get bracket config by tournament ID
   */
  async getConfigByTournamentId(tournamentId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketConfigs.findFirst({
      where: eq(bracketConfigs.tournamentId, tournamentId),
    });
  }

  /**
   * Get bracket config by ID
   */
  async getConfigById(configId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketConfigs.findFirst({
      where: eq(bracketConfigs.id, configId),
    });
  }

  /**
   * Delete bracket config
   */
  async deleteConfig(configId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    await dbInstance.delete(bracketConfigs).where(eq(bracketConfigs.id, configId));
  }

  // ============================================
  // Bracket Rounds Operations
  // ============================================

  /**
   * Create multiple rounds at once
   */
  async createRounds(
    rounds: Array<{
      bracketConfigId: string;
      roundNumber: number;
      roundName: string;
      roundNameKey: string;
      translationParams: Record<string, number> | null;
      bracketType: "winners" | "losers" | "bronze";
      matchesCount: number;
    }>,
    tx?: DbTransaction,
  ) {
    const dbInstance = tx || db;
    return await dbInstance.insert(bracketRounds).values(rounds).returning();
  }

  /**
   * Get all rounds for a bracket config
   */
  async getRoundsByConfigId(configId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketRounds.findMany({
      where: eq(bracketRounds.bracketConfigId, configId),
      orderBy: (rounds, { asc }) => [asc(rounds.roundNumber)],
    });
  }

  /**
   * Get a specific round by ID
   */
  async getRoundById(roundId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketRounds.findFirst({
      where: eq(bracketRounds.id, roundId),
    });
  }

  // ============================================
  // Bracket Seeds Operations
  // ============================================

  /**
   * Create multiple seeds at once
   */
  async createSeeds(
    seeds: Array<{
      bracketConfigId: string;
      entryId: string;
      seedNumber: number;
      seedingScore?: number;
    }>,
    tx?: DbTransaction,
  ) {
    const dbInstance = tx || db;
    return await dbInstance.insert(bracketSeeds).values(seeds).returning();
  }

  /**
   * Get all seeds for a bracket config
   */
  async getSeedsByConfigId(configId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketSeeds.findMany({
      where: eq(bracketSeeds.bracketConfigId, configId),
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
      orderBy: (seeds, { asc }) => [asc(seeds.seedNumber)],
    });
  }

  /**
   * Get seed by entry ID
   */
  async getSeedByEntryId(configId: string, entryId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketSeeds.findFirst({
      where: and(eq(bracketSeeds.bracketConfigId, configId), eq(bracketSeeds.entryId, entryId)),
    });
  }

  // ============================================
  // Bracket Match Metadata Operations
  // ============================================

  /**
   * Create match metadata
   */
  async createMatchMetadata(
    data: {
      matchId: string;
      bracketRoundId: string;
      matchNumber: number;
      winnerToMatchId?: string;
      loserToMatchId?: string;
      isByeMatch: boolean;
    },
    tx?: DbTransaction,
  ) {
    const dbInstance = tx || db;
    const [metadata] = await dbInstance.insert(bracketMatchMetadata).values(data).returning();
    return metadata;
  }

  /**
   * Get metadata by match ID
   */
  async getMetadataByMatchId(matchId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketMatchMetadata.findFirst({
      where: eq(bracketMatchMetadata.matchId, matchId),
      with: {
        bracketRound: true,
      },
    });
  }

  /**
   * Get all metadata for a round
   */
  async getMetadataByRoundId(roundId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.bracketMatchMetadata.findMany({
      where: eq(bracketMatchMetadata.bracketRoundId, roundId),
      orderBy: (metadata, { asc }) => [asc(metadata.matchNumber)],
    });
  }

  /**
   * Update match metadata (for setting winner/loser destinations)
   */
  async updateMatchMetadata(
    matchId: string,
    data: {
      winnerToMatchId?: string;
      loserToMatchId?: string;
    },
    tx?: DbTransaction,
  ) {
    const dbInstance = tx || db;
    const [updated] = await dbInstance
      .update(bracketMatchMetadata)
      .set(data)
      .where(eq(bracketMatchMetadata.matchId, matchId))
      .returning();
    return updated;
  }

  // ============================================
  // Complex Queries
  // ============================================

  /**
   * Get complete bracket data for a tournament
   */
  async getBracketDataByTournamentId(tournamentId: string) {
    const config = await db.query.bracketConfigs.findFirst({
      where: eq(bracketConfigs.tournamentId, tournamentId),
    });

    if (!config) return null;

    const [rounds, seeds, matchesWithMetadata] = await Promise.all([
      this.getRoundsByConfigId(config.id),
      this.getSeedsByConfigId(config.id),
      this.getMatchesWithMetadataByConfigId(config.id),
    ]);

    return {
      config,
      rounds,
      seeds,
      matches: matchesWithMetadata,
    };
  }

  /**
   * Get all matches with their metadata and round info for a bracket
   */
  private async getMatchesWithMetadataByConfigId(configId: string) {
    // Get all rounds for this config
    const rounds = await this.getRoundsByConfigId(configId);

    // Since Drizzle doesn't support IN clause easily, get all metadata
    const allRoundMetadata = [];
    for (const round of rounds) {
      const roundMetadata = await db.query.bracketMatchMetadata.findMany({
        where: eq(bracketMatchMetadata.bracketRoundId, round.id),
        with: {
          match: {
            with: {
              sides: {
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
              },
              result: true,
            },
          },
          bracketRound: true,
        },
        orderBy: (metadata, { asc }) => [asc(metadata.matchNumber)],
      });
      allRoundMetadata.push(...roundMetadata);
    }

    return allRoundMetadata.map((metadata) => ({
      match: metadata.match,
      metadata: {
        id: metadata.id,
        matchId: metadata.matchId,
        bracketRoundId: metadata.bracketRoundId,
        matchNumber: metadata.matchNumber,
        winnerToMatchId: metadata.winnerToMatchId || undefined,
        loserToMatchId: metadata.loserToMatchId || undefined,
        isByeMatch: metadata.isByeMatch,
        createdAt: metadata.createdAt.toISOString(),
      },
      round: metadata.bracketRound,
    }));
  }

  /**
   * Count matches for a bracket config
   */
  async countMatchesByConfigId(configId: string, tx?: DbTransaction): Promise<number> {
    const dbInstance = tx || db;
    const rounds = await this.getRoundsByConfigId(configId, dbInstance);

    if (rounds.length === 0) return 0;

    let totalMatches = 0;
    for (const round of rounds) {
      const metadata = await this.getMetadataByRoundId(round.id, dbInstance);
      totalMatches += metadata.length;
    }

    return totalMatches;
  }

  // ============================================
  // Bulk Delete Operations
  // ============================================

  /**
   * Delete all bracket data for a tournament (use in transaction)
   */
  async deleteAllBracketData(tournamentId: string, tx?: DbTransaction) {
    const performDelete = async (dbInstance: DbTransaction) => {
      const config = await this.getConfigByTournamentId(tournamentId, dbInstance);

      if (!config) return;

      // Get all rounds
      const rounds = await this.getRoundsByConfigId(config.id, dbInstance);

      // Delete all matches associated with these rounds
      for (const round of rounds) {
        const metadata = await this.getMetadataByRoundId(round.id, dbInstance);
        const matchIds = metadata.map((m) => m.matchId);

        // Delete matches (cascade will handle sides, results, etc.)
        for (const matchId of matchIds) {
          await dbInstance.delete(matches).where(eq(matches.id, matchId));
        }
      }

      // Delete config (cascade will handle rounds, seeds, metadata)
      await this.deleteConfig(config.id, dbInstance);
    };

    if (tx) {
      await performDelete(tx);
    } else {
      await db.transaction(async (newTx) => await performDelete(newTx));
    }
  }
}

export const bracketRepository = new BracketRepository();
