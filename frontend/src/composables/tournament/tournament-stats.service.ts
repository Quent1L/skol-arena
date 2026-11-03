import { ref } from 'vue'
import { i18n } from '@/i18n'
import { tournamentStatsApi } from './tournament-stats.api'
import type { TournamentStats } from '@skol-arena/shared'

export function useTournamentStatsService() {
  const stats = ref<TournamentStats | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadStats(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      stats.value = await tournamentStatsApi.getStats(tournamentId)
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : i18n.global.t('loadErrors.stats')
    } finally {
      loading.value = false
    }
  }

  return { stats, loading, error, loadStats }
}
