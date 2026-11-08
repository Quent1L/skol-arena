import { describe, it, expect, vi, beforeEach } from 'vitest'
import http from '@/config/ApiConfig'
import { rankedApi } from '../ranked.api'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)

type Verb = 'get' | 'post' | 'patch' | 'put' | 'delete'
const mocked = http as unknown as Record<Verb, ReturnType<typeof vi.fn>>

/** Every call must hit one URL with one verb, and hand the response body back untouched. */
const routes: [string, () => Promise<unknown>, Verb, string][] = [
  ['createSeason', () => rankedApi.createSeason({} as never), 'post', '/api/ranked/seasons'],
  ['getSeasonById', () => rankedApi.getSeasonById('s1'), 'get', '/api/ranked/seasons/s1'],
  [
    'updateSeason',
    () => rankedApi.updateSeason('s1', {} as never),
    'patch',
    '/api/ranked/seasons/s1',
  ],
  ['startSeason', () => rankedApi.startSeason('s1'), 'post', '/api/ranked/seasons/s1/start'],
  ['endSeason', () => rankedApi.endSeason('s1'), 'post', '/api/ranked/seasons/s1/end'],
  [
    'getLeaderboard',
    () => rankedApi.getLeaderboard('s1'),
    'get',
    '/api/ranked/seasons/s1/leaderboard',
  ],
  [
    'getProvisionalLeaderboard',
    () => rankedApi.getProvisionalLeaderboard('s1'),
    'get',
    '/api/ranked/seasons/s1/leaderboard/provisional',
  ],
  [
    'getSeasonMmrLeaderboard',
    () => rankedApi.getSeasonMmrLeaderboard('s1'),
    'get',
    '/api/ranked/seasons/s1/leaderboard/season-stats',
  ],
  [
    'getPlayerMmr',
    () => rankedApi.getPlayerMmr('s1', 'p1'),
    'get',
    '/api/ranked/seasons/s1/players/p1',
  ],
  [
    'getPlayerCareer',
    () => rankedApi.getPlayerCareer('p1'),
    'get',
    '/api/ranked/players/p1/career',
  ],
  ['getTiers', () => rankedApi.getTiers('s1'), 'get', '/api/ranked/seasons/s1/tiers'],
  [
    'createTier',
    () => rankedApi.createTier('s1', {} as never),
    'post',
    '/api/ranked/seasons/s1/tiers',
  ],
  [
    'updateTier',
    () => rankedApi.updateTier('s1', 3, {} as never),
    'patch',
    '/api/ranked/seasons/s1/tiers/3',
  ],
  ['deleteTier', () => rankedApi.deleteTier('s1', 3), 'delete', '/api/ranked/seasons/s1/tiers/3'],
  [
    'recalculateTiers',
    () => rankedApi.recalculateTiers('s1'),
    'post',
    '/api/ranked/seasons/s1/tiers/recalculate',
  ],
  [
    'getFinishedSeasons',
    () => rankedApi.getFinishedSeasons(),
    'get',
    '/api/ranked/seasons/finished',
  ],
  [
    'setAutomation',
    () => rankedApi.setAutomation('s1', {} as never),
    'put',
    '/api/ranked/seasons/s1/automation',
  ],
  ['rolloverNow', () => rankedApi.rolloverNow('s1'), 'post', '/api/ranked/seasons/s1/rollover'],
]

beforeEach(() => {
  vi.clearAllMocks()
  for (const verb of Object.keys(mocked) as Verb[]) mocked[verb].mockResolvedValue({ data: 'body' })
})

describe('rankedApi', () => {
  it.each(routes)('%s calls the right endpoint', async (_name, call, verb, url) => {
    expect(await call()).toBe('body')
    expect(mocked[verb]).toHaveBeenCalledTimes(1)
    expect(mocked[verb].mock.calls[0]![0]).toBe(url)
  })

  it('sends the payload of writes', async () => {
    await rankedApi.createSeason({ name: 'S' } as never)
    expect(mocked.post).toHaveBeenCalledWith('/api/ranked/seasons', { name: 'S' })
    await rankedApi.setAutomation('s1', { enabled: true } as never)
    expect(mocked.put).toHaveBeenCalledWith('/api/ranked/seasons/s1/automation', { enabled: true })
  })

  it('builds the season list query from its filters', async () => {
    await rankedApi.listSeasons()
    expect(mocked.get).toHaveBeenLastCalledWith('/api/ranked/seasons')
    await rankedApi.listSeasons({ disciplineId: 'd1', status: 'active' })
    expect(mocked.get).toHaveBeenLastCalledWith('/api/ranked/seasons?disciplineId=d1&status=active')
    await rankedApi.listSeasons({ status: 'finished' })
    expect(mocked.get).toHaveBeenLastCalledWith('/api/ranked/seasons?status=finished')
  })

  it('pages the player history only when asked to', async () => {
    await rankedApi.getPlayerHistory('s1', 'p1')
    expect(mocked.get).toHaveBeenLastCalledWith('/api/ranked/seasons/s1/players/p1/history')
    await rankedApi.getPlayerHistory('s1', 'p1', { limit: 5, offset: 10 })
    expect(mocked.get).toHaveBeenLastCalledWith(
      '/api/ranked/seasons/s1/players/p1/history?limit=5&offset=10',
    )
    await rankedApi.getPlayerHistory('s1', 'p1', { offset: 0 })
    expect(mocked.get).toHaveBeenLastCalledWith(
      '/api/ranked/seasons/s1/players/p1/history?offset=0',
    )
  })

  it('encodes the start date of the weekly leaders', async () => {
    await rankedApi.getWeeklyMmrLeaders('s1', '2026-01-05T00:00:00+01:00')
    expect(mocked.get).toHaveBeenCalledWith(
      '/api/ranked/seasons/s1/weekly-mmr?from=2026-01-05T00%3A00%3A00%2B01%3A00',
    )
  })

  it('deletes an automation without reading a body', async () => {
    expect(await rankedApi.deleteAutomation('s1')).toBeUndefined()
    expect(mocked.delete).toHaveBeenCalledWith('/api/ranked/seasons/s1/automation')
  })

  it('asks for an MMR snapshot at a date and unwraps the players', async () => {
    mocked.post.mockResolvedValue({ data: { players: [{ playerId: 'p1', mmr: 1000 }] } })
    const players = await rankedApi.getMmrSnapshot('s1', ['p1'], new Date('2026-02-01T10:00:00Z'))
    expect(players).toEqual([{ playerId: 'p1', mmr: 1000 }])
    expect(mocked.post).toHaveBeenCalledWith('/api/ranked/seasons/s1/mmr-snapshot', {
      playerIds: ['p1'],
      at: '2026-02-01T10:00:00.000Z',
    })
  })
})
