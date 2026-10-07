import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db } from "../config/database";
import { mmrAnimationEvents, matches, matchSides, tournamentEntries, tournamentEntryPlayers, appUsers } from "../db/schema";

// One match's stored official deltas: mmrDelta is the full match delta (sync
// key); seenDelta is the full delta as of the player's last view (displayDelta
// baseline).
export interface EventDelta {
  id: string;
  mmrDelta: number;
  seenDelta: number;
  /** The player opened this event at least once. Set by the multi-player read only. */
  viewed?: boolean;
}

export interface UpsertMmrAnimationEventData {
  playerId: string;
  seasonId: string;
  matchId: string;
  eventType: "provisional" | "official";
  reason: string;
  mmrBefore: number;
  mmrAfter: number;
  mmrDelta: number;
  displayDelta: number;
  tierBeforeLevel: number | null;
  tierAfterLevel: number | null;
  tierBeforeName: string | null;
  tierAfterName: string | null;
  rankChanged: boolean;
  /**
   * Rules-engine message for this animation. Written with the row so the event is
   * never briefly readable without it — `getPendingForPlayer` serves a row as soon
   * as it exists, and a second-step UPDATE left a window serving the generic
   * encouragement instead.
   */
  message?: string | null;
}

export class MmrAnimationEventRepository {
  async upsert(data: UpsertMmrAnimationEventData) {
    const [row] = await db
      .insert(mmrAnimationEvents)
      .values(data)
      .onConflictDoUpdate({
        target: [
          mmrAnimationEvents.playerId,
          mmrAnimationEvents.seasonId,
          mmrAnimationEvents.matchId,
          mmrAnimationEvents.eventType,
        ],
        set: {
          mmrBefore: data.mmrBefore,
          mmrAfter: data.mmrAfter,
          mmrDelta: data.mmrDelta,
          displayDelta: data.displayDelta,
          tierBeforeLevel: data.tierBeforeLevel,
          tierAfterLevel: data.tierAfterLevel,
          tierBeforeName: data.tierBeforeName,
          tierAfterName: data.tierAfterName,
          rankChanged: data.rankChanged,
          reason: data.reason,
          // A re-finalization that carries no message must not wipe the stored one.
          message: data.message ?? sql`${mmrAnimationEvents.message}`,
          viewedAt: null,
        },
      })
      .returning();
    return row;
  }

  // Single round-trip insert for many events (recalc / cancellation cascade).
  // Same conflict target/set as upsert: re-syncs deltas and re-arms the
  // animation (viewedAt: null) so the player sees the recalculated matches.
  async bulkUpsert(rows: UpsertMmrAnimationEventData[]) {
    if (rows.length === 0) return [];
    return await db
      .insert(mmrAnimationEvents)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          mmrAnimationEvents.playerId,
          mmrAnimationEvents.seasonId,
          mmrAnimationEvents.matchId,
          mmrAnimationEvents.eventType,
        ],
        set: {
          mmrBefore: sql`excluded.mmr_before`,
          mmrAfter: sql`excluded.mmr_after`,
          mmrDelta: sql`excluded.mmr_delta`,
          displayDelta: sql`excluded.display_delta`,
          tierBeforeLevel: sql`excluded.tier_before_level`,
          tierAfterLevel: sql`excluded.tier_after_level`,
          tierBeforeName: sql`excluded.tier_before_name`,
          tierAfterName: sql`excluded.tier_after_name`,
          rankChanged: sql`excluded.rank_changed`,
          reason: sql`excluded.reason`,
          viewedAt: sql`null`,
        },
      })
      .returning();
  }

  async getPendingForPlayer(playerId: string, seasonId: string) {
    const events = await db.query.mmrAnimationEvents.findMany({
      where: and(
        eq(mmrAnimationEvents.playerId, playerId),
        eq(mmrAnimationEvents.seasonId, seasonId),
        isNull(mmrAnimationEvents.viewedAt),
      ),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
    if (events.length === 0) return events.map((e) => ({ ...e, opponents: [], teammates: [] }));
    const matchIds = events.map((e) => e.matchId);
    const { opponents, teammates } = await this.fetchMatchParticipants(matchIds, playerId);
    const playedAtMap = await this.fetchPlayedAtByMatchIds(matchIds);
    return events.map((e) => ({
      ...e,
      opponents: opponents.get(e.matchId) ?? [],
      teammates: teammates.get(e.matchId) ?? [],
      playedAt: playedAtMap.get(e.matchId),
    }));
  }

  private async fetchMatchParticipants(
    matchIds: string[],
    playerId: string,
  ): Promise<{
    opponents: Map<string, { id: string; displayName: string; shortName: string }[]>;
    teammates: Map<string, { id: string; displayName: string; shortName: string }[]>;
  }> {
    const rows = await db
      .select({
        matchId: matchSides.matchId,
        sidePosition: matchSides.position,
        playerId: tournamentEntryPlayers.playerId,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
      })
      .from(matchSides)
      .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
      .innerJoin(appUsers, eq(tournamentEntryPlayers.playerId, appUsers.id))
      .where(inArray(matchSides.matchId, matchIds));

    const mySideByMatch = new Map<string, number>();
    for (const row of rows) {
      if (row.playerId === playerId) mySideByMatch.set(row.matchId, row.sidePosition);
    }

    const opponents = new Map<string, { id: string; displayName: string; shortName: string }[]>();
    const teammates = new Map<string, { id: string; displayName: string; shortName: string }[]>();
    for (const row of rows) {
      const mySide = mySideByMatch.get(row.matchId);
      if (mySide === undefined || row.playerId === playerId) continue;
      const target = row.sidePosition === mySide ? teammates : opponents;
      const list = target.get(row.matchId) ?? [];
      list.push({ id: row.playerId, displayName: row.displayName, shortName: row.shortName });
      target.set(row.matchId, list);
    }
    return { opponents, teammates };
  }

  private async fetchPlayedAtByMatchIds(matchIds: string[]): Promise<Map<string, Date>> {
    const rows = await db
      .select({ id: matches.id, playedAt: matches.playedAt })
      .from(matches)
      .where(inArray(matches.id, matchIds));
    return new Map(rows.map((r) => [r.id, r.playedAt]));
  }

  async getOfficialEventDeltasByPlayer(
    seasonId: string,
    playerId: string,
  ): Promise<Map<string, EventDelta>> {
    const rows = await db
      .select({
        id: mmrAnimationEvents.id,
        matchId: mmrAnimationEvents.matchId,
        mmrDelta: mmrAnimationEvents.mmrDelta,
        seenDelta: mmrAnimationEvents.seenDelta,
      })
      .from(mmrAnimationEvents)
      .where(
        and(
          eq(mmrAnimationEvents.playerId, playerId),
          eq(mmrAnimationEvents.seasonId, seasonId),
          eq(mmrAnimationEvents.eventType, "official"),
        ),
      );
    return new Map(rows.map((r) => [r.matchId, { id: r.id, mmrDelta: r.mmrDelta, seenDelta: r.seenDelta ?? 0 }]));
  }

  // Multi-player variant of getOfficialEventDeltasByPlayer: one query for the
  // whole cascade. Returns playerId -> (matchId -> EventDelta).
  async getOfficialEventDeltasForPlayers(
    seasonId: string,
    playerIds: string[],
  ): Promise<Map<string, Map<string, EventDelta>>> {
    const result = new Map<string, Map<string, EventDelta>>();
    if (playerIds.length === 0) return result;
    const rows = await db
      .select({
        id: mmrAnimationEvents.id,
        playerId: mmrAnimationEvents.playerId,
        matchId: mmrAnimationEvents.matchId,
        mmrDelta: mmrAnimationEvents.mmrDelta,
        seenDelta: mmrAnimationEvents.seenDelta,
        viewedAt: mmrAnimationEvents.viewedAt,
      })
      .from(mmrAnimationEvents)
      .where(
        and(
          eq(mmrAnimationEvents.seasonId, seasonId),
          inArray(mmrAnimationEvents.playerId, playerIds),
          eq(mmrAnimationEvents.eventType, "official"),
        ),
      );
    for (const r of rows) {
      const byMatch = result.get(r.playerId) ?? new Map();
      const seenDelta = r.seenDelta ?? 0;
      byMatch.set(r.matchId, { id: r.id, mmrDelta: r.mmrDelta, seenDelta, viewed: r.viewedAt !== null || seenDelta !== 0 });
      result.set(r.playerId, byMatch);
    }
    return result;
  }

  // A corrected match's message was written for the result it no longer has.
  async clearMessageForMatch(seasonId: string, matchId: string, playerIds: string[]) {
    if (playerIds.length === 0) return;
    await db
      .update(mmrAnimationEvents)
      .set({ message: null })
      .where(
        and(
          eq(mmrAnimationEvents.seasonId, seasonId),
          eq(mmrAnimationEvents.matchId, matchId),
          inArray(mmrAnimationEvents.playerId, playerIds),
        ),
      );
  }

  // A cancelled match the player never saw: its finalization event is still
  // pending and would surface in the recap as a match actually played. Retire
  // it — viewed, nothing to display — rather than delete it, so a rule firing
  // pointing at it keeps its link.
  async retireUnseenForMatch(seasonId: string, matchId: string, playerIds: string[]) {
    if (playerIds.length === 0) return;
    await db
      .update(mmrAnimationEvents)
      .set({ viewedAt: new Date(), reason: "match_cancelled", displayDelta: 0 })
      .where(
        and(
          eq(mmrAnimationEvents.seasonId, seasonId),
          eq(mmrAnimationEvents.matchId, matchId),
          inArray(mmrAnimationEvents.playerId, playerIds),
          isNull(mmrAnimationEvents.viewedAt),
          eq(mmrAnimationEvents.seenDelta, 0),
        ),
      );
  }

  // Mark events viewed and advance their seenDelta baseline to the current full
  // delta — so a later recalc of the same match shows only the change since now.
  async markViewed(ids: string[]) {
    if (ids.length === 0) return;
    await db
      .update(mmrAnimationEvents)
      .set({ viewedAt: new Date(), seenDelta: sql`${mmrAnimationEvents.mmrDelta}` })
      .where(inArray(mmrAnimationEvents.id, ids));
  }
}

export const mmrAnimationEventRepository = new MmrAnimationEventRepository();
