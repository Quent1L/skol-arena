import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { rulesApi, type RuleFiringFeedFilters } from './rules.api'
import type {
  ClientRuleFiringFeedItem,
  ClientRuleFiringOverview,
} from '@skol-arena/shared/types/index'

const FEED_PAGE_SIZE = 30

/**
 * State of the global rules-engine stats screen: the aggregated overview and the feed
 * of the latest firings. The feed is walked with the server's keyset cursor, so a
 * "load more" appends exactly the rows after the last one shown.
 */
export function useRuleFiringOverview() {
  const { t } = useI18n()
  const overview = ref<ClientRuleFiringOverview | null>(null)
  const overviewLoading = ref(false)
  const feed = ref<ClientRuleFiringFeedItem[]>([])
  const feedCursor = ref<string | null>(null)
  const feedLoading = ref(false)
  const error = ref<string | null>(null)
  /** Bumped per feed request, so a page answering after a filter change is dropped. */
  let feedRequest = 0
  /** Same for the overview: a slow answer for the previous range must not win. */
  let overviewRequest = 0

  async function loadOverview(days: number) {
    const request = ++overviewRequest
    overviewLoading.value = true
    error.value = null
    try {
      const result = await rulesApi.getFiringOverview(days)
      if (request === overviewRequest) overview.value = result
    } catch (err) {
      if (request !== overviewRequest) return
      error.value = err instanceof Error ? err.message : t('rulesService.errors.statsFailed')
    } finally {
      if (request === overviewRequest) overviewLoading.value = false
    }
  }

  /** Restarts the feed from the newest firing — on mount, refresh or filter change. */
  async function loadFeed(filters: RuleFiringFeedFilters) {
    await fetchFeedPage(filters, undefined)
  }

  async function loadMoreFeed(filters: RuleFiringFeedFilters) {
    if (!feedCursor.value || feedLoading.value) return
    await fetchFeedPage(filters, feedCursor.value)
  }

  async function fetchFeedPage(filters: RuleFiringFeedFilters, cursor: string | undefined) {
    const request = ++feedRequest
    feedLoading.value = true
    error.value = null
    try {
      const page = await rulesApi.getFiringFeed(filters, { cursor, limit: FEED_PAGE_SIZE })
      if (request !== feedRequest) return
      feed.value = cursor ? [...feed.value, ...page.items] : page.items
      feedCursor.value = page.nextCursor
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.feedFailed')
    } finally {
      if (request === feedRequest) feedLoading.value = false
    }
  }

  return {
    overview,
    overviewLoading,
    feed,
    feedCursor,
    feedLoading,
    error,
    loadOverview,
    loadFeed,
    loadMoreFeed,
  }
}
