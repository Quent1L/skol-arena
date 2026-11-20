import { ref } from 'vue'
import { configApi, type AppConfig } from './config.api'

const config = ref<AppConfig | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

export function useConfigService() {
  async function loadConfig() {
    loading.value = true
    error.value = null

    try {
      config.value = await configApi.getConfig()
      return config.value
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Error loading configuration'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    config,
    loading,
    error,
    loadConfig,
  }
}
