import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useParticipantService } from '../participant.service'
import { participantApi } from '../participant.api'
import { useAppToast } from '@/composables/useAppToast'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../participant.api')
vi.mock('@/composables/useAppToast')

const toast = { add: vi.fn() }
const api = vi.mocked(participantApi)
const toasted = (severity: string) => toast.add.mock.calls.some(([t]) => t.severity === severity)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(useAppToast).mockReturnValue(toast as unknown as ReturnType<typeof useAppToast>)
  api.getTournamentParticipants.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }] as never)
})

describe('participants state', () => {
  it('knows who takes part and how many', async () => {
    const service = useParticipantService()
    expect(service.isUserParticipant('u1')).toBe(false)
    expect(service.participantCount.value).toBe(0)

    await service.getTournamentParticipants('t1')

    expect(service.isUserParticipant('u1')).toBe(true)
    expect(service.isUserParticipant('nobody')).toBe(false)
    expect(service.isUserParticipant(null)).toBe(false)
    expect(service.participantCount.value).toBe(2)
  })

  it('returns an empty list and keeps the message when the list cannot be loaded', async () => {
    api.getTournamentParticipants.mockRejectedValue('x')
    const service = useParticipantService()

    expect(await service.getTournamentParticipants('t1')).toEqual([])

    expect(service.error.value).toBe('participantService.errors.listFailed')
    expect(service.loading.value).toBe(false)
  })
})

describe('join and leave with reload', () => {
  it('reloads the list after a successful join', async () => {
    api.joinTournament.mockResolvedValue({ id: 'p' } as never)
    const service = useParticipantService()

    expect(await service.joinTournamentAndReload('t1')).toBe(true)

    expect(api.getTournamentParticipants).toHaveBeenCalledWith('t1')
  })

  it('does not reload after a failed join', async () => {
    api.joinTournament.mockRejectedValue(new Error('full'))
    const service = useParticipantService()

    expect(await service.joinTournamentAndReload('t1')).toBe(false)

    expect(api.getTournamentParticipants).not.toHaveBeenCalled()
  })

  it('reloads after a leave, but not after a failed one', async () => {
    api.leaveTournament.mockResolvedValueOnce({ message: 'ok' })
    const service = useParticipantService()
    expect(await service.leaveTournamentAndReload('t1')).toBe(true)
    expect(api.getTournamentParticipants).toHaveBeenCalledTimes(1)

    api.leaveTournament.mockRejectedValueOnce(new Error('no'))
    expect(await service.leaveTournamentAndReload('t1')).toBe(false)
    expect(api.getTournamentParticipants).toHaveBeenCalledTimes(1)
  })
})

describe('admin adds a participant', () => {
  it('toasts a success and returns the participation', async () => {
    api.adminAddParticipant.mockResolvedValue({ id: 'p' } as never)
    const service = useParticipantService()

    expect(await service.adminAddParticipant('t1', 'u1')).toEqual({ id: 'p' })

    expect(api.adminAddParticipant).toHaveBeenCalledWith('t1', 'u1')
    expect(toasted('success')).toBe(true)
  })

  it('toasts the error and returns null on failure', async () => {
    api.adminAddParticipant.mockRejectedValue(new Error('closed'))
    const service = useParticipantService()

    expect(await service.adminAddParticipant('t1', 'u1')).toBeNull()

    expect(service.error.value).toBe('closed')
    expect(toasted('error')).toBe(true)
    expect(service.loading.value).toBe(false)
  })

  it('falls back to a translated message for a non-Error rejection', async () => {
    api.adminAddParticipant.mockRejectedValue('x')
    const service = useParticipantService()

    await service.adminAddParticipant('t1', 'u1')

    expect(service.error.value).toBe('participantService.errors.addFailed')
  })

  it('reloads the list only after a successful add', async () => {
    api.adminAddParticipant.mockResolvedValueOnce({ id: 'p' } as never)
    const service = useParticipantService()
    expect(await service.adminAddParticipantAndReload('t1', 'u1')).toBe(true)
    expect(api.getTournamentParticipants).toHaveBeenCalledTimes(1)

    api.adminAddParticipant.mockRejectedValueOnce(new Error('no'))
    expect(await service.adminAddParticipantAndReload('t1', 'u1')).toBe(false)
    expect(api.getTournamentParticipants).toHaveBeenCalledTimes(1)
  })
})

describe('admin removes a participant', () => {
  it('toasts a success and reloads', async () => {
    api.adminRemoveParticipant.mockResolvedValue({ success: true })
    const service = useParticipantService()

    expect(await service.adminRemoveParticipantAndReload('t1', 'u1')).toBe(true)

    expect(api.adminRemoveParticipant).toHaveBeenCalledWith('t1', 'u1')
    expect(api.getTournamentParticipants).toHaveBeenCalledWith('t1')
    expect(toasted('success')).toBe(true)
  })

  it('toasts the error and skips the reload on failure', async () => {
    api.adminRemoveParticipant.mockRejectedValueOnce(new Error('locked'))
    const service = useParticipantService()
    expect(await service.adminRemoveParticipantAndReload('t1', 'u1')).toBe(false)
    expect(service.error.value).toBe('locked')
    expect(toasted('error')).toBe(true)
    expect(api.getTournamentParticipants).not.toHaveBeenCalled()

    api.adminRemoveParticipant.mockRejectedValueOnce('x')
    await service.adminRemoveParticipantAndReload('t1', 'u1')
    expect(service.error.value).toBe('participantService.errors.removeFailed')
  })
})

describe('admin adds several participants', () => {
  it('adds them all, toasts the count and reloads once', async () => {
    api.adminAddParticipant.mockResolvedValue({ id: 'p' } as never)
    const service = useParticipantService()

    expect(await service.adminAddParticipantsBatchAndReload('t1', ['u1', 'u2', 'u3'])).toBe(true)

    expect(api.adminAddParticipant).toHaveBeenCalledTimes(3)
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'participantService.toast.batchAddSuccessDetail' }),
    )
    expect(api.getTournamentParticipants).toHaveBeenCalledTimes(1)
  })

  it('fails as a whole when one add fails', async () => {
    api.adminAddParticipant.mockResolvedValueOnce({ id: 'p' } as never)
    api.adminAddParticipant.mockRejectedValueOnce(new Error('dup'))
    const service = useParticipantService()

    expect(await service.adminAddParticipantsBatchAndReload('t1', ['u1', 'u2'])).toBe(false)

    expect(service.error.value).toBe('dup')
    expect(toasted('error')).toBe(true)
    expect(api.getTournamentParticipants).not.toHaveBeenCalled()
    expect(service.loading.value).toBe(false)
  })

  it('uses a translated fallback for a non-Error rejection', async () => {
    api.adminAddParticipant.mockRejectedValue('x')
    const service = useParticipantService()

    await service.adminAddParticipantsBatchAndReload('t1', ['u1'])

    expect(service.error.value).toBe('participantService.errors.batchAddFailed')
  })
})
