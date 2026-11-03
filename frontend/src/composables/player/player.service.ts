import { ref } from 'vue'
import { i18n } from '@/i18n'
import { playerApi } from './player.api'
import type {
  PlayerProfile,
  PlayerDetailStats,
  PlayerStatsFilters,
  PlayerTournamentOption,
} from '@skol-arena/shared/types/index'

export function usePlayerService() {
  const player = ref<PlayerProfile | null>(null)
  const stats = ref<PlayerDetailStats | null>(null)
  const availableTournaments = ref<PlayerTournamentOption[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadPlayer(playerId: string) {
    try {
      player.value = await playerApi.getProfile(playerId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : i18n.global.t('loadErrors.profile')
    }
  }

  async function loadTournaments(playerId: string) {
    try {
      const result = await playerApi.getTournaments(playerId)
      availableTournaments.value = result.tournaments
    } catch (err) {
      console.error('Failed to load player tournaments:', err)
    }
  }

  async function loadStats(playerId: string, filters?: PlayerStatsFilters) {
    loading.value = true
    error.value = null
    try {
      const result = await playerApi.getStats(playerId, filters)
      player.value = result.player
      stats.value = result.stats
    } catch (err) {
      error.value = err instanceof Error ? err.message : i18n.global.t('loadErrors.stats')
      stats.value = null
    } finally {
      loading.value = false
    }
  }

  return {
    player,
    stats,
    availableTournaments,
    loading,
    error,
    loadPlayer,
    loadTournaments,
    loadStats,
  }
}
