import { describe, it, expect, vi, beforeEach } from 'vitest'
import http from '@/config/ApiConfig'
import { apiBaseURL } from '@/config/api-base'
import { useAvatarService, resetAvatarCache, avatarLookupsSettled } from '../avatar.service'

vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const flush = () => avatarLookupsSettled()

describe('avatar service', () => {
  beforeEach(async () => {
    await avatarLookupsSettled()
    resetAvatarCache()
    vi.mocked(http.post).mockReset()
  })

  it('batches every id asked for in the same tick into one lookup', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { avatars: { [uuid(1)]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } })
    const { versionFor } = useAvatarService()

    versionFor(uuid(1))
    versionFor(uuid(2))
    versionFor(uuid(1))
    await flush()
    await flush()

    expect(http.post).toHaveBeenCalledTimes(1)
    expect(http.post).toHaveBeenCalledWith('/api/users/avatars/lookup', { ids: [uuid(1), uuid(2)] })
    expect(versionFor(uuid(1))).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(versionFor(uuid(2))).toBeNull()
    await flush()
    expect(http.post).toHaveBeenCalledTimes(1)
  })

  it('splits a large batch into chunks the server accepts', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { avatars: {} } })
    const { versionFor } = useAvatarService()

    for (let i = 0; i < 250; i++) versionFor(uuid(i))
    await flush()
    await flush()

    const sizes = vi.mocked(http.post).mock.calls.map((c) => (c[1] as { ids: string[] }).ids.length)
    expect(sizes).toEqual([200, 50])
  })

  it('never sends ids that are not user ids', async () => {
    const { versionFor } = useAvatarService()
    versionFor('team-1')
    await flush()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('asks again later when a lookup fails', async () => {
    vi.mocked(http.post).mockRejectedValueOnce(new Error('down'))
    const { versionFor } = useAvatarService()

    versionFor(uuid(1))
    await flush()
    await flush()
    vi.mocked(http.post).mockResolvedValue({ data: { avatars: {} } })
    versionFor(uuid(1))
    await flush()

    expect(http.post).toHaveBeenCalledTimes(2)
  })

  it('builds absolute, versioned image URLs', () => {
    const { avatarUrl } = useAvatarService()
    expect(avatarUrl(uuid(1), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 128)).toBe(
      `${apiBaseURL}/api/avatars/${uuid(1)}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/128.webp`,
    )
  })

  it('records the new version after an upload and forgets it after a removal', async () => {
    vi.mocked(http.put).mockResolvedValue({ data: { avatarVersion: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } })
    vi.mocked(http.delete).mockResolvedValue({ data: undefined })
    const { upload, remove, versionFor } = useAvatarService()

    await upload(uuid(1), new Blob(['x']))
    expect(versionFor(uuid(1))).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(vi.mocked(http.put).mock.calls[0]![1]).toBeInstanceOf(FormData)

    await remove(uuid(1))
    expect(versionFor(uuid(1))).toBeNull()
    expect(http.post).not.toHaveBeenCalled()
  })
})
