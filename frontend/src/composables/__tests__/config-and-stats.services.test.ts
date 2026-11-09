import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useConfigService } from '../config/config.service'
import { configApi } from '../config/config.api'
import { useTournamentStatsService } from '../tournament/tournament-stats.service'
import { tournamentStatsApi } from '../tournament/tournament-stats.api'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))
vi.mock('../config/config.api')
vi.mock('../tournament/tournament-stats.api')

beforeEach(() => vi.clearAllMocks())

describe('useConfigService', () => {
  it('loads and returns the configuration', async () => {
    vi.mocked(configApi.getConfig).mockResolvedValue({ version: '1' } as never)
    const service = useConfigService()

    const result = await service.loadConfig()

    expect(result).toEqual({ version: '1' })
    expect(service.config.value).toEqual({ version: '1' })
    expect(service.loading.value).toBe(false)
  })

  it('keeps the error message and rethrows', async () => {
    vi.mocked(configApi.getConfig).mockRejectedValue(new Error('offline'))
    const service = useConfigService()

    await expect(service.loadConfig()).rejects.toThrow('offline')

    expect(service.error.value).toBe('offline')
    expect(service.loading.value).toBe(false)
  })

  it('falls back to a generic message when the error has none', async () => {
    vi.mocked(configApi.getConfig).mockRejectedValue({})
    const service = useConfigService()

    await expect(service.loadConfig()).rejects.toEqual({})

    expect(service.error.value).toBe('Error loading configuration')
  })
})

describe('useTournamentStatsService', () => {
  it('loads the stats', async () => {
    vi.mocked(tournamentStatsApi.getStats).mockResolvedValue({ matches: 4 } as never)
    const service = useTournamentStatsService()

    await service.loadStats('t1')

    expect(tournamentStatsApi.getStats).toHaveBeenCalledWith('t1')
    expect(service.stats.value).toEqual({ matches: 4 })
    expect(service.loading.value).toBe(false)
  })

  it('reports a failure, with a translated fallback for non-errors', async () => {
    vi.mocked(tournamentStatsApi.getStats).mockRejectedValueOnce(new Error('boom'))
    const service = useTournamentStatsService()
    await service.loadStats('t1')
    expect(service.error.value).toBe('boom')

    vi.mocked(tournamentStatsApi.getStats).mockRejectedValueOnce('x')
    await service.loadStats('t1')
    expect(service.error.value).toBe('loadErrors.stats')
  })
})
