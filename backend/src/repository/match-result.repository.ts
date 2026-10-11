import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { matchResults } from "../db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema";

type DbTransaction = NodePgDatabase<typeof schema> | typeof db;

export type CreateResultData = {
  reportedBy?: string;
  reportedAt?: Date;
  reportProof?: string;
  finalizedBy?: string;
  finalizedAt?: Date;
  finalizationReason?: "consensus" | "auto_validation" | "admin_override" | "trust_score";
};

export type UpdateResultData = Partial<CreateResultData>;

export class MatchResultRepository {
  /**
   * Get match result by match ID
   */
  async getByMatchId(matchId: string, tx?: DbTransaction) {
    return await (tx || db).query.matchResults.findFirst({
      where: eq(matchResults.matchId, matchId),
      with: {
        reporter: true,
        finalizer: true,
      },
    });
  }

  /**
   * Create a new match result
   */
  async create(matchId: string, data: CreateResultData, tx?: DbTransaction) {
    const dbInstance = tx || db;

    const [result] = await dbInstance
      .insert(matchResults)
      .values({
        matchId,
        reportedBy: data.reportedBy,
        reportedAt: data.reportedAt,
        reportProof: data.reportProof,
        finalizedBy: data.finalizedBy,
        finalizedAt: data.finalizedAt,
        finalizationReason: data.finalizationReason,
      })
      .returning();

    return result;
  }

  /**
   * Update an existing match result
   */
  async update(matchId: string, data: UpdateResultData, tx?: DbTransaction) {
    const [updated] = await (tx || db)
      .update(matchResults)
      .set({
        reportedBy: data.reportedBy,
        reportedAt: data.reportedAt,
        reportProof: data.reportProof,
        finalizedBy: data.finalizedBy,
        finalizedAt: data.finalizedAt,
        finalizationReason: data.finalizationReason,
      })
      .where(eq(matchResults.matchId, matchId))
      .returning();

    return updated;
  }

  /**
   * Mark as reported
   */
  async markAsReported(matchId: string, reportedBy: string, reportProof?: string) {
    return await this.update(matchId, {
      reportedBy,
      reportedAt: new Date(),
      reportProof,
    });
  }

  /**
   * Mark as finalized
   */
  async markAsFinalized(
    matchId: string,
    finalizedBy: string,
    finalizationReason: "consensus" | "auto_validation" | "admin_override" | "trust_score",
  ) {
    return await this.update(matchId, {
      finalizedBy,
      finalizedAt: new Date(),
      finalizationReason,
    });
  }

  /**
   * Delete match result
   */
  async delete(matchId: string) {
    await db.delete(matchResults).where(eq(matchResults.matchId, matchId));
  }

  /**
   * Check if match has been reported
   */
  async isReported(matchId: string) {
    const result = await this.getByMatchId(matchId);
    return result && !!result.reportedBy;
  }

  /**
   * Check if match has been finalized
   */
  async isFinalized(matchId: string) {
    const result = await this.getByMatchId(matchId);
    return result && !!result.finalizedBy;
  }
}

export const matchResultRepository = new MatchResultRepository();
