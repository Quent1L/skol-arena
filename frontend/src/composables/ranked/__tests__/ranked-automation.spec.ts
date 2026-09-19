import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rankedApi } from '../ranked.api'
import { useRankedService } from '../ranked.service'

vi.mock('../ranked.api', () => ({
  rankedApi: {
    setAutomation: vi.fn(),
    deleteAutomation: vi.fn(),
    rolloverNow: vi.fn(),
    getSeasonById: vi.fn(),
  },
}))
vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key } },
}))

const input = {
  enabled: true,
  durationDays: 30,
  nameTemplate: 'Saison {n}',
  carryParticipants: true,
  participantsMinMatches: 0,
  carryTiers: true,
  tierScalingMode: 'keep' as const,
  carryMmr: true,
  softResetFactor: 0.5,
}

const storedAutomation = { id: 'auto-1', tournamentId: 'season-1', ...input, seasonNumber: 1 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setAutomation', () => {
  it('stores the automation on the season currently loaded', async () => {
    const service = useRankedService()
    service.currentSeason.value = { id: 'season-1', name: 'Saison 1' } as never
    vi.mocked(rankedApi.setAutomation).mockResolvedValue(storedAutomation as never)

    expect(await service.setAutomation('season-1', input)).toBe(true)
    expect(service.currentSeason.value?.automation).toEqual(storedAutomation as never)
    expect(service.error.value).toBeNull()
  })

  it('leaves another season in state untouched', async () => {
    const service = useRankedService()
    service.currentSeason.value = { id: 'other', name: 'Other' } as never
    vi.mocked(rankedApi.setAutomation).mockResolvedValue(storedAutomation as never)

    await service.setAutomation('season-1', input)

    expect(service.currentSeason.value?.automation).toBeUndefined()
  })

  it('surfaces the backend message rather than swallowing it', async () => {
    const service = useRankedService()
    vi.mocked(rankedApi.setAutomation).mockRejectedValue(new Error('SEASON_NOT_FOUND'))

    expect(await service.setAutomation('season-1', input)).toBe(false)
    expect(service.error.value).toBe('SEASON_NOT_FOUND')
    expect(service.loading.value).toBe(false)
  })
})

describe('deleteAutomation', () => {
  it('clears the automation held in state', async () => {
    const service = useRankedService()
    service.currentSeason.value = {
      id: 'season-1',
      name: 'Saison 1',
      automation: storedAutomation,
    } as never
    vi.mocked(rankedApi.deleteAutomation).mockResolvedValue(undefined)

    expect(await service.deleteAutomation('season-1')).toBe(true)
    expect(service.currentSeason.value?.automation).toBeNull()
  })
})

describe('rolloverNow', () => {
  it('returns the season that was opened', async () => {
    const service = useRankedService()
    const next = { id: 'season-2', name: 'Saison 2' }
    vi.mocked(rankedApi.rolloverNow).mockResolvedValue(next as never)

    expect(await service.rolloverNow('season-1')).toEqual(next as never)
    expect(rankedApi.rolloverNow).toHaveBeenCalledWith('season-1')
  })

  it('returns null and records the error when the rollover is refused', async () => {
    const service = useRankedService()
    vi.mocked(rankedApi.rolloverNow).mockRejectedValue(new Error('TOURNAMENT_INVALID_STATUS'))

    expect(await service.rolloverNow('season-1')).toBeNull()
    expect(service.error.value).toBe('TOURNAMENT_INVALID_STATUS')
  })
})
