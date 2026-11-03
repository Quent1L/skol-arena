import { ref } from 'vue'
import { i18n } from '@/i18n'
import { userApi, type UserResponse } from './user.api'

export function useUserService() {
  const users = ref<UserResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Get all users (admin only)
   */
  async function listUsers(): Promise<UserResponse[]> {
    try {
      loading.value = true
      error.value = null

      const result = await userApi.list()
      users.value = result

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : i18n.global.t('loadErrors.users')
      error.value = message

      console.error('Failed to load users:', err)
      return []
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    users,
    loading,
    error,

    // Actions
    listUsers,
  }
}
