import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  tournamentApi,
  type TournamentResponse,
  type TournamentListResponse,
  type CreateTournamentPayload,
} from './tournament.api'
import type {
  CreateTournamentFormData,
  UpdateTournamentFormData,
  TournamentStatus,
  TournamentEditability,
} from '@skol-arena/shared/types/index'
import {
  formDataToApiPayload,
  nestTournamentConfigs,
  TOURNAMENT_STATUS_TRANSITIONS,
} from '@skol-arena/shared/types/index'
import { useAuth } from '../useAuth'

/**
 * Recalculate points for all matches in a tournament (admin only)
 */
async function recalculatePoints(id: string): Promise<{ updatedMatches: number }> {
  return await tournamentApi.recalculatePoints(id)
}

async function clearCache(id: string): Promise<void> {
  await tournamentApi.clearCache(id)
}

/**
 * Get available status transitions
 */
function getAvailableStatusTransitions(currentStatus: TournamentStatus): TournamentStatus[] {
  return TOURNAMENT_STATUS_TRANSITIONS[currentStatus] ?? []
}

/**
 * Tournament service - Business logic and state management
 */
export function useTournamentService() {
  const { currentUser, isSuperAdmin } = useAuth()
  const { t } = useI18n()

  const tournaments = ref<TournamentListResponse[]>([])
  const currentTournament = ref<TournamentResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Check if current user can create tournaments
   */
  const canCreateTournament = computed(() => {
    if (!currentUser.value) return false
    // Match backend logic - only tournament_admin or super_admin can create
    return isSuperAdmin.value
  })

  /**
   * Check if current user can manage a specific tournament
   */
  function canManageTournament(_tournament: TournamentResponse | TournamentListResponse): boolean {
    if (!currentUser.value) return false

    if (isSuperAdmin.value) return true

    // TODO: Implement when tournament admins are available in BaseTournament
    // Check if user is in the tournament admins
    // return tournament.admins?.some((admin) => admin.user.id === currentUser.value?.id) ?? false

    // For now, only super admin can manage
    return false
  }

  /**
   * Check if user can delete tournament
   */
  function canDeleteTournament(tournament: TournamentResponse | TournamentListResponse): boolean {
    if (!currentUser.value) return false

    if (isSuperAdmin.value) return true

    // TODO: allow tournament owner to delete drafts once tournament admins exist.
    // For now, only super admin can delete drafts.
    return tournament.status === 'draft'
  }

  /**
   * Check if tournament can be edited
   */
  function canEditTournament(tournament: TournamentResponse | TournamentListResponse): boolean {
    if (!canManageTournament(tournament)) return false

    // After draft, only certain fields can be edited
    return true // Service handles the restriction
  }

  /**
   * What may still be edited, straight from the backend.
   *
   * Deliberately not derived locally: the list used to be duplicated here and in
   * the form, both disagreed with what the API accepted, and fields were shown
   * disabled that the server would happily have taken.
   */
  async function getEditability(id: string): Promise<TournamentEditability> {
    return await tournamentApi.getEditability(id)
  }

  /**
   * List tournaments with optional filters
   */
  async function listTournaments(filters?: {
    status?: TournamentStatus
    mode?: 'championship' | 'bracket'
  }) {
    loading.value = true
    error.value = null

    try {
      tournaments.value = await tournamentApi.list(filters)
      return tournaments.value
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('tournamentService.errors.loadFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Get tournament by ID
   */
  async function getTournament(id: string) {
    loading.value = true
    error.value = null

    try {
      currentTournament.value = await tournamentApi.getById(id)
      return currentTournament.value
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('tournamentService.errors.loadFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Create tournament
   */
  async function createTournament(formData: CreateTournamentFormData) {
    if (!canCreateTournament.value) {
      throw new Error(t('tournamentService.errors.noCreatePermission'))
    }

    loading.value = true
    error.value = null

    try {
      const payload = nestTournamentConfigs(
        formDataToApiPayload(formData),
      ) as CreateTournamentPayload
      const tournament = await tournamentApi.create(payload)

      // Reload list rather than inserting full detail item into summary list

      return tournament
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('tournamentService.errors.createFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Update tournament
   */
  async function updateTournament(id: string, formData: UpdateTournamentFormData) {
    loading.value = true
    error.value = null

    try {
      const payload = nestTournamentConfigs(formDataToApiPayload(formData))
      const tournament = await tournamentApi.update(id, payload)

      // Update status in list summary
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], ...tournament }
      }

      // Update current
      if (currentTournament.value?.id === id) {
        currentTournament.value = tournament
      }

      return tournament
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('tournamentService.errors.updateFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Change tournament status
   */
  async function changeTournamentStatus(id: string, status: TournamentStatus) {
    loading.value = true
    error.value = null

    try {
      const tournament = await tournamentApi.changeStatus(id, status)

      // Update status in list summary
      const listIndex = tournaments.value.findIndex((t) => t.id === id)
      if (listIndex !== -1) {
        tournaments.value[listIndex] = { ...tournaments.value[listIndex], status: tournament.status }
      }

      // Update current
      if (currentTournament.value?.id === id) {
        currentTournament.value = tournament
      }

      return tournament
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('tournamentService.errors.statusChangeFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Delete tournament
   */
  async function deleteTournament(id: string) {
    loading.value = true
    error.value = null

    try {
      await tournamentApi.delete(id)

      // Remove from list
      tournaments.value = tournaments.value.filter((t: TournamentResponse) => t.id !== id)

      // Clear current if it's the deleted one
      if (currentTournament.value?.id === id) {
        currentTournament.value = null
      }

      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('tournamentService.errors.deleteFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Check if tournament is open for joining
   */
  function isTournamentOpenForJoin(tournament: TournamentResponse | null): boolean {
    if (!tournament) return false
    return ['open'].includes(tournament.status) || (tournament.status === 'ongoing' && tournament.mode === 'ranked')
  }

  /**
   * Check if tournament allows leaving
   */
  // Mirrors the backend: a championship or a ranked season can be left until it is
  // finished (the player's results stay, listed as inactive); a started bracket cannot.
  function canLeaveTournament(tournament: TournamentResponse | null): boolean {
    if (!tournament || tournament.status === 'finished') return false
    if (tournament.mode === 'championship' || tournament.mode === 'ranked') return true
    return tournament.status !== 'ongoing'
  }

  /**
   * Check if user can create match in tournament
   */
  function canCreateMatchInTournament(
    tournament: TournamentResponse | null,
    isAuthenticated: boolean,
    isParticipant: boolean,
    userRole?: string,
  ): boolean {
    if (!isAuthenticated || !tournament || tournament.mode === 'bracket') return false
    if (userRole === 'kiosk') return ['open', 'ongoing'].includes(tournament.status)
    if (!isParticipant) return false
    return ['open', 'ongoing'].includes(tournament.status)
  }

  /**
   * Load tournament with error handling
   */
  async function loadTournamentWithErrorHandling(id: string): Promise<TournamentResponse | null> {
    try {
      return await getTournament(id)
    } catch (err) {
      if (err instanceof Error && err.cause === 'ORGANIZATION_ACCESS_DENIED') throw err
      console.error('Erreur lors du chargement du tournoi:', err)
      return null
    }
  }

  return {
    // State
    tournaments,
    currentTournament,
    loading,
    error,

    // Computed
    canCreateTournament,

    // Methods
    canManageTournament,
    canDeleteTournament,
    canEditTournament,
    getEditability,
    getAvailableStatusTransitions,
    isTournamentOpenForJoin,
    canLeaveTournament,
    canCreateMatchInTournament,
    loadTournamentWithErrorHandling,
    listTournaments,
    getTournament,
    createTournament,
    updateTournament,
    changeTournamentStatus,
    deleteTournament,
    recalculatePoints,
    clearCache,
  }
}
