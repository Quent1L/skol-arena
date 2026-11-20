import { and, asc, desc, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  MmrHistoryOutcome,
  PlayerRewindPayload,
  RewindArchiveEntry,
  RewindPromotion,
  SeasonRewindPayload,
} from "@skol-arena/shared/types/index";
import { db } from "../config/database";
import type * as schema from "../db/schema";
import {
  appUsers,
  disciplines,
  matches,
  matchSides,
  mmrHistory,
  playerMmr,
  playerSeasonRewinds,
  seasonRewinds,
  tournamentEntryPlayers,
  tournaments,
} from "../db/schema";

type DbTransaction = NodePgDatabase<typeof schema> | typeof db;

/**
 * Postgres caps a statement's parameters, so player payloads go in by chunks.
 * The caller owns the chunking: building every payload up front just to slice it
 * here would hold the whole season's decks in memory at once.
 */
export const REWIND_UPSERT_CHUNK_SIZE = 100;

export interface PlayerRewindRow {
  playerId: string;
  payload: PlayerRewindPayload;
  promotedUntil: Date;
}

export interface StoredPlayerRewind {
  payload: PlayerRewindPayload;
  version: number;
  promotedUntil: Date;
  openedAt: Date | null;
  viewedAt: Date | null;
}

/** One MMR history row, in the chronological order the replay needs. */
export interface SeasonHistoryRow {
  playerId: string;
  matchId: string;
  mmrBefore: number;
  mmrAfter: number;
  mmrDelta: number;
  opponentAvgMmr: number;
  isPlacement: boolean;
  outcome: MmrHistoryOutcome | null;
  playedAt: Date;
}

/** Who played on which side of a season match. */
export interface SeasonSideRow {
  matchId: string;
  position: number;
  playerId: string;
}

export class SeasonRewindRepository {
  /**
   * Every MMR history row of the season, ordered exactly like the deterministic
   * recalculation orders matches (played_at, then match id as a stable
   * tie-break). The replay depends on that order being reproducible: two
   * generations over identical data must produce identical awards.
   */
  async getSeasonHistoryOrdered(seasonId: string): Promise<SeasonHistoryRow[]> {
    const rows = await db
      .select({
        playerId: mmrHistory.playerId,
        matchId: mmrHistory.matchId,
        mmrBefore: mmrHistory.mmrBefore,
        mmrAfter: mmrHistory.mmrAfter,
        mmrDelta: mmrHistory.mmrDelta,
        opponentAvgMmr: mmrHistory.opponentAvgMmr,
        isPlacement: mmrHistory.isPlacement,
        outcome: mmrHistory.outcome,
        playedAt: matches.playedAt,
      })
      .from(mmrHistory)
      .innerJoin(matches, eq(mmrHistory.matchId, matches.id))
      .where(eq(mmrHistory.seasonId, seasonId))
      .orderBy(asc(matches.playedAt), asc(mmrHistory.matchId));

    return rows.map((row) => ({
      ...row,
      outcome: (row.outcome as MmrHistoryOutcome | null) ?? null,
    }));
  }

  /**
   * Side composition of every season match that has MMR history.
   *
   * Ordered, and not incidentally: without an ORDER BY, Postgres is free to hand
   * back a team's members in any order, and that order decides which opponent an
   * upset feat names and which teammate a pair tally is keyed on. Two
   * regenerations over the same data would otherwise produce different awards.
   */
  async getSeasonSides(seasonId: string): Promise<SeasonSideRow[]> {
    return await db
      .selectDistinct({
        matchId: matchSides.matchId,
        position: matchSides.position,
        playerId: tournamentEntryPlayers.playerId,
      })
      .from(matchSides)
      .innerJoin(matches, eq(matchSides.matchId, matches.id))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntryPlayers.entryId, matchSides.entryId))
      .where(eq(matches.tournamentId, seasonId))
      .orderBy(asc(matchSides.matchId), asc(matchSides.position), asc(tournamentEntryPlayers.playerId));
  }

  async getSeasonRewind(seasonId: string): Promise<{
    id: string;
    payload: SeasonRewindPayload;
    version: number;
    disciplineId: string | null;
  } | null> {
    const row = await db.query.seasonRewinds.findFirst({
      where: and(eq(seasonRewinds.seasonId, seasonId), eq(seasonRewinds.scope, "season")),
    });
    if (!row) return null;
    return {
      id: row.id,
      payload: row.payload as SeasonRewindPayload,
      version: row.version,
      disciplineId: row.disciplineId,
    };
  }

  /**
   * The format a season's rewind is already stored in, without dragging its
   * payload along. Generation reads this to decide whether it is allowed to
   * touch the season at all.
   */
  async getStoredVersion(seasonId: string): Promise<number | null> {
    const [row] = await db
      .select({ version: seasonRewinds.version })
      .from(seasonRewinds)
      .where(and(eq(seasonRewinds.seasonId, seasonId), eq(seasonRewinds.scope, "season")))
      .limit(1);

    return row?.version ?? null;
  }

  /**
   * Every rewind covering a season those players took part in. Their name can
   * appear in the season payload (as an award holder), in their own deck and in
   * the decks of everyone they played with or against, so the unit of repair is
   * the whole rewind, not the player's own row.
   */
  async listRewindIdsForPlayers(playerIds: string[]): Promise<string[]> {
    if (playerIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ id: seasonRewinds.id })
      .from(seasonRewinds)
      .innerJoin(playerMmr, eq(playerMmr.seasonId, seasonRewinds.seasonId))
      .where(inArray(playerMmr.playerId, playerIds));

    return rows.map((row) => row.id);
  }

  /** Current names of the given players, to write over the ones a payload froze. */
  async getIdentities(playerIds: string[]): Promise<Map<string, { displayName: string; shortName: string }>> {
    if (playerIds.length === 0) return new Map();
    const rows = await db
      .select({
        id: appUsers.id,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
      })
      .from(appUsers)
      .where(inArray(appUsers.id, playerIds));

    return new Map(rows.map((row) => [row.id, { displayName: row.displayName, shortName: row.shortName }]));
  }

  /** Payloads of one rewind, in the shape the identity rewrite works on. */
  async getPayloadsForRewind(rewindId: string): Promise<{
    season: SeasonRewindPayload | null;
    players: { id: string; payload: PlayerRewindPayload }[];
  }> {
    const [season] = await db
      .select({ payload: seasonRewinds.payload })
      .from(seasonRewinds)
      .where(eq(seasonRewinds.id, rewindId))
      .limit(1);

    const players = await db
      .select({ id: playerSeasonRewinds.id, payload: playerSeasonRewinds.payload })
      .from(playerSeasonRewinds)
      .where(eq(playerSeasonRewinds.rewindId, rewindId));

    return {
      season: (season?.payload as SeasonRewindPayload | undefined) ?? null,
      players: players.map((row) => ({ id: row.id, payload: row.payload as PlayerRewindPayload })),
    };
  }

  /**
   * Writes payloads back without touching `version` or `generated_at`: this is a
   * repair of the names inside a stored format, not a regeneration, and it has
   * to stay legal on a rewind frozen at an older version.
   */
  async rewritePayloads(
    rewindId: string,
    season: SeasonRewindPayload | null,
    players: { id: string; payload: PlayerRewindPayload }[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (season) {
        await tx.update(seasonRewinds).set({ payload: season }).where(eq(seasonRewinds.id, rewindId));
      }
      for (const player of players) {
        await tx
          .update(playerSeasonRewinds)
          .set({ payload: player.payload })
          .where(eq(playerSeasonRewinds.id, player.id));
      }
    });
  }

  async getPlayerRewind(seasonId: string, playerId: string): Promise<StoredPlayerRewind | null> {
    const [row] = await db
      .select({
        payload: playerSeasonRewinds.payload,
        version: playerSeasonRewinds.version,
        promotedUntil: playerSeasonRewinds.promotedUntil,
        openedAt: playerSeasonRewinds.openedAt,
        viewedAt: playerSeasonRewinds.viewedAt,
      })
      .from(playerSeasonRewinds)
      .innerJoin(seasonRewinds, eq(playerSeasonRewinds.rewindId, seasonRewinds.id))
      .where(
        and(
          eq(seasonRewinds.seasonId, seasonId),
          eq(seasonRewinds.scope, "season"),
          eq(playerSeasonRewinds.playerId, playerId),
        ),
      )
      .limit(1);

    if (!row) return null;
    return { ...row, payload: row.payload as PlayerRewindPayload };
  }

  async upsertSeasonRewind(
    seasonId: string,
    disciplineId: string | null,
    payload: SeasonRewindPayload,
    version: number,
    tx: DbTransaction = db,
  ): Promise<string> {
    const [row] = await tx
      .insert(seasonRewinds)
      .values({
        seasonId,
        scope: "season",
        disciplineId,
        payload,
        version,
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: seasonRewinds.seasonId,
        targetWhere: eq(seasonRewinds.scope, "season"),
        set: { payload, version, disciplineId, generatedAt: new Date() },
      })
      .returning({ id: seasonRewinds.id });

    return row!.id;
  }

  /**
   * Rewrites the player payloads without touching the per-player state.
   * promotedUntil, openedAt and viewedAt are deliberately excluded from the
   * conflict update: regenerating a rewind (after an MMR recalculation, say)
   * must not restart the promotion window nor un-watch a deck the player has
   * already been through.
   */
  async upsertPlayerRewindsBatch(
    rewindId: string,
    rows: PlayerRewindRow[],
    version: number,
    tx: DbTransaction = db,
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx
      .insert(playerSeasonRewinds)
      .values(
        rows.map((row) => ({
          rewindId,
          playerId: row.playerId,
          payload: row.payload,
          version,
          generatedAt: new Date(),
          promotedUntil: row.promotedUntil,
        })),
      )
      .onConflictDoUpdate({
        target: [playerSeasonRewinds.rewindId, playerSeasonRewinds.playerId],
        set: {
          payload: sql`excluded.payload`,
          version: sql`excluded.version`,
          generatedAt: sql`excluded.generated_at`,
        },
      });
  }

  /** Drops player decks that no longer belong to the rewind (players wiped by a recalculation). */
  async deleteStalePlayerRewinds(rewindId: string, keepPlayerIds: string[], tx: DbTransaction = db): Promise<void> {
    const scope = eq(playerSeasonRewinds.rewindId, rewindId);
    await tx
      .delete(playerSeasonRewinds)
      .where(keepPlayerIds.length > 0 ? and(scope, notInArray(playerSeasonRewinds.playerId, keepPlayerIds)) : scope);
  }

  async markOpened(seasonId: string, playerId: string): Promise<void> {
    await this.stampOnce(seasonId, playerId, "opened_at");
  }

  async markViewed(seasonId: string, playerId: string): Promise<void> {
    await this.stampOnce(seasonId, playerId, "viewed_at");
  }

  /** Idempotent: the first stamp wins, later calls are no-ops. */
  private async stampOnce(seasonId: string, playerId: string, column: "opened_at" | "viewed_at"): Promise<void> {
    await db.execute(sql`
      UPDATE player_season_rewinds AS p
      SET ${sql.raw(column)} = now()
      FROM season_rewinds AS r
      WHERE p.rewind_id = r.id
        AND r.season_id = ${seasonId}::uuid
        AND r.scope = 'season'
        AND p.player_id = ${playerId}::uuid
        AND p.${sql.raw(column)} IS NULL
    `);
  }

  /** Full archive, newest season first — no promotion window applies here. */
  async listForPlayer(playerId: string): Promise<RewindArchiveEntry[]> {
    const rows = await db
      .select({
        seasonId: tournaments.id,
        seasonName: tournaments.name,
        disciplineName: disciplines.name,
        startDate: tournaments.startDate,
        endDate: tournaments.endDate,
        generatedAt: playerSeasonRewinds.generatedAt,
        viewedAt: playerSeasonRewinds.viewedAt,
      })
      .from(playerSeasonRewinds)
      .innerJoin(seasonRewinds, eq(playerSeasonRewinds.rewindId, seasonRewinds.id))
      .innerJoin(tournaments, eq(seasonRewinds.seasonId, tournaments.id))
      .leftJoin(disciplines, eq(tournaments.disciplineId, disciplines.id))
      .where(eq(playerSeasonRewinds.playerId, playerId))
      .orderBy(desc(tournaments.endDate));

    return rows.map((row) => ({
      seasonId: row.seasonId,
      seasonName: row.seasonName,
      disciplineName: row.disciplineName ?? null,
      startDate: new Date(row.startDate),
      endDate: new Date(row.endDate),
      generatedAt: row.generatedAt,
      viewedAt: row.viewedAt,
    }));
  }

  /**
   * The rewind to put in front of the player right now: still inside its
   * promotion window and not watched to the end. Returns the most recent one so
   * two seasons closing back to back never fight over the home page.
   */
  async getPromotedForPlayer(playerId: string): Promise<RewindPromotion | null> {
    const [row] = await db
      .select({
        seasonId: tournaments.id,
        seasonName: tournaments.name,
        disciplineName: disciplines.name,
        endDate: tournaments.endDate,
        promotedUntil: playerSeasonRewinds.promotedUntil,
        openedAt: playerSeasonRewinds.openedAt,
      })
      .from(playerSeasonRewinds)
      .innerJoin(seasonRewinds, eq(playerSeasonRewinds.rewindId, seasonRewinds.id))
      .innerJoin(tournaments, eq(seasonRewinds.seasonId, tournaments.id))
      .leftJoin(disciplines, eq(tournaments.disciplineId, disciplines.id))
      .where(
        and(
          eq(playerSeasonRewinds.playerId, playerId),
          isNull(playerSeasonRewinds.viewedAt),
          gt(playerSeasonRewinds.promotedUntil, new Date()),
        ),
      )
      .orderBy(desc(playerSeasonRewinds.promotedUntil))
      .limit(1);

    if (!row) return null;
    return {
      seasonId: row.seasonId,
      seasonName: row.seasonName,
      disciplineName: row.disciplineName ?? null,
      endDate: new Date(row.endDate),
      promotedUntil: row.promotedUntil,
      openedAt: row.openedAt,
    };
  }
}

export const seasonRewindRepository = new SeasonRewindRepository();
