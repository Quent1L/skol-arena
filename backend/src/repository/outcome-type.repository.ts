import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../config/database";
import { matches, outcomeReasons, outcomeTypes } from "../db/schema";
import { handleDatabaseError } from "../utils/db-errors";
import type { DeletionBlocker } from "@skol-arena/shared/types/index";

export interface CreateOutcomeTypeData {
  disciplineId: string;
  name: string;
  isDefault?: boolean;
  scoreCountsForMmr?: boolean;
  points?: number;
  mmrMultiplier?: number;
}

export interface UpdateOutcomeTypeData {
  disciplineId?: string;
  name?: string;
  isDefault?: boolean;
  scoreCountsForMmr?: boolean;
  points?: number;
  mmrMultiplier?: number;
}

export class OutcomeTypeRepository {
  async create(data: CreateOutcomeTypeData) {
    const [outcomeType] = await db.insert(outcomeTypes).values(data).returning();
    return outcomeType;
  }

  /** Resolves archived types too: a match already tagged with one still renders. */
  async getById(id: string) {
    return await db.query.outcomeTypes.findFirst({
      where: eq(outcomeTypes.id, id),
      with: {
        discipline: true,
      },
    });
  }

  async list(disciplineId?: string, includeArchived = false) {
    const conditions = [];

    if (disciplineId) {
      conditions.push(eq(outcomeTypes.disciplineId, disciplineId));
    }
    if (!includeArchived) {
      conditions.push(isNull(outcomeTypes.archivedAt));
    }

    return await db.query.outcomeTypes.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        discipline: true,
      },
      orderBy: (outcomeTypes, { asc }) => [asc(outcomeTypes.name)],
    });
  }

  /**
   * Clears the default flag across a discipline. Archived rows are skipped: they
   * are out of the running anyway, and rewriting them would churn history.
   */
  async resetDefault(disciplineId: string) {
    await db
      .update(outcomeTypes)
      .set({ isDefault: false })
      .where(and(eq(outcomeTypes.disciplineId, disciplineId), isNull(outcomeTypes.archivedAt)));
  }

  async update(id: string, data: UpdateOutcomeTypeData) {
    const [updated] = await db.update(outcomeTypes).set(data).where(eq(outcomeTypes.id, id)).returning();
    return updated;
  }

  /**
   * Matches played under this outcome type, directly or through one of its
   * reasons. The reasons themselves are not blockers — they cascade, which is
   * what should happen to a type nobody has played under.
   */
  async getDeletionBlockers(id: string): Promise<DeletionBlocker[]> {
    const reasonIds = await db
      .select({ id: outcomeReasons.id })
      .from(outcomeReasons)
      .where(eq(outcomeReasons.outcomeTypeId, id));

    const [byType] = await db.select({ total: count() }).from(matches).where(eq(matches.outcomeTypeId, id));

    const byReason = reasonIds.length
      ? ((
          await db
            .select({ total: count() })
            .from(matches)
            .where(
              inArray(
                matches.outcomeReasonId,
                reasonIds.map((row) => row.id),
              ),
            )
        )[0]?.total ?? 0)
      : 0;

    const total = (byType?.total ?? 0) + byReason;
    return total > 0 ? [{ resource: "matches", count: total }] : [];
  }

  async archive(id: string, actorId: string) {
    const [updated] = await db
      .update(outcomeTypes)
      .set({ archivedAt: new Date(), archivedBy: actorId, isDefault: false })
      .where(and(eq(outcomeTypes.id, id), isNull(outcomeTypes.archivedAt)))
      .returning();
    return updated;
  }

  async restore(id: string) {
    const [updated] = await db
      .update(outcomeTypes)
      .set({ archivedAt: null, archivedBy: null })
      .where(eq(outcomeTypes.id, id))
      .returning();
    return updated;
  }

  async delete(id: string) {
    try {
      await db.delete(outcomeTypes).where(eq(outcomeTypes.id, id));
    } catch (error) {
      handleDatabaseError(error, { operation: "outcome type delete" });
    }
  }
}

export const outcomeTypeRepository = new OutcomeTypeRepository();
