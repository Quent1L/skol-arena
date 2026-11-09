import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMatchMessageService } from '../match/match-message.service'
import { matchMessageApi } from '../match/match-message.api'
import { useAppToast } from '@/composables/useAppToast'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('../match/match-message.api')
vi.mock('@/composables/useAppToast')

const handlers = new Map<string, (payload: unknown) => void>()
const off = vi.fn()
vi.mock('@/composables/notification/notification.socket', () => ({
  onWsEvent: (event: string, cb: (payload: unknown) => void) => {
    handlers.set(event, cb)
    return off
  },
}))

const toast = { add: vi.fn() }
const message = (id: string, matchId = 'm1') => ({
  id,
  matchId,
  body: `body ${id}`,
  createdAt: new Date('2026-01-01'),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(useAppToast).mockReturnValue(toast as unknown as ReturnType<typeof useAppToast>)
})

describe('load', () => {
  it('fills the thread and clears the loading flag', async () => {
    vi.mocked(matchMessageApi.list).mockResolvedValue([message('a')] as never)
    const service = useMatchMessageService()

    await service.load('m1')

    expect(service.messages.value).toHaveLength(1)
    expect(service.loading.value).toBe(false)
  })

  it('empties the thread when the request fails', async () => {
    vi.mocked(matchMessageApi.list).mockRejectedValue(new Error('down'))
    const service = useMatchMessageService()
    service.messages.value = [message('a')] as never

    await service.load('m1')

    expect(service.messages.value).toEqual([])
    expect(service.loading.value).toBe(false)
  })
})

describe('post', () => {
  it('ignores a blank message', async () => {
    const service = useMatchMessageService()

    await service.post('m1', '   ')

    expect(matchMessageApi.post).not.toHaveBeenCalled()
  })

  it('sends the trimmed body and appends the reply once', async () => {
    vi.mocked(matchMessageApi.post).mockResolvedValue(message('a') as never)
    const service = useMatchMessageService()

    await service.post('m1', '  hi  ')
    await service.post('m1', 'hi')

    expect(matchMessageApi.post).toHaveBeenCalledWith('m1', 'hi')
    expect(service.messages.value).toHaveLength(1)
    expect(service.posting.value).toBe(false)
  })

  it('toasts and rethrows when the post fails', async () => {
    vi.mocked(matchMessageApi.post).mockRejectedValue(new Error('nope'))
    const service = useMatchMessageService()

    await expect(service.post('m1', 'hi')).rejects.toThrow('nope')

    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'nope' }),
    )
    expect(service.posting.value).toBe(false)
  })

  it('falls back to a translated detail for a non-Error rejection', async () => {
    vi.mocked(matchMessageApi.post).mockRejectedValue('x')
    const service = useMatchMessageService()

    await expect(service.post('m1', 'hi')).rejects.toBe('x')

    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'matchMessageThread.errors.postFailed' }),
    )
  })
})

describe('subscribe', () => {
  it('appends live messages of its own match, reviving the date', () => {
    const service = useMatchMessageService()
    const unsubscribe = service.subscribe('m1')
    const push = handlers.get('match_message')!

    push({ ...message('a'), createdAt: '2026-01-02T00:00:00.000Z' })
    push({ ...message('a'), createdAt: '2026-01-02T00:00:00.000Z' })

    expect(service.messages.value).toHaveLength(1)
    expect(service.messages.value[0].createdAt).toBeInstanceOf(Date)
    expect(unsubscribe).toBe(off)
  })

  it('ignores messages of another match or an empty payload', () => {
    const service = useMatchMessageService()
    service.subscribe('m1')
    const push = handlers.get('match_message')!

    push(message('b', 'other'))
    push(null)

    expect(service.messages.value).toEqual([])
  })
})
