import { and, asc, desc, eq, gte, isNotNull, isNull, lt, or, ilike, sql } from "drizzle-orm";
import { db } from "../config/database";
import { foldedILike } from "../utils/accent-folding";
import { appUsers, organizationMembers, organizations, session, user } from "../db/schema";
import type {
  AdminUserDeletionBlocker,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListQuery,
  AdminUserStats,
  UserRole,
} from "@skol-arena/shared";

/** `%term%` with the LIKE wildcards escaped, so a typed `_` or `%` matches literally. */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

export class UserRepository {
  /**
   * Get app_user by external ID
   */
  async getByExternalId(betterAuthUserId: string) {
    return await db.query.appUsers.findFirst({
      where: eq(appUsers.externalId, betterAuthUserId),
    });
  }

  async getById(id: string) {
    return await db.query.appUsers.findFirst({
      where: eq(appUsers.id, id),
    });
  }

  async createAppUser(appUser: typeof appUsers.$inferInsert) {
    const [createdUser] = await db.insert(appUsers).values(appUser).returning();
    return createdUser;
  }

  async incrementTrustScore(userId: string): Promise<void> {
    await db
      .update(appUsers)
      .set({ trustScoreCount: sql`${appUsers.trustScoreCount} + 1` })
      .where(eq(appUsers.id, userId))
  }

  async resetTrustScore(userId: string): Promise<void> {
    await db.update(appUsers).set({ trustScoreCount: 0 }).where(eq(appUsers.id, userId))
  }

  async updateAppUser(
    id: string,
    data: {
      displayName?: string;
      shortName?: string;
      role?: UserRole;
      deactivatedAt?: Date | null;
      deactivatedBy?: string | null;
    },
  ) {
    const [updated] = await db
      .update(appUsers)
      .set(data)
      .where(eq(appUsers.id, id))
      .returning();
    return updated;
  }

  /**
   * Search users by display name or short name (case- and accent-insensitive)
   */
  async searchByName(query: string, limit = 10) {
    const pattern = containsPattern(query);
    return await db.query.appUsers.findMany({
      where: or(
        foldedILike(appUsers.displayName, pattern),
        foldedILike(appUsers.shortName, pattern),
      ),
      columns: { id: true, displayName: true, shortName: true },
      orderBy: (users, { asc }) => [asc(users.displayName)],
      limit,
    });
  }

  /**
   * Get all users (for admin use)
   */
  async getAllUsers() {
    return await db.query.appUsers.findMany({
      with: {
        externalUser: {
          columns: {
            id: true,
            email: true,
            name: true,
            image: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });
  }

  /**
   * Refresh the last login timestamp. Keyed by the Better Auth user id, since
   * the session hook only knows about the external identity.
   */
  async touchLastLogin(externalId: string): Promise<void> {
    await db
      .update(appUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(appUsers.externalId, externalId));
  }

  /**
   * Refresh the last activity timestamp, but only if the stored value is older
   * than `staleBefore`. The SQL guard makes the write idempotent across
   * instances, so the in-memory throttle upstream is an optimisation only.
   */
  async touchLastSeen(externalId: string, staleBefore: Date): Promise<void> {
    await db
      .update(appUsers)
      .set({ lastLoginAt: new Date() })
      .where(
        and(
          eq(appUsers.externalId, externalId),
          or(isNull(appUsers.lastLoginAt), lt(appUsers.lastLoginAt, staleBefore)),
        ),
      );
  }

  async countByRole(role: UserRole): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(appUsers)
      .where(and(eq(appUsers.role, role), isNull(appUsers.deactivatedAt)));
    return row?.total ?? 0;
  }

  /**
   * Paginated admin listing. Counts come from scalar subqueries so that the
   * windowed COUNT(*) OVER () total stays accurate (a GROUP BY would break it).
   */
  async listUsersAdmin(
    filters: AdminUserListQuery,
  ): Promise<{ data: AdminUserListItem[]; total: number }> {
    const conditions = [];

    if (filters.search) {
      const pattern = containsPattern(filters.search);
      conditions.push(
        or(
          foldedILike(appUsers.displayName, pattern),
          foldedILike(appUsers.shortName, pattern),
          ilike(user.email, pattern),
        ),
      );
    }
    if (filters.role) {
      conditions.push(eq(appUsers.role, filters.role));
    }
    if (filters.status === "active") {
      conditions.push(isNull(appUsers.deactivatedAt));
    } else if (filters.status === "deactivated") {
      conditions.push(isNotNull(appUsers.deactivatedAt));
    }

    const sortColumn = {
      displayName: appUsers.displayName,
      role: appUsers.role,
      createdAt: appUsers.createdAt,
      lastLoginAt: appUsers.lastLoginAt,
    }[filters.sortBy];

    const rows = await db
      .select({
        id: appUsers.id,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
        email: user.email,
        // Left join: an archived user has no Better Auth row any more.
        emailVerified: sql<boolean>`COALESCE(${user.emailVerified}, false)`,
        role: appUsers.role,
        createdAt: appUsers.createdAt,
        lastLoginAt: appUsers.lastLoginAt,
        deactivatedAt: appUsers.deactivatedAt,
        archivedAt: appUsers.archivedAt,
        matchCount: sql<number>`(
          SELECT COUNT(DISTINCT ms.match_id)
          FROM match_sides ms
          JOIN tournament_entry_players tep ON tep.entry_id = ms.entry_id
          WHERE tep.player_id = ${appUsers.id}
        )`.mapWith(Number),
        tournamentCount: sql<number>`(
          SELECT COUNT(*) FROM tournament_participants WHERE user_id = ${appUsers.id}
        )`.mapWith(Number),
        authProviders: sql<string[]>`(
          SELECT COALESCE(ARRAY_AGG(DISTINCT a.provider_id), '{}')
          FROM account a WHERE a.user_id = ${appUsers.externalId}
        )`,
        total: sql<number>`COUNT(*) OVER ()`.mapWith(Number),
      })
      .from(appUsers)
      .leftJoin(user, eq(appUsers.externalId, user.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(filters.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn))
      .limit(filters.limit)
      .offset(filters.offset);

    return {
      data: rows.map(({ total: _total, ...row }) => row),
      total: rows[0]?.total ?? 0,
    };
  }

  async getUserAdminDetail(id: string): Promise<AdminUserDetail | null> {
    const [detail] = await db
      .select({
        id: appUsers.id,
        displayName: appUsers.displayName,
        shortName: appUsers.shortName,
        email: user.email,
        // Left join: an archived user has no Better Auth row any more.
        emailVerified: sql<boolean>`COALESCE(${user.emailVerified}, false)`,
        role: appUsers.role,
        createdAt: appUsers.createdAt,
        lastLoginAt: appUsers.lastLoginAt,
        deactivatedAt: appUsers.deactivatedAt,
        archivedAt: appUsers.archivedAt,
        matchCount: sql<number>`(
          SELECT COUNT(DISTINCT ms.match_id)
          FROM match_sides ms
          JOIN tournament_entry_players tep ON tep.entry_id = ms.entry_id
          WHERE tep.player_id = ${appUsers.id}
        )`.mapWith(Number),
        tournamentCount: sql<number>`(
          SELECT COUNT(*) FROM tournament_participants WHERE user_id = ${appUsers.id}
        )`.mapWith(Number),
        authProviders: sql<string[]>`(
          SELECT COALESCE(ARRAY_AGG(DISTINCT a.provider_id), '{}')
          FROM account a WHERE a.user_id = ${appUsers.externalId}
        )`,
      })
      .from(appUsers)
      .leftJoin(user, eq(appUsers.externalId, user.id))
      .where(eq(appUsers.id, id));

    if (!detail) return null;

    const memberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, id))
      .orderBy(asc(organizations.name));

    return { ...detail, organizations: memberships };
  }

  async getAdminStats(): Promise<AdminUserStats> {
    const now = new Date();
    const days7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totals] = await db
      .select({
        total: sql<number>`COUNT(*)`.mapWith(Number),
        deactivated: sql<number>`COUNT(*) FILTER (WHERE ${isNotNull(appUsers.deactivatedAt)})`.mapWith(Number),
        archived: sql<number>`COUNT(*) FILTER (WHERE ${isNotNull(appUsers.archivedAt)})`.mapWith(Number),
        activeLast7Days: sql<number>`COUNT(*) FILTER (WHERE ${gte(appUsers.lastLoginAt, days7)})`.mapWith(Number),
        activeLast30Days: sql<number>`COUNT(*) FILTER (WHERE ${gte(appUsers.lastLoginAt, days30)})`.mapWith(Number),
        newThisMonth: sql<number>`COUNT(*) FILTER (WHERE ${gte(appUsers.createdAt, monthStart)})`.mapWith(Number),
      })
      .from(appUsers);

    const roleRows = await db
      .select({ role: appUsers.role, count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(appUsers)
      .groupBy(appUsers.role);

    const byRole = { player: 0, tournament_admin: 0, super_admin: 0, kiosk: 0 } as AdminUserStats["byRole"];
    for (const row of roleRows) byRole[row.role] = row.count;

    return { ...totals, byRole };
  }

  /**
   * Everything a permanent deletion would destroy.
   *
   * Two families, and missing the second one is what made an earlier version of this
   * method dangerous: the `created_by` tables merely raise a restrict error, whereas
   * the player tables cascade silently and take the whole tournament history with them.
   * A user with any of these must be archived, never purged.
   */
  async getDeletionBlockers(id: string): Promise<AdminUserDeletionBlocker[]> {
    const ownedTables = [
      { resource: "tournaments", table: "tournaments" },
      { resource: "teams", table: "teams" },
      { resource: "gameRules", table: "game_rules" },
      { resource: "organizations", table: "organizations" },
      { resource: "rules", table: "rules" },
      { resource: "invitationCodes", table: "invitation_codes" },
    ];
    const playedTables = [
      { resource: "matches", table: "tournament_entry_players", column: "player_id" },
      { resource: "tournamentParticipations", table: "tournament_participants", column: "user_id" },
      { resource: "matchPoints", table: "match_player_points", column: "player_id" },
      { resource: "mmr", table: "player_mmr", column: "player_id" },
      { resource: "mmrHistory", table: "mmr_history", column: "player_id" },
      { resource: "badges", table: "player_badges", column: "player_id" },
      { resource: "teamMemberships", table: "team_members", column: "user_id" },
      { resource: "tournamentAdmin", table: "tournament_admins", column: "user_id" },
    ];

    const blockers: AdminUserDeletionBlocker[] = [];
    for (const { resource, table } of ownedTables) {
      const count = await this.countRowsFor(table, "created_by", id);
      if (count > 0) blockers.push({ resource, count });
    }
    for (const { resource, table, column } of playedTables) {
      const count = await this.countRowsFor(table, column, id);
      if (count > 0) blockers.push({ resource, count });
    }
    return blockers;
  }

  private async countRowsFor(table: string, column: string, id: string): Promise<number> {
    const result = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${id}`,
    );
    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0);
  }

  async countArchived(): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(appUsers)
      .where(isNotNull(appUsers.archivedAt));
    return row?.total ?? 0;
  }

  /**
   * Destroys the Better Auth identity and anonymises the app_users row, which the
   * `set null` on external_id keeps alive along with every match it appears in.
   */
  async archiveUser(
    id: string,
    externalId: string | null,
    actorId: string,
    displayName: string,
    shortName: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (externalId) {
        await tx.delete(user).where(eq(user.id, externalId));
      }
      await tx
        .update(appUsers)
        .set({
          externalId: null,
          displayName,
          shortName,
          archivedAt: new Date(),
          archivedBy: actorId,
          deactivatedAt: new Date(),
          deactivatedBy: actorId,
        })
        .where(eq(appUsers.id, id));
    });
  }

  /**
   * Drops every active session of a user. The auth cookie cache (5 min) means
   * the revocation can take up to that long to be observed by the client.
   */
  async revokeSessions(externalId: string): Promise<void> {
    await db.delete(session).where(eq(session.userId, externalId));
  }

  /**
   * Moves a sign-in identity onto an archived profile and drops the now-redundant
   * source row. Ordered inside one transaction because external_id is unique: the
   * source must let go of it before the archived row can take it.
   */
  async restoreArchivedUser(
    archivedId: string,
    sourceId: string,
    sourceExternalId: string,
    displayName: string,
    shortName: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(appUsers).where(eq(appUsers.id, sourceId));
      await tx
        .update(appUsers)
        .set({
          externalId: sourceExternalId,
          displayName,
          shortName,
          archivedAt: null,
          archivedBy: null,
          deactivatedAt: null,
          deactivatedBy: null,
        })
        .where(eq(appUsers.id, archivedId));
    });
  }

  /**
   * Hard delete, reserved for accounts with no data at all: external_id is now
   * `set null`, so the app_users row must be removed explicitly.
   */
  async deleteUserPermanently(id: string, externalId: string | null): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(appUsers).where(eq(appUsers.id, id));
      if (externalId) {
        await tx.delete(user).where(eq(user.id, externalId));
      }
    });
  }

  async updateExternalUserEmail(externalId: string, email: string): Promise<void> {
    await db
      .update(user)
      .set({ email, emailVerified: false, updatedAt: new Date() })
      .where(eq(user.id, externalId));
  }

  async isEmailTaken(email: string, exceptExternalId: string): Promise<boolean> {
    const existing = await db.query.user.findFirst({
      where: eq(user.email, email),
      columns: { id: true },
    });
    return !!existing && existing.id !== exceptExternalId;
  }
}

export const userRepository = new UserRepository();
