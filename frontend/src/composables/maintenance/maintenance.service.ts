import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { maintenanceApi } from './maintenance.api'
import type {
  AvatarMigrationResult,
  MaintenanceStatus,
  SystemInfo,
} from '@skol-arena/shared/types/index'

export function useMaintenanceService() {
  const { t } = useI18n()
  const toast = useAppToast()
  const info = ref<SystemInfo | null>(null)
  const status = ref<MaintenanceStatus | null>(null)
  const lastMigration = ref<AvatarMigrationResult | null>(null)
  const loading = ref(false)
  const migrating = ref(false)
  const error = ref<string | null>(null)

  /** True when the backend found avatars in a store AVATAR_STORAGE no longer points at. */
  const hasStrandedAvatars = computed(
    () => (status.value?.avatarStorage.strandedDrivers.length ?? 0) > 0,
  )

  async function loadSystemInfo() {
    loading.value = true
    error.value = null
    try {
      info.value = await maintenanceApi.getSystemInfo()
      status.value = {
        avatarStorage: {
          driver: info.value.avatarStorage.driver,
          strandedDrivers: info.value.avatarStorage.strandedDrivers,
        },
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('maintenanceService.errors.loadFailed')
    } finally {
      loading.value = false
    }
  }

  /** Cheap: the backend answers from a flag computed at startup. Failures stay silent. */
  async function loadStatus() {
    try {
      status.value = await maintenanceApi.getStatus()
    } catch {
      status.value = null
    }
  }

  async function migrateAvatars() {
    migrating.value = true
    try {
      const result = await maintenanceApi.migrateAvatars()
      lastMigration.value = result
      if (info.value) info.value = { ...info.value, avatarStorage: result.report }
      status.value = {
        avatarStorage: { driver: result.report.driver, strandedDrivers: result.report.strandedDrivers },
      }
      toast.add({
        severity: result.failed > 0 ? 'warn' : 'success',
        summary: t('maintenanceService.migrationDone'),
        detail: t('maintenanceService.migrationDetail', result),
        life: 5000,
      })
    } catch (err) {
      toast.add({
        severity: 'error',
        summary: t('maintenanceService.errors.migrationFailed'),
        detail: err instanceof Error ? err.message : undefined,
        life: 5000,
      })
    } finally {
      migrating.value = false
    }
  }

  return {
    info,
    status,
    lastMigration,
    loading,
    migrating,
    error,
    hasStrandedAvatars,
    loadSystemInfo,
    loadStatus,
    migrateAvatars,
  }
}
