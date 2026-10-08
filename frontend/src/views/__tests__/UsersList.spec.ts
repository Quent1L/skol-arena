import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithUi } from '@/test-support/mount'
import UsersList from '@/views/admin/UsersList.vue'
import { useAdminUsersService } from '@/composables/admin-users/admin-users.service'
import type { AdminUserListItem } from '@skol-arena/shared/types/index'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/composables/admin-users/admin-users.service', () => ({
  useAdminUsersService: vi.fn(),
}))
vi.mock('@/composables/useAppToast', () => ({
  useAppToast: () => ({ add: vi.fn() }),
}))

function makeUser(overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id: 'user-1',
    displayName: 'Alice',
    shortName: 'ALI',
    email: 'alice@example.com',
    emailVerified: true,
    role: 'player',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    lastLoginAt: new Date('2026-07-01T10:00:00Z'),
    deactivatedAt: null,
    archivedAt: null,
    matchCount: 12,
    tournamentCount: 3,
    authProviders: ['credential'],
    ...overrides,
  }
}

function makeServiceMock(users: AdminUserListItem[]) {
  const service = {
    users: ref(users),
    total: ref(users.length),
    stats: ref({
      total: 42,
      activeLast7Days: 5,
      activeLast30Days: 20,
      newThisMonth: 3,
      deactivated: 1,
      byRole: { player: 40, tournament_admin: 1, super_admin: 1, kiosk: 0 },
    }),
    currentUser: ref(null),
    deletionBlockers: ref([]),
    loading: ref(false),
    error: ref<string | null>(null),
    loadUsers: vi.fn().mockResolvedValue(undefined),
    loadStats: vi.fn().mockResolvedValue(undefined),
    loadUserById: vi.fn(),
    updateUser: vi.fn(),
    resetPassword: vi.fn().mockResolvedValue(true),
    setActivation: vi.fn().mockResolvedValue(true),
    archiveUser: vi.fn().mockResolvedValue(true),
    deleteUser: vi.fn().mockResolvedValue(true),
    addOrganization: vi.fn(),
    removeOrganization: vi.fn(),
  }
  vi.mocked(useAdminUsersService).mockReturnValue(service as never)
  return service
}

describe('UsersList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the first page and the KPIs on mount', async () => {
    const service = makeServiceMock([makeUser()])
    mountWithUi(UsersList)
    await flushPromises()

    expect(service.loadStats).toHaveBeenCalledTimes(1)
    expect(service.loadUsers).toHaveBeenCalledWith({
      search: undefined,
      role: undefined,
      status: undefined,
      limit: 20,
      offset: 0,
      sortBy: 'createdAt',
      sortDir: 'desc',
    })
  })

  it('renders a row per user with its activity', async () => {
    makeServiceMock([makeUser(), makeUser({ id: 'user-2', displayName: 'Bob', shortName: 'BOB' })])
    const wrapper = mountWithUi(UsersList)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Alice')
    expect(text).toContain('Bob')
    expect(text).toContain('alice@example.com')
  })

  it('shows "never" when a user has never logged in', async () => {
    makeServiceMock([makeUser({ lastLoginAt: null })])
    const wrapper = mountWithUi(UsersList)
    await flushPromises()

    expect(wrapper.text()).toContain('adminUsersList.never')
  })

  it('renders a tag per authentication provider', async () => {
    makeServiceMock([makeUser({ authProviders: ['credential', 'keycloak'] })])
    const wrapper = mountWithUi(UsersList)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('adminUsersList.authProviders.credential')
    expect(text).toContain('adminUsersList.authProviders.keycloak')
  })

  it('falls back to "none" for accounts created outside Better Auth', async () => {
    makeServiceMock([makeUser({ authProviders: [] })])
    const wrapper = mountWithUi(UsersList)
    await flushPromises()

    expect(wrapper.text()).toContain('adminUsersList.authProviders.none')
  })

  it('marks an archived user and hides the actions that need an identity', async () => {
    makeServiceMock([makeUser({ archivedAt: new Date('2026-07-01T10:00:00Z') })])
    const wrapper = mountWithUi(UsersList)
    await flushPromises()

    expect(wrapper.text()).toContain('adminUsersList.archived')
    const actions = wrapper.findAll('[aria-label]').map((b) => b.attributes('aria-label'))
    expect(actions).toContain('common.edit')
    expect(actions).not.toContain('adminUsersList.resetPassword')
    expect(actions).not.toContain('adminUsersList.deletePermanently')
  })

  it('debounces the search before querying the backend', async () => {
    vi.useFakeTimers()
    const service = makeServiceMock([makeUser()])
    const wrapper = mountWithUi(UsersList)
    await flushPromises()
    service.loadUsers.mockClear()

    await wrapper.find('input').setValue('ali')
    expect(service.loadUsers).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(service.loadUsers).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'ali', offset: 0 }),
    )
    vi.useRealTimers()
  })

  it('surfaces the service error', async () => {
    const service = makeServiceMock([])
    service.error.value = 'boom'
    const wrapper = mountWithUi(UsersList)
    await flushPromises()

    expect(wrapper.text()).toContain('boom')
  })
})
