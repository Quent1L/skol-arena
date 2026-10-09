import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ClientRuleFiringFeed, ClientRuleFiringFeedItem } from '@skol-arena/shared/types/index'
import { rulesApi } from '../rules.api'
import { useRuleFiringOverview } from '../rule-firing-overview.service'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../rules.api', () => ({
  rulesApi: { getFiringFeed: vi.fn(), getFiringOverview: vi.fn() },
}))

function item(id: string): ClientRuleFiringFeedItem {
  return {
    id,
    playerId: 'p1',
    playerName: 'Alice',
    matchId: null,
    result: 'selected',
    message: null,
    deliveredAt: null,
    seenAt: null,
    seenSurface: null,
    createdAt: new Date(),
    ruleId: 'r1',
    ruleName: 'Rule',
    ruleType: 'message',
  }
}

function page(ids: string[], nextCursor: string | null): ClientRuleFiringFeed {
  return { items: ids.map(item), nextCursor }
}

describe('useRuleFiringOverview — feed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends the next page with the cursor of the previous one', async () => {
    vi.mocked(rulesApi.getFiringFeed)
      .mockResolvedValueOnce(page(['a', 'b'], 'c1'))
      .mockResolvedValueOnce(page(['c'], null))
    const service = useRuleFiringOverview()

    await service.loadFeed({ type: 'message' })
    await service.loadMoreFeed({ type: 'message' })

    expect(service.feed.value.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(service.feedCursor.value).toBeNull()
    expect(vi.mocked(rulesApi.getFiringFeed).mock.calls[1]).toEqual([
      { type: 'message' },
      { cursor: 'c1', limit: 30 },
    ])
  })

  it('does nothing on load more once the last page is reached', async () => {
    vi.mocked(rulesApi.getFiringFeed).mockResolvedValueOnce(page(['a'], null))
    const service = useRuleFiringOverview()

    await service.loadFeed({})
    await service.loadMoreFeed({})

    expect(rulesApi.getFiringFeed).toHaveBeenCalledTimes(1)
  })

  it('drops a page that answers after the filters changed', async () => {
    let resolveStale!: (value: ClientRuleFiringFeed) => void
    vi.mocked(rulesApi.getFiringFeed)
      .mockResolvedValueOnce(page(['a'], 'c1'))
      .mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)))
      .mockResolvedValueOnce(page(['badge'], null))
    const service = useRuleFiringOverview()

    await service.loadFeed({})
    const stale = service.loadMoreFeed({})
    await service.loadFeed({ type: 'badge' })
    resolveStale(page(['stale'], 'c2'))
    await stale

    expect(service.feed.value.map((i) => i.id)).toEqual(['badge'])
    expect(service.feedCursor.value).toBeNull()
    expect(service.feedLoading.value).toBe(false)
  })
})
