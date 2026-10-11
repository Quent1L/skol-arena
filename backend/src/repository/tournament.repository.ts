import { eq, and, count, ne, inArray } from "drizzle-orm";
import { db } from "../config/database";
import {
  tournaments,
  tournamentAdmins,
  appUsers,
  tournamentParticipants,
  tournamentScoringConfigs,
  championshipConfigs,
  tournamentVoteConfigs,
} from "../db/schema";
import {
  type TournamentMode,
  type TeamMode,
  type TournamentStatus,
  type ValidationMode,
  type TournamentScoringConfig,
  type ChampionshipConfig,
  type VoteConfig,
  resolveVoteConfig,
} from "@skol-arena/shared/types/index";
import { handleDatabaseError } from "../utils/db-errors";
import {
  SCORING_CONFIG_COLUMNS,
  CHAMPIONSHIP_CONFIG_COLUMNS,
  TOURNAMENT_CONFIGS_WITH,
  VOTE_CONFIG_COLUMNS,
} from "./tournament-config.columns";

export interface CreateTournamentData {
  name: string;
  description?: string;
  mode: TournamentMode;
  teamMode: TeamMode;
  minTeamSize: number;
  maxTeamSize: number;
  maxSidesPerMatch?: number;
  /** Fully resolved by the service; omitted for modes that award no points. */
  scoringConfig?: TournamentScoringConfig;
  /** Fully resolved by the service; omitted outside championship mode. */
  championshipConfig?: ChampionshipConfig;
  voteConfig?: Partial<VoteConfig>;
  allowDraw: boolean | null;
  scoreEnabled?: boolean;
  startDate: string;
  endDate: string;
  disciplineId?: string;
  minScore?: number | null;
  maxScore?: number | null;
  validationMode?: ValidationMode;
  validationTimerHours?: number | null;
  createdBy: string;
  status: TournamentStatus;
}

export interface UpdateTournamentData {
  name?: string;
  description?: string;
  mode?: TournamentMode;
  teamMode?: TeamMode;
  teamSize?: number;
  maxSidesPerMatch?: number;
  scoringConfig?: Partial<TournamentScoringConfig>;
  championshipConfig?: Partial<ChampionshipConfig>;
  voteConfig?: Partial<VoteConfig>;
  allowDraw?: boolean;
  startDate?: string;
  endDate?: string;
  status?: TournamentStatus;
  disciplineId?: string;
  scoreEnabled?: boolean;
  rulesId?: string | null;
  organizationId?: string | null;
  minTeamSize?: number;
  maxTeamSize?: number;
  minScore?: number | null;
  maxScore?: number | null;
  validationMode?: ValidationMode;
  validationTimerHours?: number | null;
}

export interface TournamentFilters {
  status?: TournamentStatus;
  mode?: TournamentMode;
  createdBy?: string;
  excludeDraft?: boolean;
  excludeRanked?: boolean;
  /** Requesting user, used to resolve `isParticipant`. Omit for anonymous callers. */
  viewerId?: string;
}

export class TournamentRepository {
  /**
   * Create a new tournament
   */
  async create(data: CreateTournamentData) {
    const values: typeof tournaments.$inferInsert = {
      name: data.name,
      mode: data.mode,
      teamMode: data.teamMode,
      minTeamSize: data.minTeamSize,
      maxTeamSize: data.maxTeamSize,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      createdBy: data.createdBy,
      ...(data.description !== undefined && { description: data.description }),
      ...(data.maxSidesPerMatch !== undefined && { maxSidesPerMatch: data.maxSidesPerMatch }),
      ...(data.allowDraw !== null && data.allowDraw !== undefined && { allowDraw: data.allowDraw }),
      ...(data.scoreEnabled !== undefined && {
        scoreEnabled: data.scoreEnabled,
      }),
      ...(data.disciplineId !== undefined && {
        disciplineId: data.disciplineId,
      }),
      ...(data.minScore !== undefined && { minScore: data.minScore }),
      ...(data.maxScore !== undefined && { maxScore: data.maxScore }),
      ...(data.validationMode !== undefined && { validationMode: data.validationMode }),
      ...(data.validationTimerHours !== undefined && {
        validationTimerHours: data.validationTimerHours,
      }),
    };

    try {
      return await db.transaction(async (tx) => {
        const [tournament] = await tx.insert(tournaments).values(values).returning();

        if (data.scoringConfig) {
          await tx.insert(tournamentScoringConfigs).values({ tournamentId: tournament.id, ...data.scoringConfig });
        }

        if (data.championshipConfig) {
          await tx.insert(championshipConfigs).values({ tournamentId: tournament.id, ...data.championshipConfig });
        }

        if (data.voteConfig && Object.keys(data.voteConfig).length > 0) {
          await tx.insert(tournamentVoteConfigs).values({ tournamentId: tournament.id, ...data.voteConfig });
        }

        // Return the configs alongside the row: the create response carries them.
        return {
          ...tournament,
          scoringConfig: data.scoringConfig ?? null,
          championshipConfig: data.championshipConfig ?? null,
          voteConfig: data.voteConfig ? resolveVoteConfig(data.voteConfig) : null,
        };
      });
    } catch (error) {
      handleDatabaseError(error, {
        operation: "creation",
        name: data.name,
      });
    }
  }

  /**
   * Get tournament by ID
   */
  async getById(id: string) {
    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, id),
      with: {
        creator: true,
        discipline: true,
        rules: {
          columns: {
            id: true,
          },
        },
        admins: {
          with: {
            user: true,
          },
        },
        scoringConfig: { columns: SCORING_CONFIG_COLUMNS },
        championshipConfig: { columns: CHAMPIONSHIP_CONFIG_COLUMNS },
        voteConfig: { columns: VOTE_CONFIG_COLUMNS },
      },
    });

    return tournament;
  }

  /**
   * Get tournament by ID (simple, without relations)
   */
  async getByIdSimple(id: string) {
    return await db.query.tournaments.findFirst({
      where: eq(tournaments.id, id),
    });
  }

  /**
   * List tournaments with optional filters
   */
  async list(filters?: TournamentFilters) {
    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(tournaments.status, filters.status));
    }
    if (filters?.mode) {
      conditions.push(eq(tournaments.mode, filters.mode));
    }
    if (filters?.createdBy) {
      conditions.push(eq(tournaments.createdBy, filters.createdBy));
    }
    if (filters?.excludeDraft) {
      conditions.push(ne(tournaments.status, "draft"));
    }
    if (filters?.excludeRanked) {
      conditions.push(ne(tournaments.mode, "ranked"));
    }

    const result = await db.query.tournaments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      columns: {
        id: true,
        name: true,
        mode: true,
        teamMode: true,
        status: true,
        startDate: true,
        endDate: true,
        disciplineId: true,
        organizationId: true,
      },
      with: {
        discipline: { columns: { id: true, name: true, icon: true } },
      },
      orderBy: (tournaments, { desc }) => [desc(tournaments.createdAt)],
    });

    return await this.withParticipation(result, filters?.viewerId);
  }

  /**
   * Attach `participantCount` / `isParticipant` to a batch of tournament rows.
   *
   * Two grouped queries rather than correlated subqueries: the relational query
   * builder aliases its root table, so a subquery correlating on
   * `tournaments.id` is not guaranteed to bind to the right alias.
   */
  async withParticipation<T extends { id: string }>(
    rows: T[],
    viewerId?: string,
  ): Promise<(T & { participantCount: number; isParticipant: boolean })[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);

    const counts = await db
      .select({
        tournamentId: tournamentParticipants.tournamentId,
        total: count(),
      })
      .from(tournamentParticipants)
      .where(and(inArray(tournamentParticipants.tournamentId, ids), eq(tournamentParticipants.status, "active")))
      .groupBy(tournamentParticipants.tournamentId);

    const countByTournament = new Map(counts.map((row) => [row.tournamentId, Number(row.total)]));

    const joined = viewerId
      ? await db
          .select({ tournamentId: tournamentParticipants.tournamentId })
          .from(tournamentParticipants)
          .where(
            and(
              inArray(tournamentParticipants.tournamentId, ids),
              eq(tournamentParticipants.userId, viewerId),
              eq(tournamentParticipants.status, "active"),
            ),
          )
      : [];

    const joinedIds = new Set(joined.map((row) => row.tournamentId));

    return rows.map((row) => ({
      ...row,
      participantCount: countByTournament.get(row.id) ?? 0,
      isParticipant: joinedIds.has(row.id),
    }));
  }

  /**
   * Update tournament
   */
  async update(id: string, data: UpdateTournamentData) {
    const { scoringConfig, championshipConfig, voteConfig, ...columns } = data;

    try {
      return await db.transaction(async (tx) => {
        if (scoringConfig) {
          await tx
            .insert(tournamentScoringConfigs)
            .values({ tournamentId: id, ...scoringConfig })
            .onConflictDoUpdate({
              target: tournamentScoringConfigs.tournamentId,
              set: scoringConfig,
            });
        }

        if (championshipConfig) {
          await tx
            .insert(championshipConfigs)
            .values({ tournamentId: id, ...championshipConfig })
            .onConflictDoUpdate({
              target: championshipConfigs.tournamentId,
              set: championshipConfig,
            });
        }

        if (voteConfig && Object.keys(voteConfig).length > 0) {
          await tx
            .insert(tournamentVoteConfigs)
            .values({ tournamentId: id, ...voteConfig })
            .onConflictDoUpdate({ target: tournamentVoteConfigs.tournamentId, set: voteConfig });
        }

        // Skipped when the payload only touched the configs: an UPDATE with no
        // columns is not valid SQL.
        if (Object.keys(columns).length > 0) {
          await tx.update(tournaments).set(columns).where(eq(tournaments.id, id));
        }

        // Re-read rather than use `returning()`: the caller stores this row as
        // the current tournament, so it has to carry the configs too.
        const updated = await tx.query.tournaments.findFirst({
          where: eq(tournaments.id, id),
          with: TOURNAMENT_CONFIGS_WITH,
        });
        if (!updated) throw new Error("Tournament not found");

        return updated;
      });
    } catch (error) {
      handleDatabaseError(error, {
        operation: "update",
        name: data.name,
      });
    }
  }

  /**
   * Delete tournament
   */
  async delete(id: string) {
    await db.delete(tournaments).where(eq(tournaments.id, id));
  }

  /**
   * Count tournaments by user and status
   */
  async countByUserAndStatus(userId: string, status: TournamentStatus) {
    const result = await db
      .select({ count: count() })
      .from(tournaments)
      .where(and(eq(tournaments.createdBy, userId), eq(tournaments.status, status)));

    return result[0]?.count ?? 0;
  }

  /**
   * Check if user is tournament admin
   */
  async isUserTournamentAdmin(tournamentId: string, userId: string) {
    const adminRecord = await db.query.tournamentAdmins.findFirst({
      where: and(eq(tournamentAdmins.tournamentId, tournamentId), eq(tournamentAdmins.userId, userId)),
    });

    return !!adminRecord;
  }

  /**
   * List the users who administrate a tournament (owner and co-admins).
   */
  /** The raw vote settings row of a tournament, or null when it never set any. */
  async getVoteConfig(tournamentId: string): Promise<VoteConfig | null> {
    const row = await db.query.tournamentVoteConfigs.findFirst({
      where: eq(tournamentVoteConfigs.tournamentId, tournamentId),
      columns: VOTE_CONFIG_COLUMNS,
    });
    return row ?? null;
  }

  /** Whether the user is an active participant (member) of the tournament. */
  async isActiveParticipant(tournamentId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: tournamentParticipants.id })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
          eq(tournamentParticipants.status, "active"),
        ),
      )
      .limit(1);
    return !!row;
  }

  async getAdminUserIds(tournamentId: string): Promise<string[]> {
    const records = await db.query.tournamentAdmins.findMany({
      where: eq(tournamentAdmins.tournamentId, tournamentId),
      columns: { userId: true },
    });

    return records.map((record) => record.userId);
  }

  /**
   * Add tournament admin
   */
  async addAdmin(tournamentId: string, userId: string, role: "owner" | "co_admin") {
    await db.insert(tournamentAdmins).values({
      tournamentId,
      userId,
      role,
    });
  }

  /**
   * Get user by ID (for permission checks)
   */
  async getUser(userId: string) {
    return await db.query.appUsers.findFirst({
      where: eq(appUsers.id, userId),
    });
  }
}

export const tournamentRepository = new TournamentRepository();
