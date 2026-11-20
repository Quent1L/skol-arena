import { ref, computed } from 'vue'
import { notificationApi, type RawNotification } from './notification.api'

export type Notification = RawNotification

/**
 * A notification only blocks while what it asks for is still owed. The server re-reads
 * that from the live state on every load, so an action settled elsewhere — a
 * contestation withdrawn, a match arbitrated or deleted — frees the notification.
 */
export function isBlocking(n: Notification): boolean {
  return n.requiresAction && !n.actionResolved && !n.actionCompleted
}

export const NOTIFICATION_PAGE_SIZE = 20

const notifications = ref<Notification[]>([])
const loadingNotifications = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const nextCursor = ref<string | null>(null)
/**
 * Counted server-side. Deriving it from the loaded array stopped working the moment the
 * feed became paginated: the badge would only ever count the page in hand.
 */
const unreadCount = ref(0)
const total = ref(0)
/**
 * Unloaded notifications already counted down. A match opened here hears of its read
 * twice — the HTTP answer and the socket echo — and nothing else would tell them apart.
 */
const countedReadUnloaded = new Set<string>()

function normalize(raw: RawNotification): Notification {
  return { ...raw }
}

export function useNotificationService() {
  /** First page, replacing whatever was loaded. */
  async function load() {
    if (loadingNotifications.value) return
    loadingNotifications.value = true
    try {
      const page = await notificationApi.list({ limit: NOTIFICATION_PAGE_SIZE })
      notifications.value = page.data.map(normalize)
      hasMore.value = page.hasMore
      nextCursor.value = page.nextCursor
      unreadCount.value = page.unreadCount
      total.value = page.total
    } finally {
      loadingNotifications.value = false
    }
  }

  /** Next page, appended. The cursor points at the tail, so a socket push in the
   * meantime lands on top without disturbing it. */
  async function loadMore() {
    if (!hasMore.value || !nextCursor.value || loadingMore.value || loadingNotifications.value) {
      return
    }
    loadingMore.value = true
    try {
      const page = await notificationApi.list({
        limit: NOTIFICATION_PAGE_SIZE,
        cursor: nextCursor.value,
      })
      const known = new Set(notifications.value.map((n) => n.id))
      notifications.value = [
        ...notifications.value,
        ...page.data.filter((n) => !known.has(n.id)).map(normalize),
      ]
      hasMore.value = page.hasMore
      nextCursor.value = page.nextCursor
      unreadCount.value = page.unreadCount
      total.value = page.total
    } finally {
      loadingMore.value = false
    }
  }

  function add(n: RawNotification) {
    notifications.value.unshift(normalize(n))
    total.value += 1
    if (!n.isRead) unreadCount.value += 1
  }

  async function markRead(id: string) {
    const notif = notifications.value.find((n) => n.id === id)
    if (!notif || notif.isRead) return
    notif.isRead = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    await notificationApi.markRead(id)
  }

  /**
   * The server marked these read on its own — a match seen through its MMR reveal or its
   * page, an announcement pop-up dismissed. Every id it sends flipped from unread, so one
   * that is not loaded still counts; one already read here was counted down already.
   */
  function markReadLocally(ids: string[]) {
    for (const id of ids) {
      const notif = notifications.value.find((n) => n.id === id)
      if (notif?.isRead || (!notif && countedReadUnloaded.has(id))) continue
      if (notif) notif.isRead = true
      else countedReadUnloaded.add(id)
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }

  /** Opening a match settles its "added to a match" notification. Never blocks the page. */
  async function markMatchRead(matchId: string) {
    try {
      const { ids } = await notificationApi.markMatchRead(matchId)
      markReadLocally(ids)
    } catch {
      // Best effort: the notification simply stays unread.
    }
  }

  async function markActionCompleted(id: string) {
    const notif = notifications.value.find((n) => n.id === id)
    if (!notif || notif.actionCompleted) return
    notif.actionCompleted = true
    if (!notif.isRead) unreadCount.value = Math.max(0, unreadCount.value - 1)
    notif.isRead = true
    await notificationApi.markActionCompleted(id)
  }

  function open(notif: Notification, router?: { push: (url: string) => void }) {
    if (notif.actionUrl && router) {
      router.push(notif.actionUrl)
    }
    if (!isBlocking(notif)) {
      void markRead(notif.id)
    }
  }

  async function deleteNotification(id: string) {
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index === -1) return
    const notif = notifications.value[index]
    if (isBlocking(notif)) {
      throw new Error('Cannot delete blocking notification')
    }
    // Optimistic update
    notifications.value = notifications.value.filter((n) => n.id !== id)
    total.value = Math.max(0, total.value - 1)
    if (!notif.isRead) unreadCount.value = Math.max(0, unreadCount.value - 1)
    try {
      await notificationApi.delete(id)
    } catch (error) {
      // Rollback at the position it held, so the feed keeps its order
      notifications.value = [
        ...notifications.value.slice(0, index),
        notif,
        ...notifications.value.slice(index),
      ]
      total.value += 1
      if (!notif.isRead) unreadCount.value += 1
      throw error
    }
  }

  /** One request for the whole feed, loaded or not. */
  async function markAllAsRead() {
    const previouslyUnread = notifications.value.filter((n) => !n.isRead)
    const previousCount = unreadCount.value
    previouslyUnread.forEach((n) => {
      n.isRead = true
    })
    unreadCount.value = 0
    try {
      await notificationApi.markAllRead()
    } catch (error) {
      previouslyUnread.forEach((n) => {
        n.isRead = false
      })
      unreadCount.value = previousCount
      throw error
    }
  }

  /**
   * One request as well. The server decides what survives — a notification still asking
   * for something owed — and says how many it kept.
   */
  async function deleteAll() {
    const backup = [...notifications.value]
    const previousCount = unreadCount.value
    const previousTotal = total.value

    notifications.value = notifications.value.filter((n) => isBlocking(n))
    unreadCount.value = notifications.value.filter((n) => !n.isRead).length
    total.value = notifications.value.length

    try {
      const result = await notificationApi.deleteAll()
      // The list is a page; the truth about what is left comes from the reload.
      await load()
      return result
    } catch (error) {
      notifications.value = backup
      unreadCount.value = previousCount
      total.value = previousTotal
      throw error
    }
  }

  function remove(id: string) {
    const notif = notifications.value.find((n) => n.id === id)
    if (!notif) return
    notifications.value = notifications.value.filter((n) => n.id !== id)
    total.value = Math.max(0, total.value - 1)
    if (!notif.isRead) unreadCount.value = Math.max(0, unreadCount.value - 1)
  }

  // Unloaded pages count too: a first page made only of blocking notifications does not
  // mean the feed has nothing to clear.
  const hasDeletable = computed(
    () =>
      notifications.value.some((n) => !isBlocking(n)) || total.value > notifications.value.length,
  )

  return {
    notifications,
    unreadCount,
    total,
    hasMore,
    hasDeletable,
    loading: loadingNotifications,
    loadingMore,
    load,
    loadMore,
    add,
    remove,
    markRead,
    markReadLocally,
    markMatchRead,
    markActionCompleted,
    open,
    deleteNotification,
    markAllAsRead,
    deleteAll,
  }
}
