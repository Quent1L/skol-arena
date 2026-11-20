import { describe, it, expect, vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useRankedService } from '../ranked.service'
import { rankedApi } from '../ranked.api'

const season = { id: 's1' }
describeServiceContract(
  'useRankedService',
  useRankedService,
  [
    {
      name: 'loadSeasons',
      call: (s) => s.loadSeasons({ status: 'active' }),
      api: rankedApi,
      method: 'listSeasons',
      args: [{ status: 'active' }],
      result: [],
    },
    {
      name: 'loadSeasonById',
      call: (s) => s.loadSeasonById('s1'),
      api: rankedApi,
      method: 'getSeasonById',
      args: ['s1'],
      result: season,
    },
    {
      name: 'loadFinishedSeasons',
      call: (s) => s.loadFinishedSeasons(),
      api: rankedApi,
      method: 'getFinishedSeasons',
      result: [],
    },
    {
      name: 'createSeason',
      call: (s) => s.createSeason({} as never),
      api: rankedApi,
      method: 'createSeason',
      result: season,
    },
    {
      name: 'updateSeason',
      call: (s) => s.updateSeason('s1', {} as never),
      api: rankedApi,
      method: 'updateSeason',
      result: season,
    },
    {
      name: 'startSeason',
      call: (s) => s.startSeason('s1'),
      api: rankedApi,
      method: 'startSeason',
      args: ['s1'],
      result: season,
    },
    {
      name: 'endSeason',
      call: (s) => s.endSeason('s1'),
      api: rankedApi,
      method: 'endSeason',
      args: ['s1'],
      result: season,
    },
    {
      name: 'rolloverNow',
      call: (s) => s.rolloverNow('s1'),
      api: rankedApi,
      method: 'rolloverNow',
      args: ['s1'],
      result: season,
    },
    {
      name: 'setAutomation',
      call: (s) => s.setAutomation('s1', {} as never),
      api: rankedApi,
      method: 'setAutomation',
      result: season,
    },
    {
      name: 'deleteAutomation',
      call: (s) => s.deleteAutomation('s1'),
      api: rankedApi,
      method: 'deleteAutomation',
      args: ['s1'],
      result: season,
    },
    {
      name: 'loadTiers',
      call: (s) => s.loadTiers('s1'),
      api: rankedApi,
      method: 'getTiers',
      args: ['s1'],
      result: [],
    },
    {
      name: 'createTier',
      call: (s) => s.createTier('s1', {} as never),
      api: rankedApi,
      method: 'createTier',
      result: {},
    },
    {
      name: 'updateTier',
      call: (s) => s.updateTier('s1', 2, {} as never),
      api: rankedApi,
      method: 'updateTier',
      result: {},
    },
    {
      name: 'deleteTier',
      call: (s) => s.deleteTier('s1', 2),
      api: rankedApi,
      method: 'deleteTier',
      args: ['s1', 2],
    },
    {
      name: 'recalculateTiers',
      call: (s) => s.recalculateTiers('s1'),
      api: rankedApi,
      method: 'recalculateTiers',
      args: ['s1'],
      result: [],
    },
    {
      name: 'loadSeasonMmrLeaderboard',
      call: (s) => s.loadSeasonMmrLeaderboard('s1'),
      api: rankedApi,
      method: 'getSeasonMmrLeaderboard',
      args: ['s1'],
      result: [],
    },
    {
      name: 'loadProvisionalLeaderboard',
      call: (s) => s.loadProvisionalLeaderboard('s1'),
      api: rankedApi,
      method: 'getProvisionalLeaderboard',
      args: ['s1'],
      result: [],
    },
  ],
  toastAdd,
)

describe('useRankedService.loadPlayerMmr', () => {
  it('exposes the profile and returns the chart history', async () => {
    vi.spyOn(rankedApi, 'getPlayerMmr').mockResolvedValue({
      mmr: { mmr: 1200 },
      tiers: [],
      chartHistory: [1, 2],
    } as never)
    const service = useRankedService()

    expect(await service.loadPlayerMmr('s1', 'p1')).toEqual([1, 2])
    expect(service.playerMmr.value).toEqual({ mmr: 1200 })
    expect(service.loading.value).toBe(false)
  })

  it('degrades to an empty history instead of failing the page', async () => {
    vi.spyOn(rankedApi, 'getPlayerMmr').mockRejectedValue(new Error('down'))
    const service = useRankedService()

    expect(await service.loadPlayerMmr('s1', 'p1')).toEqual([])
    expect(service.playerMmr.value).toBeNull()
    expect(service.loading.value).toBe(false)
  })
})
