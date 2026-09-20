import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { RankedSeasonAutomationInput } from "@skol-arena/shared/types/index";
import { db } from "../config/database";
import { rankedSeasonAutomations, tournaments } from "../db/schema";

export type RankedSeasonAutomationRow =
  typeof rankedSeasonAutomations.$inferSelect;

/** An automation joined to the season it drives — what the rollover job works from. */
export interface DueAutomation {
  automation: RankedSeasonAutomationRow;
  season: typeof tournaments.$inferSelect;
}

export class RankedSeasonAutomationRepository {
  async getByTournamentId(
    tournamentId: string,
  ): Promise<RankedSeasonAutomationRow | null> {
    const row = await db.query.rankedSeasonAutomations.findFirst({
      where: eq(rankedSeasonAutomations.tournamentId, tournamentId),
    });
    return row ?? null;
  }

  /**
   * Creates or replaces the chain settings of a season. The chain state columns
   * (`nextSeasonNumber`, `nextRolloverAt`, `nextSeasonId`, …) are deliberately absent: they
   * belong to the server, and an admin editing a duration must not renumber the chain.
   */
  async upsert(
    tournamentId: string,
    data: RankedSeasonAutomationInput,
  ): Promise<RankedSeasonAutomationRow> {
    const [row] = await db
      .insert(rankedSeasonAutomations)
      .values({ tournamentId, ...data })
      .onConflictDoUpdate({
        target: rankedSeasonAutomations.tournamentId,
        set: data,
      })
      .returning();
    return row;
  }

  /** Caches the number `{n}` will render to on the next rollover. */
  async setNextSeasonNumber(tournamentId: string, next: number): Promise<void> {
    await db
      .update(rankedSeasonAutomations)
      .set({ nextSeasonNumber: next })
      .where(eq(rankedSeasonAutomations.tournamentId, tournamentId));
  }

  /**
   * Seeds the successor's chain settings. A no-op when the row is already there, so a resumed
   * rollover does not renumber the chain it is finishing.
   */
  async createForSuccessor(
    tournamentId: string,
    source: RankedSeasonAutomationRow,
    nextSeasonNumber: number,
  ): Promise<void> {
    await db
      .insert(rankedSeasonAutomations)
      .values({
        tournamentId,
        enabled: source.enabled,
        mode: source.mode,
        durationDays: source.durationDays,
        nameTemplate: source.nameTemplate,
        nextSeasonNumber,
        carryParticipants: source.carryParticipants,
        participantsMinMatches: source.participantsMinMatches,
        carryTiers: source.carryTiers,
        tierScalingMode: source.tierScalingMode,
        carryMmr: source.carryMmr,
        softResetFactor: source.softResetFactor,
      })
      .onConflictDoNothing({ target: rankedSeasonAutomations.tournamentId });
  }

  async delete(tournamentId: string): Promise<void> {
    await db
      .delete(rankedSeasonAutomations)
      .where(eq(rankedSeasonAutomations.tournamentId, tournamentId));
  }

  /**
   * Chains that need work now.
   *
   * Two cases, and the second is what makes the job resumable: an `ongoing` season whose term
   * has passed is the normal rollover, while a `finished` season with no successor is a
   * rollover that died between ending the old season and creating the new one.
   *
   * That second case is chain-only: a `close` automation never gets a successor, so its
   * season would otherwise come back on every tick once finished.
   */
  async listDue(now: Date): Promise<DueAutomation[]> {
    const rows = await db
      .select({ automation: rankedSeasonAutomations, season: tournaments })
      .from(rankedSeasonAutomations)
      .innerJoin(tournaments, eq(tournaments.id, rankedSeasonAutomations.tournamentId))
      .where(
        and(
          eq(rankedSeasonAutomations.enabled, true),
          isNull(rankedSeasonAutomations.nextSeasonId),
          or(
            and(
              eq(tournaments.status, "ongoing"),
              lte(rankedSeasonAutomations.nextRolloverAt, now),
            ),
            and(
              eq(tournaments.status, "finished"),
              eq(rankedSeasonAutomations.mode, "chain"),
            ),
          ),
        ),
      );
    return rows;
  }

  async scheduleRollover(tournamentId: string, at: Date): Promise<void> {
    await db
      .update(rankedSeasonAutomations)
      .set({ nextRolloverAt: at, lastError: null })
      .where(eq(rankedSeasonAutomations.tournamentId, tournamentId));
  }

  /**
   * Stamps the successor. Guarded on `nextSeasonId IS NULL` so two schedulers racing the same
   * chain cannot both claim it — the loser writes nothing and reports it.
   */
  async markRolledOver(tournamentId: string, nextSeasonId: string): Promise<boolean> {
    const updated = await db
      .update(rankedSeasonAutomations)
      .set({ nextSeasonId, lastRolloverAt: sql`now()`, lastError: null })
      .where(
        and(
          eq(rankedSeasonAutomations.tournamentId, tournamentId),
          isNull(rankedSeasonAutomations.nextSeasonId),
        ),
      )
      .returning({ id: rankedSeasonAutomations.id });
    return updated.length > 0;
  }

  /** A `close` automation is done once its season has ended: nothing left to schedule. */
  async markClosed(tournamentId: string): Promise<void> {
    await db
      .update(rankedSeasonAutomations)
      .set({ nextRolloverAt: null, lastRolloverAt: sql`now()`, lastError: null })
      .where(eq(rankedSeasonAutomations.tournamentId, tournamentId));
  }

  async recordError(tournamentId: string, message: string): Promise<void> {
    await db
      .update(rankedSeasonAutomations)
      .set({ lastError: message.slice(0, 500) })
      .where(eq(rankedSeasonAutomations.tournamentId, tournamentId));
  }
}

export const rankedSeasonAutomationRepository =
  new RankedSeasonAutomationRepository();
