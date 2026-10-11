import { matchRepository } from "../../repository/match.repository";
import { teamRepository } from "../../repository/team.repository";
import { userRepository } from "../../repository/user.repository";
import { BadRequestError, ConflictError, ErrorCode } from "../../types/errors";
import type { ChampionshipConfig, CreateMatchRequestData as CreateMatchInput } from "@skol-arena/shared/types/index";
import { t } from "../../utils/i18n-context";

type TournamentFromRepository = Awaited<ReturnType<typeof matchRepository.getTournament>>;

/** A tournament carrying its championship caps — the only shape this validator acts on. */
type CappedTournament = NonNullable<TournamentFromRepository> & {
  championshipConfig: ChampionshipConfig;
};

export class MatchRuleValidator {
  /**
   * The caps live on the championship config, so a tournament without one — a
   * bracket, a ranked season — has nothing to validate here. The size-mismatch
   * check inside the flex path is structural rather than a cap, but ranked has
   * always been exempt from it (asymmetric matches are a ranked feature) and
   * brackets generate their own matches, so skipping the whole pass is correct
   * for both.
   */
  async validateMatchRules(
    input: CreateMatchInput & { matchId?: string },
    tournament: NonNullable<TournamentFromRepository>,
  ): Promise<void> {
    if (!tournament.championshipConfig) return;
    const capped = tournament as CappedTournament;

    const sides = input.sides ?? [];
    if (sides.length < 2) return;

    if (capped.teamMode === "flex") {
      const flexSides = sides.filter((s) => s.playerIds && s.playerIds.length > 0);
      if (flexSides.length >= 2) {
        await this.validateFlexTeamRules(input, capped);
      }
    } else if (capped.teamMode === "static") {
      const staticSides = sides.filter((s) => s.teamId);
      if (staticSides.length >= 2) {
        await this.validateStaticTeamRules(input, capped);
      }
    }
  }

  private async validateStaticTeamRules(
    input: CreateMatchInput & { matchId?: string },
    tournament: CappedTournament,
  ): Promise<void> {
    const sides = input.sides ?? [];
    const excludeMatchId = input.matchId;

    const sidePlayerIds: string[][] = [];
    const teamNames: string[] = [];
    for (const side of sides) {
      if (!side.teamId) continue;
      const team = await teamRepository.getById(side.teamId);
      if (team && team.members.length > 0) {
        sidePlayerIds.push(team.members.map((m) => m.userId));
        teamNames.push(team.name);
      }
    }

    if (sidePlayerIds.length < 2) return;

    const allPlayerIds = sidePlayerIds.flat();
    await this.validateAtLeastOnePlayerUnderLimit(tournament, allPlayerIds, excludeMatchId);

    // No partner cap here: a fixed team always plays with the same teammates.
    await this.validateOpponentPairs(input.tournamentId, sidePlayerIds, tournament, excludeMatchId, teamNames);
  }

  private async validateFlexTeamRules(
    input: CreateMatchInput & { matchId?: string },
    tournament: CappedTournament,
  ): Promise<void> {
    const sides = input.sides ?? [];
    const sideSizes = sides.map((s) => s.playerIds?.length ?? 0);

    const mismatch = sideSizes.find((n) => n !== sideSizes[0]);
    if (mismatch !== undefined) {
      throw new BadRequestError(ErrorCode.MATCH_TEAM_SIZE_MISMATCH, {
        teamASize: sideSizes[0],
        teamBSize: mismatch,
      });
    }

    const allPlayerIds = sides.flatMap((s) => s.playerIds ?? []);
    const excludeMatchId = input.matchId;

    await this.validateAtLeastOnePlayerUnderLimit(tournament, allPlayerIds, excludeMatchId);

    for (const side of sides) {
      if (side.playerIds && side.playerIds.length > 1) {
        await this.validateTeamPartnerConstraints(tournament, side.playerIds, excludeMatchId);
      }
    }

    const sidePlayerIds = sides.map((s) => s.playerIds ?? []).filter((ids) => ids.length > 0);
    await this.validateOpponentPairs(input.tournamentId, sidePlayerIds, tournament, excludeMatchId);
  }

  /** The opponent cap holds for every pair of sides: in a 1v1v1, each duel within it. */
  private async validateOpponentPairs(
    tournamentId: string,
    sidePlayerIds: string[][],
    tournament: CappedTournament,
    excludeMatchId?: string,
    teamNames?: string[],
  ): Promise<void> {
    for (let i = 0; i < sidePlayerIds.length; i++) {
      for (let j = i + 1; j < sidePlayerIds.length; j++) {
        await this.validateTeamOpponentConstraints(
          tournamentId,
          sidePlayerIds[i],
          sidePlayerIds[j],
          tournament,
          excludeMatchId,
          teamNames ? [teamNames[i], teamNames[j]] : undefined,
        );
      }
    }
  }

  private async validateAtLeastOnePlayerUnderLimit(
    tournament: CappedTournament,
    allPlayerIds: string[],
    excludeMatchId?: string,
  ): Promise<void> {
    const counts = await Promise.all(
      allPlayerIds.map((id) => matchRepository.countMatchesForUser(tournament.id, id, excludeMatchId)),
    );
    const atLeastOneUnderLimit = counts.some((count) => count < tournament.championshipConfig.maxMatchesPerPlayer);
    if (!atLeastOneUnderLimit) {
      throw new ConflictError(ErrorCode.ALL_PLAYERS_MAX_MATCHES_EXCEEDED, {
        max: tournament.championshipConfig.maxMatchesPerPlayer,
      });
    }
  }

  private async validateTeamPartnerConstraints(
    tournament: CappedTournament,
    teamPlayerIds: string[],
    excludeMatchId?: string,
  ): Promise<void> {
    const count = await matchRepository.countMatchesForTeam(tournament.id, teamPlayerIds, excludeMatchId);

    if (count >= tournament.championshipConfig.maxTimesWithSamePartner) {
      throw new ConflictError(ErrorCode.MAX_PARTNER_MATCHES_EXCEEDED, {
        max: tournament.championshipConfig.maxTimesWithSamePartner,
        teamName: await this.joinPlayerNames(teamPlayerIds),
      });
    }
  }

  private async validateTeamOpponentConstraints(
    tournamentId: string,
    playerIdsA: string[],
    playerIdsB: string[],
    tournament: CappedTournament,
    excludeMatchId?: string,
    /** Fixed teams have a name; flex sides are named after their players. */
    teamNames?: [string, string],
  ): Promise<void> {
    const count = await matchRepository.countMatchesTeamsVsTeam(tournamentId, playerIdsA, playerIdsB, excludeMatchId);

    if (count >= tournament.championshipConfig.maxTimesWithSameOpponent) {
      const [teamName, opponentTeamName] =
        teamNames ?? (await Promise.all([this.joinPlayerNames(playerIdsA), this.joinPlayerNames(playerIdsB)]));
      throw new ConflictError(ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED, {
        max: tournament.championshipConfig.maxTimesWithSameOpponent,
        teamName,
        opponentTeamName,
      });
    }
  }

  private async joinPlayerNames(playerIds: string[]): Promise<string> {
    const names = await Promise.all(playerIds.map((id) => this.getPlayerName(id)));
    return names.join(", ");
  }

  private async getPlayerName(playerId: string): Promise<string> {
    const player = await userRepository.getById(playerId);
    return player?.displayName || t("messages.PLAYER_FALLBACK", { id: playerId.substring(0, 8) });
  }
}

export const matchRuleValidator = new MatchRuleValidator();
