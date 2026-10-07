import { ref, computed } from 'vue'
import { mmrAnimationEventApi } from './mmr-animation-event.api'
import type {
  BadgeAnimationResponse,
  BadgeAnimationWsPayload,
  MmrAnimationEventResponse,
  MmrAnimationWsPayload,
} from '@skol-arena/shared'

export function useMMrAnimationQueue() {
  const queue = ref<MmrAnimationEventResponse[]>([])
  const badgeQueue = ref<BadgeAnimationResponse[]>([])
  const seasonIdRef = ref<string | null>(null)

  const currentEvent = computed(() => queue.value[0] ?? null)
  // Use the grouped recap (which honours displayDelta) whenever there are
  // multiple events, or any recalc/cancellation/correction aftermath — a lone recalculated
  // event must not fall through to the single reveal, which animates the full
  // mmrBefore→mmrAfter instead of the differential.
  const showRecap = computed(
    () =>
      queue.value.length >= 2 ||
      queue.value.some(
        (e) =>
          e.reason === 'recalculated' ||
          e.reason === 'match_cancelled' ||
          e.reason === 'match_corrected' ||
          e.reason === 'cascade',
      ),
  )
  // Badges are revealed only once all MMR animations have been acknowledged.
  const currentBadge = computed(() => (queue.value.length === 0 ? badgeQueue.value[0] ?? null : null))

  async function loadPending(seasonId: string) {
    seasonIdRef.value = seasonId
    try {
      const { events } = await mmrAnimationEventApi.fetchPendingEvents(seasonId)
      queue.value = deduplicateEvents(events)
    } catch {
      // Silent fail — animation is non-critical
    }
    try {
      const { badges } = await mmrAnimationEventApi.fetchPendingBadges(seasonId)
      badgeQueue.value = dedupeBadges(badges)
    } catch {
      // Silent fail
    }
  }

  function enqueueBadge(payload: BadgeAnimationWsPayload) {
    const { tournamentId: _t, ...badge } = payload
    if (badgeQueue.value.some((b) => b.id === badge.id)) return
    badgeQueue.value.push(badge)
  }

  async function acknowledgeCurrentBadge() {
    const badge = badgeQueue.value[0]
    if (!badge || !seasonIdRef.value) return
    // Optimistic update — same pattern as acknowledgeCurrentEvent and dismissAll.
    // Recovery: loadPending() on next mount re-fetches unviewed badges from the server.
    badgeQueue.value.shift()
    try {
      await mmrAnimationEventApi.markBadgesViewed(seasonIdRef.value, [badge.id])
    } catch {
      // Silent fail — animation is non-critical
    }
  }

  function enqueue(payload: MmrAnimationWsPayload) {
    const { tournamentId: _t, ...event } = payload
    const idIdx = queue.value.findIndex((e) => e.id === event.id)
    if (idIdx !== -1) {
      queue.value.splice(idIdx, 1, event)
      return
    }
    const matchIdx = queue.value.findIndex((e) => e.matchId === event.matchId)
    if (matchIdx !== -1 && event.eventType === 'official') {
      queue.value.splice(matchIdx, 1, event)
    } else if (matchIdx === -1) {
      queue.value.push(event)
    }
  }

  // The surface is reported so the rules engine can tell a message that was read
  // from one that was not. Skipping still counts as seen: the reveal leaves the
  // message on screen at the end. The recap does not — it renders none.
  async function acknowledgeCurrentEvent(skipped = false) {
    const event = queue.value[0]
    if (!event || !seasonIdRef.value) return
    queue.value.shift()
    try {
      await mmrAnimationEventApi.markEventsViewed(
        seasonIdRef.value,
        [event.id],
        skipped ? 'reveal_skipped' : 'reveal',
      )
    } catch {
      // Silent fail
    }
  }

  async function dismissAll() {
    if (!seasonIdRef.value || queue.value.length === 0) return
    const ids = queue.value.map((e) => e.id)
    queue.value = []
    try {
      await mmrAnimationEventApi.markEventsViewed(seasonIdRef.value, ids, 'recap')
    } catch {
      // Silent fail
    }
  }

  return {
    queue,
    badgeQueue,
    currentEvent,
    showRecap,
    currentBadge,
    loadPending,
    enqueue,
    enqueueBadge,
    acknowledgeCurrentEvent,
    acknowledgeCurrentBadge,
    dismissAll,
  }
}

function dedupeBadges(badges: BadgeAnimationResponse[]): BadgeAnimationResponse[] {
  const byId = new Map<string, BadgeAnimationResponse>()
  for (const b of badges) byId.set(b.id, b)
  return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

function deduplicateEvents(events: MmrAnimationEventResponse[]): MmrAnimationEventResponse[] {
  const byMatch = new Map<string, MmrAnimationEventResponse>()
  for (const e of events) {
    const existing = byMatch.get(e.matchId)
    if (!existing || e.eventType === 'official') {
      byMatch.set(e.matchId, e)
    }
  }
  return [...byMatch.values()].sort(
    (a, b) => new Date(a.playedAt ?? a.createdAt).getTime() - new Date(b.playedAt ?? b.createdAt).getTime(),
  )
}
