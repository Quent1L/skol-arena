import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { invitationApi, type GenerateCodeInput } from './invitation.api'

const loading = ref(false)
const error = ref<string | null>(null)

export function useInvitationService() {
  const { t } = useI18n()

  async function validateCode(code: string) {
    loading.value = true
    error.value = null
    try {
      const result = await invitationApi.validate(code)
      return result
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Error validating code'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function consumeCode(code: string) {
    loading.value = true
    error.value = null
    try {
      const result = await invitationApi.consume(code)
      return result
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Error consuming code'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function generateCode(input: GenerateCodeInput) {
    loading.value = true
    error.value = null
    try {
      const code = await invitationApi.generate(input)
      return code
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Error generating code'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function getAllCodes() {
    loading.value = true
    error.value = null
    try {
      const codes = await invitationApi.getAll()
      return codes
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Error fetching codes'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deactivateCode(id: string) {
    loading.value = true
    error.value = null
    try {
      const code = await invitationApi.deactivate(id)
      return code
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Error deactivating code'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function joinOrganization(code: string) {
    loading.value = true
    error.value = null
    try {
      const result = await invitationApi.joinOrganization(code)
      return result
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('invitationService.errors.joinFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    validateCode,
    consumeCode,
    generateCode,
    getAllCodes,
    deactivateCode,
    joinOrganization,
  }
}
