import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MmrAnimationEventResponse } from '@skol-arena/shared'
import { makeMmrEvent } from '@/test-support/factories'
import { useMMrAnimationQueue } from '../useMMrAnimationQueue'
import { mmrAnimationEventApi } from '../mmr-animation-event.api'

// API is pulled in at import time; stub it so the composable has no side effects.
vi.mock('../mmr-animation-event.api', () => ({
  mmrAnimationEventApi: {
    fetchPendingEvents: vi.fn(),
    fetchPendingBadges: vi.fn(),
    markEventsViewed: vi.fn(),
    markBadgesViewed: vi.fn(),
  },
}))

function ev(reason: MmrAnimationEventResponse['reason']): MmrAnimationEventResponse {
  return makeMmrEvent({ reason })
}

describe('useMMrAnimationQueue.showRecap', () => {
  it('false on an empty queue', () => {
    const q = useMMrAnimationQueue()
    expect(q.showRecap.value).toBe(false)
  })

  it('false for a single new match', () => {
    const q = useMMrAnimationQueue()
    q.queue.value = [ev('match_finalized')]
    expect(q.showRecap.value).toBe(false)
  })

  it('true from 2 events onward (any reason)', () => {
    const q = useMMrAnimationQueue()
    q.queue.value = [ev('match_finalized'), ev('match_finalized')]
    expect(q.showRecap.value).toBe(true)
  })

  it.each(['recalculated', 'match_cancelled', 'match_corrected', 'cascade'] as const)(
    "true pour un seul event '%s' (la carte recap honore displayDelta, pas l'anim plein delta)",
    (reason) => {
      const q = useMMrAnimationQueue()
      q.queue.value = [ev(reason)]
      expect(q.showRecap.value).toBe(true)
    },
  )
})

/**
 * The surface tells the rules engine whether the contextual message could have been
 * read. The recap renders none, so its firings are provably unread — which is only
 * measurable if the client says which screen consumed the events.
 */
describe('useMMrAnimationQueue — reading surface', () => {
  const markViewed = vi.mocked(mmrAnimationEventApi.markEventsViewed)

  beforeEach(() => {
    markViewed.mockClear()
  })

  async function loadedQueue(events: MmrAnimationEventResponse[]) {
    const q = useMMrAnimationQueue()
    vi.mocked(mmrAnimationEventApi.fetchPendingEvents).mockResolvedValue({ events })
    vi.mocked(mmrAnimationEventApi.fetchPendingBadges).mockResolvedValue({ badges: [] })
    await q.loadPending('season-1')
    return q
  }

  it("reports 'reveal' when the player sat through the animation", async () => {
    const q = await loadedQueue([ev('match_finalized')])
    const [event] = q.queue.value

    await q.acknowledgeCurrentEvent(false)

    expect(markViewed).toHaveBeenCalledWith('season-1', [event.id], 'reveal')
  })

  it("reports 'reveal_skipped' when they fast-forwarded it", async () => {
    const q = await loadedQueue([ev('match_finalized')])
    const [event] = q.queue.value

    await q.acknowledgeCurrentEvent(true)

    expect(markViewed).toHaveBeenCalledWith('season-1', [event.id], 'reveal_skipped')
  })

  it("reports 'recap' when the grouped card swallowed the whole queue", async () => {
    const q = await loadedQueue([ev('match_finalized'), ev('recalculated')])
    const ids = q.queue.value.map((e) => e.id)

    await q.dismissAll()

    expect(markViewed).toHaveBeenCalledWith('season-1', ids, 'recap')
  })
})
