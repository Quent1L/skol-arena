import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { onWsEvent } from '@/composables/notification/notification.socket'
import { matchApi } from './match.api'
import { useParticipantService } from '../participant.service'
import type {
  ClientMatchModel,
  ClientMatchDetail,
  ClientCreateMatchRequest,
  ClientUpdateMatchRequest,
  ReportMatchResultRequestData,
  ConfirmMatchRequestData,
  ContestMatchRequestData,
  RespondToMatchRequestData,
  FinalizeMatchRequestData,
  ListMatchCardsQuery,
  PaginatedMatchCards,
  ClientValidateMatchRequest,
  MatchStatus,
  ParticipantListItem,
  MatchSideInput,
  TournamentMode,
} from '@skol-arena/shared/types/index'

/** Window used to fold the events of a single action into one refetch. */
const MATCH_UPDATE_COALESCE_MS = 200

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// After saving a match, land on the standings (classement) tab when the
// tournament has one (ranked/championship); otherwise the matches list.
function tabAfterMatchSave(mode?: TournamentMode): 'standings' | 'matches' {
  return mode === 'ranked' || mode === 'championship' ? 'standings' : 'matches'
}

export function useMatchService() {
  const router = useRouter()
  const toast = useAppToast()
  const { t } = useI18n()
  const { getTournamentParticipants } = useParticipantService()

  const validationResult = ref<ValidationResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const playersMap = ref<Record<string, string>>({})

  /**
   * Fill the players map from a participant list already in hand, so a caller that
   * has just fetched it does not pay for the same request twice.
   */
  function setPlayersMap(participants: ParticipantListItem[]): Record<string, string> {
    const map: Record<string, string> = {}
    for (const p of participants) {
      map[p.userId] = p.user.displayName
    }
    playersMap.value = map
    return map
  }

  /**
   * Create players map from participants
   */
  async function loadPlayersMap(tournamentId: string): Promise<Record<string, string>> {
    try {
      const participants = (await getTournamentParticipants(tournamentId)) as ParticipantListItem[]
      return setPlayersMap(participants)
    } catch (err) {
      console.error('Erreur loading participants map:', err)
      return {}
    }
  }

  async function validateParticipants(
    tournamentId: string,
    allPlayerIds: string[],
    playedAt?: Date,
    matchId?: string,
  ): Promise<ValidationResult> {
    try {
      const dataToValidate: ClientValidateMatchRequest = {
        tournamentId,
        allPlayerIds,
        playedAt,
        ...(matchId && { matchId }),
      }
      const result = await matchApi.validate(dataToValidate)
      validationResult.value = result
      return result
    } catch {
      const errorResult: ValidationResult = {
        valid: false,
        errors: [t('matchService.errors.validationFailed')],
        warnings: [],
      }
      validationResult.value = errorResult
      return errorResult
    }
  }

  /**
   * Validate match with full sides composition
   */
  async function validateMatchSides(
    tournamentId: string,
    sides: MatchSideInput[],
    playedAt?: Date,
    matchId?: string,
  ): Promise<ValidationResult> {
    try {
      const dataToValidate: ClientValidateMatchRequest = {
        tournamentId,
        sides,
        playedAt,
        ...(matchId && { matchId }),
      }
      const result = await matchApi.validate(dataToValidate)
      validationResult.value = result
      return result
    } catch {
      const errorResult: ValidationResult = {
        valid: false,
        errors: [t('matchService.errors.validationFailed')],
        warnings: [],
      }
      validationResult.value = errorResult
      return errorResult
    }
  }

  function canProceedToNextStep(
    _step: string,
    playerIdsA: string[],
    playerIdsB: string[],
    teamAId?: string,
    teamBId?: string,
  ): boolean {
    const result = validationResult.value
    if (!result) return false
    if (teamAId && teamBId) return result.valid
    return result.valid && playerIdsA.length > 0 && playerIdsB.length > 0
  }

  /**
   * Check if can create match
   */
  function canCreateMatch(
    status: MatchStatus,
    scheduledDate: Date | null,
    scoreA: number,
    scoreB: number,
  ): boolean {
    const result = validationResult.value
    if (!result?.valid) return false
    if (!status) return false

    if (status === 'scheduled' && !scheduledDate) return false
    if (status === 'reported' && (scoreA < 0 || scoreB < 0)) return false

    return true
  }

  /**
   * Create match with error handling and navigation
   */
  async function createMatchWithNavigation(
    data: ClientCreateMatchRequest,
    tournamentId: string,
    tournamentMode?: TournamentMode,
  ): Promise<ClientMatchModel | null> {
    loading.value = true
    error.value = null

    try {
      const match = await matchApi.create(data)

      toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('matchService.toast.createSuccessDetail'),
        life: 3000,
      })

      await router.replace({
        name: 'tournament-tab',
        params: { id: tournamentId, tab: tabAfterMatchSave(tournamentMode) },
      })
      return match
    } catch (err) {
      const message = err instanceof Error ? err.message : t('matchService.errors.createFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: message,
        life: 5000,
      })

      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Update match with error handling and navigation
   */
  async function updateMatchWithNavigation(
    matchId: string,
    data: ClientUpdateMatchRequest,
    tournamentId: string,
    tournamentMode?: TournamentMode,
  ): Promise<ClientMatchModel | null> {
    loading.value = true
    error.value = null

    try {
      const match = await matchApi.update(matchId, data)

      toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('matchService.toast.updateSuccessDetail'),
        life: 3000,
      })

      await router.replace({
        name: 'tournament-tab',
        params: { id: tournamentId, tab: tabAfterMatchSave(tournamentMode) },
      })
      return match
    } catch (err) {
      const message = err instanceof Error ? err.message : t('matchService.errors.updateFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: message,
        life: 5000,
      })

      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Get team players names from IDs
   */
  function getTeamPlayersNames(playerIds: string[]): string[] {
    return playerIds.map((id) => playersMap.value[id] ?? t('matchService.unknownPlayer', { id }))
  }

  // Basic API methods
  const createMatch = async (data: ClientCreateMatchRequest): Promise<ClientMatchModel> => {
    return await matchApi.create(data)
  }

  const getMatch = async (id: string): Promise<ClientMatchDetail> => {
    return await matchApi.getById(id)
  }

  const listMatches = async (
    filters?: Omit<Partial<ListMatchCardsQuery>, 'bracketMode'> & {
      bracketMode?: 'true' | 'false'
    },
  ): Promise<PaginatedMatchCards> => {
    return await matchApi.list(filters)
  }

  const updateMatch = async (
    id: string,
    data: ClientUpdateMatchRequest,
  ): Promise<ClientMatchModel> => {
    return await matchApi.update(id, data)
  }

  const deleteMatch = async (id: string): Promise<void> => {
    await matchApi.delete(id)
  }

  const reportMatchResult = async (
    id: string,
    data: ReportMatchResultRequestData,
  ): Promise<ClientMatchModel> => {
    return await matchApi.reportResult(id, data)
  }

  const confirmMatchResult = async (
    id: string,
    data: ConfirmMatchRequestData = {},
  ): Promise<ClientMatchModel> => {
    try {
      const match = await matchApi.confirmResult(id, data)
      toast.add({
        severity: 'success',
        summary: t('matchService.toast.confirmSuccessSummary'),
        detail: t('matchService.toast.confirmSuccessDetail'),
        life: 3000,
      })
      return match
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('matchService.errors.confirmFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: errorMessage,
        life: 5000,
      })
      throw err
    }
  }

  const contestMatchResult = async (
    id: string,
    data: ContestMatchRequestData,
  ): Promise<ClientMatchModel> => {
    try {
      const match = await matchApi.contestResult(id, data)
      toast.add({
        severity: 'warn',
        summary: t('matchService.toast.contestSuccessSummary'),
        detail: t('matchService.toast.contestSuccessDetail'),
        life: 6000,
      })
      return match
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('matchService.errors.contestFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: errorMessage,
        life: 5000,
      })
      throw err
    }
  }

  const respondToMatch = async (
    id: string,
    data: RespondToMatchRequestData,
    options?: { withdrawingDispute?: boolean; postFinalization?: boolean },
  ): Promise<ClientMatchDetail> => {
    try {
      const match = await matchApi.respondToMatch(id, data)
      const postFinalization = options?.postFinalization === true
      if (data.type === 'agree') {
        // Withdrawing after finalization changes nothing about the result, so it does
        // not promise the round will re-open the way the pre-finalization one does.
        const withdrawing = options?.withdrawingDispute === true
        const key = withdrawing
          ? postFinalization
            ? 'withdrawPostDispute'
            : 'withdrawDispute'
          : 'agreeSuccess'
        toast.add({
          severity: 'success',
          summary: t(`matchService.toast.${key}Summary`),
          detail: t(`matchService.toast.${key}Detail`),
          life: 3000,
        })
      } else {
        toast.add({
          severity: 'warn',
          summary: t('matchService.toast.contestSuccessSummary'),
          detail: postFinalization
            ? t('matchService.toast.postContestDetail')
            : t('matchService.toast.respondContestDetail'),
          life: 6000,
        })
      }
      return match
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('matchService.errors.respondFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: errorMessage,
        life: 5000,
      })
      throw err
    }
  }

  const cancelMatch = async (id: string): Promise<ClientMatchModel> => {
    try {
      const match = await matchApi.cancel(id)
      toast.add({
        severity: 'info',
        summary: t('matchService.toast.cancelSuccessSummary'),
        detail: t('matchService.toast.cancelSuccessDetail'),
        life: 3000,
      })
      return match
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('matchService.errors.cancelFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: errorMessage,
        life: 5000,
      })
      throw err
    }
  }

  const finalizeMatch = async (
    id: string,
    data: FinalizeMatchRequestData,
  ): Promise<ClientMatchModel> => {
    try {
      const match = await matchApi.finalize(id, data)
      toast.add({
        severity: 'success',
        summary: t('matchService.toast.finalizeSuccessSummary'),
        detail: t('matchService.toast.finalizeSuccessDetail'),
        life: 3000,
      })
      return match
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('matchService.errors.finalizeFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: errorMessage,
        life: 5000,
      })
      throw err
    }
  }

  const validateMatch = async (data: ClientValidateMatchRequest) => {
    return await matchApi.validate(data)
  }

  /**
   * Live updates for one match: the server signals that its state moved, the caller
   * refetches. A single action can move the match twice (a validation that finalizes it),
   * so the signals are coalesced into one refresh. Returns the unsubscribe function.
   */
  const subscribeToMatchUpdates = (matchId: string, onUpdate: () => void): (() => void) => {
    let pending: ReturnType<typeof setTimeout> | null = null

    const off = onWsEvent('match_updated', (payload) => {
      if ((payload as { matchId?: string })?.matchId !== matchId) return
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        pending = null
        onUpdate()
      }, MATCH_UPDATE_COALESCE_MS)
    })

    return () => {
      if (pending) clearTimeout(pending)
      off()
    }
  }

  return {
    // State
    validationResult,
    loading,
    error,
    playersMap,

    // Business logic methods
    loadPlayersMap,
    setPlayersMap,
    validateParticipants,
    validateMatchSides,
    canProceedToNextStep,
    canCreateMatch,
    createMatchWithNavigation,
    updateMatchWithNavigation,
    getTeamPlayersNames,

    // Basic API methods
    createMatch,
    getMatch,
    listMatches,
    updateMatch,
    deleteMatch,
    reportMatchResult,
    confirmMatchResult,
    contestMatchResult,
    respondToMatch,
    cancelMatch,
    finalizeMatch,
    validateMatch,
    subscribeToMatchUpdates,
  }
}
