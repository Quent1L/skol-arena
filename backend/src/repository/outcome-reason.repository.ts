import { eq, and, count } from "drizzle-orm";
import { db } from "../config/database";
import { matches, outcomeReasons } from "../db/schema";
import { handleDatabaseError } from "../utils/db-errors";
import type { DeletionBlocker } from "@skol-arena/shared/types/index";

export interface CreateOutcomeReasonData {
  outcomeTypeId: string;
  name: string;
}

export interface UpdateOutcomeReasonData {
  outcomeTypeId?: string;
  name?: string;
}

export class OutcomeReasonRepository {
  async create(data: CreateOutcomeReasonData) {
    const [outcomeReason] = await db.insert(outcomeReasons).values(data).returning();
    return outcomeReason;
  }

  async getById(id: string) {
    return await db.query.outcomeReasons.findFirst({
      where: eq(outcomeReasons.id, id),
      with: {
        outcomeType: {
          with: {
            discipline: true,
          },
        },
      },
    });
  }

  async list(outcomeTypeId?: string) {
    const conditions = [];

    if (outcomeTypeId) {
      conditions.push(eq(outcomeReasons.outcomeTypeId, outcomeTypeId));
    }

    return await db.query.outcomeReasons.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        outcomeType: {
          with: {
            discipline: true,
          },
        },
      },
      orderBy: (outcomeReasons, { asc }) => [asc(outcomeReasons.name)],
    });
  }

  async update(id: string, data: UpdateOutcomeReasonData) {
    const [updated] = await db.update(outcomeReasons).set(data).where(eq(outcomeReasons.id, id)).returning();
    return updated;
  }

  /**
   * A reason has no archived state of its own — it is a label on an outcome type.
   * It simply cannot be deleted once a match was recorded with it.
   */
  async getDeletionBlockers(id: string): Promise<DeletionBlocker[]> {
    const [row] = await db.select({ total: count() }).from(matches).where(eq(matches.outcomeReasonId, id));

    return row?.total ? [{ resource: "matches", count: row.total }] : [];
  }

  async delete(id: string) {
    try {
      await db.delete(outcomeReasons).where(eq(outcomeReasons.id, id));
    } catch (error) {
      handleDatabaseError(error, { operation: "outcome reason delete" });
    }
  }
}

export const outcomeReasonRepository = new OutcomeReasonRepository();
