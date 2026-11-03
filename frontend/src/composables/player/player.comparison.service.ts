import { ref } from 'vue'
import { i18n } from '@/i18n'
import { playerApi } from './player.api'
import type {
  PlayerProfile,
  PlayerStatsResponse,
  PlayerStatsFilters,
  PlayerHeadToHeadRecord,
  PlayerTeamupRecord,
} from '@skol-arena/shared/types/index'

async function searchPlayers(query: string): Promise<PlayerProfile[]> {
  try {
    return await playerApi.search(query)
  } catch {
    return []
  }
}

export function usePlayerComparisonService() {
  const playerA = ref<PlayerStatsResponse | null>(null)
  const playerB = ref<PlayerStatsResponse | null>(null)
  const headToHead = ref<PlayerHeadToHeadRecord | null>(null)
  const together = ref<PlayerTeamupRecord | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Discards responses from requests superseded by a newer load or a clear
  let requestId = 0

  function clearComparison() {
    requestId++
    playerA.value = null
    playerB.value = null
    headToHead.value = null
    together.value = null
    error.value = null
    loading.value = false
  }

  async function loadComparison(
    playerAId: string,
    playerBId: string,
    filters?: PlayerStatsFilters,
  ) {
    const current = ++requestId
    loading.value = true
    error.value = null
    try {
      const result = await playerApi.getComparison(playerAId, playerBId, filters)
      if (current !== requestId) return
      playerA.value = result.playerA
      playerB.value = result.playerB
      headToHead.value = result.headToHead
      together.value = result.together
    } catch (err) {
      if (current !== requestId) return
      clearComparison()
      requestId = current
      error.value = err instanceof Error ? err.message : i18n.global.t('loadErrors.comparison')
    } finally {
      if (current === requestId) loading.value = false
    }
  }

  return {
    playerA,
    playerB,
    headToHead,
    together,
    loading,
    error,
    loadComparison,
    clearComparison,
    searchPlayers,
  }
}
