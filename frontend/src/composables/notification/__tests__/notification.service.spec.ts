import { describe, it, expect, vi, beforeEach } from 'vitest'

import { notificationApi, type RawNotification } from '../notification.api'
import { NOTIFICATION_PAGE_SIZE, useNotificationService } from '../notification.service'

function makeNotif(id: string, over: Partial<RawNotification> = {}): RawNotification {
  return {
    id,
    type: 'MATCH_MESSAGE',
    title: `title ${id}`,
    message: `message ${id}`,
    actionUrl: null,
    requiresAction: false,
    isRead: false,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    ...over,
  }
}

function page(
  data: RawNotification[],
  over: Partial<Awaited<ReturnType<typeof notificationApi.list>>> = {},
) {
  return {
    data,
    hasMore: false,
    nextCursor: null,
    unreadCount: data.filter((n) => !n.isRead).length,
    total: data.length,
    ...over,
  }
}

const service = useNotificationService()

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.spyOn(notificationApi, 'list').mockResolvedValue(page([]))
  await service.load()
  vi.restoreAllMocks()
})

describe('notification service pagination', () => {
  it('asks for one page and keeps the cursor the server handed back', async () => {
    const list = vi
      .spyOn(notificationApi, 'list')
      .mockResolvedValue(
        page([makeNotif('n-1')], { hasMore: true, nextCursor: 'cur-1', total: 40 }),
      )

    await service.load()

    expect(list).toHaveBeenCalledWith({ limit: NOTIFICATION_PAGE_SIZE })
    expect(service.hasMore.value).toBe(true)
    expect(service.total.value).toBe(40)
  })

  it('appends the next page from the cursor', async () => {
    vi.spyOn(notificationApi, 'list')
      .mockResolvedValueOnce(page([makeNotif('n-1')], { hasMore: true, nextCursor: 'cur-1' }))
      .mockResolvedValueOnce(page([makeNotif('n-2')], { hasMore: false, nextCursor: null }))

    await service.load()
    await service.loadMore()

    expect(service.notifications.value.map((n) => n.id)).toEqual(['n-1', 'n-2'])
    expect(notificationApi.list).toHaveBeenLastCalledWith({
      limit: NOTIFICATION_PAGE_SIZE,
      cursor: 'cur-1',
    })
    expect(service.hasMore.value).toBe(false)
  })

  it('does not fetch past the last page', async () => {
    const list = vi
      .spyOn(notificationApi, 'list')
      .mockResolvedValue(page([makeNotif('n-1')], { hasMore: false, nextCursor: null }))

    await service.load()
    await service.loadMore()

    expect(list).toHaveBeenCalledTimes(1)
  })

  it('never duplicates a notification a socket push already put on top', async () => {
    vi.spyOn(notificationApi, 'list')
      .mockResolvedValueOnce(page([makeNotif('n-1')], { hasMore: true, nextCursor: 'cur-1' }))
      .mockResolvedValueOnce(page([makeNotif('n-1'), makeNotif('n-2')]))

    await service.load()
    await service.loadMore()

    expect(service.notifications.value.map((n) => n.id)).toEqual(['n-1', 'n-2'])
  })

  it('takes the unread count from the server, not from the loaded page', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1', { isRead: true })], {
        unreadCount: 137,
        total: 500,
        hasMore: true,
        nextCursor: 'c',
      }),
    )

    await service.load()

    expect(service.unreadCount.value).toBe(137)
  })
})

describe('notification service bulk actions', () => {
  it('clears the feed with a single request and reloads what survived', async () => {
    vi.spyOn(notificationApi, 'list')
      .mockResolvedValueOnce(page([makeNotif('n-1'), makeNotif('n-2')]))
      .mockResolvedValueOnce(page([]))
    const deleteAll = vi
      .spyOn(notificationApi, 'deleteAll')
      .mockResolvedValue({ affected: 2, kept: 0 })
    const single = vi.spyOn(notificationApi, 'delete')

    await service.load()
    const result = await service.deleteAll()

    expect(deleteAll).toHaveBeenCalledTimes(1)
    expect(single).not.toHaveBeenCalled()
    expect(result).toEqual({ affected: 2, kept: 0 })
    expect(service.notifications.value).toHaveLength(0)
  })

  it('marks everything read with a single request and zeroes the badge', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1')], { unreadCount: 90, total: 90 }),
    )
    const markAll = vi
      .spyOn(notificationApi, 'markAllRead')
      .mockResolvedValue({ affected: 90, kept: 0 })
    const single = vi.spyOn(notificationApi, 'markRead')

    await service.load()
    await service.markAllAsRead()

    expect(markAll).toHaveBeenCalledTimes(1)
    expect(single).not.toHaveBeenCalled()
    expect(service.unreadCount.value).toBe(0)
  })

  it('puts a notification back where it was when its deletion fails', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1'), makeNotif('n-2'), makeNotif('n-3')]),
    )
    vi.spyOn(notificationApi, 'delete').mockRejectedValue(new Error('nope'))

    await service.load()
    await expect(service.deleteNotification('n-2')).rejects.toThrow('nope')

    expect(service.notifications.value.map((n) => n.id)).toEqual(['n-1', 'n-2', 'n-3'])
    expect(service.unreadCount.value).toBe(3)
  })

  it('refuses to delete a notification whose action is still owed', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1', { requiresAction: true })]),
    )
    const del = vi.spyOn(notificationApi, 'delete')

    await service.load()
    await expect(service.deleteNotification('n-1')).rejects.toThrow()
    expect(del).not.toHaveBeenCalled()
  })
})

describe('notification service socket updates', () => {
  it('puts an incoming notification on top and counts it', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1')], { hasMore: true, nextCursor: 'cur-1', unreadCount: 1, total: 1 }),
    )
    await service.load()

    service.add(makeNotif('n-new'))

    expect(service.notifications.value[0].id).toBe('n-new')
    expect(service.unreadCount.value).toBe(2)
    // The cursor points at the tail, so an arrival on top leaves paging alone
    expect(service.hasMore.value).toBe(true)
  })

  it('drops a notification the server says is gone', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1'), makeNotif('n-2')], { unreadCount: 2, total: 2 }),
    )
    await service.load()

    service.remove('n-1')

    expect(service.notifications.value.map((n) => n.id)).toEqual(['n-2'])
    expect(service.unreadCount.value).toBe(1)
  })
})

describe('notification service server-side reads', () => {
  it('marks loaded notifications read and counts down unloaded ones too', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1'), makeNotif('n-2')], { unreadCount: 5, total: 5 }),
    )
    await service.load()

    service.markReadLocally(['n-1', 'n-unloaded'])

    expect(service.notifications.value.find((n) => n.id === 'n-1')?.isRead).toBe(true)
    expect(service.notifications.value.find((n) => n.id === 'n-2')?.isRead).toBe(false)
    expect(service.unreadCount.value).toBe(3)
  })

  it('does not count twice a notification already read here', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1', { isRead: true }), makeNotif('n-2')], { unreadCount: 1, total: 2 }),
    )
    await service.load()

    service.markReadLocally(['n-1'])

    expect(service.unreadCount.value).toBe(1)
  })

  it('applies what the server marked read when a match is opened', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1', { type: 'MATCH_CREATED' })], { unreadCount: 1, total: 1 }),
    )
    await service.load()
    const markMatchRead = vi
      .spyOn(notificationApi, 'markMatchRead')
      .mockResolvedValue({ ids: ['n-1'] })

    await service.markMatchRead('match-1')

    expect(markMatchRead).toHaveBeenCalledWith('match-1')
    expect(service.notifications.value[0].isRead).toBe(true)
    expect(service.unreadCount.value).toBe(0)
  })

  it('counts an unloaded notification down once, though the HTTP answer and the socket echo both name it', async () => {
    vi.spyOn(notificationApi, 'list').mockResolvedValue(
      page([makeNotif('n-1')], { unreadCount: 5, total: 30 }),
    )
    await service.load()
    vi.spyOn(notificationApi, 'markMatchRead').mockResolvedValue({ ids: ['n-beyond-page'] })

    await service.markMatchRead('match-1')
    service.markReadLocally(['n-beyond-page'])

    expect(service.unreadCount.value).toBe(4)
  })

  it('never throws when the match read fails', async () => {
    vi.spyOn(notificationApi, 'markMatchRead').mockRejectedValue(new Error('offline'))
    await expect(service.markMatchRead('match-1')).resolves.toBeUndefined()
  })
})
