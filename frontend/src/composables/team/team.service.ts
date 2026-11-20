import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { teamApi } from './team.api'
import type { ClientTeam } from '@skol-arena/shared/types/index'

export function useTeamService() {
  const toast = useAppToast()
  const { t } = useI18n()
  const teams = ref<ClientTeam[]>([])
  const loading = ref(false)

  async function loadTeams(tournamentId: string): Promise<void> {
    loading.value = true
    try {
      teams.value = await teamApi.list(tournamentId)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('teamService.errors.listFailed')
      toast.add({ severity: 'error', summary: t('common.error'), detail: message, life: 4000 })
    } finally {
      loading.value = false
    }
  }

  async function createTeam(tournamentId: string, name: string): Promise<void> {
    loading.value = true
    try {
      await teamApi.create(tournamentId, { name })
      toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('teamService.toast.createSuccess'),
        life: 3000,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('teamService.errors.createFailed')
      toast.add({ severity: 'error', summary: t('common.error'), detail: message, life: 4000 })
      throw err
    } finally {
      loading.value = false
    }
  }

  async function joinTeam(tournamentId: string, teamId: string, userId?: string): Promise<void> {
    loading.value = true
    try {
      const updated = await teamApi.join(tournamentId, teamId, userId)
      if (updated) {
        const idx = teams.value.findIndex((t) => t.id === teamId)
        if (idx !== -1) teams.value[idx] = updated
      }
      toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('teamService.toast.joinSuccess'),
        life: 3000,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('teamService.errors.joinFailed')
      toast.add({ severity: 'error', summary: t('common.error'), detail: message, life: 4000 })
      throw err
    } finally {
      loading.value = false
    }
  }

  async function leaveTeam(tournamentId: string, teamId: string): Promise<void> {
    loading.value = true
    try {
      await teamApi.leave(tournamentId, teamId)
      await loadTeams(tournamentId)
      toast.add({
        severity: 'info',
        summary: t('common.success'),
        detail: t('teamService.toast.leaveSuccess'),
        life: 3000,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('teamService.errors.leaveFailed')
      toast.add({ severity: 'error', summary: t('common.error'), detail: message, life: 4000 })
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteTeam(tournamentId: string, teamId: string): Promise<void> {
    loading.value = true
    try {
      await teamApi.delete(tournamentId, teamId)
      teams.value = teams.value.filter((t) => t.id !== teamId)
      toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('teamService.toast.deleteSuccess'),
        life: 3000,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('teamService.errors.deleteFailed')
      toast.add({ severity: 'error', summary: t('common.error'), detail: message, life: 4000 })
      throw err
    } finally {
      loading.value = false
    }
  }

  return { teams, loading, loadTeams, createTeam, joinTeam, leaveTeam, deleteTeam }
}
