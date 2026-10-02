import { eq, and, count, isNotNull } from "drizzle-orm";
import { db } from "../config/database";
import { teams, teamMembers, tournamentEntries, tournaments } from "../db/schema";

export class TeamRepository {
  async create(data: { tournamentId: string; name: string; createdBy: string }) {
    const [team] = await db.insert(teams).values(data).returning();
    return team;
  }

  async hasMatchEntry(teamId: string): Promise<boolean> {
    const entry = await db.query.tournamentEntries.findFirst({
      where: eq(tournamentEntries.teamId, teamId),
    });
    return !!entry;
  }

  async getById(id: string) {
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, id),
      with: {
        members: {
          with: { user: true },
        },
      },
    });
    if (!team) return null;
    const hasMatch = await this.hasMatchEntry(id);
    return { ...team, hasMatch };
  }

  async getByTournament(tournamentId: string) {
    const teamList = await db.query.teams.findMany({
      where: eq(teams.tournamentId, tournamentId),
      with: {
        members: {
          with: { user: true },
        },
      },
    });

    const entries = await db
      .selectDistinct({ teamId: tournamentEntries.teamId })
      .from(tournamentEntries)
      .where(
        and(
          eq(tournamentEntries.tournamentId, tournamentId),
          isNotNull(tournamentEntries.teamId),
        )
      );
    const teamsWithMatch = new Set(entries.map((e) => e.teamId));

    return teamList.map((team) => ({ ...team, hasMatch: teamsWithMatch.has(team.id) }));
  }

  async addMember(teamId: string, userId: string) {
    const [member] = await db
      .insert(teamMembers)
      .values({ teamId, userId })
      .returning();
    return member;
  }

  /**
   * Adds a member under a lock on the tournament row, so concurrent joins see each
   * other: two players cannot both take the last seat, nor one player two teams.
   */
  async addMemberIfAllowed(
    tournamentId: string,
    teamId: string,
    userId: string,
    maxTeamSize: number,
  ): Promise<"added" | "full" | "already_in_team"> {
    return await db.transaction(async (tx) => {
      await tx.select({ id: tournaments.id }).from(tournaments)
        .where(eq(tournaments.id, tournamentId)).for("update");

      const [existing] = await tx.select({ id: teamMembers.id }).from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(and(eq(teams.tournamentId, tournamentId), eq(teamMembers.userId, userId)))
        .limit(1);
      if (existing) return "already_in_team";

      const [{ value }] = await tx.select({ value: count() }).from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));
      if (value >= maxTeamSize) return "full";

      await tx.insert(teamMembers).values({ teamId, userId });
      return "added";
    });
  }

  async removeMember(teamId: string, userId: string) {
    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  }

  async isMember(teamId: string, userId: string): Promise<boolean> {
    const member = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
    });
    return !!member;
  }

  async getMemberCount(teamId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    return result?.count ?? 0;
  }

  async getUserTeamInTournament(tournamentId: string, userId: string) {
    const result = await db
      .select({ team: teams })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teams.tournamentId, tournamentId),
          eq(teamMembers.userId, userId),
        )
      )
      .limit(1);
    return result[0]?.team ?? null;
  }

  async delete(id: string) {
    await db.delete(teams).where(eq(teams.id, id));
  }
}

export const teamRepository = new TeamRepository();
