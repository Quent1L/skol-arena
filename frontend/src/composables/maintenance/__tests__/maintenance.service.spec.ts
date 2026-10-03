import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMaintenanceService } from '../maintenance.service'
import { maintenanceApi } from '../maintenance.api'
import type { AvatarStorageReport, SystemInfo } from '@skol-arena/shared/types/index'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))

function makeReport(overrides: Partial<AvatarStorageReport> = {}): AvatarStorageReport {
  return {
    driver: 'filesystem',
    total: 3,
    inActive: 1,
    stranded: [{ driver: 'postgres', count: 2 }],
    missing: 0,
    strandedDrivers: ['postgres'],
    ...overrides,
  }
}

function makeInfo(report: AvatarStorageReport): SystemInfo {
  return {
    application: {
      version: '2.0.4',
      bunVersion: '1.4.0',
      nodeEnv: 'production',
      startedAt: new Date(),
      apiVersions: ['v1'],
      latestApiVersion: 'v1',
    },
    database: {
      serverVersion: '17.2',
      sizeBytes: 1024,
      tables: [],
      migrations: { applied: 87, latestMigrationAt: null },
    },
    avatarStorage: report,
    environment: [],
  }
}

describe('useMaintenanceService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastAdd.mockReset()
  })

  it('flags stranded avatars from the cheap status endpoint', async () => {
    vi.spyOn(maintenanceApi, 'getStatus').mockResolvedValue({
      avatarStorage: { driver: 'postgres', strandedDrivers: ['filesystem'] },
    })
    const service = useMaintenanceService()

    await service.loadStatus()

    expect(service.hasStrandedAvatars.value).toBe(true)
  })

  it('stays silent when the status cannot be read', async () => {
    vi.spyOn(maintenanceApi, 'getStatus').mockRejectedValue(new Error('forbidden'))
    const service = useMaintenanceService()

    await service.loadStatus()

    expect(service.hasStrandedAvatars.value).toBe(false)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('clears the flag and refreshes the report after a migration', async () => {
    vi.spyOn(maintenanceApi, 'getSystemInfo').mockResolvedValue(makeInfo(makeReport()))
    const fresh = makeReport({ inActive: 3, stranded: [{ driver: 'postgres', count: 0 }], strandedDrivers: [] })
    vi.spyOn(maintenanceApi, 'migrateAvatars').mockResolvedValue({ migrated: 2, failed: 0, missing: 0, report: fresh })
    const service = useMaintenanceService()
    await service.loadSystemInfo()
    expect(service.hasStrandedAvatars.value).toBe(true)

    await service.migrateAvatars()

    expect(service.hasStrandedAvatars.value).toBe(false)
    expect(service.info.value?.avatarStorage).toEqual(fresh)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }))
  })

  it('reports a failed migration', async () => {
    vi.spyOn(maintenanceApi, 'migrateAvatars').mockRejectedValue(new Error('already running'))
    const service = useMaintenanceService()

    await service.migrateAvatars()

    expect(service.migrating.value).toBe(false)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'already running' }),
    )
  })
})
