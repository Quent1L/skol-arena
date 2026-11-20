import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../config/database";
import { disciplines, matches, outcomeTypes, rules, tournaments } from "../db/schema";
import { handleDatabaseError } from "../utils/db-errors";
import type { DeletionBlocker } from "@skol-arena/shared/types/index";

export interface CreateDisciplineData {
  name: string;
  icon?: string | null;
  scoreInstructions?: string | null;
  teamInteractionMode?: "INDIVIDUAL" | "SHARED_RESOURCE" | "COLLABORATIVE" | null;
}

export interface UpdateDisciplineData {
  name?: string;
  icon?: string | null;
  scoreInstructions?: string | null;
  teamInteractionMode?: "INDIVIDUAL" | "SHARED_RESOURCE" | "COLLABORATIVE" | null;
}

export class DisciplineRepository {
  async create(data: CreateDisciplineData) {
    const [discipline] = await db.insert(disciplines).values(data).returning();
    return discipline;
  }

  /** Resolves archived disciplines too: past results still have to render. */
  async getById(id: string) {
    return await db.query.disciplines.findFirst({
      where: eq(disciplines.id, id),
    });
  }

  async list(includeArchived = false) {
    return await db.query.disciplines.findMany({
      where: includeArchived ? undefined : isNull(disciplines.archivedAt),
      orderBy: (disciplines, { asc }) => [asc(disciplines.name)],
    });
  }

  async update(id: string, data: UpdateDisciplineData) {
    const [updated] = await db.update(disciplines).set(data).where(eq(disciplines.id, id)).returning();
    return updated;
  }

  /**
   * Everything a permanent deletion would destroy.
   *
   * Outcome types are deliberately absent: they cascade, which is the wanted
   * behaviour for a discipline nobody has played under yet. What must block is
   * anything that would lose data — a tournament or a rule pointing at it (both
   * `set null`, so they would silently forget their discipline) and any match
   * played under one of its outcome types.
   */
  async getDeletionBlockers(id: string): Promise<DeletionBlocker[]> {
    const outcomeTypeIds = await db
      .select({ id: outcomeTypes.id })
      .from(outcomeTypes)
      .where(eq(outcomeTypes.disciplineId, id));

    const [tournamentRow] = await db
      .select({ total: count() })
      .from(tournaments)
      .where(eq(tournaments.disciplineId, id));

    const [ruleRow] = await db.select({ total: count() }).from(rules).where(eq(rules.disciplineId, id));

    const matchTotal = outcomeTypeIds.length
      ? ((
          await db
            .select({ total: count() })
            .from(matches)
            .where(
              inArray(
                matches.outcomeTypeId,
                outcomeTypeIds.map((row) => row.id),
              ),
            )
        )[0]?.total ?? 0)
      : 0;

    const blockers: DeletionBlocker[] = [];
    if (tournamentRow?.total) blockers.push({ resource: "tournaments", count: tournamentRow.total });
    if (ruleRow?.total) blockers.push({ resource: "rules", count: ruleRow.total });
    if (matchTotal) blockers.push({ resource: "matches", count: matchTotal });
    return blockers;
  }

  async archive(id: string, actorId: string) {
    const [updated] = await db
      .update(disciplines)
      .set({ archivedAt: new Date(), archivedBy: actorId })
      .where(and(eq(disciplines.id, id), isNull(disciplines.archivedAt)))
      .returning();
    return updated;
  }

  async restore(id: string) {
    const [updated] = await db
      .update(disciplines)
      .set({ archivedAt: null, archivedBy: null })
      .where(eq(disciplines.id, id))
      .returning();
    return updated;
  }

  async delete(id: string) {
    try {
      await db.delete(disciplines).where(eq(disciplines.id, id));
    } catch (error) {
      // The cascade into outcome_types stops on the restrict from matches, so a
      // discipline the preflight cleared but that raced a match entry lands here.
      handleDatabaseError(error, { operation: "discipline delete" });
    }
  }
}

export const disciplineRepository = new DisciplineRepository();
