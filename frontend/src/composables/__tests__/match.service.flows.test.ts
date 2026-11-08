import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMatchService } from '../match/match.service'
import { matchApi } from '../match/match.api'
import { useRouter } from 'vue-router'
import { useAppToast } from '@/composables/useAppToast'
import { useParticipantService } from '../participant.service'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('../match/match.api')
vi.mock('vue-router')
vi.mock('@/composables/useAppToast')
vi.mock('../participant.service')

const handlers = new Map<string, (payload: unknown) => void>()
const off = vi.fn()
vi.mock('@/composables/notification/notification.socket', () => ({
  onWsEvent: (event: string, cb: (payload: unknown) => void) => {
    handlers.set(event, cb)
    return off
  },
}))

const router = { replace: vi.fn(), push: vi.fn() }
const toast = { add: vi.fn() }
const participants = { getTournamentParticipants: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>)
  vi.mocked(useAppToast).mockReturnValue(toast as unknown as ReturnType<typeof useAppToast>)
  vi.mocked(useParticipantService).mockReturnValue(
    participants as unknown as ReturnType<typeof useParticipantService>,
  )
  participants.getTournamentParticipants.mockResolvedValue([])
})

const valid = { valid: true, errors: [], warnings: [] }
const toasted = (severity: string) => toast.add.mock.calls.some(([t]) => t.severity === severity)

describe('players map', () => {
  it('maps participants to their display names', () => {
    const service = useMatchService()
    const map = service.setPlayersMap([
      { userId: 'a', user: { displayName: 'Ann' } },
      { userId: 'b', user: { displayName: 'Bob' } },
    ] as never)
    expect(map).toEqual({ a: 'Ann', b: 'Bob' })
    expect(service.playersMap.value).toEqual(map)
    expect(service.getTeamPlayersNames(['a', 'zz'])).toEqual(['Ann', 'matchService.unknownPlayer'])
  })

  it('loads the map for a tournament, and answers empty when loading fails', async () => {
    participants.getTournamentParticipants.mockResolvedValueOnce([
      { userId: 'a', user: { displayName: 'Ann' } },
    ])
    const service = useMatchService()
    expect(await service.loadPlayersMap('t1')).toEqual({ a: 'Ann' })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    participants.getTournamentParticipants.mockRejectedValueOnce(new Error('down'))
    expect(await service.loadPlayersMap('t1')).toEqual({})
  })
})

describe('validation', () => {
  it('validates participants, passing the match being edited', async () => {
    vi.mocked(matchApi.validate).mockResolvedValue(valid)
    const service = useMatchService()
    const when = new Date('2026-01-01')
    expect(await service.validateParticipants('t1', ['a', 'b'], when, 'm1')).toEqual(valid)
    expect(matchApi.validate).toHaveBeenCalledWith({
      tournamentId: 't1',
      allPlayerIds: ['a', 'b'],
      playedAt: when,
      matchId: 'm1',
    })
    await service.validateParticipants('t1', ['a', 'b'])
    expect(vi.mocked(matchApi.validate).mock.calls[1]![0]).not.toHaveProperty('matchId')
    expect(service.validationResult.value).toEqual(valid)
  })

  it('validates a full composition', async () => {
    vi.mocked(matchApi.validate).mockResolvedValue(valid)
    const service = useMatchService()
    const sides = [
      { position: 1, playerIds: ['a'] },
      { position: 2, playerIds: ['b'] },
    ]
    await service.validateMatchSides('t1', sides, undefined, 'm1')
    expect(matchApi.validate).toHaveBeenCalledWith({
      tournamentId: 't1',
      sides,
      playedAt: undefined,
      matchId: 'm1',
    })
  })

  it('turns an API failure into an invalid result', async () => {
    vi.mocked(matchApi.validate).mockRejectedValue(new Error('boom'))
    const service = useMatchService()
    const result = await service.validateParticipants('t1', ['a'])
    expect(result).toEqual({
      valid: false,
      errors: ['matchService.errors.validationFailed'],
      warnings: [],
    })
    expect((await service.validateMatchSides('t1', [])).valid).toBe(false)
    expect(service.validationResult.value?.valid).toBe(false)
  })

  it('lets the user proceed only on a valid result with both sides filled', async () => {
    vi.mocked(matchApi.validate).mockResolvedValue(valid)
    const service = useMatchService()
    expect(service.canProceedToNextStep('s', ['a'], ['b'])).toBe(false)
    await service.validateParticipants('t1', ['a', 'b'])
    expect(service.canProceedToNextStep('s', ['a'], ['b'])).toBe(true)
    expect(service.canProceedToNextStep('s', [], ['b'])).toBe(false)
    expect(service.canProceedToNextStep('s', [], [], 'x', 'y')).toBe(true)
  })

  it('checks a match can be created for its status', async () => {
    const service = useMatchService()
    expect(service.canCreateMatch('reported', null, 1, 0)).toBe(false)
    vi.mocked(matchApi.validate).mockResolvedValue(valid)
    await service.validateParticipants('t1', ['a', 'b'])
    expect(service.canCreateMatch('reported', null, 1, 0)).toBe(true)
    expect(service.canCreateMatch('reported', null, -1, 0)).toBe(false)
    expect(service.canCreateMatch('scheduled', null, 0, 0)).toBe(false)
    expect(service.canCreateMatch('scheduled', new Date(), 0, 0)).toBe(true)
    expect(service.canCreateMatch('' as never, null, 0, 0)).toBe(false)
  })
})

describe('create and update with navigation', () => {
  it.each([
    ['championship', 'standings'],
    ['ranked', 'standings'],
    ['bracket', 'matches'],
    [undefined, 'matches'],
  ] as const)('goes to the %s tab after saving', async (mode, tab) => {
    vi.mocked(matchApi.create).mockResolvedValue({ id: 'm1' } as never)
    vi.mocked(matchApi.update).mockResolvedValue({ id: 'm1' } as never)
    const service = useMatchService()

    expect(await service.createMatchWithNavigation({} as never, 't1', mode)).toEqual({ id: 'm1' })
    expect(router.replace).toHaveBeenLastCalledWith({
      name: 'tournament-tab',
      params: { id: 't1', tab },
    })
    expect(await service.updateMatchWithNavigation('m1', {} as never, 't1', mode)).toEqual({
      id: 'm1',
    })
    expect(toasted('success')).toBe(true)
    expect(service.loading.value).toBe(false)
  })

  it('reports a failure without navigating', async () => {
    vi.mocked(matchApi.create).mockRejectedValue(new Error('refused'))
    vi.mocked(matchApi.update).mockRejectedValue('weird')
    const service = useMatchService()

    expect(await service.createMatchWithNavigation({} as never, 't1')).toBeNull()
    expect(service.error.value).toBe('refused')
    expect(await service.updateMatchWithNavigation('m1', {} as never, 't1')).toBeNull()
    expect(service.error.value).toBe('matchService.errors.updateFailed')
    expect(router.replace).not.toHaveBeenCalled()
    expect(toasted('error')).toBe(true)
  })
})

describe('plain API passthroughs', () => {
  it('forwards reads and writes to the API', async () => {
    const service = useMatchService()
    vi.mocked(matchApi.getById).mockResolvedValue({ id: 'm1' } as never)
    vi.mocked(matchApi.list).mockResolvedValue({ data: [] } as never)
    vi.mocked(matchApi.update).mockResolvedValue({ id: 'm1' } as never)
    vi.mocked(matchApi.delete).mockResolvedValue(undefined as never)
    vi.mocked(matchApi.reportResult).mockResolvedValue({ id: 'm1' } as never)
    vi.mocked(matchApi.validate).mockResolvedValue(valid)

    expect(await service.getMatch('m1')).toEqual({ id: 'm1' })
    expect(await service.listMatches({ bracketMode: 'true' })).toEqual({ data: [] })
    expect(await service.updateMatch('m1', {} as never)).toEqual({ id: 'm1' })
    await service.deleteMatch('m1')
    expect(await service.reportMatchResult('m1', {} as never)).toEqual({ id: 'm1' })
    expect(await service.validateMatch({} as never)).toEqual(valid)
    expect(await service.createMatch({} as never).catch(() => 'rejected')).toBeDefined()
    expect(matchApi.delete).toHaveBeenCalledWith('m1')
  })
})

describe.each([
  [
    'confirmMatchResult',
    'confirmResult',
    (s: ReturnType<typeof useMatchService>) => s.confirmMatchResult('m1'),
    'success',
  ],
  [
    'contestMatchResult',
    'contestResult',
    (s: ReturnType<typeof useMatchService>) => s.contestMatchResult('m1', {} as never),
    'warn',
  ],
  ['cancelMatch', 'cancel', (s: ReturnType<typeof useMatchService>) => s.cancelMatch('m1'), 'info'],
  [
    'finalizeMatch',
    'finalize',
    (s: ReturnType<typeof useMatchService>) => s.finalizeMatch('m1', {} as never),
    'success',
  ],
] as const)('%s', (_name, apiMethod, run, severity) => {
  it('confirms with a toast', async () => {
    vi.mocked(matchApi[apiMethod] as never).mockResolvedValue({ id: 'm1' } as never)
    expect(await run(useMatchService())).toEqual({ id: 'm1' })
    expect(toasted(severity)).toBe(true)
  })

  it('reports the failure and rethrows it', async () => {
    vi.mocked(matchApi[apiMethod] as never).mockRejectedValue(new Error('nope') as never)
    await expect(run(useMatchService())).rejects.toThrow('nope')
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'nope' }),
    )
  })

  it('falls back on a translated message for a non-Error failure', async () => {
    vi.mocked(matchApi[apiMethod] as never).mockRejectedValue('weird' as never)
    await expect(run(useMatchService())).rejects.toBe('weird')
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: expect.stringContaining('matchService.errors.'),
      }),
    )
  })
})

describe('respondToMatch', () => {
  it.each([
    [{ type: 'agree' }, undefined, 'agreeSuccess'],
    [{ type: 'agree' }, { withdrawingDispute: true }, 'withdrawDispute'],
    [
      { type: 'agree' },
      { withdrawingDispute: true, postFinalization: true },
      'withdrawPostDispute',
    ],
  ] as const)('confirms an agreement (%j, %j)', async (data, options, key) => {
    vi.mocked(matchApi.respondToMatch).mockResolvedValue({ id: 'm1' } as never)
    await useMatchService().respondToMatch('m1', data as never, options)
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: `matchService.toast.${key}Summary` }),
    )
  })

  it('warns when the answer contests the result, before or after finalization', async () => {
    vi.mocked(matchApi.respondToMatch).mockResolvedValue({ id: 'm1' } as never)
    const service = useMatchService()
    await service.respondToMatch('m1', { type: 'contest' } as never)
    expect(toast.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        severity: 'warn',
        detail: 'matchService.toast.respondContestDetail',
      }),
    )
    await service.respondToMatch('m1', { type: 'contest' } as never, { postFinalization: true })
    expect(toast.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: 'matchService.toast.postContestDetail' }),
    )
  })

  it('reports a failure and rethrows it', async () => {
    vi.mocked(matchApi.respondToMatch).mockRejectedValue(new Error('late'))
    await expect(
      useMatchService().respondToMatch('m1', { type: 'agree' } as never),
    ).rejects.toThrow('late')
    vi.mocked(matchApi.respondToMatch).mockRejectedValue('weird')
    await expect(useMatchService().respondToMatch('m1', { type: 'agree' } as never)).rejects.toBe(
      'weird',
    )
  })
})

describe('subscribeToMatchUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    handlers.clear()
  })

  it('coalesces bursts of updates for the watched match into one callback', () => {
    const onUpdate = vi.fn()
    useMatchService().subscribeToMatchUpdates('m1', onUpdate)
    const emit = handlers.get('match_updated')!
    emit({ matchId: 'other' })
    emit(undefined)
    emit({ matchId: 'm1' })
    emit({ matchId: 'm1' })
    vi.advanceTimersByTime(200)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    emit({ matchId: 'm1' })
    vi.advanceTimersByTime(200)
    expect(onUpdate).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('cancels a pending callback and unsubscribes', () => {
    const onUpdate = vi.fn()
    const unsubscribe = useMatchService().subscribeToMatchUpdates('m1', onUpdate)
    handlers.get('match_updated')!({ matchId: 'm1' })
    unsubscribe()
    vi.advanceTimersByTime(500)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(off).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
