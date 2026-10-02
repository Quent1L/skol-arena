import { eq, and, inArray, sql, desc, max } from "drizzle-orm";
import { db } from "../config/database";
import {
  appUsers,
  tournaments,
  tournamentEntries,
  tournamentEntryPlayers,
  matches,
  matchSides,
  matchPlayerPoints,
  disciplines,
  outcomeTypes,
} from "../db/schema";
import { organizationVisibilityCondition } from "./organization-visibility";

export class PlayerStatsRepository {
  async getPlayerProfile(playerId: string) {
    return db.query.appUsers.findFirst({
      where: eq(appUsers.id, playerId),
      columns: { id: true, displayName: true, shortName: true },
    });
  }

  /**
   * `visibleOrganizationIds` leaves out the competitions of organizations the viewer
   * is not part of (null: no restriction). Every stat is derived from these entries,
   * so filtering them here scopes the whole page.
   */
  async getPlayerEntries(
    playerId: string,
    filters?: { tournamentId?: string; disciplineId?: string; tournamentMode?: string; teamMode?: string; allowedModes?: string[] },
    visibleOrganizationIds: string[] | null = null,
  ) {
    const conditions = [
      eq(tournamentEntryPlayers.playerId, playerId),
      organizationVisibilityCondition(tournaments.organizationId, visibleOrganizationIds),
    ];

    const entries = await db
      .select({
        entryId: tournamentEntries.id,
        tournamentId: tournaments.id,
        tournamentName: tournaments.name,
        tournamentMode: tournaments.mode,
        teamMode: tournaments.teamMode,
        disciplineId: tournaments.disciplineId,
        disciplineName: disciplines.name,
      })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .innerJoin(tournaments, eq(tournamentEntries.tournamentId, tournaments.id))
      .leftJoin(disciplines, eq(tournaments.disciplineId, disciplines.id))
      .where(and(...conditions));

    return entries.filter((e) => {
      if (filters?.tournamentId && e.tournamentId !== filters.tournamentId) return false;
      if (filters?.disciplineId && e.disciplineId !== filters.disciplineId) return false;
      if (filters?.tournamentMode && e.tournamentMode !== filters.tournamentMode) return false;
      if (filters?.teamMode && e.teamMode !== filters.teamMode) return false;
      if (filters?.allowedModes?.length && !filters.allowedModes.includes(e.tournamentMode)) return false;
      return true;
    });
  }

  async getEntryPlayerCounts(entryIds: string[]): Promise<Map<string, number>> {
    if (entryIds.length === 0) return new Map();
    const rows = await db
      .select({
        entryId: tournamentEntryPlayers.entryId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(tournamentEntryPlayers)
      .where(inArray(tournamentEntryPlayers.entryId, entryIds))
      .groupBy(tournamentEntryPlayers.entryId);
    return new Map(rows.map((r) => [r.entryId, r.count]));
  }

  async getPlayerMatchResults(playerEntryIds: string[], playerId: string) {
    if (playerEntryIds.length === 0) return [];

    return db
      .select({
        matchId: matchSides.matchId,
        entryId: matchSides.entryId,
        ownScore: matchSides.score,
        ownPosition: matchSides.position,
        winnerSide: matches.winnerSide,
        oppEntryId: sql<string>`ms2.entry_id`,
        oppScore: sql<number>`ms2.score`,
        allowDraw: tournaments.allowDraw,
        pointsAwarded: sql<number | null>`COALESCE(${matchPlayerPoints.pointsAwarded}, ${matchSides.pointsAwarded})`,
        outcomeTypeId: matches.outcomeTypeId,
      })
      .from(matchSides)
      .innerJoin(sql`match_sides ms2`, sql`${matchSides.matchId} = ms2.match_id AND ms2.entry_id != ${matchSides.entryId}`)
      .innerJoin(matches, eq(matchSides.matchId, matches.id))
      .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(tournaments, eq(tournamentEntries.tournamentId, tournaments.id))
      .leftJoin(
        matchPlayerPoints,
        and(
          eq(matchPlayerPoints.matchId, matchSides.matchId),
          eq(matchPlayerPoints.playerId, sql`${playerId}::uuid`),
        ),
      )
      .where(and(inArray(matchSides.entryId, playerEntryIds), eq(matches.status, "finalized")));
  }

  async getPlayersInEntries(entryIds: string[]) {
    if (entryIds.length === 0) return [];

    return db
      .select({
        entryId: tournamentEntryPlayers.entryId,
        playerId: tournamentEntryPlayers.playerId,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
      })
      .from(tournamentEntryPlayers)
      .innerJoin(appUsers, eq(tournamentEntryPlayers.playerId, appUsers.id))
      .where(inArray(tournamentEntryPlayers.entryId, entryIds));
  }

  async getPlayerMatchHistory(
    playerId: string,
    filters: { limit?: number; offset?: number; tournamentId?: string },
  ) {
    const { limit = 10, offset = 0, tournamentId } = filters;

    const conditions = [eq(tournamentEntryPlayers.playerId, playerId)];
    if (tournamentId) {
      conditions.push(eq(matches.tournamentId, tournamentId));
    }

    // Use GROUP BY to deduplicate matches (a player may appear multiple times
    // via different entry_player rows). All non-aggregate fields are deterministic
    // per match (same tournament, same playedAt, etc.) so MAX() is just a formality.
    return db
      .select({
        matchId: matches.id,
        tournamentId: tournaments.id,
        tournamentName: tournaments.name,
        tournamentMode: tournaments.mode,
        tournamentScoreEnabled: tournaments.scoreEnabled,
        playedAt: max(matches.playedAt),
        status: max(matches.status),
        winnerSide: max(matches.winnerSide),
        scoreA: sql<number | null>`(SELECT score FROM match_sides WHERE match_id = ${matches.id} AND position = 1 LIMIT 1)`,
        scoreB: sql<number | null>`(SELECT score FROM match_sides WHERE match_id = ${matches.id} AND position = 2 LIMIT 1)`,
        teamSizeA: sql<number>`(
          SELECT COUNT(*) FROM tournament_entry_players tep2
          JOIN match_sides ms2 ON ms2.entry_id = tep2.entry_id
          WHERE ms2.match_id = ${matches.id} AND ms2.position = 1
        )`.mapWith(Number),
        teamSizeB: sql<number>`(
          SELECT COUNT(*) FROM tournament_entry_players tep2
          JOIN match_sides ms2 ON ms2.entry_id = tep2.entry_id
          WHERE ms2.match_id = ${matches.id} AND ms2.position = 2
        )`.mapWith(Number),
        mmrDelta: sql<number | null>`(
          SELECT mmr_delta FROM mmr_history
          WHERE match_id = ${matches.id} AND player_id = ${playerId}
          LIMIT 1
        )`,
        outcomeTypeId: matches.outcomeTypeId,
        outcomeTypeName: sql<string | null>`(
          SELECT name FROM outcome_types
          WHERE id = ${matches.outcomeTypeId}
          LIMIT 1
        )`,
      })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .innerJoin(matchSides, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(matches, eq(matchSides.matchId, matches.id))
      .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(and(...conditions))
      .groupBy(matches.id, tournaments.id, tournaments.name, tournaments.mode, tournaments.scoreEnabled)
      .orderBy(desc(max(matches.playedAt)))
      .limit(limit)
      .offset(offset);
  }

  async getMatchPlayersForSides(matchIds: string[]) {
    if (matchIds.length === 0) return [];
    return db.query.matchSides.findMany({
      where: inArray(matchSides.matchId, matchIds),
      with: {
        entry: {
          with: {
            players: {
              with: { player: true },
            },
          },
        },
      },
    });
  }

  async getPlayerRecentForm(
    playerId: string,
    limit = 10,
    tournamentId?: string,
    visibleOrganizationIds: string[] | null = null,
  ) {
    const conditions = [
      eq(tournamentEntryPlayers.playerId, playerId),
      eq(matches.status, "finalized"),
      organizationVisibilityCondition(tournaments.organizationId, visibleOrganizationIds),
      ...(tournamentId ? [eq(matches.tournamentId, tournamentId)] : []),
    ];
    return db
      .select({
        matchId: matches.id,
        ownPosition: sql<number>`MAX(${matchSides.position})`.mapWith(Number),
        winnerSide: sql<string | null>`MAX(${matches.winnerSide})`,
        allowDraw: sql<boolean>`BOOL_OR(${tournaments.allowDraw})`,
      })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .innerJoin(matchSides, eq(matchSides.entryId, tournamentEntries.id))
      .innerJoin(matches, eq(matchSides.matchId, matches.id))
      .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(and(...conditions))
      .groupBy(matches.id)
      .orderBy(desc(max(matches.playedAt)))
      .limit(limit);
  }

  async getOutcomeTypeNames(outcomeTypeIds: string[]) {
    if (outcomeTypeIds.length === 0) return [];
    return db
      .select({ id: outcomeTypes.id, name: outcomeTypes.name })
      .from(outcomeTypes)
      .where(inArray(outcomeTypes.id, outcomeTypeIds));
  }

  async getPlayerTournaments(playerId: string, visibleOrganizationIds: string[] | null = null) {
    return db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        mode: tournaments.mode,
        teamMode: tournaments.teamMode,
        disciplineId: tournaments.disciplineId,
        disciplineName: disciplines.name,
      })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .innerJoin(tournaments, eq(tournamentEntries.tournamentId, tournaments.id))
      .leftJoin(disciplines, eq(tournaments.disciplineId, disciplines.id))
      .where(
        and(
          eq(tournamentEntryPlayers.playerId, playerId),
          organizationVisibilityCondition(tournaments.organizationId, visibleOrganizationIds),
        ),
      )
      .groupBy(tournaments.id, disciplines.name);
  }

  async getPlayerIdsByTournament(tournamentId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ playerId: tournamentEntryPlayers.playerId })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .where(eq(tournamentEntries.tournamentId, tournamentId));
    return rows.map((r) => r.playerId);
  }

  async getPlayerIdsByTournaments(tournamentIds: string[]): Promise<string[]> {
    if (tournamentIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ playerId: tournamentEntryPlayers.playerId })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .where(inArray(tournamentEntries.tournamentId, tournamentIds));
    return rows.map((r) => r.playerId);
  }

  /** Lean counterpart of getPlayerTournaments: ids only, for several players at once. */
  async getTournamentIdsByPlayers(playerIds: string[]): Promise<string[]> {
    if (playerIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ tournamentId: tournamentEntries.tournamentId })
      .from(tournamentEntryPlayers)
      .innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .where(inArray(tournamentEntryPlayers.playerId, playerIds));
    return rows.map((r) => r.tournamentId);
  }

}

export const playerStatsRepository = new PlayerStatsRepository();
