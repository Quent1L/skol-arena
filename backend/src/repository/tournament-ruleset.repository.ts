import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../config/database";
import { disciplines, matches, outcomeReasons, outcomeTypes, tournamentRulesets, tournaments } from "../db/schema";
import type { MatchStatus, TournamentRulesetPayload } from "@skol-arena/shared/types/index";

const EMPTY_PAYLOAD: TournamentRulesetPayload = { discipline: null, outcomeTypes: [] };

export class TournamentRulesetRepository {
  async getByTournamentId(tournamentId: string) {
    return await db.query.tournamentRulesets.findFirst({
      where: eq(tournamentRulesets.tournamentId, tournamentId),
    });
  }

  /**
   * Writes the ruleset in force. Bumps `version` and `appliedAt`, so a
   * propagation is distinguishable from the original seed when reading history.
   */
  async upsert(tournamentId: string, payload: TournamentRulesetPayload) {
    const [row] = await db
      .insert(tournamentRulesets)
      .values({ tournamentId, payload, appliedAt: new Date() })
      .onConflictDoUpdate({
        target: tournamentRulesets.tournamentId,
        set: {
          payload,
          appliedAt: new Date(),
          version: sql`${tournamentRulesets.version} + 1`,
        },
      })
      .returning();
    return row;
  }

  async setRecalcPending(tournamentId: string, at: Date | null) {
    await db
      .update(tournamentRulesets)
      .set({ recalcPendingAt: at })
      .where(eq(tournamentRulesets.tournamentId, tournamentId));
  }

  /**
   * Markers left behind by a worker that died mid-job. Without this sweep the
   * "recalculation running" banner would stay up forever.
   */
  async clearStalePending(olderThan: Date): Promise<number> {
    const cleared = await db
      .update(tournamentRulesets)
      .set({ recalcPendingAt: null })
      .where(and(isNotNull(tournamentRulesets.recalcPendingAt), lt(tournamentRulesets.recalcPendingAt, olderThan)))
      .returning({ tournamentId: tournamentRulesets.tournamentId });
    return cleared.length;
  }

  /**
   * The discipline as it stands right now, shaped as a payload.
   *
   * This is the ONLY place the live discipline tables are read for anything that
   * feeds a calculation — everywhere else reads the stored snapshot. Archived
   * outcome types are included on purpose: a match already tagged with one still
   * has to resolve its points and its multiplier.
   */
  async buildPayloadForDiscipline(disciplineId: string | null | undefined): Promise<TournamentRulesetPayload> {
    if (!disciplineId) return EMPTY_PAYLOAD;

    const discipline = await db.query.disciplines.findFirst({
      where: eq(disciplines.id, disciplineId),
      columns: { id: true, name: true, teamInteractionMode: true },
    });
    if (!discipline) return EMPTY_PAYLOAD;

    const types = await db.query.outcomeTypes.findMany({
      where: eq(outcomeTypes.disciplineId, disciplineId),
      orderBy: [asc(outcomeTypes.name)],
    });

    const reasonsByType = await this.loadReasonsByType(types.map((type) => type.id));

    return {
      discipline: {
        id: discipline.id,
        name: discipline.name,
        teamInteractionMode: discipline.teamInteractionMode,
      },
      outcomeTypes: types.map((type) => ({
        id: type.id,
        name: type.name,
        points: type.points,
        mmrMultiplier: type.mmrMultiplier,
        scoreCountsForMmr: type.scoreCountsForMmr,
        isDefault: type.isDefault,
        archivedAt: type.archivedAt?.toISOString() ?? null,
        reasons: reasonsByType.get(type.id) ?? [],
      })),
    };
  }

  /** Just enough of the tournament to decide whether the snapshot still tracks the discipline. */
  async getSnapshotContext(tournamentId: string) {
    return await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
      columns: { id: true, status: true, mode: true, disciplineId: true },
    });
  }

  /**
   * Competitions a discipline edit could still legitimately reach. Finished ones
   * are never returned: their ruleset is history and must not move.
   */
  async listPropagationTargets(disciplineId: string, enteredStatuses: MatchStatus[]) {
    const rows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        mode: tournaments.mode,
        status: tournaments.status,
        matchCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${matches}
          WHERE ${matches.tournamentId} = ${tournaments.id}
            AND ${inArray(matches.status, enteredStatuses)}
        )`,
        payload: tournamentRulesets.payload,
      })
      .from(tournaments)
      .leftJoin(tournamentRulesets, eq(tournamentRulesets.tournamentId, tournaments.id))
      .where(and(eq(tournaments.disciplineId, disciplineId), sql`${tournaments.status} <> 'finished'`))
      .orderBy(asc(tournaments.name));

    return rows;
  }

  /**
   * The payload a competition should carry: its discipline's outcome types, plus
   * any type its own matches actually reference.
   *
   * That second half is not theoretical. `tournaments.discipline_id` is nullable
   * and used to be set to NULL whenever a discipline was deleted, so there are
   * competitions with matches whose outcome type belongs to a discipline the
   * tournament no longer points at. Including them keeps the snapshot
   * self-sufficient: every id a match carries resolves out of it.
   */
  async buildPayloadForTournament(
    tournamentId: string,
    disciplineId: string | null | undefined,
  ): Promise<TournamentRulesetPayload> {
    const base = await this.buildPayloadForDiscipline(disciplineId);

    const referenced = await db
      .selectDistinct({ id: matches.outcomeTypeId })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));

    const known = new Set(base.outcomeTypes.map((outcome) => outcome.id));
    const missing = referenced.map((row) => row.id).filter((id): id is string => Boolean(id) && !known.has(id!));

    if (missing.length === 0) return base;

    const strays = await db.query.outcomeTypes.findMany({
      where: inArray(outcomeTypes.id, missing),
      orderBy: [asc(outcomeTypes.name)],
    });
    const reasonsByType = await this.loadReasonsByType(strays.map((type) => type.id));

    return {
      ...base,
      outcomeTypes: [
        ...base.outcomeTypes,
        ...strays.map((type) => ({
          id: type.id,
          name: type.name,
          points: type.points,
          mmrMultiplier: type.mmrMultiplier,
          scoreCountsForMmr: type.scoreCountsForMmr,
          isDefault: type.isDefault,
          archivedAt: type.archivedAt?.toISOString() ?? null,
          reasons: reasonsByType.get(type.id) ?? [],
        })),
      ],
    };
  }

  private async loadReasonsByType(outcomeTypeIds: string[]) {
    const byType = new Map<string, { id: string; name: string }[]>();
    if (outcomeTypeIds.length === 0) return byType;

    const reasons = await db.query.outcomeReasons.findMany({
      where: inArray(outcomeReasons.outcomeTypeId, outcomeTypeIds),
      orderBy: [asc(outcomeReasons.name)],
    });

    for (const reason of reasons) {
      const bucket = byType.get(reason.outcomeTypeId) ?? [];
      bucket.push({ id: reason.id, name: reason.name });
      byType.set(reason.outcomeTypeId, bucket);
    }
    return byType;
  }
}

export const tournamentRulesetRepository = new TournamentRulesetRepository();
