import { eq, and } from "drizzle-orm";
import { db } from "../config/database";
import { tournamentEntries, tournamentEntryPlayers, teamMembers } from "../db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema";

type DbTransaction = NodePgDatabase<typeof schema> | typeof db;

type EntryWithPlayers = {
  entry: typeof tournamentEntries.$inferSelect;
  playerIds: string[];
};

/** Load all PLAYER entries of a tournament grouped with their player ids */
async function loadPlayerEntries(dbInstance: DbTransaction, tournamentId: string): Promise<EntryWithPlayers[]> {
  const rows = await dbInstance
    .select({
      entry: tournamentEntries,
      playerIds: tournamentEntryPlayers.playerId,
    })
    .from(tournamentEntries)
    .leftJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
    .where(and(eq(tournamentEntries.tournamentId, tournamentId), eq(tournamentEntries.entryType, "PLAYER")));

  const entriesMap = new Map<string, EntryWithPlayers>();
  for (const row of rows) {
    if (!entriesMap.has(row.entry.id)) {
      entriesMap.set(row.entry.id, { entry: row.entry, playerIds: [] });
    }
    if (row.playerIds) {
      entriesMap.get(row.entry.id)!.playerIds.push(row.playerIds);
    }
  }
  return [...entriesMap.values()];
}

/** Find the entry whose player composition matches playerIds exactly */
function findEntryByComposition(
  entries: EntryWithPlayers[],
  playerIds: string[],
): typeof tournamentEntries.$inferSelect | undefined {
  const sorted = [...playerIds].sort((a, b) => a.localeCompare(b));
  return entries.find(({ playerIds: entryPlayerIds }) => {
    const sortedEntry = [...entryPlayerIds].sort((a, b) => a.localeCompare(b));
    return sortedEntry.length === sorted.length && sorted.every((id, i) => id === sortedEntry[i]);
  })?.entry;
}

export class EntryRepository {
  /**
   * Get entry by ID with players and team info
   */
  async getById(entryId: string, tx?: DbTransaction) {
    const dbInstance = tx || db;
    return await dbInstance.query.tournamentEntries.findFirst({
      where: eq(tournamentEntries.id, entryId),
      with: {
        team: true,
        players: {
          with: {
            player: true,
          },
        },
      },
    });
  }

  /**
   * Get all entries for a tournament
   */
  async getByTournament(tournamentId: string) {
    return await db.query.tournamentEntries.findMany({
      where: eq(tournamentEntries.tournamentId, tournamentId),
      with: {
        team: true,
        players: {
          with: {
            player: true,
          },
        },
      },
    });
  }

  /**
   * Create a new entry with players
   */
  async create(
    data: {
      tournamentId: string;
      entryType: "PLAYER" | "TEAM";
      teamId?: string;
      playerIds: string[];
    },
    tx?: DbTransaction,
  ) {
    const performCreate = async (dbInstance: DbTransaction) => {
      // Create entry
      const [entry] = await dbInstance
        .insert(tournamentEntries)
        .values({
          tournamentId: data.tournamentId,
          entryType: data.entryType,
          teamId: data.teamId,
        })
        .returning();

      // Link players
      if (data.playerIds.length > 0) {
        await dbInstance.insert(tournamentEntryPlayers).values(
          data.playerIds.map((playerId) => ({
            entryId: entry.id,
            playerId,
          })),
        );
      }

      return entry;
    };

    // If transaction provided, use it; otherwise create a new one
    if (tx) {
      return await performCreate(tx);
    } else {
      return await db.transaction(async (newTx) => await performCreate(newTx));
    }
  }

  /**
   * Find existing entry or create new one for a match
   * For static mode: find/create entry with teamId
   * For flex mode: find/create entry with specific playerIds
   */
  async getOrCreateForMatch(tournamentId: string, teamId?: string, playerIds?: string[], tx?: DbTransaction) {
    const dbInstance = tx || db;

    // For static team mode
    if (teamId) {
      const existing = await dbInstance.query.tournamentEntries.findFirst({
        where: and(eq(tournamentEntries.tournamentId, tournamentId), eq(tournamentEntries.teamId, teamId)),
        with: {
          team: true,
          players: {
            with: {
              player: true,
            },
          },
        },
      });

      if (existing) {
        return existing;
      }

      // Create new entry for team - read members from team_members table
      const members = await dbInstance
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));
      const memberIds = members.map((m: { userId: string }) => m.userId);

      const entry = await this.create(
        {
          tournamentId,
          entryType: "TEAM",
          teamId,
          playerIds: memberIds.length > 0 ? memberIds : playerIds || [],
        },
        tx,
      );

      // Return with relations
      return await this.getById(entry.id, tx);
    }

    // For flex mode - find entry with exact same player composition
    if (playerIds && playerIds.length > 0) {
      const entries = await loadPlayerEntries(dbInstance, tournamentId);
      const match = findEntryByComposition(entries, playerIds);
      if (match) {
        return await this.getById(match.id, tx);
      }

      // Create new entry for players
      const entry = await this.create(
        {
          tournamentId,
          entryType: "PLAYER",
          playerIds,
        },
        tx,
      );

      // Return with relations
      return await this.getById(entry.id, tx);
    }

    throw new Error("Either teamId or playerIds must be provided");
  }

  /**
   * Find existing entry without creating it
   * For static mode: find entry with teamId
   * For flex mode: find entry with exact same playerIds composition
   */
  async findExistingEntry(tournamentId: string, teamId?: string, playerIds?: string[]) {
    // For static team mode
    if (teamId) {
      return await db.query.tournamentEntries.findFirst({
        where: and(eq(tournamentEntries.tournamentId, tournamentId), eq(tournamentEntries.teamId, teamId)),
        with: {
          team: true,
          players: {
            with: {
              player: true,
            },
          },
        },
      });
    }

    // For flex mode - find entry with exact same player composition
    if (playerIds && playerIds.length > 0) {
      const entries = await loadPlayerEntries(db, tournamentId);
      const match = findEntryByComposition(entries, playerIds);
      if (match) {
        return await db.query.tournamentEntries.findFirst({
          where: eq(tournamentEntries.id, match.id),
          with: {
            team: true,
            players: {
              with: {
                player: true,
              },
            },
          },
        });
      }
    }

    return null;
  }

  /**
   * Get entries by player ID
   */
  async getByPlayerId(playerId: string, tournamentId?: string) {
    const whereConditions = tournamentId
      ? and(eq(tournamentEntryPlayers.playerId, playerId), eq(tournamentEntries.tournamentId, tournamentId))
      : eq(tournamentEntryPlayers.playerId, playerId);

    const results = await db
      .select({
        entry: tournamentEntries,
      })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .where(whereConditions);

    return results.map((r) => r.entry);
  }

  /**
   * Check if a player is in an entry
   */
  async isPlayerInEntry(entryId: string, playerId: string) {
    const link = await db.query.tournamentEntryPlayers.findFirst({
      where: and(eq(tournamentEntryPlayers.entryId, entryId), eq(tournamentEntryPlayers.playerId, playerId)),
    });
    return !!link;
  }
}

export const entryRepository = new EntryRepository();
