import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { organizationApi } from './organization.api'
import type { OrganizationWithMemberCount, OrganizationMemberWithUser } from '@skol-arena/shared'

export function useOrganizationService() {
  const { t } = useI18n()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function listOrganizations(): Promise<OrganizationWithMemberCount[]> {
    loading.value = true
    error.value = null
    try {
      return await organizationApi.list()
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : t('organizationService.errors.listFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createOrganization(name: string) {
    loading.value = true
    error.value = null
    try {
      return await organizationApi.create(name)
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t('organizationService.errors.createFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function getMembers(orgId: string): Promise<OrganizationMemberWithUser[]> {
    loading.value = true
    error.value = null
    try {
      return await organizationApi.getMembers(orgId)
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t('organizationService.errors.getMembersFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function addMember(orgId: string, userId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await organizationApi.addMember(orgId, userId)
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t('organizationService.errors.addMemberFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function removeMember(orgId: string, userId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await organizationApi.removeMember(orgId, userId)
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t('organizationService.errors.removeMemberFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function renameOrganization(orgId: string, name: string) {
    loading.value = true
    error.value = null
    try {
      return await organizationApi.rename(orgId, name)
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t('organizationService.errors.renameFailed')
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    listOrganizations,
    createOrganization,
    getMembers,
    addMember,
    removeMember,
    renameOrganization,
  }
}
