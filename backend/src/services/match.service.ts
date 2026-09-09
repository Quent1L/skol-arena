import {
  matchRepository,
  type CreateMatchData,
  type UpdateMatchData,
} from '../repository/match.repository'
import { matchConfirmationRepository } from '../repository/match-confirmation.repository'
import { userRepository } from '../repository/user.repository'
import { organizationRepository } from '../repository/organization.repository'
import { entryRepository } from '../repository/entry.repository'
import {
  type CreateMatchRequestData as CreateMatchInput,
  type UpdateMatchRequestData as UpdateMatchInput,
  type ReportMatchResultRequestData as ReportMatchResultInput,
  type ConfirmMatchRequestData as ConfirmMatchInput,
  type ContestMatchRequestData as ContestMatchInput,
  type FinalizeMatchRequestData as FinalizeMatchInput,
  type RespondToMatchRequestData as RespondToMatchInput,
  type MatchStatus,
  type ListMatchCardsQuery,
  type ClientMatchCard,
  type PaginatedMatchCards,
  POST_FINALIZATION_DISPUTE_DAYS,
} from '@skol-arena/shared/types/index'
import {
  ErrorCode,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  AppError,
} from '../types/errors'
import { t } from '../utils/i18n-context'
import { matchSidesRepository } from '../repository/match-sides.repository'
import { notificationService } from './notification.service'
import { matchInputValidator } from './validators/match-input.validator'
import { logger } from '../utils/logger'
import { matchRuleValidator } from './validators/match-rule.validator'
import { matchPermissionValidator } from './validators/match-permission.validator'
import { matchStatusValidator } from './validators/match-status.validator'
import { standingsService } from './standings.service'
import { playerComputedDataRepository } from '../repository/player-computed-data.repository'
import { participantRepository } from '../repository/participant.repository'
import { rankedSeasonRepository } from '../repository/ranked-season.repository'
import { rankedSeasonService } from './ranked-season.service'
import { teamRepository } from '../repository/team.repository'
import { matchNotificationBuilder } from './match-notification.builder'
import { matchFinalizationOrchestrator } from './match-finalization.orchestrator'
import { matchMessageService } from './match-message.service'
import { matchRealtimeService } from './match-realtime.service'

type TournamentFromRepository = Awaited<ReturnType<typeof matchRepository.getTournament>>

const DEFAULT_AUTO_VALIDATION_HOURS = 24
const TRUST_SCORE_THRESHOLD = 10

export class MatchService {
  async canManageMatches(tournamentId: string, userId: string): Promise<boolean> {
    return await matchPermissionValidator.canManageMatches(tournamentId, userId)
  }

  /**
   * Which organizations a caller may see matches from. null lifts the restriction
   * (super admins); an empty array leaves only the competitions attached to none.
   */
  private async visibleOrganizationIdsFor(viewerId: string | null): Promise<string[] | null> {
    if (!viewerId) return []

    const viewer = await userRepository.getById(viewerId)
    if (viewer?.role === 'super_admin') return null

    return await organizationRepository.getUserOrganizationIds(viewerId)
  }

  async createMatch(input: CreateMatchInput, createdBy: string) {
    const tournament = await this.getAndValidateTournament(input.tournamentId)
    await this.runCreateValidations(input, createdBy, tournament)

    const matchId = await this.createMatchRecord(input, createdBy, tournament)

    if (input.status === 'reported') {
      return await this.handleReportedCreation(matchId, input, createdBy, tournament)
    }

    await matchNotificationBuilder.notifyMatchCreated(matchId, createdBy, tournament.name)
    return await matchRepository.getById(matchId)
  }

  private async runCreateValidations(
    input: CreateMatchInput,
    createdBy: string,
    tournament: NonNullable<TournamentFromRepository>,
  ): Promise<void> {
    await this.checkCreatePermissions(input, createdBy, tournament)
    await this.validateMatchInput(input, tournament)
    await this.validateMatchRules(input, tournament)

    if (tournament.mode === 'ranked') {
      matchInputValidator.validateRankedPlayedAt(input.playedAt)
      await this.autoRegisterRankedPlayers(input)
    }

    if (!tournament.scoreEnabled && input.status === 'reported') {
      matchInputValidator.validateWinnerRequired(input.winnerPosition, tournament.allowDraw ?? false)
      input.scoreA = null
      input.scoreB = null
    } else if (input.status === 'reported' && input.scoreA != null && input.scoreB != null) {
      matchInputValidator.validateScores(input.scoreA, input.scoreB)
      matchInputValidator.validateScoreRange(
        input.scoreA,
        input.scoreB,
        tournament.minScore,
        tournament.maxScore,
      )
      await matchInputValidator.validateDrawAllowed(
        input.tournamentId,
        input.scoreA,
        input.scoreB,
        input.winnerPosition,
      )
    }

    if (input.playedAt) {
      const playerIds = await this.resolvePlayerIds(input, tournament)
      await this.validateNoPlayerConflict(playerIds, input.playedAt, input.tournamentId)
    }
  }

  private async handleReportedCreation(
    matchId: string,
    input: CreateMatchInput,
    createdBy: string,
    tournament: NonNullable<TournamentFromRepository>,
  ) {
    const creator = await userRepository.getById(createdBy)
    if (creator?.role !== 'kiosk') {
      await matchConfirmationRepository.upsert({
        matchId,
        playerId: createdBy,
        isConfirmed: true,
        isContested: false,
      })

      if (tournament.validationMode === 'none') {
        await this.finalizeMatch(matchId, { finalizationReason: 'auto_validation' }, createdBy)
        await this.triggerStandingsRecalcIfNeeded(input.tournamentId, matchId)
        await matchNotificationBuilder.notifyMatchCreated(matchId, createdBy, tournament.name)
        return await matchRepository.getById(matchId)
      }

      if (
        tournament.validationMode === 'auto' &&
        (creator?.trustScoreCount ?? 0) >= TRUST_SCORE_THRESHOLD
      ) {
        await this.finalizeMatch(matchId, { finalizationReason: 'trust_score' }, createdBy)
        await this.triggerStandingsRecalcIfNeeded(input.tournamentId, matchId)
        await matchNotificationBuilder.notifyMatchCreated(matchId, createdBy, tournament.name)
        return await matchRepository.getById(matchId)
      }
    }

    await this.checkAndFinalizeMatch(matchId)
    await this.triggerStandingsRecalcIfNeeded(input.tournamentId, matchId)

    const refreshed = await matchRepository.getById(matchId)
    if (refreshed?.status === 'reported') {
      await matchNotificationBuilder.notifyMatchValidationRequired(matchId, createdBy)
      this.scheduleProvisionalRecompute(input.tournamentId)
    } else {
      await matchNotificationBuilder.notifyMatchCreated(matchId, createdBy, tournament.name)
    }

    return await matchRepository.getById(matchId)
  }

  private async triggerStandingsRecalcIfNeeded(
    tournamentId: string,
    matchId?: string,
  ): Promise<void> {
    const tournament = await matchRepository.getTournament(tournamentId)
    if (tournament?.mode === 'championship') {
      if (tournament.teamMode === 'flex' && tournament.championshipConfig) {
        await standingsService.recalculatePointsInternal(tournamentId)
      } else {
        await standingsService.invalidateCache(tournamentId)
      }
    }
    if (matchId) {
      const playerIds = await matchRepository.getPlayerIdsForMatch(matchId)
      if (playerIds.length > 0) {
        await playerComputedDataRepository.deleteMany(playerIds)
      }
    }
  }

  private async autoRegisterRankedPlayers(input: CreateMatchInput): Promise<void> {
    const allPlayerIds = (input.sides ?? []).flatMap((s) => s.playerIds ?? [])
    for (const playerId of allPlayerIds) {
      const existing = await participantRepository.findParticipationByUserAndTournament(
        playerId,
        input.tournamentId,
      )
      if (!existing) {
        await participantRepository.createParticipation(playerId, input.tournamentId)
      }
    }
  }

  private async getAndValidateTournament(tournamentId: string) {
    const tournament = await matchRepository.getTournament(tournamentId)
    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND)
    }

    if (!['open', 'ongoing'].includes(tournament.status)) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_INVALID_STATUS)
    }

    return tournament
  }

  private async checkCreatePermissions(
    input: CreateMatchInput,
    createdBy: string,
    tournament: NonNullable<TournamentFromRepository>,
  ) {
    await matchPermissionValidator.checkCreatePermissions(input, createdBy, tournament)
  }

  private async validateMatchInput(
    input: CreateMatchInput,
    tournament: NonNullable<TournamentFromRepository>,
  ) {
    await matchInputValidator.validateMatchInput(input, tournament)
  }

  private async createMatchRecord(
    input: CreateMatchInput,
    createdBy: string,
    tournament?: TournamentFromRepository,
  ) {
    const matchData: CreateMatchData = {
      tournamentId: input.tournamentId,
      sides: input.sides ?? [],
      status: input.status ?? ('scheduled' as const),
      createdBy,
      playedAt: input.playedAt ? new Date(input.playedAt) : undefined,
    }

    if (input.status === 'reported' && input.scoreA !== undefined && input.scoreB !== undefined) {
      matchData.scoreA = input.scoreA
      matchData.scoreB = input.scoreB
      matchData.reportProof = input.reportProof
      matchData.outcomeTypeId = input.outcomeTypeId
      matchData.outcomeReasonId = input.outcomeReasonId
      matchData.reportedBy = createdBy
      matchData.confirmationDeadline = this.getDeadlineForTournament(tournament) ?? undefined
      const winnerPosition = this.deriveWinnerFromScores(input.scoreA, input.scoreB, input.winnerPosition)
      if (winnerPosition !== undefined) matchData.winnerPosition = winnerPosition
    }

    return await matchRepository.create(matchData)
  }

  private async validateMatchRules(
    input: CreateMatchInput & { matchId?: string },
    tournament: NonNullable<TournamentFromRepository>,
  ) {
    await matchRuleValidator.validateMatchRules(input, tournament)
  }

  async getMatchById(id: string) {
    const match = await matchRepository.getById(id)
    if (!match) {
      throw new NotFoundError(ErrorCode.MATCH_NOT_FOUND)
    }
    return match
  }

  async listMatches(filters?: {
    tournamentId?: string
    status?: MatchStatus
    round?: number
    playerId?: string
  }) {
    return await matchRepository.list(filters)
  }

  /**
   * `viewerId` narrows the page to the competitions that caller may see — null for
   * an anonymous request, which leaves only the ones attached to no organization.
   */
  async listMatchCards(
    filters: ListMatchCardsQuery,
    viewerId: string | null,
  ): Promise<PaginatedMatchCards> {
    const visibleOrganizationIds = await this.visibleOrganizationIdsFor(viewerId)
    const { data: rows, total } = await matchRepository.listMatchCards(
      filters,
      visibleOrganizationIds,
    )
    if (rows.length === 0) return { data: [], total: 0, hasMore: false }

    const matchIds = rows.map((r) => r.matchId)
    const sidesData = await matchSidesRepository.getByMatchIds(matchIds)

    const sidesByMatch = new Map<string, typeof sidesData>()
    for (const side of sidesData) {
      if (!sidesByMatch.has(side.matchId)) sidesByMatch.set(side.matchId, [])
      sidesByMatch.get(side.matchId)!.push(side)
    }

    const data: ClientMatchCard[] = rows.map((row) => ({
      id: row.matchId,
      playedAt: row.playedAt ?? new Date(),
      status: row.status,
      tournament: {
        id: row.tournamentId,
        name: row.tournamentName,
        mode: row.tournamentMode,
        scoreEnabled: row.tournamentScoreEnabled,
      },
      sides: (sidesByMatch.get(row.matchId) ?? []).map((s) => ({
        position: s.position,
        score: s.score,
        isWinner: row.winnerSide === (s.position === 1 ? 'A' : 'B'),
        players: s.entry.players.map((p) => ({
          id: p.player.id,
          displayName: p.player.displayName,
          shortName: p.player.shortName ?? p.player.displayName.slice(0, 8),
        })),
      })),
      outcomeType: row.outcomeTypeId
        ? { id: row.outcomeTypeId, name: row.outcomeTypeName ?? '' }
        : null,
      ...(filters.playerIds && {
        playerId: filters.playerIds.split(',')[0],
        mmrDelta: row.mmrDelta ?? null,
        pointsDelta: row.pointsDelta ?? null,
      }),
    }))

    return {
      data,
      total,
      hasMore: filters.offset + filters.limit < total,
    }
  }

  async updateMatch(id: string, input: UpdateMatchInput, updatedBy: string) {
    const match = await this.getMatchById(id)
    const tournament = await matchRepository.getTournament(match.tournamentId)

    await this.runUpdateValidations(id, match, updatedBy, tournament)

    const isRevision = this.isResultRevision(match, input)
    const updateData = await this.buildUpdateMatchData(
      id,
      input,
      match,
      tournament,
      updatedBy,
      isRevision,
    )
    const result = await matchRepository.update(id, updateData)
    await notificationService.deleteActionsByMatchId(id)

    if (isRevision) {
      await this.handleResultRevision(id, match, updatedBy)
    } else if (input.status === 'reported') {
      await this.handleReportedUpdate(id, updatedBy)
    }

    await matchRealtimeService.notifyMatchUpdated(id)
    return result
  }

  /**
   * A revision is a change to the result of a match that already carries one. It is the
   * replacement for the score counter-proposal: rather than an opponent submitting a
   * rival score, the author fixes their own entry and the opponents vote again.
   */
  private isResultRevision(
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    input: UpdateMatchInput,
  ): boolean {
    if (match.status !== 'reported' && match.status !== 'disputed') return false

    return (
      input.scoreA !== undefined ||
      input.scoreB !== undefined ||
      input.winnerPosition !== undefined ||
      input.outcomeTypeId !== undefined ||
      input.outcomeReasonId !== undefined
    )
  }

  private async runUpdateValidations(
    id: string,
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    updatedBy: string,
    tournament: TournamentFromRepository,
  ): Promise<void> {
    const canManage = await this.canManageMatches(match.tournamentId, updatedBy)
    if (!canManage) {
      const isParticipant = await matchRepository.isUserInMatch(id, updatedBy)
      const isAuthor =
        match.result?.reportedBy === updatedBy || match.createdBy === updatedBy
      const isEditableByAuthor = ['reported', 'disputed'].includes(match.status)

      const allowed =
        isParticipant && (match.status === 'scheduled' || (isAuthor && isEditableByAuthor))
      if (!allowed) {
        throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
      }
    }

    if (match.status === 'confirmed') {
      throw new BadRequestError(ErrorCode.MATCH_ALREADY_CONFIRMED)
    }

    matchStatusValidator.validateNotFinalized(match.status)

    if (tournament?.mode === 'bracket') {
      const sides = (match as { sides?: { entryId: string }[] }).sides ?? []
      if (sides.length < 2) {
        throw new BadRequestError(ErrorCode.BRACKET_MATCH_TEAMS_NOT_READY)
      }
    }
  }

  private async buildUpdateMatchData(
    id: string,
    input: UpdateMatchInput,
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    tournament: TournamentFromRepository,
    updatedBy: string,
    isRevision = false,
  ): Promise<UpdateMatchData> {
    const updateData: UpdateMatchData = {}
    if (input.scoreA !== undefined) updateData.scoreA = input.scoreA
    if (input.scoreB !== undefined) updateData.scoreB = input.scoreB
    if (input.status !== undefined) updateData.status = input.status
    if (input.reportProof !== undefined) updateData.reportProof = input.reportProof
    if (input.outcomeTypeId !== undefined) updateData.outcomeTypeId = input.outcomeTypeId
    if (input.outcomeReasonId !== undefined) updateData.outcomeReasonId = input.outcomeReasonId
    if (input.winnerPosition !== undefined) updateData.winnerPosition = input.winnerPosition
    if (input.playedAt !== undefined) {
      updateData.playedAt = new Date(input.playedAt)
      const playerIds = await matchRepository.getPlayerIdsForMatch(id)
      await this.validateNoPlayerConflict(playerIds, input.playedAt, match.tournamentId, id)
    }

    if (input.status === 'reported' || isRevision) {
      // A revision can carry only an outcome change: the untouched side keeps the
      // score already stored, never 0, or the range and draw checks below would
      // validate a result the match never had.
      const scoreA = input.scoreA ?? match.sides[0]?.score ?? 0
      const scoreB = input.scoreB ?? match.sides[1]?.score ?? 0
      matchInputValidator.validateScores(scoreA, scoreB)
      matchInputValidator.validateScoreRange(
        scoreA,
        scoreB,
        tournament?.minScore,
        tournament?.maxScore,
      )
      await matchInputValidator.validateDrawAllowed(
        match.tournamentId,
        scoreA,
        scoreB,
        input.winnerPosition,
      )

      // A corrected entry re-opens the validation round, including on a contested match.
      updateData.status = 'reported'
      updateData.reportedBy = updatedBy
      updateData.confirmationDeadline = this.getDeadlineForTournament(tournament)
    }
    return updateData
  }

  /**
   * Every confirmation collected on the previous score is dropped: opponents validated a
   * result that no longer exists. Without this reset an organizer could finalize a
   * corrected score on a stale approval.
   */
  private async handleResultRevision(
    matchId: string,
    previous: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    updatedBy: string,
  ): Promise<void> {
    await matchConfirmationRepository.resetConfirmationsExcept(matchId, updatedBy)

    const isParticipant = await matchRepository.isUserInMatch(matchId, updatedBy)
    const updater = await userRepository.getById(updatedBy)
    if (isParticipant && updater?.role !== 'kiosk') {
      await matchConfirmationRepository.upsert({
        matchId,
        playerId: updatedBy,
        isConfirmed: true,
        isContested: false,
      })
    }

    const refreshed = await matchRepository.getById(matchId)
    await matchMessageService.postSystem(matchId, 'matchMessages.RESULT_REVISED', {
      authorName: updater?.displayName ?? null,
      previousScore: this.formatScore(previous),
      newScore: this.formatScore(refreshed),
    })

    await this.checkAndFinalizeMatch(matchId)

    const afterCheck = await matchRepository.getById(matchId)
    if (afterCheck?.status === 'reported') {
      await matchNotificationBuilder.notifyMatchValidationRequired(matchId, updatedBy)
      this.scheduleProvisionalRecompute(previous.tournamentId)
    }
  }

  private formatScore(
    match: Awaited<ReturnType<typeof matchRepository.getById>>,
  ): string {
    const sideA = match?.sides?.find((s) => s.position === 1)
    const sideB = match?.sides?.find((s) => s.position === 2)
    return `${sideA?.score ?? 0} - ${sideB?.score ?? 0}`
  }

  private async handleReportedUpdate(matchId: string, updatedBy: string): Promise<void> {
    const isParticipant = await matchRepository.isUserInMatch(matchId, updatedBy)
    if (isParticipant) {
      const updater = await userRepository.getById(updatedBy)
      if (updater?.role !== 'kiosk') {
        await matchConfirmationRepository.upsert({
          matchId,
          playerId: updatedBy,
          isConfirmed: true,
          isContested: false,
        })
      }
    }
    await this.checkAndFinalizeMatch(matchId)
    const refreshed = await matchRepository.getById(matchId)
    if (refreshed?.status === 'reported') {
      await matchNotificationBuilder.notifyMatchValidationRequired(matchId, updatedBy)
    }
  }

  async deleteMatch(id: string, deletedBy: string) {
    const match = await this.getMatchById(id)

    const canManage = await this.canManageMatches(match.tournamentId, deletedBy)
    if (!canManage) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
    }

    matchStatusValidator.validateCanDelete(match.status)

    // matches.id is cleared from the notifications rather than cascading, so anything
    // still pointing at this match has to go before the match itself does.
    await notificationService.deleteActionsByMatchId(id)
    await matchRepository.delete(id)

    return { success: true, message: 'Match supprimé avec succès' }
  }

  async reportMatchResult(id: string, input: ReportMatchResultInput, reportedBy: string) {
    const match = await this.getMatchById(id)
    await this.validateReportPermissions(id, reportedBy)
    this.validateReportStatus(match.status)
    await this.validateScoreConstraints(match.tournamentId, input)

    const tournament = await matchRepository.getTournament(match.tournamentId)
    const updateData = this.buildReportUpdateData(input, match, reportedBy)
    updateData.confirmationDeadline = this.getDeadlineForTournament(tournament)

    const updatedMatch = await matchRepository.update(id, updateData)

    await matchConfirmationRepository.upsert({
      matchId: id,
      playerId: reportedBy,
      isConfirmed: true,
      isContested: false,
    })

    // A re-report on a contested match is a correction: opponents vote again.
    if (match.status === 'disputed') {
      await matchConfirmationRepository.resetConfirmationsExcept(id, reportedBy)
    }

    const reporterUser = await userRepository.getById(reportedBy)
    await matchMessageService.postSystem(id, 'matchMessages.RESULT_REPORTED', {
      authorName: reporterUser?.displayName ?? null,
      score: `${input.scoreA} - ${input.scoreB}`,
    })

    if (tournament?.validationMode === 'none') {
      await this.finalizeMatch(id, { finalizationReason: 'auto_validation' }, reportedBy)
      return await matchRepository.getById(id)
    }


    if (tournament?.validationMode === 'auto') {
      const reporter = await userRepository.getById(reportedBy)
      if ((reporter?.trustScoreCount ?? 0) >= TRUST_SCORE_THRESHOLD) {
        await this.finalizeMatch(id, { finalizationReason: 'trust_score' }, reportedBy)
        return await matchRepository.getById(id)
      }
    }

    await this.checkAndFinalizeMatch(id)

    const refreshed = await matchRepository.getById(id)
    if (refreshed?.status === 'reported') {
      await matchNotificationBuilder.notifyMatchValidationRequired(id, reportedBy)
    }

    if (refreshed?.status === 'reported') {
      this.scheduleProvisionalRecompute(match.tournamentId)
    }

    await matchRealtimeService.notifyMatchUpdated(id)
    return updatedMatch
  }

  private async validateReportPermissions(matchId: string, userId: string) {
    await matchPermissionValidator.validateReportPermissions(matchId, userId)
  }

  private validateReportStatus(status: MatchStatus): void {
    matchStatusValidator.validateReportStatus(status)
  }

  private async validateScoreConstraints(tournamentId: string, input: ReportMatchResultInput) {
    matchInputValidator.validateScores(input.scoreA, input.scoreB)
    const tournament = await matchRepository.getTournament(tournamentId)
    matchInputValidator.validateScoreRange(
      input.scoreA,
      input.scoreB,
      tournament?.minScore,
      tournament?.maxScore,
    )
    await matchInputValidator.validateDrawAllowed(
      tournamentId,
      input.scoreA,
      input.scoreB,
      input.winnerPosition,
    )
  }

  private buildReportUpdateData(
    input: ReportMatchResultInput,
    _match: Awaited<ReturnType<typeof matchRepository.getById>>,
    reportedBy: string,
  ): UpdateMatchData {
    return {
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      status: 'reported',
      reportProof: input.reportProof,
      outcomeTypeId: input.outcomeTypeId,
      outcomeReasonId: input.outcomeReasonId,
      reportedBy,
      winnerPosition: this.deriveWinnerFromScores(input.scoreA, input.scoreB, input.winnerPosition) ?? null,
    }
  }

  async confirmMatch(id: string, _input: ConfirmMatchInput, confirmedBy: string) {
    const match = await this.getMatchById(id)

    const confirmer = await userRepository.getById(confirmedBy)
    if (confirmer?.role === 'kiosk') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
    }

    const isParticipant = await matchRepository.isUserInMatch(id, confirmedBy)
    if (!isParticipant) {
      throw new ForbiddenError(ErrorCode.NOT_A_PARTICIPANT)
    }

    if (!['reported', 'disputed'].includes(match.status)) {
      throw new BadRequestError(ErrorCode.MATCH_INVALID_STATUS)
    }

    await this.recordAgreement(id, match, confirmedBy)

    return await matchRepository.getById(id)
  }

  async contestMatch(id: string, input: ContestMatchInput, contestedBy: string) {
    const match = await this.getMatchById(id)

    const contester = await userRepository.getById(contestedBy)
    if (contester?.role === 'kiosk') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
    }

    const isParticipant = await matchRepository.isUserInMatch(id, contestedBy)
    if (!isParticipant) {
      throw new ForbiddenError(ErrorCode.NOT_A_PARTICIPANT)
    }

    if (!['reported', 'disputed'].includes(match.status)) {
      throw new BadRequestError(ErrorCode.MATCH_INVALID_STATUS)
    }

    await matchConfirmationRepository.upsert({
      matchId: id,
      playerId: contestedBy,
      isConfirmed: false,
      isContested: true,
    })

    const originalReporter = match.result?.reportedBy
    if (originalReporter) {
      await userRepository.resetTrustScore(originalReporter)
    }

    await this.applyDisputeOutcome(id, match.tournamentId, contestedBy, input.contestationReason)

    return await matchRepository.getById(id)
  }

  async respondToMatch(id: string, input: RespondToMatchInput, respondedBy: string) {
    const match = await this.getMatchById(id)

    const responder = await userRepository.getById(respondedBy)
    if (responder?.role === 'kiosk') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
    }

    const isParticipant = await matchRepository.isUserInMatch(id, respondedBy)
    if (!isParticipant) {
      throw new ForbiddenError(ErrorCode.NOT_A_PARTICIPANT)
    }

    if (match.status === 'finalized') {
      return this.handlePostFinalizationResponse(id, match, input, respondedBy)
    }

    return this.handlePreFinalizationResponse(id, match, input, respondedBy)
  }

  /**
   * Mirror of handlePreFinalizationResponse for a result that is already settled. A
   * player may contest it during the dispute window, and change their mind as often as
   * they like: the conversation is what settles it, not the order in which the buttons
   * were pressed. Only filing a contestation is time-boxed — withdrawing one is not.
   */
  private async handlePostFinalizationResponse(
    id: string,
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    input: RespondToMatchInput,
    respondedBy: string,
  ) {
    if (input.type === 'agree') {
      // Taking a contestation back de-escalates: it stays possible once the window has
      // closed, otherwise an expired dispute would keep the organizers on the hook with
      // an arbitration request nobody can ever settle.
      await this.withdrawPostFinalizationDispute(id, respondedBy)
    } else {
      await this.assertPostDisputeAllowed(match)
      await this.recordPostFinalizationDispute(id, input, respondedBy)
    }

    return await matchRepository.getById(id)
  }

  /**
   * A finalized result is only contestable when nobody has already had the last word on
   * it: the timer or the trust score settled it, in a tournament whose mode leaves that
   * door open, and the window has not closed.
   */
  private async assertPostDisputeAllowed(
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
  ): Promise<void> {
    const tournament = await matchRepository.getTournament(match.tournamentId)
    if (tournament?.validationMode !== 'auto' && tournament?.validationMode !== 'none') {
      throw new BadRequestError(ErrorCode.DISPUTE_NOT_ALLOWED_FOR_VALIDATION_MODE)
    }

    // A consensus is everyone's own signature, an override is an organizer's decision:
    // neither is reopened by contesting it again.
    const finalizationReason = match.result?.finalizationReason
    if (finalizationReason !== 'auto_validation' && finalizationReason !== 'trust_score') {
      throw new BadRequestError(ErrorCode.DISPUTE_NOT_ALLOWED_FOR_VALIDATION_MODE)
    }

    const finalizedAt = match.result?.finalizedAt
    if (!finalizedAt) {
      throw new BadRequestError(ErrorCode.MATCH_NOT_FOUND)
    }

    const daysSinceFinalization = (Date.now() - new Date(finalizedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceFinalization > POST_FINALIZATION_DISPUTE_DAYS) {
      throw new BadRequestError(ErrorCode.DISPUTE_WINDOW_EXPIRED)
    }
  }

  /**
   * Files a contestation against a settled result. Like a contestation of a live entry,
   * it lands in the thread — the system note says who disagrees, the reason follows as
   * their own message, where the others can answer it.
   */
  private async recordPostFinalizationDispute(
    id: string,
    input: RespondToMatchInput,
    respondedBy: string,
  ): Promise<void> {
    const alreadyDisputed = await matchConfirmationRepository.hasPlayerDisputedPostFinalization(id, respondedBy)
    if (alreadyDisputed) {
      throw new BadRequestError(ErrorCode.ALREADY_DISPUTED)
    }

    const sidePosition = await this.resolveSidePosition(id, respondedBy)

    await matchConfirmationRepository.upsert({
      matchId: id,
      playerId: respondedBy,
      isConfirmed: false,
      isContested: true,
      contestationReason: input.reason,
      sidePosition,
      isPostFinalization: true,
    })

    const disputer = await userRepository.getById(respondedBy)
    await matchMessageService.postSystem(id, 'matchMessages.RESULT_DISPUTED_POST', {
      authorName: disputer?.displayName ?? null,
    })
    await matchMessageService.postUserNote(id, respondedBy, input.reason)

    await matchNotificationBuilder.notifyPostFinalizationDispute(id, respondedBy)
    await matchRealtimeService.notifyMatchUpdated(id)
  }

  /**
   * The contester accepts the result after all. Unlike a withdrawal before finalization
   * there is no validation round to re-open: the match was and stays finalized, so only
   * the contestation and the arbitration request the organizers received are dropped.
   */
  private async withdrawPostFinalizationDispute(id: string, respondedBy: string): Promise<void> {
    const hasDisputed = await matchConfirmationRepository.hasPlayerDisputedPostFinalization(id, respondedBy)
    if (!hasDisputed) {
      throw new BadRequestError(ErrorCode.CANNOT_AGREE_AFTER_FINALIZATION)
    }

    await matchConfirmationRepository.delete(id, respondedBy, true)
    await notificationService.deleteActionsByMatchIdAndType(id, 'MATCH_POST_DISPUTE')

    const withdrawer = await userRepository.getById(respondedBy)
    await matchMessageService.postSystem(id, 'matchMessages.POST_DISPUTE_WITHDRAWN', {
      authorName: withdrawer?.displayName ?? null,
    })

    await matchRealtimeService.notifyMatchUpdated(id)
  }

  private async handlePreFinalizationResponse(
    id: string,
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    input: RespondToMatchInput,
    respondedBy: string,
  ) {
    if (!['reported', 'disputed'].includes(match.status)) {
      throw new BadRequestError(ErrorCode.MATCH_INVALID_STATUS)
    }

    if (input.type === 'agree') {
      await this.recordAgreement(id, match, respondedBy)

      return await matchRepository.getById(id)
    }

    // dispute
    const sidePosition = await this.resolveSidePosition(id, respondedBy)
    await matchConfirmationRepository.upsert({
      matchId: id,
      playerId: respondedBy,
      isConfirmed: false,
      isContested: true,
      sidePosition,
      isPostFinalization: false,
    })

    const originalReporter = match.result?.reportedBy
    if (originalReporter) {
      await userRepository.resetTrustScore(originalReporter)
    }

    await this.applyDisputeOutcome(id, match.tournamentId, respondedBy, input.reason)

    return await matchRepository.getById(id)
  }

  /**
   * Record a player's approval of the current entry. Agreeing is also how a contester
   * changes their mind after the discussion: their contestation is wiped, and once the
   * last one is gone the match goes back to a normal validation round.
   */
  private async recordAgreement(
    id: string,
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    playerId: string,
  ): Promise<void> {
    const side = await this.resolveSidePosition(id, playerId)

    await matchConfirmationRepository.upsert({
      matchId: id,
      playerId,
      isConfirmed: true,
      isContested: false,
      contestationReason: null,
      sidePosition: side,
      isPostFinalization: false,
    })

    if (match.status === 'disputed') {
      const confirmations = await matchConfirmationRepository.getByMatchId(id)
      if (!this.detectContestation(confirmations)) {
        await this.applyDisputeWithdrawal(id, match.tournamentId, playerId)
      }
    }

    await notificationService.deleteActionsByMatchIdForUser(id, playerId)
    await this.checkAndFinalizeMatch(id)
    await matchRealtimeService.notifyMatchUpdated(id)
  }

  async validateMatch(input: CreateMatchInput & { matchId?: string; allPlayerIds?: string[] }) {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      const tournament = await this.getTournamentForValidation(input)
      if (!tournament) {
        errors.push('Tournoi non trouvé')
        return { valid: false, errors, warnings }
      }

      if (!this.isTournamentOpenForMatches(tournament)) {
        errors.push('Le tournoi doit être ouvert ou en cours pour créer des matchs')
        return { valid: false, errors, warnings }
      }

      await this.validateMatchInputForValidation(input, tournament, errors)
      await this.validateTournamentRulesForValidation(input, tournament, errors)
      if (tournament.mode === 'ranked') {
        matchInputValidator.collectRankedPlayedAt(input.playedAt, errors)
      }
      await this.collectPlayedAtConflict(input, tournament, errors)
      await this.checkSimilarMatch(input, warnings, input.matchId)

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        tournament: {
          id: tournament.id,
          name: tournament.name,
          teamMode: tournament.teamMode,
          status: tournament.status,
        },
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Erreur inattendue lors de la validation',
      )
      return { valid: false, errors, warnings }
    }
  }

  private async getTournamentForValidation(input: CreateMatchInput) {
    return await matchRepository.getTournament(input.tournamentId)
  }

  private async collectPlayedAtConflict(
    input: CreateMatchInput & { matchId?: string; allPlayerIds?: string[] },
    tournament: NonNullable<TournamentFromRepository>,
    errors: string[],
  ): Promise<void> {
    if (!input.playedAt) return

    const playerIds = input.allPlayerIds?.length
      ? input.allPlayerIds
      : await this.resolvePlayerIds(input, tournament)
    const conflict = await matchRepository.findPlayerConflictAtTime(
      playerIds,
      new Date(input.playedAt),
      input.tournamentId,
      input.matchId,
    )
    if (conflict) {
      errors.push(`${conflict.playerName} a déjà un match à cette date et heure`)
    }
  }

  private isTournamentOpenForMatches(tournament: TournamentFromRepository): boolean {
    return tournament ? ['open', 'ongoing'].includes(tournament.status) : false
  }

  private async validateMatchInputForValidation(
    input: CreateMatchInput & { allPlayerIds?: string[] },
    tournament: NonNullable<TournamentFromRepository>,
    errors: string[],
  ) {
    await matchInputValidator.validateMatchInputForValidation(input, tournament, errors)
  }

  private async validateTournamentRulesForValidation(
    input: CreateMatchInput & { allPlayerIds?: string[] },
    tournament: NonNullable<TournamentFromRepository>,
    errors: string[],
  ) {
    let sides = input.sides ?? []
    const hasFullComposition = sides.length >= 2 &&
      sides.every((s) =>
        tournament.teamMode === 'static' ? !!s.teamId : (s.playerIds?.length ?? 0) > 0
      )

    if (!hasFullComposition) {
      // A 2-player flex match can only mean 1v1 — no need to wait for the
      // composition step to know the split, so rule checks (opponent/partner
      // limits) can run right away instead of only failing at match creation.
      if (tournament.teamMode !== 'flex' || input.allPlayerIds?.length !== 2) return
      sides = [
        { position: 1, playerIds: [input.allPlayerIds[0]] },
        { position: 2, playerIds: [input.allPlayerIds[1]] },
      ]
    }

    try {
      await this.validateMatchRules({ ...input, sides }, tournament)
    } catch (error) {
      if (error instanceof AppError) {
        const translatedMessage = t(`errors.${error.code}`, error.details || {})
        errors.push(translatedMessage)
      } else {
        const fallbackMessage = t('errors.UNKNOWN')
        errors.push(error instanceof Error ? error.message : fallbackMessage)
      }
    }
  }

  private async checkSimilarMatch(
    input: CreateMatchInput & { matchId?: string },
    warnings: string[],
    excludeMatchId?: string,
  ) {
    const sides = input.sides ?? []
    if (sides.length < 2) return

    try {
      const entryIds = await Promise.all(
        sides.map((side) =>
          entryRepository.findExistingEntry(
            input.tournamentId,
            side.teamId,
            side.playerIds,
          ).then((e) => e?.id)
        )
      )

      if (entryIds.some((id) => !id)) return

      const duplicates = await matchRepository.findMatchesWithSameEntries(
        input.tournamentId,
        entryIds[0]!,
        entryIds[1]!,
        excludeMatchId,
      )

      if (duplicates.length > 0) {
        warnings.push('Un match similaire existe déjà')
      }
    } catch (error) {
      logger.error({ err: error }, 'Error checking for duplicate matches')
    }
  }

  private async checkAndFinalizeMatch(matchId: string) {
    const match = await matchRepository.getById(matchId)
    if (!match) return

    if (match.status !== 'reported') return

    const participants = await matchRepository.getParticipationsByMatchId(matchId)
    if (participants.length === 0) return

    const confirmations = await matchConfirmationRepository.getByMatchId(matchId)

    if (this.detectContestation(confirmations)) {
      await matchRepository.update(matchId, { status: 'disputed' })
      return
    }

    const tournament = await matchRepository.getTournament(match.tournamentId)
    if (tournament?.validationMode === 'admin') return

    const reporter = match.result?.reportedBy
    const reporterSide = participants.find((p) => p.playerId === reporter)?.teamSide

    const opponentConfirmed = confirmations.some((c) => {
      if (!c.isConfirmed || c.isContested) return false
      const side = participants.find((p) => p.playerId === c.playerId)?.teamSide
      return reporterSide ? side !== reporterSide : c.playerId !== reporter
    })

    if (opponentConfirmed) {
      await this.finalizeMatch(matchId, { finalizationReason: 'consensus' })
    }
  }

  async cancelMatch(id: string, cancelledBy: string) {
    const match = await this.getMatchById(id)

    const canceller = await userRepository.getById(cancelledBy)
    if (canceller?.role === 'kiosk') {
      if (match.createdBy !== cancelledBy) {
        throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
      }
    } else {
      const isAdmin = await this.canManageMatches(match.tournamentId, cancelledBy)
      const isParticipant = await matchRepository.isUserInMatch(id, cancelledBy)
      if (!isAdmin && !isParticipant) {
        throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
      }
    }

    if (match.status === 'finalized') {
      await this.cancelFinalizedMatch(id, match, cancelledBy)
      return await matchRepository.getById(id)
    }

    matchStatusValidator.validateCanCancel(match.status)

    const wasUnfinalized = ['reported', 'disputed'].includes(match.status)
    await matchRepository.update(id, { status: 'cancelled' })
    await notificationService.deleteActionsByMatchId(id)
    if (wasUnfinalized) {
      this.scheduleProvisionalRecompute(match.tournamentId)
    }

    await matchRealtimeService.notifyMatchUpdated(id)
    return await matchRepository.getById(id)
  }

  private async cancelFinalizedMatch(
    id: string,
    match: NonNullable<Awaited<ReturnType<typeof matchRepository.getById>>>,
    cancelledBy: string,
  ): Promise<void> {
    const tournament = await matchRepository.getTournament(match.tournamentId)
    if (!['championship', 'ranked'].includes(tournament?.mode ?? '')) {
      throw new BadRequestError(ErrorCode.MATCH_CANNOT_BE_CANCELLED)
    }

    const reason = match.result?.finalizationReason
    if (!['auto_validation', 'trust_score'].includes(reason ?? '')) {
      throw new BadRequestError(ErrorCode.MATCH_CANNOT_BE_CANCELLED)
    }

    if (match.result?.reportedBy !== cancelledBy) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS)
    }

    const finalizedAt = match.result?.finalizedAt
    if (!finalizedAt) throw new BadRequestError(ErrorCode.MATCH_CANNOT_BE_CANCELLED)
    const hoursSince = (Date.now() - new Date(finalizedAt).getTime()) / (1000 * 60 * 60)
    if (hoursSince > 48) throw new BadRequestError(ErrorCode.CANCEL_WINDOW_EXPIRED)

    await matchRepository.update(id, { status: 'cancelled' })
    await notificationService.deleteActionsByMatchId(id)
    await matchFinalizationOrchestrator.runPostCancellationEffects(id, match.tournamentId, match.playedAt ?? new Date())
  }

  async finalizeMatch(
    id: string,
    input: FinalizeMatchInput,
    finalizedBy?: string,
    backgroundTasks?: Promise<void>[],
  ) {
    const match = await this.getMatchById(id)

    if (match.status === 'finalized') {
      throw new BadRequestError(ErrorCode.MATCH_ALREADY_FINALIZED)
    }

    const updateData: UpdateMatchData = {
      status: 'finalized',
      finalizedAt: new Date(),
      finalizationReason: input.finalizationReason,
    }
    if (finalizedBy) {
      updateData.finalizedBy = finalizedBy
    }

    const result = await matchRepository.update(id, updateData)
    await matchFinalizationOrchestrator.runPostFinalizationEffects(
      id,
      match.tournamentId,
      backgroundTasks,
    )

    if (['consensus', 'auto_validation', 'trust_score'].includes(input.finalizationReason)) {
      const reportedBy = match.result?.reportedBy
      if (reportedBy) {
        await userRepository.incrementTrustScore(reportedBy)
      }
    }

    await matchMessageService.postSystem(id, 'matchMessages.MATCH_FINALIZED', {
      reason: input.finalizationReason,
    })
    await matchRealtimeService.notifyMatchUpdated(id)

    return result
  }

  async autoFinalizeExpiredMatches() {
    const now = new Date()
    const expiredMatches = await matchRepository.getMatchesPendingFinalization()

    const finalized: string[] = []
    const disputed: string[] = []
    const backgroundTasks: Promise<void>[] = []

    for (const match of expiredMatches) {
      if (!match.confirmationDeadline) continue
      if (new Date(match.confirmationDeadline) > now) continue

      const confirmations = await matchConfirmationRepository.getByMatchId(match.id)

      if (this.detectContestation(confirmations)) {
        disputed.push(match.id)
        continue
      }

      await this.finalizeMatch(
        match.id,
        { finalizationReason: 'auto_validation' },
        undefined,
        backgroundTasks,
      )
      finalized.push(match.id)
    }

    // Wait for all background tasks to complete before returning
    if (backgroundTasks.length > 0) {
      await Promise.allSettled(backgroundTasks)
    }

    return {
      finalized,
      disputed,
      total: finalized.length + disputed.length,
    }
  }

  private detectContestation(
    confirmations: Awaited<ReturnType<typeof matchConfirmationRepository.getByMatchId>>,
  ): boolean {
    return confirmations.some((c) => c.isContested && !c.isPostFinalization)
  }

  private deriveWinnerFromScores(
    scoreA: number | null | undefined,
    scoreB: number | null | undefined,
    explicitWinnerPosition: number | null | undefined,
  ): number | null | undefined {
    if (explicitWinnerPosition !== undefined) return explicitWinnerPosition
    if (scoreA == null || scoreB == null) return undefined
    if (scoreA > scoreB) return 1
    if (scoreB > scoreA) return 2
    return null
  }

  private buildConfirmationDeadline(hours: number): Date {
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + hours)
    return deadline
  }

  private getDeadlineForTournament(tournament: TournamentFromRepository): Date | null {
    if (tournament?.validationMode !== 'auto') return null
    return this.buildConfirmationDeadline(
      tournament.validationTimerHours ?? DEFAULT_AUTO_VALIDATION_HOURS,
    )
  }

  private async recomputeProvisionalIfRanked(tournamentId: string): Promise<void> {
    const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId)
    if (rankedConfig) {
      rankedSeasonService
        .computeAndCacheProvisional(tournamentId)
        .catch((err) => logger.error({ err }, '[Ranked] background cache update failed'))
    }
  }

  private scheduleProvisionalRecompute(tournamentId: string): void {
    this.recomputeProvisionalIfRanked(tournamentId).catch((err) =>
      logger.error({ err }, '[Ranked] background cache update failed'),
    )
  }

  /**
   * A contested match stops moving on its own: the timer never settles a disagreement.
   * It waits for the author to correct the entry or for an organizer to arbitrate, and
   * both of them are told about it — the organizers through an actionable notification,
   * everyone through the match thread.
   */
  private async applyDisputeOutcome(
    id: string,
    tournamentId: string,
    disputerId: string,
    reason?: string,
  ): Promise<void> {
    await notificationService.deleteActionsByMatchIdForUser(id, disputerId)
    await matchRepository.update(id, {
      status: 'disputed',
      confirmationDeadline: null,
    })

    const disputer = await userRepository.getById(disputerId)
    await matchMessageService.postSystem(id, 'matchMessages.RESULT_DISPUTED', {
      authorName: disputer?.displayName ?? null,
    })
    // The reason belongs to the conversation, where it can be answered
    await matchMessageService.postUserNote(id, disputerId, reason)

    this.scheduleProvisionalRecompute(tournamentId)
    await matchNotificationBuilder.notifyDisputeEscalation(id, disputerId)
    await matchRealtimeService.notifyMatchUpdated(id)
  }

  /**
   * Mirror of applyDisputeOutcome: the last contestation is gone, so the match rejoins a
   * normal validation round. The organizers' arbitration request is dropped — narrowly,
   * because the other players may still owe a validation.
   */
  private async applyDisputeWithdrawal(
    id: string,
    tournamentId: string,
    withdrawerId: string,
  ): Promise<void> {
    const tournament = await matchRepository.getTournament(tournamentId)
    await matchRepository.update(id, {
      status: 'reported',
      confirmationDeadline: this.getDeadlineForTournament(tournament),
    })

    await notificationService.deleteActionsByMatchIdAndType(id, 'MATCH_DISPUTE_ESCALATED')

    const withdrawer = await userRepository.getById(withdrawerId)
    await matchMessageService.postSystem(id, 'matchMessages.DISPUTE_WITHDRAWN', {
      authorName: withdrawer?.displayName ?? null,
    })

    this.scheduleProvisionalRecompute(tournamentId)
    await matchRealtimeService.notifyMatchUpdated(id)
  }

  private async resolveSidePosition(matchId: string, playerId: string): Promise<number> {
    const participants = await matchRepository.getParticipationsByMatchId(matchId)
    return participants.find((p) => p.playerId === playerId)?.teamSide === 'A' ? 1 : 2
  }

  private async resolvePlayerIds(
    input: CreateMatchInput,
    tournament: NonNullable<TournamentFromRepository>,
  ): Promise<string[]> {
    const sides = input.sides ?? []
    if (tournament.teamMode === 'flex') {
      return sides.flatMap((s) => s.playerIds ?? [])
    }
    const ids: string[] = []
    for (const side of sides) {
      if (side.teamId) {
        const team = await teamRepository.getById(side.teamId)
        if (team) ids.push(...team.members.map((m) => m.userId))
      }
    }
    return ids
  }

  private async validateNoPlayerConflict(
    playerIds: string[],
    playedAt: Date | string,
    tournamentId: string,
    excludeMatchId?: string,
  ): Promise<void> {
    if (playerIds.length === 0) return
    const conflict = await matchRepository.findPlayerConflictAtTime(
      playerIds,
      new Date(playedAt),
      tournamentId,
      excludeMatchId,
    )
    if (conflict) {
      throw new ConflictError(ErrorCode.PLAYER_SCHEDULE_CONFLICT, {
        playerName: conflict.playerName,
      })
    }
  }
}

export const matchService = new MatchService()
