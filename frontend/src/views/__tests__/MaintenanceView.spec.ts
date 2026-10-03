import { describe, it, expect, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithPrime } from '@/test-support/mount'
import MaintenanceView from '@/views/admin/MaintenanceView.vue'
import AdminView from '@/views/admin/AdminView.vue'
import { useMaintenanceService } from '@/composables/maintenance/maintenance.service'
import type { AvatarStorageDriver, SystemInfo } from '@skol-arena/shared/types/index'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/maintenance/maintenance.service', () => ({
  useMaintenanceService: vi.fn(),
}))

function makeInfo(strandedDrivers: AvatarStorageDriver[]): SystemInfo {
  return {
    application: {
      version: '2.0.4',
      bunVersion: '1.4.0',
      nodeEnv: 'production',
      startedAt: new Date('2026-10-03T10:00:00Z'),
      apiVersions: ['v1'],
      latestApiVersion: 'v1',
    },
    database: {
      serverVersion: '17.2',
      sizeBytes: 5 * 1024 * 1024,
      tables: [{ name: 'matches', sizeBytes: 2048, rows: 10 }],
      migrations: { applied: 87, latestMigrationAt: new Date('2026-10-01T10:00:00Z') },
    },
    avatarStorage: {
      driver: 'filesystem',
      total: 2,
      inActive: strandedDrivers.length ? 0 : 2,
      stranded: [{ driver: 'postgres', count: strandedDrivers.length ? 2 : 0 }],
      missing: 0,
      strandedDrivers,
    },
    environment: [
      { name: 'PORT', group: 'server', secret: false, configured: true, value: '3000' },
      { name: 'BETTER_AUTH_SECRET', group: 'auth', secret: true, configured: true, value: null },
    ],
  }
}

function mockService(strandedDrivers: AvatarStorageDriver[]) {
  const info = ref<SystemInfo | null>(makeInfo(strandedDrivers))
  const service = {
    info,
    status: ref(null),
    lastMigration: ref(null),
    loading: ref(false),
    migrating: ref(false),
    error: ref<string | null>(null),
    hasStrandedAvatars: computed(() => strandedDrivers.length > 0),
    loadSystemInfo: vi.fn(),
    loadStatus: vi.fn(),
    migrateAvatars: vi.fn(),
  }
  vi.mocked(useMaintenanceService).mockReturnValue(service as unknown as ReturnType<typeof useMaintenanceService>)
  return service
}

describe('MaintenanceView', () => {
  it('offers the migration only when avatars are stranded', async () => {
    mockService(['postgres'])
    const stranded = mountWithPrime(MaintenanceView)
    await flushPromises()
    expect(stranded.find('[data-testid="migrate-avatars"]').exists()).toBe(true)

    mockService([])
    const clean = mountWithPrime(MaintenanceView)
    await flushPromises()
    expect(clean.find('[data-testid="migrate-avatars"]').exists()).toBe(false)
  })

  it('shows public values but never a secret', async () => {
    mockService([])
    const wrapper = mountWithPrime(MaintenanceView)
    await flushPromises()

    expect(wrapper.text()).toContain('3000')
    expect(wrapper.text()).toContain('BETTER_AUTH_SECRET')
    expect(wrapper.text()).toContain('maintenanceView.env.secretSet')
  })

  it('shows a single version, flagged only when this tab runs an older bundle', async () => {
    const service = mockService([])
    service.info.value!.application.version = __APP_VERSION__
    const current = mountWithPrime(MaintenanceView)
    await flushPromises()
    expect(current.find('[data-testid="app-version"]').text()).toBe(__APP_VERSION__)

    const stale = mockService([])
    stale.info.value!.application.version = '99.0.0'
    const wrapper = mountWithPrime(MaintenanceView)
    await flushPromises()
    expect(wrapper.find('[data-testid="app-version"]').text()).toContain('99.0.0')
    expect(wrapper.find('[data-testid="app-version"]').text()).toContain('maintenanceView.app.staleClient')
  })

  it('falls back to the bundle version when the server does not know it', async () => {
    const service = mockService([])
    service.info.value!.application.version = null
    const wrapper = mountWithPrime(MaintenanceView)
    await flushPromises()

    expect(wrapper.find('[data-testid="app-version"]').text()).toBe(__APP_VERSION__)
  })

  it('loads the system information on mount', async () => {
    const service = mockService([])
    mountWithPrime(MaintenanceView)
    await flushPromises()

    expect(service.loadSystemInfo).toHaveBeenCalled()
  })
})

describe('AdminView maintenance card', () => {
  it('warns about stranded avatars from the cached status', async () => {
    const service = mockService(['postgres'])
    const wrapper = mountWithPrime(AdminView)
    await flushPromises()

    expect(service.loadStatus).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="maintenance-avatar-warning"]').exists()).toBe(true)
  })

  it('stays quiet when storage is consistent', async () => {
    mockService([])
    const wrapper = mountWithPrime(AdminView)
    await flushPromises()

    expect(wrapper.find('[data-testid="maintenance-avatar-warning"]').exists()).toBe(false)
  })
})
