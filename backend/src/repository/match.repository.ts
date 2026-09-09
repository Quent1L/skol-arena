import { eq, and, ne, sql, count, inArray, isNull, or, lt, desc } from "drizzle-orm";
import { db } from "../config/database";
import {
  matches,
  matchSides,
  matchPlayerPoints,
  mmrHistory,
  tournamentEntries,
  tournamentEntryPlayers,
  teams,
  tournaments,
  appUsers,
  tournamentParticipants,
} from "../db/schema";
import {
  type MatchStatus,
  type MatchFinalizationReason,
  type ListMatchCardsQuery,
  type ClientMatchDetail,
  type MatchDetailSide,
  type MatchDetailPlayer,
  type TournamentScoringConfig,
  resolveScoringConfig,
  resolveRulesetOutcome,
  ENTERED_MATCH_STATUSES,
} from "@skol-arena/shared";
import { TOURNAMENT_CONFIGS_WITH } from "./tournament-config.columns";
import { entryRepository } from "./entry.repository";
import { matchSidesRepository } from "./match-sides.repository";
import { matchResultRepository } from "./match-result.repository";

// Type for synthetic team object
type AppUser = typeof appUsers.$inferSelect;

export interface SyntheticTeamParticipant {
  user: AppUser;
}

export interface SyntheticTeam {
  id?: string;
  name?: string | null;
  participants: SyntheticTeamParticipant[];
}

export interface CreateMatchSideData {
  position: number;
  playerIds?: string[];
  teamId?: string;
}

export interface CreateMatchData {
  tournamentId: string;
  sides: CreateMatchSideData[];
  scoreA?: number | null;
  scoreB?: number | null;
  winnerPosition?: number | null;
  status?: MatchStatus;
  reportedBy?: string;
  reportProof?: string;
  confirmationDeadline?: Date;
  playedAt?: Date;
  outcomeTypeId?: string;
  outcomeReasonId?: string;
  createdBy?: string;
}

export interface UpdateMatchData {
  scoreA?: number | null;
  scoreB?: number | null;
  winnerPosition?: number | null;
  status?: MatchStatus;
  reportedBy?: string;
  reportProof?: string;
  confirmationDeadline?: Date | null;
  finalizedAt?: Date;
  finalizedBy?: string;
  finalizationReason?: MatchFinalizationReason;
  playedAt?: Date;
  outcomeTypeId?: string;
  outcomeReasonId?: string;
}

export interface MatchFilters {
  tournamentId?: string;
  status?: MatchStatus;
  playerId?: string;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type MatchOutcome = { isDraw: boolean; isAWinner: boolean; winnerSide: "A" | "B" | null };

function resolveMatchOutcome(
  data: { winnerPosition?: number | null },
  scoreA: number,
  scoreB: number,
): MatchOutcome {
  const hasExplicitWinner = data.winnerPosition !== undefined;
  const isDraw = hasExplicitWinner ? data.winnerPosition === null : scoreA === scoreB;
  const isAWinner = hasExplicitWinner ? data.winnerPosition === 1 : scoreA > scoreB;
  let winnerSide: "A" | "B" | null = null;
  if (!isDraw) winnerSide = isAWinner ? "A" : "B";
  return { isDraw, isAWinner, winnerSide };
}

function computeSidePoints(
  tournament: { scoringConfig?: TournamentScoringConfig | null },
  outcome: MatchOutcome,
): { a: number; b: number } {
  const { pointPerVictory: win, pointPerDraw: draw, pointPerLoss: loss } =
    resolveScoringConfig(tournament.scoringConfig);
  if (outcome.isDraw) return { a: draw, b: draw };
  return outcome.isAWinner ? { a: win, b: loss } : { a: loss, b: win };
}

export class MatchRepository {
  /**
   * Create a new match
   */
  async create(data: CreateMatchData) {
    return await db.transaction(async (tx) => {
      // 1. Create match record (no teamIds/scores anymore)
      const [match] = await tx
        .insert(matches)
        .values({
          tournamentId: data.tournamentId,
          status: data.status ?? "scheduled",
          playedAt: data.playedAt ?? new Date(),
          confirmationDeadline: data.confirmationDeadline,
          outcomeTypeId: data.outcomeTypeId,
          outcomeReasonId: data.outcomeReasonId,
          createdBy: data.createdBy,
        })
        .returning();

      // 2. Get tournament for points calculation (use tx to avoid deadlock on PGlite)
      const tournament = await tx.query.tournaments.findFirst({
        where: eq(tournaments.id, data.tournamentId),
        with: TOURNAMENT_CONFIGS_WITH,
      });
      if (!tournament) {
        throw new Error("Tournament not found");
      }

      // 3. Get or create entries for each side
      const resolvedSides = await Promise.all(
        data.sides.map(async (side) => {
          const entry = await entryRepository.getOrCreateForMatch(
            data.tournamentId,
            side.teamId,
            side.playerIds,
            tx,
          );
          if (!entry) throw new Error("Failed to create or find entry");
          return { ...side, entry };
        })
      );

      // 4. Determine winner and calculate points (sides model: winnerPosition = winning side's position)
      const calcScoreA = data.scoreA ?? 0;
      const calcScoreB = data.scoreB ?? 0;
      const outcome = resolveMatchOutcome(data, calcScoreA, calcScoreB);

      await tx
        .update(matches)
        .set({ winnerSide: outcome.winnerSide })
        .where(eq(matches.id, match.id));

      const scoreByPosition: Record<number, number> = {
        1: data.scoreA ?? 0,
        2: data.scoreB ?? 0,
      };

      // 5. Create match_sides for all sides
      const points = computeSidePoints(tournament, outcome);
      const sidesData = resolvedSides.map((rs) => ({
        entryId: rs.entry.id,
        position: rs.position,
        score: scoreByPosition[rs.position] ?? 0,
        pointsAwarded: rs.position === 1 ? points.a : points.b,
      }));
      await matchSidesRepository.createSides(match.id, sidesData, tx);

      // 6. Create match_results if reported
      if (
        data.status &&
        ["reported", "confirmed", "finalized"].includes(data.status)
      ) {
        await matchResultRepository.create(
          match.id,
          {
            reportedBy: data.reportedBy,
            reportedAt: new Date(),
            reportProof: data.reportProof,
          },
          tx,
        );
      }

      return match.id;
    });
  }

  async getById(id: string): Promise<ClientMatchDetail | null> {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, id),
      with: {
        // The ruleset travels with the tournament: outcome labels come from the
        // snapshot the match was played under, not from the live rows.
        tournament: { with: { ruleset: true } },
        creator: true,
        confirmations: {
          with: {
            player: true,
          },
        },
      },
    });

    if (!match) return null;

    // A match with no outcome type keeps a null label rather than the default
    // one: the detail view distinguishes "not qualified" from "qualified as X".
    const ruleset = match.tournament?.ruleset?.payload ?? null;
    const matchOutcome = match.outcomeTypeId
      ? resolveRulesetOutcome(ruleset, match.outcomeTypeId)
      : null;
    const matchOutcomeReason =
      match.outcomeReasonId && matchOutcome
        ? (matchOutcome.reasons.find((r) => r.id === match.outcomeReasonId) ?? null)
        : null;

    const sides = await matchSidesRepository.getByMatchId(id);
    const result = await matchResultRepository.getByMatchId(id);

    let playerPointMap = new Map<string, { pointsAwarded: number; countsForRanking: boolean }>();
    if (match.status === "finalized") {
      const rows = await db
        .select({
          playerId: matchPlayerPoints.playerId,
          pointsAwarded: matchPlayerPoints.pointsAwarded,
          countsForRanking: matchPlayerPoints.countsForRanking,
        })
        .from(matchPlayerPoints)
        .where(eq(matchPlayerPoints.matchId, id));
      playerPointMap = new Map(rows.map((r) => [r.playerId, r]));
    }

    let playerMmrMap = new Map<string, number>();
    if (match.status === "finalized" && match.tournament?.mode === "ranked") {
      const rows = await db
        .select({ playerId: mmrHistory.playerId, mmrDelta: mmrHistory.mmrDelta })
        .from(mmrHistory)
        .where(eq(mmrHistory.matchId, id));
      playerMmrMap = new Map(rows.map((r) => [r.playerId, r.mmrDelta]));
    }

    const builtSides: MatchDetailSide[] = sides.map((side) => {
      const isWinner =
        (match.winnerSide === "A" && side.position === 1) ||
        (match.winnerSide === "B" && side.position === 2);
      const entry = side.entry;
      const entryName = entry?.team?.name ?? null;
      const standardPoints = side.pointsAwarded ?? 0;

      const players: MatchDetailPlayer[] = (entry?.players ?? []).map((ep) => {
        const player: MatchDetailPlayer = {
          id: ep.player.id,
          displayName: ep.player.displayName,
          shortName: ep.player.shortName ?? ep.player.displayName.slice(0, 8),
        };
        if (match.status === "finalized") {
          const row = playerPointMap.get(ep.player.id);
          if (row) {
            player.exceededMatchLimit = !row.countsForRanking;
            player.effectivePointsAwarded = row.pointsAwarded;
          } else {
            player.exceededMatchLimit = false;
            player.effectivePointsAwarded = standardPoints;
          }
          if (match.tournament?.mode === "ranked") {
            player.mmrDelta = playerMmrMap.get(ep.player.id) ?? null;
          }
        }
        return player;
      });

      return {
        position: side.position,
        score: side.score,
        pointsAwarded: standardPoints,
        isWinner,
        entryId: entry?.id ?? "",
        entryName,
        teamId: entry?.team?.id ?? null,
        players,
      };
    });

    return {
      id: match.id,
      tournamentId: match.tournamentId,
      status: match.status,
      playedAt: match.playedAt as unknown as Date,
      confirmationDeadline: match.confirmationDeadline as unknown as Date | undefined,
      createdAt: match.createdAt as unknown as Date,
      createdBy: match.createdBy ?? undefined,
      creator: match.creator
        ? { id: match.creator.id, displayName: match.creator.displayName }
        : undefined,
      outcomeTypeId: match.outcomeTypeId ?? undefined,
      outcomeReasonId: match.outcomeReasonId,
      tournament: match.tournament
        ? {
            id: match.tournament.id,
            name: match.tournament.name,
            mode: match.tournament.mode,
            teamMode: match.tournament.teamMode,
            scoreEnabled: match.tournament.scoreEnabled ?? true,
            allowDraw: match.tournament.allowDraw ?? false,
            validationMode: match.tournament.validationMode,
            validationTimerHours: match.tournament.validationTimerHours,
            status: match.tournament.status,
          }
        : undefined,
      outcomeType: matchOutcome
        ? { id: matchOutcome.id, name: matchOutcome.name }
        : null,
      outcomeReason: matchOutcomeReason
        ? { id: matchOutcomeReason.id, name: matchOutcomeReason.name }
        : null,
      confirmations: match.confirmations.map((c) => ({
        id: c.id,
        matchId: c.matchId,
        playerId: c.playerId,
        isConfirmed: c.isConfirmed,
        isContested: c.isContested,
        contestationReason: c.contestationReason,
        sidePosition: c.sidePosition,
        isPostFinalization: c.isPostFinalization,
        createdAt: c.createdAt as unknown as Date,
        updatedAt: c.updatedAt as unknown as Date,
        player: c.player ? { id: c.player.id, displayName: c.player.displayName } : null,
      })),
      sides: builtSides,
      result: result
        ? {
            reportedBy: result.reportedBy ?? undefined,
            reportedAt: result.reportedAt as unknown as Date | undefined,
            reportProof: result.reportProof ?? undefined,
            finalizedBy: result.finalizedBy ?? undefined,
            finalizedAt: result.finalizedAt as unknown as Date | undefined,
            finalizationReason: result.finalizationReason ?? undefined,
            reporter: result.reporter
              ? { id: result.reporter.id, displayName: result.reporter.displayName }
              : undefined,
          }
        : undefined,
    };
  }

  /**
   * Get match by ID (simple, without relations)
   */
  async getByIdSimple(id: string) {
    return await db.query.matches.findFirst({
      where: eq(matches.id, id),
    });
  }

  /**
   * Statuses of several matches in one round-trip. Used to tell whether the action a
   * notification asks for is still pending, for a whole notification list at once.
   */
  async getStatusesByIds(ids: string[]): Promise<{ id: string; status: MatchStatus }[]> {
    if (ids.length === 0) return [];

    return await db
      .select({ id: matches.id, status: matches.status })
      .from(matches)
      .where(inArray(matches.id, ids));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildTeamObject(side: any): SyntheticTeam {
    const entry = side.entry;
    if (!entry) return { participants: [] };
    if (entry.entryType === "TEAM" && entry.team) {
      return {
        id: entry.team.id,
        name: entry.team.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        participants: entry.players.map((ep: any) => ({ user: ep.player })),
      };
    }
    return {
      id: entry.id,
      name: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participants: entry.players.map((ep: any) => ({ user: ep.player })),
    };
  }

  private determineWinnerSide(match: { winnerSide: string | null }): "A" | "B" | null {
    if (match.winnerSide === "A" || match.winnerSide === "B") return match.winnerSide;
    return null;
  }

  /**
   * List matches with optional filters
   */
  async list(filters?: MatchFilters) {
    const conditions = [];

    if (filters?.tournamentId) {
      conditions.push(eq(matches.tournamentId, filters.tournamentId));
    }
    if (filters?.status) {
      conditions.push(eq(matches.status, filters.status));
    }
    if (filters?.playerId) {
      const playerMatchIds = await db
        .select({ matchId: matchSides.matchId })
        .from(matchSides)
        .innerJoin(tournamentEntries, eq(matchSides.entryId, tournamentEntries.id))
        .innerJoin(tournamentEntryPlayers, eq(tournamentEntries.id, tournamentEntryPlayers.entryId))
        .where(eq(tournamentEntryPlayers.playerId, filters.playerId));
      const ids = playerMatchIds.map((r) => r.matchId);
      if (ids.length === 0) return [];
      conditions.push(inArray(matches.id, ids));
    }

    const matchList = await db.query.matches.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        tournament: true,
        outcomeType: {
          with: {
            discipline: true,
          },
        },
        outcomeReason: {
          with: {
            outcomeType: {
              with: {
                discipline: true,
              },
            },
          },
        },
      },
      orderBy: (matches, { desc }) => [desc(matches.createdAt)],
    });

    // Build full match objects with synthetic teams
    const processed = await Promise.all(
      matchList.map(async (m) => {
        const sides = await matchSidesRepository.getByMatchId(m.id);
        const result = await matchResultRepository.getByMatchId(m.id);

        const teamA = sides[0] ? this.buildTeamObject(sides[0]) : null;
        const teamB = sides[1] ? this.buildTeamObject(sides[1]) : null;
        const scoreA = sides[0]?.score ?? 0;
        const scoreB = sides[1]?.score ?? 0;
        const winnerSide = this.determineWinnerSide(m);
        let winnerId: string | null = null;
        if (winnerSide === "A") {
          winnerId = sides[0]?.entry?.teamId || sides[0]?.entry?.id || null;
        } else if (winnerSide === "B") {
          winnerId = sides[1]?.entry?.teamId || sides[1]?.entry?.id || null;
        }
        let winner: typeof teamA = null;
        if (winnerId) winner = winnerSide === "A" ? teamA : teamB;

        return {
          ...m,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          teamA: teamA as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          teamB: teamB as any,
          scoreA,
          scoreB,
          winnerId,
          winnerSide,
          winner,
          reportedBy: result?.reportedBy,
          reportedAt: result?.reportedAt,
          reportProof: result?.reportProof,
          finalizedBy: result?.finalizedBy,
          finalizedAt: result?.finalizedAt,
          finalizationReason: result?.finalizationReason,
          reporter: result?.reporter,
          sides: sides,
        };
      }),
    );

    return processed;
  }

  /**
   * Lean match list for the unified GET /matches endpoint.
   * Scores and team sizes are assembled from sides in the service layer.
   */
  /**
   * `visibleOrganizationIds` scopes the page to what the caller may see: the ids of
   * the organizations they belong to, or null to lift the restriction entirely
   * (super admins). An empty array is not the same as null — it means the caller
   * only gets competitions attached to no organization.
   *
   * The filter has to run here rather than on the result: the page is cut in SQL,
   * so dropping rows afterwards would return short pages and a wrong total.
   */
  async listMatchCards(
    filters: ListMatchCardsQuery,
    visibleOrganizationIds: string[] | null,
  ) {
    const conditions = [];
    if (visibleOrganizationIds !== null) {
      conditions.push(
        visibleOrganizationIds.length > 0
          ? or(
              isNull(tournaments.organizationId),
              inArray(tournaments.organizationId, visibleOrganizationIds),
            )
          : isNull(tournaments.organizationId),
      );
    }
    if (filters.tournamentId) {
      conditions.push(eq(matches.tournamentId, filters.tournamentId));
    }
    if (filters.status) {
      conditions.push(eq(matches.status, filters.status as MatchStatus));
    }
    if (filters.playerIds) {
      for (const pid of filters.playerIds.split(',').filter(Boolean)) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM match_sides ms
            JOIN tournament_entries te ON ms.entry_id = te.id
            JOIN tournament_entry_players tep ON tep.entry_id = te.id
            WHERE ms.match_id = ${matches.id} AND tep.player_id = ${pid}
          )`,
        );
      }
    }
    if (filters.bracketMode) {
      conditions.push(
        sql`(SELECT COUNT(*) FROM match_sides WHERE match_id = ${matches.id}) >= 2`,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        matchId: matches.id,
        tournamentId: tournaments.id,
        tournamentName: tournaments.name,
        tournamentMode: tournaments.mode,
        tournamentScoreEnabled: tournaments.scoreEnabled,
        playedAt: matches.playedAt,
        status: matches.status,
        winnerSide: matches.winnerSide,
        outcomeTypeId: matches.outcomeTypeId,
        // Resolved out of the competition's ruleset snapshot rather than the live
        // outcome_types row, so a renamed outcome does not relabel matches that
        // were played under the old name.
        outcomeTypeName: sql<string | null>`(
          SELECT elem->>'name'
          FROM tournament_rulesets tr,
               jsonb_array_elements(tr.payload->'outcomeTypes') elem
          WHERE tr.tournament_id = ${tournaments.id}
            AND elem->>'id' = ${matches.outcomeTypeId}::text
          LIMIT 1
        )`,
        mmrDelta: filters.playerIds?.split(',').find(Boolean)
          ? sql<number | null>`(
              SELECT mmr_delta FROM mmr_history
              WHERE match_id = ${matches.id} AND player_id = ${filters.playerIds!.split(',')[0]}
              LIMIT 1
            )`
          : sql<null>`NULL`,
        pointsDelta: filters.playerIds?.split(',').find(Boolean)
          ? sql<number | null>`(
              SELECT points_awarded FROM match_player_points
              WHERE match_id = ${matches.id} AND player_id = ${filters.playerIds!.split(',')[0]}
              LIMIT 1
            )`
          : sql<null>`NULL`,
        total: sql<number>`COUNT(*) OVER ()`.mapWith(Number),
      })
      .from(matches)
      .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(where)
      .orderBy(desc(matches.playedAt))
      .limit(filters.limit)
      .offset(filters.offset);

    return {
      data: rows,
      total: rows[0]?.total ?? 0,
    };
  }

  /**
   * Update match
   */
  async update(id: string, data: UpdateMatchData) {
    return await db.transaction(async (tx) => {
      const updated = await this.updateMatchRecord(tx, id, data);
      if (!updated) throw new Error(`Match ${id} not found`);

      if (data.scoreA !== undefined || data.scoreB !== undefined) {
        await this.applyScoreUpdates(tx, id, updated.tournamentId, data);
      }

      await this.upsertMatchResult(id, data);

      return updated;
    });
  }

  /** Update the match row itself, or just fetch it when no match fields changed */
  private async updateMatchRecord(tx: Tx, id: string, data: UpdateMatchData) {
    const matchFields = {
      status: data.status,
      playedAt: data.playedAt,
      outcomeTypeId: data.outcomeTypeId,
      outcomeReasonId: data.outcomeReasonId,
      confirmationDeadline: data.confirmationDeadline,
    };
    const hasMatchFields = Object.values(matchFields).some((v) => v !== undefined);

    if (hasMatchFields) {
      const [updated] = await tx
        .update(matches)
        .set(matchFields)
        .where(eq(matches.id, id))
        .returning();
      return updated;
    }

    const rows = await tx.select().from(matches).where(eq(matches.id, id));
    return rows[0];
  }

  /** Persist new scores, winner side and recomputed points for the match sides */
  private async applyScoreUpdates(
    tx: Tx,
    id: string,
    tournamentId: string,
    data: UpdateMatchData,
  ) {
    const sides = await matchSidesRepository.getByMatchId(id);
    const updates: { entryId: string; score: number | null }[] = [];

    if (data.scoreA !== undefined && sides[0]) {
      updates.push({ entryId: sides[0].entryId, score: data.scoreA });
    }
    if (data.scoreB !== undefined && sides[1]) {
      updates.push({ entryId: sides[1].entryId, score: data.scoreB });
    }
    if (updates.length > 0) {
      await matchSidesRepository.updateScores(id, updates);
    }

    const tournament = await this.getTournament(tournamentId);
    if (!tournament) return;

    const scoreA = data.scoreA ?? sides[0]?.score ?? 0;
    const scoreB = data.scoreB ?? sides[1]?.score ?? 0;
    const outcome = resolveMatchOutcome(data, scoreA, scoreB);

    await tx
      .update(matches)
      .set({ winnerSide: outcome.winnerSide })
      .where(eq(matches.id, id));

    const points = computeSidePoints(tournament, outcome);
    if (sides[0]) {
      await matchSidesRepository.updatePointsAwarded(id, sides[0].entryId, points.a);
    }
    if (sides[1]) {
      await matchSidesRepository.updatePointsAwarded(id, sides[1].entryId, points.b);
    }
  }

  /** Create or update the match_results row when reporting/finalization fields change */
  private async upsertMatchResult(id: string, data: UpdateMatchData) {
    const shouldUpsert =
      data.reportedBy !== undefined ||
      data.reportProof !== undefined ||
      data.finalizedBy !== undefined;
    if (!shouldUpsert) return;

    const payload = {
      reportedBy: data.reportedBy,
      reportedAt: data.reportedBy ? new Date() : undefined,
      reportProof: data.reportProof,
      finalizedBy: data.finalizedBy,
      finalizedAt: data.finalizedAt,
      finalizationReason: data.finalizationReason,
    };

    const existingResult = await matchResultRepository.getByMatchId(id);
    if (existingResult) {
      await matchResultRepository.update(id, payload);
    } else {
      await matchResultRepository.create(id, payload);
    }
  }

  /**
   * Delete match
   */
  async delete(id: string) {
    await db.delete(matches).where(eq(matches.id, id));
  }

  /**
   * Count matches for a tournament
   */
  async countByTournament(tournamentId: string) {
    const result = await db
      .select({ count: count() })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));

    return result[0]?.count ?? 0;
  }

  /**
   * Matches carrying an actual result, contested or not.
   *
   * This is what decides whether a competition's rules are still free to move: a
   * scheduled match commits nobody, an entered one does. Same grouping as the
   * provisional standings, so the two never disagree about what "already played"
   * means. Hits `idx_matches_tournament_status_played_at`.
   */
  async countEnteredMatches(tournamentId: string) {
    const result = await db
      .select({ count: count() })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          inArray(matches.status, ENTERED_MATCH_STATUSES),
        ),
      );

    return result[0]?.count ?? 0;
  }

  /**
   * Count matches for a user in a tournament
   */
  async countMatchesForUser(
    tournamentId: string,
    userId: string,
    excludeMatchId?: string,
  ) {
    const matchConditions = [
      eq(matches.tournamentId, tournamentId),
      ne(matches.status, "cancelled"),
    ];
    if (excludeMatchId) {
      matchConditions.push(ne(matches.id, excludeMatchId));
    }

    // Get all entries where this user participates
    const userEntries = await db
      .select({ entryId: tournamentEntryPlayers.entryId })
      .from(tournamentEntryPlayers)
      .innerJoin(
        tournamentEntries,
        eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
      )
      .where(
        and(
          eq(tournamentEntryPlayers.playerId, userId),
          eq(tournamentEntries.tournamentId, tournamentId),
        ),
      );

    if (userEntries.length === 0) {
      return 0;
    }

    const entryIds = userEntries.map((e) => e.entryId);

    // Count matches where user's entries are involved
    const result = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${matches.id})` })
      .from(matches)
      .innerJoin(sql`match_sides`, sql`${matches.id} = match_sides.match_id`)
      .where(and(...matchConditions, sql`match_sides.entry_id IN ${entryIds}`));

    return result[0]?.count ?? 0;
  }

  /**
   * Count matches between same players (partners)
   * For flex tournaments, only counts matches with the same team size
   */
  async countMatchesWithSamePartner(
    tournamentId: string,
    userId: string,
    partnerId: string,
    excludeMatchId?: string,
    teamSize?: number,
  ) {
    // Get entries where both users are together
    const userEntries = await db
      .select({ entryId: tournamentEntryPlayers.entryId })
      .from(tournamentEntryPlayers)
      .innerJoin(
        tournamentEntries,
        eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
      )
      .where(
        and(
          eq(tournamentEntryPlayers.playerId, userId),
          eq(tournamentEntries.tournamentId, tournamentId),
        ),
      );

    if (userEntries.length === 0) {
      return 0;
    }

    let count = 0;
    for (const { entryId } of userEntries) {
      // Check if partner is also in this entry
      const partnerInEntry = await db.query.tournamentEntryPlayers.findFirst({
        where: and(
          eq(tournamentEntryPlayers.entryId, entryId),
          eq(tournamentEntryPlayers.playerId, partnerId),
        ),
      });

      if (!partnerInEntry) continue;

      // Get entry details
      const entry = await entryRepository.getById(entryId);
      if (!entry) continue;

      // If teamSize specified, check it matches
      if (teamSize !== undefined && entry.players.length !== teamSize) {
        continue;
      }

      // Count matches with this entry
      const matchConditions = [
        eq(matches.tournamentId, tournamentId),
        ne(matches.status, "cancelled"),
      ];
      if (excludeMatchId) {
        matchConditions.push(ne(matches.id, excludeMatchId));
      }

      const entryMatches = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${matches.id})` })
        .from(matches)
        .innerJoin(sql`match_sides`, sql`${matches.id} = match_sides.match_id`)
        .where(and(...matchConditions, sql`match_sides.entry_id = ${entryId}`));

      count += entryMatches[0]?.count ?? 0;
    }

    return count;
  }

  /**
   * Count matches against same opponent
   */
  async countMatchesWithSameOpponent(
    tournamentId: string,
    userId: string,
    opponentId: string,
    excludeMatchId?: string,
    teamSize?: number,
  ) {
    // Get user's entries
    const userEntries = await db
      .select({ entryId: tournamentEntryPlayers.entryId })
      .from(tournamentEntryPlayers)
      .innerJoin(
        tournamentEntries,
        eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
      )
      .where(
        and(
          eq(tournamentEntryPlayers.playerId, userId),
          eq(tournamentEntries.tournamentId, tournamentId),
        ),
      );

    // Get opponent's entries
    const opponentEntries = await db
      .select({ entryId: tournamentEntryPlayers.entryId })
      .from(tournamentEntryPlayers)
      .innerJoin(
        tournamentEntries,
        eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
      )
      .where(
        and(
          eq(tournamentEntryPlayers.playerId, opponentId),
          eq(tournamentEntries.tournamentId, tournamentId),
        ),
      );

    if (userEntries.length === 0 || opponentEntries.length === 0) {
      return 0;
    }

    // If teamSize is specified, filter entries by team size
    let userEntryIds = userEntries.map((e) => e.entryId);
    let opponentEntryIds = opponentEntries.map((e) => e.entryId);

    if (teamSize !== undefined) {
      // Get full entry details to check team size
      const userEntriesDetails = await Promise.all(
        userEntryIds.map((id) => entryRepository.getById(id)),
      );
      const opponentEntriesDetails = await Promise.all(
        opponentEntryIds.map((id) => entryRepository.getById(id)),
      );

      userEntryIds = userEntriesDetails
        .filter((e) => e?.players.length === teamSize)
        .map((e) => e!.id);

      opponentEntryIds = opponentEntriesDetails
        .filter((e) => e?.players.length === teamSize)
        .map((e) => e!.id);

      if (userEntryIds.length === 0 || opponentEntryIds.length === 0) {
        return 0;
      }
    }

    // Find matches where user and opponent entries face each other
    const matchConditions = [
      eq(matches.tournamentId, tournamentId),
      ne(matches.status, "cancelled"),
    ];
    if (excludeMatchId) {
      matchConditions.push(ne(matches.id, excludeMatchId));
    }

    // Use a Set to track unique match IDs
    const matchedMatchIds = new Set<string>();

    const opposingMatches = await db
      .select({ matchId: sql<string>`match_sides.match_id` })
      .from(sql`match_sides`)
      .innerJoin(matches, sql`matches.id = match_sides.match_id`)
      .where(
        and(
          ...matchConditions,
          inArray(sql`match_sides.entry_id`, userEntryIds),
        ),
      );

    for (const { matchId } of opposingMatches) {
      // Skip if we've already counted this match
      if (matchedMatchIds.has(matchId)) {
        continue;
      }

      // Get user's side position
      const userSide = await db
        .select({ position: sql<number>`match_sides.position` })
        .from(sql`match_sides`)
        .where(
          and(
            sql`match_sides.match_id = ${matchId}`,
            inArray(sql`match_sides.entry_id`, userEntryIds),
          ),
        )
        .limit(1);

      if (userSide.length === 0) {
        continue;
      }

      const userPosition = userSide[0].position;

      // Check if opponent is also in this match (on the opposite side)
      const opponentSide = await db
        .select({ position: sql<number>`match_sides.position` })
        .from(sql`match_sides`)
        .where(
          and(
            sql`match_sides.match_id = ${matchId}`,
            inArray(sql`match_sides.entry_id`, opponentEntryIds),
          ),
        )
        .limit(1);

      // Only count if they are on opposite sides (different positions)
      if (
        opponentSide.length > 0 &&
        opponentSide[0].position !== userPosition
      ) {
        matchedMatchIds.add(matchId);
      }
    }

    return matchedMatchIds.size;
  }

  /**
   * Count matches where exactly the given players formed a team together.
   * Only counts entries with the exact same player composition.
   */
  async countMatchesForTeam(
    tournamentId: string,
    playerIds: string[],
    excludeMatchId?: string,
  ): Promise<number> {
    if (playerIds.length === 0) return 0;

    // Find candidate entries: entries in this tournament containing the first player
    const candidateRows = await db
      .select({ entryId: tournamentEntryPlayers.entryId })
      .from(tournamentEntryPlayers)
      .innerJoin(
        tournamentEntries,
        eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
      )
      .where(
        and(
          eq(tournamentEntries.tournamentId, tournamentId),
          eq(tournamentEntryPlayers.playerId, playerIds[0]),
        ),
      );

    if (candidateRows.length === 0) return 0;

    // Filter to entries whose player set matches exactly
    const exactEntryIds: string[] = [];
    for (const { entryId } of candidateRows) {
      const entry = await entryRepository.getById(entryId);
      if (!entry) continue;
      const entryPlayerIds = entry.players.map((ep) => ep.player.id as string);
      if (
        entryPlayerIds.length === playerIds.length &&
        playerIds.every((id) => entryPlayerIds.includes(id))
      ) {
        exactEntryIds.push(entryId);
      }
    }

    if (exactEntryIds.length === 0) return 0;

    const matchConditions = [
      eq(matches.tournamentId, tournamentId),
      ne(matches.status, "cancelled"),
    ];
    if (excludeMatchId) {
      matchConditions.push(ne(matches.id, excludeMatchId));
    }

    const result = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${matches.id})` })
      .from(matches)
      .innerJoin(sql`match_sides`, sql`${matches.id} = match_sides.match_id`)
      .where(
        and(...matchConditions, inArray(sql`match_sides.entry_id`, exactEntryIds)),
      );

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count matches where exactly team A (playerIdsA) faced exactly team B (playerIdsB),
   * regardless of which side (position 1 or 2) each team was on.
   */
  async countMatchesTeamsVsTeam(
    tournamentId: string,
    playerIdsA: string[],
    playerIdsB: string[],
    excludeMatchId?: string,
  ): Promise<number> {
    const findExactEntries = async (playerIds: string[]): Promise<string[]> => {
      if (playerIds.length === 0) return [];
      const candidateRows = await db
        .select({ entryId: tournamentEntryPlayers.entryId })
        .from(tournamentEntryPlayers)
        .innerJoin(
          tournamentEntries,
          eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
        )
        .where(
          and(
            eq(tournamentEntries.tournamentId, tournamentId),
            eq(tournamentEntryPlayers.playerId, playerIds[0]),
          ),
        );

      const exactEntryIds: string[] = [];
      for (const { entryId } of candidateRows) {
        const entry = await entryRepository.getById(entryId);
        if (!entry) continue;
        const entryPlayerIds = entry.players.map((ep) => ep.player.id as string);
        if (
          entryPlayerIds.length === playerIds.length &&
          playerIds.every((id) => entryPlayerIds.includes(id))
        ) {
          exactEntryIds.push(entryId);
        }
      }
      return exactEntryIds;
    };

    const [teamAEntries, teamBEntries] = await Promise.all([
      findExactEntries(playerIdsA),
      findExactEntries(playerIdsB),
    ]);

    if (teamAEntries.length === 0 || teamBEntries.length === 0) return 0;

    const matchConditions = [
      eq(matches.tournamentId, tournamentId),
      ne(matches.status, "cancelled"),
    ];
    if (excludeMatchId) {
      matchConditions.push(ne(matches.id, excludeMatchId));
    }

    // Find all match_sides where a team A entry appears
    const aMatchSides = await db
      .select({
        matchId: sql<string>`match_sides.match_id`,
        position: sql<number>`match_sides.position`,
      })
      .from(sql`match_sides`)
      .innerJoin(matches, sql`matches.id = match_sides.match_id`)
      .where(
        and(
          ...matchConditions,
          inArray(sql`match_sides.entry_id`, teamAEntries),
        ),
      );

    let count = 0;
    for (const { matchId, position: aPosition } of aMatchSides) {
      // Check if a team B entry is in the same match on the opposite side
      const bSide = await db
        .select({ position: sql<number>`match_sides.position` })
        .from(sql`match_sides`)
        .where(
          and(
            sql`match_sides.match_id = ${matchId}`,
            inArray(sql`match_sides.entry_id`, teamBEntries),
          ),
        )
        .limit(1);

      if (bSide.length > 0 && bSide[0].position !== aPosition) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if user is participant in match
   */
  async isUserInMatch(matchId: string, userId: string): Promise<boolean> {
    // Get match sides
    const sides = await matchSidesRepository.getByMatchId(matchId);

    for (const side of sides) {
      const isInEntry = await entryRepository.isPlayerInEntry(
        side.entryId,
        userId,
      );
      if (isInEntry) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get tournament by ID (for validation)
   */
  async getTournament(tournamentId: string) {
    return await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
      with: TOURNAMENT_CONFIGS_WITH,
    });
  }

  /**
   * Validate that entries belong to tournament and players are registered
   */
  async validateEntriesForTournament(
    tournamentId: string,
    teamAId?: string,
    teamBId?: string,
    playerIdsA?: string[],
    playerIdsB?: string[],
  ) {
    // For static teams: validate team IDs
    if (teamAId) {
      const teamA = await db.query.teams.findFirst({
        where: and(eq(teams.id, teamAId), eq(teams.tournamentId, tournamentId)),
      });
      if (!teamA) {
        throw new Error("TEAM_A_NOT_FOUND");
      }
    }

    if (teamBId) {
      const teamB = await db.query.teams.findFirst({
        where: and(eq(teams.id, teamBId), eq(teams.tournamentId, tournamentId)),
      });
      if (!teamB) {
        throw new Error("TEAM_B_NOT_FOUND");
      }
    }

    if (teamAId && teamBId && teamAId === teamBId) {
      throw new Error("TEAMS_CANNOT_BE_SAME");
    }

    // For flex teams: validate player IDs
    const allPlayerIds = [...(playerIdsA || []), ...(playerIdsB || [])];
    if (allPlayerIds.length > 0) {
      // Check all players are registered in tournamentParticipants
      for (const playerId of allPlayerIds) {
        const participant = await db.query.tournamentParticipants.findFirst({
          where: and(
            eq(tournamentParticipants.userId, playerId),
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.status, "active"),
          ),
        });
        if (!participant) {
          throw new Error(`PLAYER_NOT_REGISTERED: ${playerId}`);
        }
      }
    }
  }

  /**
   * Get all participations for a match (returns match sides with player info)
   */
  async getParticipationsByMatchId(matchId: string) {
    const sides = await matchSidesRepository.getByMatchId(matchId);

    // Build participation-like objects for backward compatibility
    const participations = [];
    for (const side of sides) {
      const teamSide = side.position === 1 ? "A" : "B";
      for (const playerLink of side.entry?.players || []) {
        participations.push({
          matchId,
          playerId: playerLink.player.id,
          player: playerLink.player,
          teamSide,
        });
      }
    }

    return participations;
  }

  /**
   * Find matches with the same entries in a tournament
   * Used for duplicate detection
   */
  async findMatchesWithSameEntries(
    tournamentId: string,
    entryAId: string,
    entryBId: string,
    excludeMatchId?: string,
  ): Promise<string[]> {
    // Step 1: Find all matches in the tournament that contain either entry
    const matchesWithEntries = await db
      .select({
        matchId: matchSides.matchId,
        entryIds: sql<string[]>`array_agg(DISTINCT ${matchSides.entryId})`,
      })
      .from(matchSides)
      .innerJoin(matches, eq(matchSides.matchId, matches.id))
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          ne(matches.status, "cancelled"),
          or(
            eq(matchSides.entryId, entryAId),
            eq(matchSides.entryId, entryBId),
          ),
          excludeMatchId ? ne(matches.id, excludeMatchId) : sql`true`,
        ),
      )
      .groupBy(matchSides.matchId)
      .having(sql`count(DISTINCT ${matchSides.entryId}) = 2`);

    // Step 2: Filter to only matches where BOTH entries are present
    const duplicateMatchIds: string[] = [];
    for (const match of matchesWithEntries) {
      const entries = match.entryIds;
      if (entries.includes(entryAId) && entries.includes(entryBId)) {
        duplicateMatchIds.push(match.matchId);
      }
    }

    return duplicateMatchIds;
  }

  /**
   * Count finalized matches for a user in a tournament played before the given date.
   * Used to determine whether a player has exceeded their ranking match limit.
   */
  async countFinalizedMatchesForUserBefore(
    tournamentId: string,
    userId: string,
    beforeDate: Date,
    excludeMatchId?: string,
  ): Promise<number> {
    const userEntries = await db
      .select({ entryId: tournamentEntryPlayers.entryId })
      .from(tournamentEntryPlayers)
      .innerJoin(
        tournamentEntries,
        eq(tournamentEntryPlayers.entryId, tournamentEntries.id),
      )
      .where(
        and(
          eq(tournamentEntryPlayers.playerId, userId),
          eq(tournamentEntries.tournamentId, tournamentId),
        ),
      );

    if (userEntries.length === 0) return 0;

    const entryIds = userEntries.map((e) => e.entryId);
    const conditions = [
      eq(matches.tournamentId, tournamentId),
      eq(matches.status, "finalized"),
      lt(matches.playedAt, beforeDate),
    ];
    if (excludeMatchId) {
      conditions.push(ne(matches.id, excludeMatchId));
    }

    const result = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${matches.id})` })
      .from(matches)
      .innerJoin(sql`match_sides`, sql`${matches.id} = match_sides.match_id`)
      .where(and(...conditions, sql`match_sides.entry_id IN ${entryIds}`));

    return result[0]?.count ?? 0;
  }

  /**
   * Get all matches with status 'reported'.
   * Used by auto-finalization job to find matches that may need to be finalized.
   * Contested matches are excluded on purpose: a disagreement is settled by a human,
   * never by the timer.
   */
  async getMatchesPendingFinalization() {
    return db.query.matches.findMany({
      where: (m, { eq: eqOp }) => eqOp(m.status, "reported"),
    });
  }

  async getPlayerIdsForMatch(matchId: string): Promise<string[]> {
    const sides = await db.query.matchSides.findMany({
      where: eq(matchSides.matchId, matchId),
      with: {
        entry: {
          with: {
            players: { columns: { playerId: true } },
          },
        },
      },
    });
    const ids = new Set<string>();
    for (const side of sides) {
      for (const ep of side.entry.players) {
        ids.add(ep.playerId);
      }
    }
    return Array.from(ids);
  }

  async findPlayerConflictAtTime(
    playerIds: string[],
    playedAt: Date,
    tournamentId: string,
    excludeMatchId?: string,
  ): Promise<{ playerId: string; playerName: string } | null> {
    if (playerIds.length === 0) return null;

    const conditions = [
      sql`DATE_TRUNC('minute', ${matches.playedAt}) = DATE_TRUNC('minute', ${playedAt}::timestamptz)`,
      eq(matches.tournamentId, tournamentId),
      ne(matches.status, "cancelled"),
      inArray(tournamentEntryPlayers.playerId, playerIds),
    ];
    if (excludeMatchId) conditions.push(ne(matches.id, excludeMatchId));

    const rows = await db
      .select({
        playerId: tournamentEntryPlayers.playerId,
        playerName: appUsers.displayName,
      })
      .from(matches)
      .innerJoin(matchSides, eq(matchSides.matchId, matches.id))
      .innerJoin(tournamentEntries, eq(tournamentEntries.id, matchSides.entryId))
      .innerJoin(tournamentEntryPlayers, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
      .innerJoin(appUsers, eq(appUsers.id, tournamentEntryPlayers.playerId))
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }
}

export const matchRepository = new MatchRepository();
