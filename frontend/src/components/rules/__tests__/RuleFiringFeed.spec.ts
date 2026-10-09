import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { ClientRuleFiringFeedItem } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import { useRuleFiringOverview } from '@/composables/rules/rule-firing-overview.service'
import RuleFiringFeed from '../RuleFiringFeed.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('fr') }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))
vi.mock('@/composables/rules/rule-firing-overview.service')

const feed = ref<ClientRuleFiringFeedItem[]>([])
const feedCursor = ref<string | null>(null)
const loadFeed = vi.fn()
const loadMoreFeed = vi.fn()

function item(overrides: Partial<ClientRuleFiringFeedItem>): ClientRuleFiringFeedItem {
  return {
    id: 'f1',
    playerId: 'p1',
    playerName: 'Alice',
    matchId: 'm1',
    result: 'selected',
    message: 'Bien joué Alice',
    deliveredAt: new Date(),
    seenAt: new Date(),
    seenSurface: 'reveal',
    createdAt: new Date(),
    ruleId: 'r1',
    ruleName: 'Encouragement',
    ruleType: 'message',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  feed.value = []
  feedCursor.value = null
  vi.mocked(useRuleFiringOverview).mockReturnValue({
    feed,
    feedCursor,
    feedLoading: ref(false),
    error: ref(null),
    loadFeed,
    loadMoreFeed,
  } as unknown as ReturnType<typeof useRuleFiringOverview>)
})

describe('RuleFiringFeed', () => {
  it('loads the newest firings on mount, unfiltered', async () => {
    mountWithUi(RuleFiringFeed, { props: { rules: [] } })
    await flushPromises()
    expect(loadFeed).toHaveBeenCalledWith({ type: undefined, ruleId: undefined, result: undefined })
  })

  it('shows who got which rule, its message and its fate', async () => {
    feed.value = [item({}), item({ id: 'f2', ruleType: 'badge', result: 'awarded', message: null })]
    const wrapper = mountWithUi(RuleFiringFeed, { props: { rules: [] } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Alice')
    expect(text).toContain('Encouragement')
    expect(text).toContain('Bien joué Alice')
    expect(text).toContain('rulesEngineStats.fate.seen')
    expect(text).toContain('rulesEngineStats.result.awarded')
  })

  it('offers to load more only while a cursor remains', async () => {
    feed.value = [item({})]
    const wrapper = mountWithUi(RuleFiringFeed, { props: { rules: [] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('rulesEngineOverview.loadMore')

    feedCursor.value = 'c1'
    await flushPromises()
    const button = wrapper
      .findAll('button')
      .find((b) => b.text() === 'rulesEngineOverview.loadMore')
    await button!.trigger('click')
    expect(loadMoreFeed).toHaveBeenCalled()
  })
})
