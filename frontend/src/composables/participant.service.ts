import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { participantApi } from './participant.api'
import { useAppToast } from '@/composables/useAppToast'
import type { JoinTournamentResponse, ParticipantListItem } from '@skol-arena/shared'

export function useParticipantService() {
  const toast = useAppToast()
  const { t } = useI18n()

  // State
  const participants = ref<ParticipantListItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Actions
  async function joinTournament(tournamentId: string): Promise<JoinTournamentResponse | null> {
    try {
      loading.value = true
      error.value = null

      const result = await participantApi.joinTournament(tournamentId)

      toast.add({
        severity: 'success',
        summary: t('participantService.toast.joinSuccessSummary'),
        detail: t('participantService.toast.joinSuccessDetail'),
        life: 3000,
      })

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : t('participantService.errors.joinFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('participantService.toast.joinErrorSummary'),
        detail: message,
        life: 5000,
      })

      return null
    } finally {
      loading.value = false
    }
  }

  async function leaveTournament(tournamentId: string): Promise<boolean> {
    try {
      loading.value = true
      error.value = null

      await participantApi.leaveTournament(tournamentId)

      toast.add({
        severity: 'success',
        summary: t('participantService.toast.leaveSuccessSummary'),
        detail: t('participantService.toast.leaveSuccessDetail'),
        life: 3000,
      })

      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('participantService.errors.leaveFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('participantService.toast.leaveErrorSummary'),
        detail: message,
        life: 5000,
      })

      return false
    } finally {
      loading.value = false
    }
  }

  async function getTournamentParticipants(tournamentId: string): Promise<ParticipantListItem[]> {
    try {
      loading.value = true
      error.value = null

      const result = await participantApi.getTournamentParticipants(tournamentId)
      participants.value = result

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : t('participantService.errors.listFailed')
      error.value = message

      console.error('Erreur lors du chargement des participants:', err)
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Check if user is participant
   */
  function isUserParticipant(userId: string | null | undefined): boolean {
    if (!participants.value.length) return false
    return participants.value.some((p) => p.userId === userId)
  }

  /**
   * Get participant count
   */
  const participantCount = computed(() => participants.value.length)

  /**
   * Join tournament and reload participants
   */
  async function joinTournamentAndReload(tournamentId: string): Promise<boolean> {
    const result = await joinTournament(tournamentId)
    if (result) {
      await getTournamentParticipants(tournamentId)
      return true
    }
    return false
  }

  /**
   * Leave tournament and reload participants
   */
  async function leaveTournamentAndReload(tournamentId: string): Promise<boolean> {
    const success = await leaveTournament(tournamentId)
    if (success) {
      await getTournamentParticipants(tournamentId)
      return true
    }
    return false
  }

  /**
   * Admin adds a participant to tournament
   */
  async function adminAddParticipant(
    tournamentId: string,
    userId: string,
  ): Promise<JoinTournamentResponse | null> {
    try {
      loading.value = true
      error.value = null

      const result = await participantApi.adminAddParticipant(tournamentId, userId)

      toast.add({
        severity: 'success',
        summary: t('participantService.toast.addSuccessSummary'),
        detail: t('participantService.toast.addSuccessDetail'),
        life: 3000,
      })

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : t('participantService.errors.addFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('participantService.toast.addErrorSummary'),
        detail: message,
        life: 5000,
      })

      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Admin adds participant and reload participants
   */
  async function adminAddParticipantAndReload(
    tournamentId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await adminAddParticipant(tournamentId, userId)
    if (result) {
      await getTournamentParticipants(tournamentId)
      return true
    }
    return false
  }

  /**
   * Admin removes a participant and reloads
   */
  async function adminRemoveParticipantAndReload(
    tournamentId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      loading.value = true
      error.value = null

      await participantApi.adminRemoveParticipant(tournamentId, userId)

      toast.add({
        severity: 'success',
        summary: t('participantService.toast.removeSuccessSummary'),
        detail: t('participantService.toast.removeSuccessDetail'),
        life: 3000,
      })

      await getTournamentParticipants(tournamentId)
      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('participantService.errors.removeFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('participantService.toast.removeErrorSummary'),
        detail: message,
        life: 5000,
      })

      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Admin adds multiple participants in parallel and reloads
   */
  async function adminAddParticipantsBatchAndReload(
    tournamentId: string,
    userIds: string[],
  ): Promise<boolean> {
    try {
      loading.value = true
      error.value = null

      await Promise.all(
        userIds.map((userId) => participantApi.adminAddParticipant(tournamentId, userId)),
      )

      toast.add({
        severity: 'success',
        summary: t('participantService.toast.batchAddSuccessSummary'),
        detail: t('participantService.toast.batchAddSuccessDetail', { count: userIds.length }),
        life: 3000,
      })

      await getTournamentParticipants(tournamentId)
      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('participantService.errors.batchAddFailed')
      error.value = message

      toast.add({
        severity: 'error',
        summary: t('participantService.toast.addErrorSummary'),
        detail: message,
        life: 5000,
      })

      return false
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    participants,
    loading,
    error,
    participantCount,

    // Actions
    joinTournament,
    leaveTournament,
    getTournamentParticipants,
    isUserParticipant,
    joinTournamentAndReload,
    leaveTournamentAndReload,
    adminAddParticipant,
    adminAddParticipantAndReload,
    adminAddParticipantsBatchAndReload,
    adminRemoveParticipantAndReload,
  }
}
