import { eq, and, sql, ne, inArray } from "drizzle-orm";
import { db } from "../config/database";
import { tournaments, tournamentParticipants } from "../db/schema";

/**
 * Repository for tournament participation management
 *
 * Note: tournamentParticipants tracks user REGISTRATION (who CAN play)
 *       tournamentEntries tracks match COMPOSITION (who DID play)
 */
type ParticipantStatus = typeof tournamentParticipants.$inferSelect.status;

export class ParticipantRepository {
  /**
   * Get tournament by ID
   */
  async findTournamentById(tournamentId: string) {
    return await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
    });
  }

  /**
   * Check if user is already registered in tournament
   */
  async findParticipationByUserAndTournament(
    userId: string,
    tournamentId: string
  ) {
    return await db.query.tournamentParticipants.findFirst({
      where: and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.userId, userId),
        eq(tournamentParticipants.status, "active")
      ),
    });
  }

  /**
   * Registration row whatever its status, to tell a player who left on their own
   * (`withdrawn`) from one an organizer removed (`removed`)
   */
  async findParticipationAnyStatus(userId: string, tournamentId: string) {
    return await db.query.tournamentParticipants.findFirst({
      where: and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.userId, userId)
      ),
    });
  }

  /**
   * Ids of the players who registered and then left or were removed. Their matches stay,
   * so standings and leaderboards keep their row, flagged inactive.
   */
  async findInactivePlayerIds(tournamentId: string): Promise<Set<string>> {
    const rows = await db
      .select({ userId: tournamentParticipants.userId })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          ne(tournamentParticipants.status, "active")
        )
      );
    return new Set(rows.map((row) => row.userId));
  }

  /**
   * Registration status of each listed player who has one. A player missing from the map
   * never registered.
   */
  async findStatuses(
    tournamentId: string,
    userIds: string[]
  ): Promise<Map<string, ParticipantStatus>> {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ userId: tournamentParticipants.userId, status: tournamentParticipants.status })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          inArray(tournamentParticipants.userId, userIds)
        )
      );
    return new Map(rows.map((row) => [row.userId, row.status]));
  }

  /**
   * Create a new participation (user joins tournament)
   */
  async createParticipation(userId: string, tournamentId: string) {
    const [participation] = await db
      .insert(tournamentParticipants)
      .values({
        tournamentId,
        userId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [tournamentParticipants.tournamentId, tournamentParticipants.userId],
        set: {
          status: "active",
          joinedAt: sql`now()`,
        },
      })
      .returning();

    return participation;
  }

  /**
   * Get participation with related tournament and user details
   */
  async findParticipationWithDetails(participationId: string) {
    return await db.query.tournamentParticipants.findFirst({
      where: eq(tournamentParticipants.id, participationId),
      with: {
        tournament: true,
        user: true,
      },
    });
  }

  /**
   * Remove participation (soft delete - mark as withdrawn)
   */
  async deleteParticipation(participationId: string) {
    await db
      .update(tournamentParticipants)
      .set({ status: "withdrawn" })
      .where(eq(tournamentParticipants.id, participationId));
  }

  /**
   * Get all active participants for a tournament
   */
  async findTournamentParticipants(tournamentId: string) {
    const participants = await db.query.tournamentParticipants.findMany({
      where: and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.status, "active")
      ),
      with: {
        user: true,
      },
    });
    return participants.sort((a, b) =>
      a.user.displayName.localeCompare(b.user.displayName)
    );
  }

  /**
   * Count active participants in a tournament
   */
  async countActiveParticipants(tournamentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.status, "active")
        )
      );
    // Convert to number (PostgreSQL count returns bigint as string)
    return Number(result[0]?.count ?? 0);
  }

  /**
   * Organizer removal (soft delete): the player's results stay in the standings, flagged
   * inactive, and only an organizer can bring them back
   */
  async markRemoved(participationId: string) {
    await db
      .update(tournamentParticipants)
      .set({ status: "removed" })
      .where(eq(tournamentParticipants.id, participationId));
  }
}

export const participantRepository = new ParticipantRepository();
