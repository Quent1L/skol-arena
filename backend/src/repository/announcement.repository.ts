import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../config/database";
import {
  announcements,
  announcementViews,
  appUsers,
  notifications,
  tournamentParticipants,
  tournaments,
} from "../db/schema";
import type { AnnouncementAudience } from "@skol-arena/shared";

export type AnnouncementRow = typeof announcements.$inferSelect;

export interface NewAnnouncement {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  tournamentId: string | null;
  inFeed: boolean;
  asPopup: boolean;
  expiresAt: Date | null;
  createdBy: string;
}

/** An announcement with the names and counters the admin lists show. */
export interface AnnouncementListRow extends AnnouncementRow {
  tournamentName: string | null;
  authorName: string | null;
  recipientCount: number;
  seenCount: number;
}

const recipientCount = sql<number>`(
  select count(*)::int from ${notifications}
  where ${notifications.announcementId} = ${announcements.id}
)`;
const seenCount = sql<number>`(
  select count(*)::int from ${announcementViews}
  where ${announcementViews.announcementId} = ${announcements.id}
)`;

async function listWhere(where: SQL | undefined): Promise<AnnouncementListRow[]> {
  const rows = await db
    .select({
      announcement: announcements,
      tournamentName: tournaments.name,
      authorName: appUsers.displayName,
      recipientCount,
      seenCount,
    })
    .from(announcements)
    .leftJoin(tournaments, eq(tournaments.id, announcements.tournamentId))
    .leftJoin(appUsers, eq(appUsers.id, announcements.createdBy))
    .where(where)
    .orderBy(desc(announcements.createdAt), desc(announcements.id));
  return rows.map(({ announcement, ...rest }) => ({ ...announcement, ...rest }));
}

export const announcementRepository = {
  async create(data: NewAnnouncement): Promise<AnnouncementRow> {
    const [row] = await db.insert(announcements).values(data).returning();
    return row;
  },

  async findById(id: string): Promise<AnnouncementRow | undefined> {
    const [row] = await db.select().from(announcements).where(eq(announcements.id, id));
    return row;
  },

  async delete(id: string): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  },

  listAll(): Promise<AnnouncementListRow[]> {
    return listWhere(undefined);
  },

  listForTournament(tournamentId: string): Promise<AnnouncementListRow[]> {
    return listWhere(eq(announcements.tournamentId, tournamentId));
  },

  /**
   * Pop-ups the user has not dismissed yet, oldest first so they read in order.
   * Without a tournament: the app-wide ones. With one: that tournament's, and only
   * while the user is one of its active players.
   */
  async findPendingPopups(
    userId: string,
    tournamentId?: string,
  ): Promise<AnnouncementRow[]> {
    const scope = tournamentId
      ? and(
          eq(announcements.audience, "tournament"),
          eq(announcements.tournamentId, tournamentId),
          sql`exists (
            select 1 from ${tournamentParticipants}
            where ${tournamentParticipants.tournamentId} = ${tournamentId}
              and ${tournamentParticipants.userId} = ${userId}
              and ${tournamentParticipants.status} = 'active'
          )`,
        )
      : eq(announcements.audience, "all");

    const rows = await db
      .select({ announcement: announcements })
      .from(announcements)
      .leftJoin(
        announcementViews,
        and(
          eq(announcementViews.announcementId, announcements.id),
          eq(announcementViews.userId, userId),
        ),
      )
      .where(
        and(
          eq(announcements.asPopup, true),
          isNull(announcementViews.userId),
          or(isNull(announcements.expiresAt), sql`${announcements.expiresAt} > now()`),
          or(isNull(announcements.createdBy), sql`${announcements.createdBy} <> ${userId}`),
          scope,
        ),
      )
      .orderBy(announcements.createdAt, announcements.id);
    return rows.map((r) => r.announcement);
  },

  async markSeen(announcementId: string, userId: string): Promise<void> {
    await db
      .insert(announcementViews)
      .values({ announcementId, userId })
      .onConflictDoNothing();
  },
};
