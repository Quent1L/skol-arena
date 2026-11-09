import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlayerService } from '../player/player.service'
import { usePlayerComparisonService } from '../player/player.comparison.service'
import { playerApi } from '../player/player.api'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))
vi.mock('../player/player.api')

const api = vi.mocked(playerApi)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('usePlayerService', () => {
  it('loads the profile', async () => {
    api.getProfile.mockResolvedValue({ id: 'p1' } as never)
    const service = usePlayerService()

    await service.loadPlayer('p1')

    expect(service.player.value).toEqual({ id: 'p1' })
  })

  it('reports a profile failure, with a translated fallback for non-errors', async () => {
    api.getProfile.mockRejectedValueOnce(new Error('gone'))
    const service = usePlayerService()
    await service.loadPlayer('p1')
    expect(service.error.value).toBe('gone')

    api.getProfile.mockRejectedValueOnce('x')
    await service.loadPlayer('p1')
    expect(service.error.value).toBe('loadErrors.profile')
  })

  it('loads the tournament options and swallows a failure', async () => {
    api.getTournaments.mockResolvedValueOnce({ tournaments: [{ id: 't1' }] } as never)
    const service = usePlayerService()
    await service.loadTournaments('p1')
    expect(service.availableTournaments.value).toEqual([{ id: 't1' }])

    api.getTournaments.mockRejectedValueOnce(new Error('down'))
    await service.loadTournaments('p1')
    expect(service.availableTournaments.value).toEqual([{ id: 't1' }])
  })

  it('loads stats and the profile together', async () => {
    api.getStats.mockResolvedValue({ player: { id: 'p1' }, stats: { wins: 3 } } as never)
    const service = usePlayerService()

    await service.loadStats('p1', { tournamentId: 't1' } as never)

    expect(api.getStats).toHaveBeenCalledWith('p1', { tournamentId: 't1' })
    expect(service.stats.value).toEqual({ wins: 3 })
    expect(service.loading.value).toBe(false)
  })

  it('clears the stats and keeps the error when loading fails', async () => {
    api.getStats.mockRejectedValue(new Error('boom'))
    const service = usePlayerService()
    service.stats.value = { wins: 1 } as never

    await service.loadStats('p1')

    expect(service.stats.value).toBeNull()
    expect(service.error.value).toBe('boom')
    expect(service.loading.value).toBe(false)
  })
})

describe('usePlayerComparisonService', () => {
  const result = {
    playerA: { player: { id: 'a' } },
    playerB: { player: { id: 'b' } },
    headToHead: { wins: 1 },
    together: { wins: 2 },
  }

  it('stores a comparison', async () => {
    api.getComparison.mockResolvedValue(result as never)
    const service = usePlayerComparisonService()

    await service.loadComparison('a', 'b')

    expect(service.playerA.value).toEqual(result.playerA)
    expect(service.together.value).toEqual(result.together)
    expect(service.loading.value).toBe(false)
  })

  it('wipes the previous comparison and reports a failure', async () => {
    api.getComparison.mockResolvedValueOnce(result as never)
    const service = usePlayerComparisonService()
    await service.loadComparison('a', 'b')

    api.getComparison.mockRejectedValueOnce(new Error('nope'))
    await service.loadComparison('a', 'c')
    expect(service.playerA.value).toBeNull()
    expect(service.error.value).toBe('nope')
    expect(service.loading.value).toBe(false)

    api.getComparison.mockRejectedValueOnce('x')
    await service.loadComparison('a', 'c')
    expect(service.error.value).toBe('loadErrors.comparison')
  })

  it('drops the response of a request superseded by a clear', async () => {
    let resolve!: (value: unknown) => void
    api.getComparison.mockReturnValue(new Promise((r) => (resolve = r)) as never)
    const service = usePlayerComparisonService()

    const pending = service.loadComparison('a', 'b')
    service.clearComparison()
    resolve(result)
    await pending

    expect(service.playerA.value).toBeNull()
  })

  it('drops the failure of a request superseded by a newer one', async () => {
    let reject!: (reason: unknown) => void
    api.getComparison.mockReturnValueOnce(new Promise((_, r) => (reject = r)) as never)
    api.getComparison.mockResolvedValueOnce(result as never)
    const service = usePlayerComparisonService()

    const stale = service.loadComparison('a', 'b')
    await service.loadComparison('a', 'c')
    reject(new Error('late'))
    await stale

    expect(service.error.value).toBeNull()
    expect(service.playerB.value).toEqual(result.playerB)
  })

  it('searches players, falling back to an empty list on failure', async () => {
    api.search.mockResolvedValueOnce([{ id: 'a' }] as never)
    const service = usePlayerComparisonService()
    expect(await service.searchPlayers('an')).toEqual([{ id: 'a' }])

    api.search.mockRejectedValueOnce(new Error('down'))
    expect(await service.searchPlayers('an')).toEqual([])
  })
})
