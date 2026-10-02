import { teamRepository } from "../repository/team.repository";
import { db } from "../config/database";
import { tournaments, tournamentParticipants, teams } from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ErrorCode,
} from "../types/errors";
import { webSocketService } from "./websocket.service";

class TeamService {
  private checkTournamentEditable(tournament: { status: string }) {
    if (tournament.status === "ongoing" || tournament.status === "finished") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS);
    }
  }

  /**
   * Rights are checked against the tournament in the URL, so the team must belong to
   * it: otherwise an admin of one tournament could act on the teams of any other.
   */
  private async getTeamInTournament(teamId: string, tournamentId: string) {
    const team = await teamRepository.getById(teamId);
    if (!team || team.tournamentId !== tournamentId) {
      throw new NotFoundError(ErrorCode.TEAM_NOT_FOUND);
    }
    return team;
  }

  private async assertActiveParticipant(tournamentId: string, userId: string) {
    const participant = await db.query.tournamentParticipants.findFirst({
      where: and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.userId, userId),
        eq(tournamentParticipants.status, "active"),
      ),
    });
    if (!participant) {
      throw new BadRequestError(ErrorCode.NOT_A_PARTICIPANT);
    }
  }

  async createTeam(tournamentId: string, name: string, createdBy: string, isAdmin: boolean = false) {
    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
    });

    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }

    if (tournament.teamMode !== "static") {
      throw new BadRequestError(ErrorCode.INVALID_TOURNAMENT_MODE);
    }

    this.checkTournamentEditable(tournament);
    // Registration is what vouches for the caller (it checks the organization), so
    // only registered players and the organizers may create teams.
    if (!isAdmin) {
      await this.assertActiveParticipant(tournamentId, createdBy);
    }

    const nameCheck = await db.query.teams.findFirst({
      where: and(eq(teams.tournamentId, tournamentId), eq(teams.name, name)),
    });

    if (nameCheck) {
      throw new ConflictError(ErrorCode.TEAM_NAME_TAKEN);
    }

    const team = await teamRepository.create({ tournamentId, name, createdBy });

    if (!isAdmin) {
      const outcome = await teamRepository.addMemberIfAllowed(
        tournamentId,
        team.id,
        createdBy,
        tournament.maxTeamSize,
      );
      if (outcome !== "added") {
        await teamRepository.delete(team.id);
        throw new ConflictError(ErrorCode.PLAYER_ALREADY_IN_TEAM);
      }
    }
    // Admin → team created empty, no auto-add, no conflict check

    const result = await teamRepository.getById(team.id);
    webSocketService.broadcastToTournament(tournamentId, { event: "team_created", data: result });
    return result;
  }

  async listTeams(tournamentId: string) {
    return await teamRepository.getByTournament(tournamentId);
  }

  async joinTeam(
    teamId: string,
    tournamentId: string,
    userId: string,
    requestedBy: string,
    isAdmin: boolean,
  ) {
    // Only admins can add other users
    if (userId !== requestedBy && !isAdmin) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN);
    }

    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
    });

    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }

    await this.getTeamInTournament(teamId, tournamentId);

    if (await teamRepository.hasMatchEntry(teamId)) {
      throw new BadRequestError(ErrorCode.TEAM_HAS_MATCH);
    }

    this.checkTournamentEditable(tournament);
    await this.assertActiveParticipant(tournamentId, userId);

    const outcome = await teamRepository.addMemberIfAllowed(
      tournamentId,
      teamId,
      userId,
      tournament.maxTeamSize,
    );
    if (outcome === "already_in_team") {
      throw new ConflictError(ErrorCode.PLAYER_ALREADY_IN_TEAM);
    }
    if (outcome === "full") {
      throw new BadRequestError(ErrorCode.TEAM_FULL);
    }

    const updated = await teamRepository.getById(teamId);
    webSocketService.broadcastToTournament(tournamentId, { event: "team_updated", data: updated });
    return updated;
  }

  async leaveTeam(
    teamId: string,
    tournamentId: string,
    userId: string,
    requestedBy: string,
    isAdmin: boolean,
  ) {
    if (userId !== requestedBy && !isAdmin) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN);
    }

    const team = await this.getTeamInTournament(teamId, tournamentId);

    const teamHasMatch = await teamRepository.hasMatchEntry(teamId);
    if (teamHasMatch) {
      throw new BadRequestError(ErrorCode.TEAM_HAS_MATCH);
    }

    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, team.tournamentId),
    });

    if (tournament) {
      this.checkTournamentEditable(tournament);
    }

    const isMember = await teamRepository.isMember(teamId, userId);
    if (!isMember) {
      throw new BadRequestError(ErrorCode.PLAYER_NOT_IN_TEAM);
    }

    await teamRepository.removeMember(teamId, userId);

    // Fix #1: auto-delete team when last member leaves
    const count = await teamRepository.getMemberCount(teamId);
    if (count === 0) {
      await teamRepository.delete(teamId);
      webSocketService.broadcastToTournament(team.tournamentId, {
        event: "team_deleted",
        data: { teamId },
      });
    } else {
      const updated = await teamRepository.getById(teamId);
      webSocketService.broadcastToTournament(team.tournamentId, {
        event: "team_updated",
        data: updated,
      });
    }
  }

  async deleteTeam(teamId: string, tournamentId: string, requestedBy: string, isAdmin: boolean) {
    const team = await this.getTeamInTournament(teamId, tournamentId);

    if (team.createdBy !== requestedBy && !isAdmin) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN);
    }

    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, team.tournamentId),
    });

    if (tournament) {
      this.checkTournamentEditable(tournament);
    }

    await teamRepository.delete(teamId);
    webSocketService.broadcastToTournament(team.tournamentId, {
      event: "team_deleted",
      data: { teamId },
    });
  }
}

export const teamService = new TeamService();
