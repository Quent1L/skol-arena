import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminUsersApi } from './admin-users.api'
import type {
  AdminArchiveUserInput,
  AdminUpdateUserInput,
  AdminUserDeletionBlocker,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListQuery,
  AdminUserStats,
} from '@skol-arena/shared/types/index'

/** Backend error payload carried by the xior interceptor for a failed deletion. */
interface DeletionConflict {
  details?: { blockers?: AdminUserDeletionBlocker[] }
}

export function useAdminUsersService() {
  const { t } = useI18n()
  const users = ref<AdminUserListItem[]>([])
  const total = ref(0)
  const stats = ref<AdminUserStats | null>(null)
  const currentUser = ref<AdminUserDetail | null>(null)
  const deletionBlockers = ref<AdminUserDeletionBlocker[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function fail(err: unknown, fallbackKey: string) {
    error.value = err instanceof Error ? err.message : t(fallbackKey)
  }

  async function loadUsers(filters: Partial<AdminUserListQuery>) {
    loading.value = true
    error.value = null
    try {
      const response = await adminUsersApi.list(filters)
      users.value = response.data
      total.value = response.total
    } catch (err) {
      fail(err, 'adminUsersService.errors.listFailed')
    } finally {
      loading.value = false
    }
  }

  async function loadStats() {
    try {
      stats.value = await adminUsersApi.stats()
    } catch (err) {
      fail(err, 'adminUsersService.errors.statsFailed')
    }
  }

  async function loadUserById(id: string) {
    loading.value = true
    error.value = null
    try {
      currentUser.value = await adminUsersApi.getById(id)
    } catch (err) {
      fail(err, 'adminUsersService.errors.getFailed')
    } finally {
      loading.value = false
    }
  }

  async function updateUser(
    id: string,
    payload: AdminUpdateUserInput,
  ): Promise<AdminUserDetail | null> {
    loading.value = true
    error.value = null
    try {
      const updated = await adminUsersApi.update(id, payload)
      currentUser.value = updated
      syncListEntry(updated)
      return updated
    } catch (err) {
      fail(err, 'adminUsersService.errors.updateFailed')
      return null
    } finally {
      loading.value = false
    }
  }

  async function resetPassword(id: string): Promise<boolean> {
    error.value = null
    try {
      await adminUsersApi.resetPassword(id)
      return true
    } catch (err) {
      fail(err, 'adminUsersService.errors.resetPasswordFailed')
      return false
    }
  }

  async function setActivation(id: string, active: boolean): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = active
        ? await adminUsersApi.reactivate(id)
        : await adminUsersApi.deactivate(id)
      currentUser.value = updated
      syncListEntry(updated)
      return true
    } catch (err) {
      fail(
        err,
        active
          ? 'adminUsersService.errors.reactivateFailed'
          : 'adminUsersService.errors.deactivateFailed',
      )
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Archiving: destroys the sign-in identity and anonymises the profile while every
   * match, standing and MMR row that references the user is preserved.
   */
  async function archiveUser(id: string, input: AdminArchiveUserInput = {}): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await adminUsersApi.archive(id, input)
      currentUser.value = updated
      syncListEntry(updated)
      return true
    } catch (err) {
      fail(err, 'adminUsersService.errors.archiveFailed')
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Gives an archived profile the identity of a freshly created account, so a
   * returning player gets their history back. The backend refuses when the new
   * account already has data of its own, and says which.
   */
  async function restoreUser(id: string, sourceUserId: string): Promise<boolean> {
    loading.value = true
    error.value = null
    deletionBlockers.value = []
    try {
      const updated = await adminUsersApi.restore(id, { sourceUserId })
      currentUser.value = updated
      syncListEntry(updated)
      return true
    } catch (err) {
      deletionBlockers.value = (err as DeletionConflict)?.details?.blockers ?? []
      fail(err, 'adminUsersService.errors.restoreFailed')
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Permanent deletion. On conflict the backend lists the data that would be lost;
   * it is exposed so the view can explain the refusal and offer archiving instead.
   */
  async function deleteUser(id: string): Promise<boolean> {
    loading.value = true
    error.value = null
    deletionBlockers.value = []
    try {
      await adminUsersApi.delete(id)
      users.value = users.value.filter((u) => u.id !== id)
      total.value = Math.max(0, total.value - 1)
      return true
    } catch (err) {
      deletionBlockers.value = (err as DeletionConflict)?.details?.blockers ?? []
      fail(err, 'adminUsersService.errors.deleteFailed')
      return false
    } finally {
      loading.value = false
    }
  }

  async function addOrganization(id: string, organizationId: string): Promise<boolean> {
    error.value = null
    try {
      await adminUsersApi.addOrganization(id, organizationId)
      await loadUserById(id)
      return true
    } catch (err) {
      fail(err, 'adminUsersService.errors.addOrganizationFailed')
      return false
    }
  }

  async function removeOrganization(id: string, organizationId: string): Promise<boolean> {
    error.value = null
    try {
      await adminUsersApi.removeOrganization(id, organizationId)
      await loadUserById(id)
      return true
    } catch (err) {
      fail(err, 'adminUsersService.errors.removeOrganizationFailed')
      return false
    }
  }

  function syncListEntry(updated: AdminUserDetail) {
    const idx = users.value.findIndex((u) => u.id === updated.id)
    if (idx !== -1) {
      const { organizations: _organizations, ...listItem } = updated
      users.value[idx] = listItem
    }
  }

  return {
    users,
    total,
    stats,
    currentUser,
    deletionBlockers,
    loading,
    error,
    loadUsers,
    loadStats,
    loadUserById,
    updateUser,
    resetPassword,
    setActivation,
    archiveUser,
    restoreUser,
    deleteUser,
    addOrganization,
    removeOrganization,
  }
}
