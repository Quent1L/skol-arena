import { matchRepository } from "../../repository/match.repository";
import { userRepository } from "../../repository/user.repository";
import { teamRepository } from "../../repository/team.repository";
import { AppError, BadRequestError, ErrorCode } from "../../types/errors";
import { participantRepository } from "../../repository/participant.repository";
import type { CreateMatchRequestData as CreateMatchInput, MatchSideInput } from "@skol-arena/shared/types/index";
import { t } from "../../utils/i18n-context";
import { rankedMatchMaxAgeHours } from "../../config/ranked";

type TournamentFromRepository = Awaited<
    ReturnType<typeof matchRepository.getTournament>
>;

export class MatchInputValidator {
    async validateMatchInput(
        input: CreateMatchInput,
        tournament: NonNullable<TournamentFromRepository>
    ): Promise<void> {
        const sides = input.sides ?? [];
        if (sides.length < 2) {
            throw new BadRequestError(
                tournament.teamMode === "static"
                    ? ErrorCode.MATCH_INVALID_TEAMS
                    : ErrorCode.MATCH_INVALID_PLAYERS
            );
        }

        if (tournament.teamMode === "static") {
            await this.validateStaticSides(sides, tournament);
        } else {
            await this.validateFlexSides(sides, tournament);
        }
    }

    private async validateStaticSides(
        sides: MatchSideInput[],
        tournament: NonNullable<TournamentFromRepository>
    ): Promise<void> {
        for (const side of sides) {
            if (!side.teamId) {
                throw new BadRequestError(ErrorCode.MATCH_INVALID_TEAMS);
            }
        }

        const teamIds = sides.map((s) => s.teamId!);
        if (new Set(teamIds).size !== teamIds.length) {
            throw new BadRequestError(ErrorCode.MATCH_INVALID_TEAMS);
        }

        for (const teamId of teamIds) {
            await matchRepository.validateEntriesForTournament(
                tournament.id,
                teamId
            );
            const size = await teamRepository.getMemberCount(teamId);
            if (size < tournament.minTeamSize || size > tournament.maxTeamSize) {
                throw new BadRequestError(ErrorCode.TEAM_SIZE_INVALID);
            }
        }
    }

    private async validateFlexSides(
        sides: MatchSideInput[],
        tournament: NonNullable<TournamentFromRepository>
    ): Promise<void> {
        for (const side of sides) {
            if (!side.playerIds || side.playerIds.length === 0) {
                throw new BadRequestError(ErrorCode.MATCH_INVALID_PLAYERS);
            }
        }

        const allPlayerIds = sides.flatMap((s) => s.playerIds ?? []);
        if (new Set(allPlayerIds).size !== allPlayerIds.length) {
            throw new BadRequestError(ErrorCode.MATCH_OVERLAPPING_PLAYERS);
        }

        await this.validatePlayersRegistered(tournament, allPlayerIds);
    }

    /**
     * Every player needs an active registration. In a ranked season a player who never
     * joined, or who left, is registered by the match itself (autoRegisterRankedPlayers);
     * one an organizer removed is refused everywhere, only an organizer can add them back.
     */
    private async validatePlayersRegistered(
        tournament: NonNullable<TournamentFromRepository>,
        playerIds: string[]
    ): Promise<void> {
        const statuses = await participantRepository.findStatuses(tournament.id, playerIds);
        for (const playerId of playerIds) {
            const status = statuses.get(playerId);
            if (status === "active") continue;
            if (status === "removed") {
                throw await this.playerError(ErrorCode.MATCH_PLAYER_REMOVED, playerId);
            }
            if (tournament.mode !== "ranked") {
                throw await this.playerError(ErrorCode.MATCH_PLAYER_NOT_REGISTERED, playerId);
            }
        }
    }

    private async playerError(code: ErrorCode, playerId: string): Promise<BadRequestError> {
        const player = await userRepository.getById(playerId);
        return new BadRequestError(code, { playerName: player?.displayName || playerId });
    }

    /** Dry-run helper: records a validation failure as a translated message. */
    private collectError(error: unknown, errors: string[]): void {
        if (!(error instanceof AppError)) throw error;
        errors.push(t(`errors.${error.code}`, error.details ?? {}));
    }

    validateWinnerRequired(winnerPosition?: number | null, allowDraw = false): void {
        if (winnerPosition === null && allowDraw) return;
        if (winnerPosition === undefined || winnerPosition === null) {
            throw new BadRequestError(ErrorCode.MATCH_WINNER_REQUIRED);
        }
    }

    validateScores(scoreA: number, scoreB: number): void {
        if (scoreA < 0 || scoreB < 0) {
            throw new BadRequestError(ErrorCode.MATCH_INVALID_SCORE);
        }
    }

    validateScoreRange(
        scoreA: number,
        scoreB: number,
        minScore: number | null | undefined,
        maxScore: number | null | undefined
    ): void {
        if (minScore != null && (scoreA < minScore || scoreB < minScore)) {
            throw new BadRequestError(ErrorCode.MATCH_SCORE_OUT_OF_RANGE);
        }
        if (maxScore != null && (scoreA > maxScore || scoreB > maxScore)) {
            throw new BadRequestError(ErrorCode.MATCH_SCORE_OUT_OF_RANGE);
        }
    }

    async validateDrawAllowed(
        tournamentId: string,
        scoreA: number,
        scoreB: number,
        winnerPosition?: number | null,
    ): Promise<void> {
        const isDraw = winnerPosition === null || (winnerPosition === undefined && scoreA === scoreB);
        if (!isDraw) return;

        const tournament = await matchRepository.getTournament(tournamentId);
        if (!tournament?.allowDraw) {
            throw new BadRequestError(ErrorCode.MATCH_DRAW_NOT_ALLOWED);
        }
    }

    validateRankedPlayedAt(playedAt: Date | string | undefined): void {
        const maxAgeHours = rankedMatchMaxAgeHours();

        // A date is required whatever the window: the MMR replay orders matches by it.
        if (!playedAt) {
            throw new BadRequestError(ErrorCode.RANKED_MATCH_TOO_OLD, { hours: maxAgeHours });
        }

        // 0 disables the age check — backdating a whole season for a test run.
        if (maxAgeHours === 0) return;

        const played = new Date(playedAt);
        const diffMs = Date.now() - played.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours > maxAgeHours) {
            throw new BadRequestError(ErrorCode.RANKED_MATCH_TOO_OLD, { hours: maxAgeHours });
        }
    }

    /**
     * Dry-run counterpart of validateRankedPlayedAt: collects the message instead of
     * throwing, so /matches/validate reports a stale date rather than letting the form
     * pass its pre-check and take a 400 on submit.
     *
     * A missing date is deliberately not reported here — the dry run can be called from
     * a step where the user has not picked one yet. Creation still refuses it.
     */
    collectRankedPlayedAt(playedAt: Date | string | undefined, errors: string[]): void {
        if (!playedAt) return;

        try {
            this.validateRankedPlayedAt(playedAt);
        } catch (error) {
            if (!(error instanceof BadRequestError)) throw error;
            errors.push(t(`errors.${error.code}`, error.details ?? {}));
        }
    }

    async validateMatchInputForValidation(
        input: CreateMatchInput & { allPlayerIds?: string[] },
        tournament: NonNullable<TournamentFromRepository>,
        errors: string[]
    ): Promise<void> {
        if (input.allPlayerIds && input.allPlayerIds.length > 0) {
            await this.validateAllPlayerIdsForValidation(
                input.allPlayerIds, tournament, errors
            );
            return;
        }

        const sides = input.sides ?? [];
        if (sides.length === 0) return;

        if (tournament.teamMode === "static") {
            await this.validateStaticSidesForValidation(sides, tournament, errors);
        } else {
            await this.validateFlexSidesForValidation(sides, tournament, errors);
        }
    }

    private async validateAllPlayerIdsForValidation(
        allPlayerIds: string[],
        tournament: NonNullable<TournamentFromRepository>,
        errors: string[]
    ): Promise<void> {
        const min = tournament.minTeamSize * 2;
        const max = tournament.maxTeamSize * 2;
        if (allPlayerIds.length < min || allPlayerIds.length > max) {
            errors.push(
                t(`errors.${ErrorCode.MATCH_PLAYER_COUNT_INVALID}`, {
                    min,
                    max,
                    minTeamSize: tournament.minTeamSize,
                    maxTeamSize: tournament.maxTeamSize,
                    count: allPlayerIds.length,
                })
            );
            return;
        }
        try {
            await this.validatePlayersRegistered(tournament, allPlayerIds);
        } catch (error) {
            this.collectError(error, errors);
        }
    }

    private async validateStaticSidesForValidation(
        sides: MatchSideInput[],
        tournament: NonNullable<TournamentFromRepository>,
        errors: string[]
    ): Promise<void> {
        const teamIds = sides.map((s) => s.teamId).filter(Boolean) as string[];

        for (const teamId of teamIds) {
            try {
                await matchRepository.validateEntriesForTournament(
                    tournament.id,
                    teamId
                );
            } catch (error) {
                this.collectError(error, errors);
            }
        }

        if (teamIds.length >= 2 && new Set(teamIds).size !== teamIds.length) {
            errors.push("Les équipes ne peuvent pas être identiques");
        }

        if (teamIds.length >= 2) {
            await this.validateTeamSizesForValidation(
                teamIds,
                tournament.minTeamSize,
                tournament.maxTeamSize,
                errors
            );
        }
    }

    private async validateTeamSizesForValidation(
        teamIds: string[],
        minTeamSize: number,
        maxTeamSize: number,
        errors: string[]
    ): Promise<void> {
        const sizes = await Promise.all(
            teamIds.map((id) => teamRepository.getMemberCount(id))
        );
        sizes.forEach((size, i) => {
            if (size < minTeamSize || size > maxTeamSize) {
                errors.push(
                    `L'équipe ${i + 1} a ${size} membre(s), attendu entre ${minTeamSize} et ${maxTeamSize}`
                );
            }
        });
    }

    private async validateFlexSidesForValidation(
        sides: MatchSideInput[],
        tournament: NonNullable<TournamentFromRepository>,
        errors: string[]
    ): Promise<void> {
        try {
            await this.validatePlayersRegistered(
                tournament,
                [...new Set(sides.flatMap((s) => s.playerIds ?? []))]
            );
        } catch (error) {
            this.collectError(error, errors);
        }

        if (sides.length >= 2) {
            await this.checkOverlappingPlayersForValidation(sides, errors);
        }
    }

    private async checkOverlappingPlayersForValidation(
        sides: MatchSideInput[],
        errors: string[]
    ): Promise<void> {
        const allIds = sides.flatMap((s) => s.playerIds ?? []);
        const seen = new Set<string>();
        for (const id of allIds) {
            if (seen.has(id)) {
                const player = await userRepository.getById(id);
                const playerName = player?.displayName || id;
                errors.push(
                    t("errors.MATCH_OVERLAPPING_PLAYERS", { playerName })
                );
                return;
            }
            seen.add(id);
        }
    }
}

export const matchInputValidator = new MatchInputValidator();
