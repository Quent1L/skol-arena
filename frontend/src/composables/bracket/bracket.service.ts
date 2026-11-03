import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { bracketApi } from './bracket.api'
import type { ClientBracketData, GenerateBracketInput } from '@skol-arena/shared/types/index'

/**
 * Bracket service - Business logic and state management
 */
export function useBracketService() {
  const toast = useAppToast()
  const { t } = useI18n()

  const bracketData = ref<ClientBracketData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const canGenerate = ref(false)
  const canGenerateReason = ref<string | null>(null)
  const currentParticipants = ref<number>(0)

  // Computed properties
  const hasBracket = computed(() => bracketData.value !== null)

  /**
   * Load bracket data for a tournament
   */
  async function loadBracket(tournamentId: string) {
    loading.value = true
    error.value = null

    try {
      const data = await bracketApi.getBracket(tournamentId)
      bracketData.value = data
      return data
    } catch (err: unknown) {
      // Handle 404 gracefully - bracket not yet initialized
      if (err instanceof Error && err.message?.includes('404')) {
        bracketData.value = null
        error.value = null
        return null
      }

      error.value = err instanceof Error ? err.message : t('bracketService.errors.loadFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: error.value,
        life: 5000,
      })
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Check if bracket can be generated
   */
  async function checkCanGenerate(tournamentId: string) {
    try {
      const result = await bracketApi.canGenerate(tournamentId)
      canGenerate.value = result.canGenerate
      canGenerateReason.value = result.reason || null
      currentParticipants.value = result.currentParticipants ?? 0
      return result
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('bracketService.errors.eligibilityFailed')
      toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: errorMsg,
        life: 5000,
      })
      throw err
    }
  }

  /**
   * Generate bracket for a tournament
   */
  async function generateBracket(tournamentId: string, input: GenerateBracketInput) {
    loading.value = true
    error.value = null

    try {
      const data = await bracketApi.generate(tournamentId, input)
      bracketData.value = data

      toast.add({
        severity: 'success',
        summary: t('bracketService.toast.generateSuccessSummary'),
        detail: t('bracketService.toast.generateSuccessDetail'),
        life: 5000,
      })

      return data
    } catch (err: unknown) {
      let detail = err instanceof Error ? err.message : t('bracketService.errors.generateFailed')
      if (err instanceof Error && (err as Error & { cause?: unknown }).cause === 'CHAMPIONSHIP_PARTICIPANTS_WITHOUT_MATCHES') {
        const participants = ((err as Error & { details?: { participants?: Array<{ name: string }> } }).details?.participants) ?? []
        const names = participants.map((p) => p.name).join(', ')
        detail = names.length
          ? t('bracketService.errors.participantsWithoutMatchesNamed', { names })
          : t('bracketService.errors.participantsWithoutMatches')
      }
      error.value = detail
      toast.add({
        severity: 'error',
        summary: t('bracketService.toast.generateFailedSummary'),
        detail,
        life: 8000,
      })
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Regenerate bracket (delete and generate new)
   */
  async function regenerateBracket(tournamentId: string, input: GenerateBracketInput) {
    loading.value = true
    error.value = null

    try {
      // Delete existing bracket first
      await bracketApi.deleteBracket(tournamentId)

      // Generate new bracket
      const data = await bracketApi.generate(tournamentId, input)
      bracketData.value = data

      toast.add({
        severity: 'success',
        summary: t('bracketService.toast.regenerateSuccessSummary'),
        detail: t('bracketService.toast.regenerateSuccessDetail'),
        life: 5000,
      })

      return data
    } catch (err: unknown) {
      let detail = err instanceof Error ? err.message : t('bracketService.errors.regenerateFailed')
      if (err instanceof Error && (err as Error & { cause?: unknown }).cause === 'CHAMPIONSHIP_PARTICIPANTS_WITHOUT_MATCHES') {
        const participants = ((err as Error & { details?: { participants?: Array<{ name: string }> } }).details?.participants) ?? []
        const names = participants.map((p) => p.name).join(', ')
        detail = names.length
          ? t('bracketService.errors.participantsWithoutMatchesNamed', { names })
          : t('bracketService.errors.participantsWithoutMatches')
      }
      error.value = detail
      toast.add({
        severity: 'error',
        summary: t('bracketService.toast.generateFailedSummary'),
        detail,
        life: 8000,
      })
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Delete bracket
   */
  async function deleteBracket(tournamentId: string) {
    loading.value = true
    error.value = null

    try {
      await bracketApi.deleteBracket(tournamentId)
      bracketData.value = null

      toast.add({
        severity: 'success',
        summary: t('bracketService.toast.deleteSuccessSummary'),
        detail: t('bracketService.toast.deleteSuccessDetail'),
        life: 5000,
      })
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('bracketService.errors.deleteFailed')
      toast.add({
        severity: 'error',
        summary: t('bracketService.toast.deleteFailedSummary'),
        detail: error.value,
        life: 5000,
      })
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Clear bracket data
   */
  function clearBracket() {
    bracketData.value = null
    error.value = null
  }

  return {
    // State
    bracketData,
    loading,
    error,
    canGenerate,
    canGenerateReason,
    currentParticipants,

    // Computed
    hasBracket,

    // Methods
    loadBracket,
    checkCanGenerate,
    generateBracket,
    regenerateBracket,
    deleteBracket,
    clearBracket,
  }
}
