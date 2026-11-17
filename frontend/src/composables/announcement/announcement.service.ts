import { computed, ref } from 'vue'
import type { CreateAnnouncementInput } from '@skol-arena/shared'
import {
  announcementApi,
  type ClientAnnouncement,
  type ClientAnnouncementPopup,
} from './announcement.api'

/**
 * Pop-ups waiting to be shown, oldest first. Module-level: the app-wide ones are loaded
 * at sign-in and a tournament's when it is opened, and a single host shows them all.
 */
const popupQueue = ref<ClientAnnouncementPopup[]>([])

export function useAnnouncementPopups() {
  /** Without a tournament: the app-wide pop-ups. Never throws — a pop-up is a nicety. */
  async function loadPending(tournamentId?: string) {
    try {
      const pending = await announcementApi.pending(tournamentId)
      const known = new Set(popupQueue.value.map((a) => a.id))
      popupQueue.value = [...popupQueue.value, ...pending.filter((a) => !known.has(a.id))]
    } catch {
      // Not shown this time; it will be on the next visit.
    }
  }

  /** Dismisses the pop-up on screen. Its copy in the bell is marked read server-side. */
  async function dismissCurrent() {
    const [current, ...rest] = popupQueue.value
    if (!current) return
    popupQueue.value = rest
    try {
      await announcementApi.markSeen(current.id)
    } catch {
      // It shows again next time rather than being lost.
    }
  }

  function clear() {
    popupQueue.value = []
  }

  return {
    current: computed(() => popupQueue.value[0] ?? null),
    remaining: computed(() => Math.max(0, popupQueue.value.length - 1)),
    loadPending,
    dismissCurrent,
    clear,
  }
}

/** The organizer side: list, publish and delete announcements. */
export function useAnnouncementAdmin() {
  const announcements = ref<ClientAnnouncement[]>([])
  const loading = ref(false)
  const saving = ref(false)

  async function load(tournamentId?: string) {
    loading.value = true
    try {
      announcements.value = await announcementApi.list(tournamentId)
    } finally {
      loading.value = false
    }
  }

  async function publish(payload: CreateAnnouncementInput, reloadFor?: string) {
    saving.value = true
    try {
      await announcementApi.create(payload)
      await load(reloadFor)
    } finally {
      saving.value = false
    }
  }

  async function remove(id: string) {
    await announcementApi.delete(id)
    announcements.value = announcements.value.filter((a) => a.id !== id)
  }

  return { announcements, loading, saving, load, publish, remove }
}
