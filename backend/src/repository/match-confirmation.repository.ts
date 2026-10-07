import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/database";
import { matchConfirmations } from "../db/schema";

export interface CreateMatchConfirmationData {
  matchId: string;
  playerId: string;
  isConfirmed: boolean;
  isContested: boolean;
  contestationReason?: string | null;
  sidePosition?: number | null;
  isPostFinalization?: boolean;
}

export interface UpdateMatchConfirmationData {
  isConfirmed?: boolean;
  isContested?: boolean;
  contestationReason?: string | null;
  sidePosition?: number | null;
}

export class MatchConfirmationRepository {
  /**
   * Create a new match confirmation
   */
  async create(data: CreateMatchConfirmationData) {
    const [confirmation] = await db
      .insert(matchConfirmations)
      .values(data)
      .returning();
    return confirmation;
  }

  /**
   * Get confirmation by match and player (pre-finalization only by default)
   */
  async getByMatchAndPlayer(matchId: string, playerId: string, isPostFinalization = false) {
    const confirmation = await db.query.matchConfirmations.findFirst({
      where: and(
        eq(matchConfirmations.matchId, matchId),
        eq(matchConfirmations.playerId, playerId),
        eq(matchConfirmations.isPostFinalization, isPostFinalization),
      ),
      with: {
        player: true,
      },
    });
    return confirmation;
  }

  /**
   * Get all confirmations for a match
   */
  async getByMatchId(matchId: string) {
    const confirmations = await db.query.matchConfirmations.findMany({
      where: eq(matchConfirmations.matchId, matchId),
      with: {
        player: true,
      },
    });
    return confirmations;
  }

  /**
   * Update a match confirmation
   */
  async update(matchId: string, playerId: string, data: UpdateMatchConfirmationData, isPostFinalization = false) {
    const [confirmation] = await db
      .update(matchConfirmations)
      .set(data)
      .where(
        and(
          eq(matchConfirmations.matchId, matchId),
          eq(matchConfirmations.playerId, playerId),
          eq(matchConfirmations.isPostFinalization, isPostFinalization),
        )
      )
      .returning();
    return confirmation;
  }

  /**
   * Upsert a match confirmation (insert or update if exists)
   */
  async upsert(data: CreateMatchConfirmationData) {
    const isPost = data.isPostFinalization ?? false;
    const existing = await this.getByMatchAndPlayer(data.matchId, data.playerId, isPost);

    if (existing) {
      return await this.update(data.matchId, data.playerId, {
        isConfirmed: data.isConfirmed,
        isContested: data.isContested,
        contestationReason: data.contestationReason,
        sidePosition: data.sidePosition,
      }, isPost);
    }

    return await this.create(data);
  }

  /**
   * Reset all pre-finalization confirmations for a match except for the given player.
   * Used when the author revises the score: everyone else has to vote again.
   */
  async resetConfirmationsExcept(matchId: string, excludePlayerId: string) {
    const confirmations = await this.getByMatchId(matchId);
    const toReset = confirmations.filter(
      (c) => c.playerId !== excludePlayerId && !c.isPostFinalization,
    );

    for (const c of toReset) {
      await db
        .update(matchConfirmations)
        .set({
          isConfirmed: false,
          isContested: false,
          contestationReason: null,
        })
        .where(
          and(
            eq(matchConfirmations.matchId, matchId),
            eq(matchConfirmations.playerId, c.playerId),
            eq(matchConfirmations.isPostFinalization, false),
          )
        );
    }
  }

  /**
   * Of the given matches, the ones that still carry an open post-finalization
   * contestation. Batched on purpose: it answers a whole notification list at once.
   */
  async getMatchIdsWithOpenPostDispute(matchIds: string[]): Promise<string[]> {
    if (matchIds.length === 0) return [];

    const rows = await db
      .selectDistinct({ matchId: matchConfirmations.matchId })
      .from(matchConfirmations)
      .where(
        and(
          inArray(matchConfirmations.matchId, matchIds),
          eq(matchConfirmations.isPostFinalization, true),
          eq(matchConfirmations.isContested, true),
        ),
      );

    return rows.map((row) => row.matchId);
  }

  /**
   * Drops every post-finalization contestation of a match, once a correction or a
   * cancellation has answered them.
   */
  async deletePostFinalizationByMatchId(matchId: string) {
    await db
      .delete(matchConfirmations)
      .where(
        and(
          eq(matchConfirmations.matchId, matchId),
          eq(matchConfirmations.isPostFinalization, true),
        ),
      );
  }

  /**
   * Check if a player already submitted a post-finalization dispute.
   */
  async hasPlayerDisputedPostFinalization(matchId: string, playerId: string): Promise<boolean> {
    const record = await this.getByMatchAndPlayer(matchId, playerId, true);
    return record !== undefined && record !== null;
  }

  /**
   * Delete a match confirmation. A player can hold two rows for the same match — one
   * for the validation round, one for a post-finalization dispute — so the flag is
   * part of the key and never optional in practice.
   */
  async delete(matchId: string, playerId: string, isPostFinalization = false) {
    await db
      .delete(matchConfirmations)
      .where(
        and(
          eq(matchConfirmations.matchId, matchId),
          eq(matchConfirmations.playerId, playerId),
          eq(matchConfirmations.isPostFinalization, isPostFinalization)
        )
      );
  }

  /**
   * Delete all confirmations for a match
   */
  async deleteByMatchId(matchId: string) {
    await db
      .delete(matchConfirmations)
      .where(eq(matchConfirmations.matchId, matchId));
  }

  /**
   * Count confirmations for a match
   */
  async countConfirmationsByMatch(matchId: string) {
    const confirmations = await this.getByMatchId(matchId);
    
    return {
      total: confirmations.length,
      confirmed: confirmations.filter(c => c.isConfirmed).length,
      contested: confirmations.filter(c => c.isContested).length,
    };
  }

  /**
   * Check if a player has confirmed a match
   */
  async hasPlayerConfirmed(matchId: string, playerId: string): Promise<boolean> {
    const confirmation = await this.getByMatchAndPlayer(matchId, playerId);
    return confirmation?.isConfirmed || false;
  }

  /**
   * Check if a player has contested a match
   */
  async hasPlayerContested(matchId: string, playerId: string): Promise<boolean> {
    const confirmation = await this.getByMatchAndPlayer(matchId, playerId);
    return confirmation?.isContested || false;
  }

  /**
   * Check if any player has contested a match
   */
  async hasAnyContestation(matchId: string): Promise<boolean> {
    const confirmations = await this.getByMatchId(matchId);
    return confirmations.some(c => c.isContested);
  }
}

export const matchConfirmationRepository = new MatchConfirmationRepository();

