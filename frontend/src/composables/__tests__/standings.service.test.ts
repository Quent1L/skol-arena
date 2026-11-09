import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStandingsService } from '../standings.service'
import { standingsApi } from '../standings.api'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('../standings.api')

const rows = [{ id: 'e1' }] as never

beforeEach(() => vi.clearAllMocks())

describe.each([
  ['official', 'loadOfficialStandings', 'getOfficial'],
  ['provisional', 'loadProvisionalStandings', 'getProvisional'],
] as const)('%s standings', (_label, load, apiMethod) => {
  it('stores the standings', async () => {
    vi.mocked(standingsApi[apiMethod]).mockResolvedValue({ standings: rows } as never)
    const service = useStandingsService()

    await service[load]('t1')

    expect(standingsApi[apiMethod]).toHaveBeenCalledWith('t1')
    expect(service.standings.value).toEqual(rows)
    expect(service.loading.value).toBe(false)
  })

  it('keeps the previous rows, reports the error and rethrows', async () => {
    vi.mocked(standingsApi[apiMethod]).mockResolvedValueOnce({ standings: rows } as never)
    const service = useStandingsService()
    await service[load]('t1')

    vi.mocked(standingsApi[apiMethod]).mockRejectedValueOnce(new Error('boom'))
    await expect(service[load]('t1')).rejects.toThrow('boom')

    expect(service.standings.value).toEqual(rows)
    expect(service.error.value).toBe('boom')
    expect(service.loading.value).toBe(false)
  })

  it('translates the fallback message and ends up empty on a first failure', async () => {
    vi.mocked(standingsApi[apiMethod]).mockRejectedValue('x')
    const service = useStandingsService()

    await expect(service[load]('t1')).rejects.toBe('x')

    expect(service.error.value).toBe('standingsService.errors.loadFailed')
    expect(service.standings.value).toEqual([])
  })
})
