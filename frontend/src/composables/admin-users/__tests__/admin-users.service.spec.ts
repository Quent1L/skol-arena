import { vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useAdminUsersService } from '../admin-users.service'
import { adminUsersApi } from '../admin-users.api'

const user = { id: 'u1', email: 'a@b.c' }
describeServiceContract('useAdminUsersService', useAdminUsersService, [
  { name: 'loadUsers', call: (s) => s.loadUsers({}), api: adminUsersApi, method: 'list', args: [{}], result: { items: [], total: 0 } },
  { name: 'loadStats', call: (s) => s.loadStats(), api: adminUsersApi, method: 'stats' },
  { name: 'loadUserById', call: (s) => s.loadUserById('u1'), api: adminUsersApi, method: 'getById', args: ['u1'], result: user },
  { name: 'updateUser', call: (s) => s.updateUser('u1', {} as never), api: adminUsersApi, method: 'update', result: user },
  { name: 'resetPassword', call: (s) => s.resetPassword('u1'), api: adminUsersApi, method: 'resetPassword', args: ['u1'] },
  { name: 'deactivate', call: (s) => s.setActivation('u1', false), api: adminUsersApi, method: 'deactivate', args: ['u1'], result: user },
  { name: 'reactivate', call: (s) => s.setActivation('u1', true), api: adminUsersApi, method: 'reactivate', args: ['u1'], result: user },
  { name: 'archiveUser', call: (s) => s.archiveUser('u1', {} as never), api: adminUsersApi, method: 'archive', result: user },
  { name: 'restoreUser', call: (s) => s.restoreUser('u1', 'src'), api: adminUsersApi, method: 'restore', args: ['u1', { sourceUserId: 'src' }], result: user },
  { name: 'deleteUser', call: (s) => s.deleteUser('u1'), api: adminUsersApi, method: 'delete', args: ['u1'] },
  { name: 'addOrganization', call: (s) => s.addOrganization('u1', 'o1'), api: adminUsersApi, method: 'addOrganization', args: ['u1', 'o1'], result: user },
  { name: 'removeOrganization', call: (s) => s.removeOrganization('u1', 'o1'), api: adminUsersApi, method: 'removeOrganization', args: ['u1', 'o1'], result: user },
], toastAdd)
