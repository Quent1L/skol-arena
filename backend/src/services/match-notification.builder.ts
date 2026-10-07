import { matchRepository } from '../repository/match.repository'
import { tournamentRepository } from '../repository/tournament.repository'
import { userRepository } from '../repository/user.repository'
import { notificationService } from './notification.service'

type Participation = Awaited<ReturnType<typeof matchRepository.getParticipationsByMatchId>>[number]

interface ParticipantContext {
  teammates: string
  opponents: string
  matchFormat: string
}

export class MatchNotificationBuilder {
  async notifyMatchCreated(
    matchId: string,
    createdBy: string,
    tournamentName: string,
  ): Promise<void> {
    const match = await matchRepository.getById(matchId)
    if (!match) return

    const participants = await matchRepository.getParticipationsByMatchId(matchId)
    const creator = await userRepository.getById(createdBy)
    const creatorName = creator?.displayName ?? null
    const matchDate = this.serializeMatchDate(match.playedAt)
    const isScheduled =
      match.status === 'scheduled' || (match.playedAt && new Date(match.playedAt) > new Date())

    const titleKey = isScheduled
      ? 'notifications.MATCH_SCHEDULED_TITLE'
      : 'notifications.MATCH_CREATED_TITLE'
    const messageKey = isScheduled
      ? 'notifications.MATCH_SCHEDULED_MESSAGE'
      : 'notifications.MATCH_CREATED_MESSAGE'

    const recipients = this.recipientsExcept(participants, createdBy)
    for (const playerId of recipients) {
      const ctx = await this.resolveTeammatesAndOpponents(participants, playerId)
      if (!ctx) continue
      await notificationService.send({
        userId: playerId,
        type: 'MATCH_CREATED',
        titleKey,
        messageKey,
        translationParams: {
          creatorName,
          tournamentName,
          matchFormat: ctx.matchFormat,
          matchDate,
          opponents: ctx.opponents,
          teammates: ctx.teammates,
        },
        actionUrl: `/matches/${matchId}`,
        requiresAction: false,
        matchId,
      })
    }
  }

  async notifyMatchValidationRequired(matchId: string, reportedBy: string): Promise<void> {
    const match = await matchRepository.getById(matchId)
    if (!match) return

    const tournament = await matchRepository.getTournament(match.tournamentId)
    const participants = await matchRepository.getParticipationsByMatchId(matchId)
    const reporter = await userRepository.getById(reportedBy)
    const reporterName = reporter?.displayName ?? null
    const matchDate = this.serializeMatchDate(match.playedAt)

    const recipients = this.recipientsExcept(participants, reportedBy)
    for (const playerId of recipients) {
      const ctx = await this.resolveTeammatesAndOpponents(participants, playerId)
      if (!ctx) continue
      await notificationService.send({
        userId: playerId,
        type: 'MATCH_VALIDATION',
        titleKey: 'notifications.MATCH_VALIDATION_TITLE',
        messageKey: 'notifications.MATCH_VALIDATION_MESSAGE',
        translationParams: {
          reporterName,
          tournamentName: tournament?.name ?? '',
          matchFormat: ctx.matchFormat,
          matchDate,
          opponents: ctx.opponents,
          teammates: ctx.teammates,
        },
        actionUrl: `/matches/${matchId}`,
        requiresAction: true,
        matchId,
      })
    }
  }

  /**
   * A contested match has no automatic way out: the timer never settles a
   * disagreement. Organizers are the ones who arbitrate, so the dispute lands in
   * their notification list as an action to complete.
   */
  async notifyDisputeEscalation(matchId: string, disputedBy: string): Promise<void> {
    const match = await matchRepository.getById(matchId)
    if (!match) return

    const tournament = await matchRepository.getTournament(match.tournamentId)
    const disputer = await userRepository.getById(disputedBy)
    const admins = await tournamentRepository.getAdminUserIds(match.tournamentId)
    const matchDate = this.serializeMatchDate(match.playedAt)

    for (const adminId of admins) {
      await notificationService.send({
        userId: adminId,
        type: 'MATCH_DISPUTE_ESCALATED',
        titleKey: 'notifications.MATCH_DISPUTE_ESCALATED_TITLE',
        messageKey: 'notifications.MATCH_DISPUTE_ESCALATED_MESSAGE',
        translationParams: {
          disputerName: disputer?.displayName ?? null,
          tournamentName: tournament?.name ?? '',
          matchDate,
        },
        actionUrl: `/matches/${matchId}`,
        requiresAction: true,
        matchId,
      })
    }
  }

  /**
   * Notifies the other people on the thread that a message was posted. Recipients who
   * still have an unread message notification for this match are skipped, so a back
   * and forth produces one notification, not one per reply.
   */
  async notifyMatchMessage(matchId: string, authorId: string): Promise<void> {
    const match = await matchRepository.getById(matchId)
    if (!match) return

    const author = await userRepository.getById(authorId)
    const authorName = author?.displayName ?? null

    const participants = await matchRepository.getParticipationsByMatchId(matchId)
    const admins = await tournamentRepository.getAdminUserIds(match.tournamentId)
    const recipients = [
      ...new Set([...participants.map((p) => p.playerId), ...admins]),
    ].filter((id) => id !== authorId)

    for (const userId of recipients) {
      const alreadyPending = await notificationService.hasUnreadOfTypeForMatch(
        userId,
        matchId,
        'MATCH_MESSAGE',
      )
      if (alreadyPending) continue

      await notificationService.send({
        userId,
        type: 'MATCH_MESSAGE',
        titleKey: 'notifications.MATCH_MESSAGE_TITLE',
        messageKey: 'notifications.MATCH_MESSAGE_MESSAGE',
        translationParams: { authorName },
        actionUrl: `/matches/${matchId}`,
        requiresAction: false,
        matchId,
      })
    }
  }

  /**
   * A contestation filed after finalization is arbitrated the same way as one filed
   * before it: the other players are told, and the organizers get it as an action to
   * complete, because nothing else will settle it.
   */
  async notifyPostFinalizationDispute(matchId: string, disputedBy: string): Promise<void> {
    const match = await matchRepository.getById(matchId)
    if (!match) return

    const tournament = await matchRepository.getTournament(match.tournamentId)
    const participants = await matchRepository.getParticipationsByMatchId(matchId)
    const disputer = await userRepository.getById(disputedBy)
    const disputerName = disputer?.displayName ?? null
    const matchDate = this.serializeMatchDate(match.playedAt)

    const admins = await tournamentRepository.getAdminUserIds(match.tournamentId)
    const players = this.recipientsExcept(participants, disputedBy)
    const recipients = new Map<string, boolean>()
    for (const playerId of players) recipients.set(playerId, false)
    for (const adminId of admins) {
      if (adminId !== disputedBy) recipients.set(adminId, true)
    }

    for (const [userId, requiresAction] of recipients) {
      await notificationService.send({
        userId,
        type: 'MATCH_POST_DISPUTE',
        titleKey: 'notifications.MATCH_POST_DISPUTE_TITLE',
        messageKey: 'notifications.MATCH_POST_DISPUTE_MESSAGE',
        translationParams: {
          disputerName,
          tournamentName: tournament?.name ?? '',
          matchDate,
        },
        actionUrl: `/matches/${matchId}`,
        requiresAction,
        matchId,
      })
    }
  }

  /**
   * Tells every other player of a finalized match that its result changed under them.
   * The message names the match, not the scores — the thread holds the before and
   * after — so a player who has not opened the previous one yet is not sent another.
   */
  async notifyResultCorrected(
    match: { id: string; playedAt?: Date | string | null },
    tournamentName: string,
    corrector: { id: string; displayName: string | null },
  ): Promise<void> {
    const participants = await matchRepository.getParticipationsByMatchId(match.id)
    const alreadyPending = await notificationService.getUserIdsWithUnreadOfTypeForMatch(
      match.id,
      'MATCH_RESULT_CORRECTED',
    )
    const translationParams = {
      authorName: corrector.displayName ?? null,
      tournamentName,
      matchDate: this.serializeMatchDate(match.playedAt),
    }

    const recipients = this.recipientsExcept(participants, corrector.id).filter((id) => !alreadyPending.has(id))
    for (const userId of recipients) {
      await this.sendResultCorrected(userId, match.id, translationParams)
    }
  }

  private async sendResultCorrected(
    userId: string,
    matchId: string,
    translationParams: Record<string, string | null>,
  ): Promise<void> {
    await notificationService.send({
      userId,
      type: 'MATCH_RESULT_CORRECTED',
      titleKey: 'notifications.MATCH_RESULT_CORRECTED_TITLE',
      messageKey: 'notifications.MATCH_RESULT_CORRECTED_MESSAGE',
      translationParams,
      actionUrl: `/matches/${matchId}`,
      requiresAction: false,
      matchId,
    })
  }

  private recipientsExcept(participants: Participation[], excludeUserId: string): string[] {
    return [...new Set(participants.map((p) => p.playerId))].filter(
      (id) => id !== excludeUserId,
    )
  }

  /**
   * Stores the raw instant, never a pre-formatted string: the reader's device owns
   * the locale and the timezone. `null` is resolved to a localized "to be defined".
   */
  private serializeMatchDate(playedAt: Date | string | null | undefined): string | null {
    return playedAt ? new Date(playedAt).toISOString() : null
  }

  private async resolveTeammatesAndOpponents(
    participants: Participation[],
    forPlayerId: string,
  ): Promise<ParticipantContext | null> {
    const self = participants.find((p) => p.playerId === forPlayerId)
    if (!self) return null

    const teamA = participants.filter((p) => p.teamSide === 'A')
    const teamB = participants.filter((p) => p.teamSide === 'B')
    const isTeamA = self.teamSide === 'A'
    const teammates = (isTeamA ? teamA : teamB).filter((p) => p.playerId !== forPlayerId)
    const opponents = isTeamA ? teamB : teamA

    const teammateNames = await Promise.all(
      teammates.map(async (p) => {
        const user = await userRepository.getById(p.playerId)
        return user?.displayName ?? ''
      }),
    )
    const opponentNames = await Promise.all(
      opponents.map(async (p) => {
        const user = await userRepository.getById(p.playerId)
        return user?.displayName ?? ''
      }),
    )

    // Empty strings, not French labels: the client resolves them with its own locale
    return {
      teammates: teammateNames.filter(Boolean).join(', '),
      opponents: opponentNames.filter(Boolean).join(', '),
      matchFormat: `${teammates.length + 1}v${opponents.length}`,
    }
  }
}

export const matchNotificationBuilder = new MatchNotificationBuilder()
