import { matchRepository } from "../../repository/match.repository";
import { tournamentRepository } from "../../repository/tournament.repository";
import { userRepository } from "../../repository/user.repository";
import { teamRepository } from "../../repository/team.repository";
import { ForbiddenError, ErrorCode } from "../../types/errors";
import type { CreateMatchRequestData as CreateMatchInput } from "@skol-arena/shared/types/index";

type TournamentFromRepository = Awaited<
    ReturnType<typeof matchRepository.getTournament>
>;

/**
 * Validator for match permissions
 */
export class MatchPermissionValidator {
    /**
     * Check if user can manage matches in tournament
     */
    async canManageMatches(
        tournamentId: string,
        userId: string
    ): Promise<boolean> {
        const user = await userRepository.getById(userId);
        if (!user) return false;
        if (user.role === "super_admin") return true;

        // Check if user is tournament admin
        return await tournamentRepository.isUserTournamentAdmin(
            tournamentId,
            userId
        );
    }

    /**
     * Check if user has permission to create match
     */
    async checkCreatePermissions(
        input: CreateMatchInput,
        createdBy: string,
        tournament: NonNullable<TournamentFromRepository>
    ): Promise<void> {
        if (tournament.teamMode !== "static" && this.isPlayerInSides(input, createdBy)) {
            return;
        }

        // Kiosk users can create matches without being a participant
        const user = await userRepository.getById(createdBy);
        if (user?.role === "kiosk") {
            return;
        }

        if (await this.canManageMatches(input.tournamentId, createdBy)) {
            return;
        }

        const isTeamMember =
            tournament.teamMode === "static" &&
            (await this.isMemberOfASide(input, createdBy));
        if (!isTeamMember) {
            throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
        }
    }

    /**
     * Validate user can report match
     */
    async validateReportPermissions(
        matchId: string,
        userId: string
    ): Promise<void> {
        // Kiosk users can report results for matches they created
        const user = await userRepository.getById(userId);
        if (user?.role === "kiosk") {
            const match = await matchRepository.getById(matchId);
            if (match?.createdBy === userId) return;
            throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
        }

        const isParticipant = await matchRepository.isUserInMatch(matchId, userId);
        if (!isParticipant) {
            throw new ForbiddenError(ErrorCode.NOT_A_PARTICIPANT);
        }
    }

    private isPlayerInSides(input: CreateMatchInput, playerId: string): boolean {
        return (input.sides ?? []).some((s) => s.playerIds?.includes(playerId));
    }

    /**
     * In static mode a side is its team: `playerIds` is never read when the entry is
     * built, so listing yourself there proves nothing. Membership of one of the teams
     * is what makes the creator a participant.
     */
    private async isMemberOfASide(input: CreateMatchInput, playerId: string): Promise<boolean> {
        for (const side of input.sides ?? []) {
            if (side.teamId && (await teamRepository.isMember(side.teamId, playerId))) {
                return true;
            }
        }
        return false;
    }
}

export const matchPermissionValidator = new MatchPermissionValidator();
