import { vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useOrganizationService } from '../organization.service'
import { organizationApi } from '../organization.api'

describeServiceContract('useOrganizationService', useOrganizationService, [
  { name: 'listOrganizations', call: (s) => s.listOrganizations(), api: organizationApi, method: 'list', result: [] },
  { name: 'createOrganization', call: (s) => s.createOrganization('Org'), api: organizationApi, method: 'create', args: ['Org'], result: { id: 'o1' } },
  { name: 'renameOrganization', call: (s) => s.renameOrganization('o1', 'New'), api: organizationApi, method: 'rename', args: ['o1', 'New'], result: { id: 'o1' } },
  { name: 'getMembers', call: (s) => s.getMembers('o1'), api: organizationApi, method: 'getMembers', args: ['o1'], result: [] },
  { name: 'addMember', call: (s) => s.addMember('o1', 'u1'), api: organizationApi, method: 'addMember', args: ['o1', 'u1'] },
  { name: 'removeMember', call: (s) => s.removeMember('o1', 'u1'), api: organizationApi, method: 'removeMember', args: ['o1', 'u1'] },
], toastAdd)
