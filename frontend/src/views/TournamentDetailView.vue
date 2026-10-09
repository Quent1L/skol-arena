<template>
  <div>
    <!-- Initial loading -->
    <TournamentDetailSkeleton
      v-if="store.isInitialLoading"
      :variant="isMobile ? 'mobile' : 'desktop'"
      :tab="activeTabName"
    />

    <UAlert
      v-else-if="store.error"
      color="error"
      variant="subtle"
      class="mb-6 mx-4 mt-4 w-auto"
      :title="store.error"
    />

    <div v-else-if="store.tournament">
      <!-- Mobile version -->
      <div v-if="isMobile" class="h-full">
        <!-- Sub-tabs (participants, teams, stats): accessible via cards, not in the bottom nav -->
        <div v-if="isMobileSubTab" class="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
          <div
            class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-14 flex items-center px-4 shadow-sm"
          >
            <UButton
              icon="i-fa7-solid:arrow-left"
              color="neutral"
              variant="ghost"
              size="lg"
              class="mr-2 rounded-full"
              :aria-label="t('common.back')"
              @click="router.back()"
            />
            <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {{ t('tournamentDetailView.tabs.' + (activeTabName ?? '')) }}
            </h1>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <RouterView />
          </div>
        </div>
        <TournamentDetailMobile v-else />
      </div>

      <!-- Desktop version -->
      <div v-else class="bg-gray-50 dark:bg-gray-900">
        <!-- Hero header -->
        <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div class="max-w-5xl mx-auto px-6 pt-5" :class="isScrolled ? 'pb-3' : 'pb-5'">
            <div class="flex items-start gap-3">
              <UTooltip :text="t('tournamentDetailView.backToHome')" :content="{ side: 'bottom' }">
                <UButton
                  icon="i-fa7-solid:arrow-left"
                  variant="ghost"
                  size="lg"
                  class="shrink-0 mt-0.5 rounded-full"
                  :aria-label="t('tournamentDetailView.backToHome')"
                  to="/"
                />
              </UTooltip>
              <div class="flex-1 min-w-0">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white leading-tight truncate">
                  {{ store.tournament.name }}
                </h1>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span
                    v-if="store.tournament.status === 'ongoing'"
                    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold"
                  >
                    <span class="relative flex h-2 w-2">
                      <span
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"
                      ></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    {{ t('tournamentDetailView.status.ongoing') }}
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    :class="statusClasses[store.tournament.status]"
                  >
                    {{ t('tournamentDetailView.status.' + store.tournament.status) }}
                  </span>
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-semibold"
                  >
                    {{ t('tournamentDetailView.mode.' + store.tournament.mode) }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <UButton
                  v-if="store.isAuthenticated && !store.isParticipant && store.canJoinTournament"
                  :label="t('tournamentDetailView.joinBtn')"
                  icon="i-fa7-solid:user-plus"
                  size="lg"
                  :loading="store.joining"
                  @click="store.joinTournament()"
                />
                <div
                  v-if="store.isAuthenticated && store.isParticipant && !store.canLeaveTournament"
                  class="flex items-center gap-2 text-green-600 text-sm font-medium"
                >
                  <i class="fa fa-check-circle"></i>
                  <span>{{ t('tournamentDetailView.registered') }}</span>
                </div>
                <UButton
                  v-if="store.canCreateMatch"
                  :label="t('tournamentDetailView.createMatchBtn')"
                  icon="i-fa7-solid:plus"
                  size="lg"
                  :to="`/tournaments/${store.tournamentId}/create-match`"
                />
                <OverflowMenuButton :items="store.menuItems" />
              </div>
            </div>
          </div>
        </div>

        <div
          class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm"
        >
          <div class="max-w-5xl mx-auto px-6">
            <div ref="tabBarRef" class="flex relative">
              <button
                v-for="tab in visibleTabs"
                :key="tab.value"
                :ref="(el) => setTabRef(tab.value, el)"
                @click="navigateToTab(tab.value)"
                class="px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
                :class="
                  activeTabName === tab.value
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                "
              >
                {{ tab.label }}
              </button>
              <div
                class="absolute bottom-0 h-0.5 bg-primary-600 dark:bg-primary-400 transition-all duration-300 ease-out"
                :style="indicatorStyle"
              />
            </div>
          </div>
        </div>

        <!-- Tab content -->
        <!-- min-h keeps the page from collapsing while a tab chunk (or its data) loads,
             which would otherwise flip the window scrollbar on and off mid-switch. -->
        <div
          :class="
            activeTabName === 'bracket'
              ? 'max-w-[100rem] mx-auto px-6 py-6 min-h-[70vh]'
              : 'max-w-6xl mx-auto px-6 py-6 min-h-[70vh]'
          "
        >
          <RouterView />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else class="tournament-detail-view">
      <UCard variant="soft" class="text-center py-12">
          <div class="space-y-4">
            <i class="fa fa-triangle-exclamation text-4xl text-orange-400"></i>
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300">
              {{ t('tournamentDetailView.notFound.title') }}
            </h3>
            <p class="text-gray-500 dark:text-gray-400">
              {{ t('tournamentDetailView.notFound.description') }}
            </p>
            <div>
              <UButton :label="t('tournamentDetailView.notFound.backBtn')" to="/" />
            </div>
          </div>
      </UCard>
    </div>

    <!-- MMR Animation System -->
    <MmrRecapCard
      v-if="store.tournament?.mode === 'ranked' && animationQueue.showRecap.value"
      :events="animationQueue.queue.value"
      :tiers="store.rankedTiers"
      @close="animationQueue.dismissAll()"
    />
    <MmrRevealAnimation
      v-else-if="store.tournament?.mode === 'ranked' && animationQueue.currentEvent.value"
      :event="animationQueue.currentEvent.value"
      :tiers="store.rankedTiers"
      @close="animationQueue.acknowledgeCurrentEvent()"
    />
    <BadgeRevealAnimation
      v-else-if="store.tournament?.mode === 'ranked' && animationQueue.currentBadge.value"
      :badge="animationQueue.currentBadge.value"
      @close="animationQueue.acknowledgeCurrentBadge()"
    />

    <RewindLauncher v-model:open="showRewind" :season-id="tournamentId" />

    <!-- Mounted outside the mobile/desktop split: a background refresh is the same
         event on both, and the reader keeps the data they already had. -->
    <BackgroundRefreshIndicator :active="store.isRefreshing" :done="store.justRefreshed" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { useWindowScroll } from '@vueuse/core'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import { useViewport } from '@/composables/useViewport'
// Loaded on demand: the mobile shell is dead weight on desktop, the reveal
// animations only exist for ranked seasons, and the rewind opens on a click.
const TournamentDetailMobile = defineAsyncComponent(
  () => import('@/components/tournament/mobile/TournamentDetailMobile.vue'),
)
import TournamentDetailSkeleton from '@/components/tournament/TournamentDetailSkeleton.vue'
import BackgroundRefreshIndicator from '@/components/ui/BackgroundRefreshIndicator.vue'
import type { MmrAnimationWsPayload, BadgeAnimationWsPayload, MmrRecapReadyPayload } from '@skol-arena/shared'
import OverflowMenuButton from '@/components/OverflowMenuButton.vue'
import { onWsEvent, onWsOpen, sendWsMessage, useNotificationSocket } from '@/composables/notification/notification.socket'
import { useMMrAnimationQueue } from '@/composables/ranked/useMMrAnimationQueue'
const MmrRevealAnimation = defineAsyncComponent(() => import('@/components/ranked/MmrRevealAnimation.vue'))
const MmrRecapCard = defineAsyncComponent(() => import('@/components/ranked/MmrRecapCard.vue'))
const BadgeRevealAnimation = defineAsyncComponent(() => import('@/components/ranked/BadgeRevealAnimation.vue'))
const RewindLauncher = defineAsyncComponent(() => import('@/components/rewind/RewindLauncher.vue'))
import { useRewindService } from '@/composables/ranked/rewind.service'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useAppToast()
const { isMobile } = useViewport()
const { y: scrollY } = useWindowScroll()
const store = useTournamentDetailStore()

const tabBarRef = ref<HTMLElement | null>(null)
const tabEls = ref<Record<string, HTMLElement | null>>({})
const indicatorStyle = ref({ left: '0px', width: '0px' })
// animationQueue is a plain object (not reactive), so computed refs need .value in template
const animationQueue = useMMrAnimationQueue()
const notificationSocket = useNotificationSocket()

const { promoted: promotedRewind, loadPromoted } = useRewindService()
const showRewind = ref(false)

const tournamentId = computed(() => route.params.id as string)

/**
 * Plays the rewind straight away the first time a player lands on their finished
 * season, while it is still being promoted. `openedAt` is what makes this happen
 * exactly once: quitting halfway leaves the deck reachable from the banner and
 * the stats tab, but never ambushes the player again.
 */
async function maybeAutoOpenRewind() {
  if (store.tournament?.mode !== 'ranked' || store.tournament.status !== 'finished') return
  if (!store.isAuthenticated) return

  await loadPromoted()
  const promotion = promotedRewind.value
  if (promotion?.seasonId === tournamentId.value && !promotion.openedAt) {
    showRewind.value = true
  }
}
const activeTabName = computed(() => route.params.tab as string | undefined)
const isScrolled = computed(() => scrollY.value > 80)

const statusClasses: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  open: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  ongoing: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  finished: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
}

const MOBILE_SUB_TABS = ['teams', 'badges']
const isMobileSubTab = computed(() => MOBILE_SUB_TABS.includes(activeTabName.value ?? ''))

const visibleTabs = computed(() => {
  const mode = store.tournament?.mode
  const teamMode = store.tournament?.teamMode
  const tabs: { value: string; label: string; badge?: number }[] = [
    { value: 'infos', label: t('tournamentDetailView.tabs.infos') },
  ]
  if (teamMode === 'static') tabs.push({ value: 'teams', label: t('tournamentDetailView.tabs.teams') })
  if (mode === 'championship') tabs.push({ value: 'standings', label: t('tournamentDetailView.tabs.standings') })
  if (mode === 'bracket') tabs.push({ value: 'bracket', label: t('tournamentDetailView.tabs.bracket') })
  if (mode === 'ranked') tabs.push({ value: 'standings', label: t('tournamentDetailView.tabs.standings') })
  tabs.push({ value: 'matches', label: t('tournamentDetailView.tabs.matches') })
  tabs.push({ value: 'stats', label: t('tournamentDetailView.tabs.stats') })
  return tabs
})

function setTabRef(value: string, el: unknown) {
  tabEls.value[value] = el as HTMLElement | null
}

async function updateIndicator() {
  await nextTick()
  const el = tabEls.value[activeTabName.value ?? '']
  if (el) {
    indicatorStyle.value = { left: `${el.offsetLeft}px`, width: `${el.offsetWidth}px` }
  }
}

function navigateToTab(tab: string) {
  router.push({ name: 'tournament-tab', params: { id: tournamentId.value, tab } })
}

watch(activeTabName, updateIndicator)
watch(visibleTabs, updateIndicator)

const offWsHandlers: (() => void)[] = []

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && notificationSocket.hadUnexpectedDisconnect.value) {
    notificationSocket.hadUnexpectedDisconnect.value = false
    store.refreshSilently()
    if (store.tournament?.mode === 'ranked') {
      animationQueue.loadPending(tournamentId.value)
    }
  }
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  try {
    await store.initialize(tournamentId.value)
  } catch (err) {
    if (err instanceof Error && err.cause === 'ORGANIZATION_ACCESS_DENIED') {
      toast.add({
        severity: 'error',
        summary: t('tournamentDetailView.accessDenied.summary'),
        detail: t('tournamentDetailView.accessDenied.detail'),
        life: 4000,
      })
      router.replace('/')
      return
    }
    throw err
  }

  // Handle legacy ?tab= redirect
  const legacyTab = route.query.tab as string | undefined
  if (legacyTab) {
    router.replace({
      name: 'tournament-tab',
      params: { id: tournamentId.value, tab: legacyTab },
      query: {},
    })
    return
  }

  // Set default tab based on mode if no child route yet
  if (!route.params.tab) {
    const mode = store.tournament?.mode
    const defaultTab = mode === 'bracket' ? 'bracket' : 'standings'
    router.replace({ name: 'tournament-tab', params: { id: tournamentId.value, tab: defaultTab } })
  }

  await updateIndicator()
  await maybeAutoOpenRewind()

  offWsHandlers.push(
    onWsOpen(() => sendWsMessage({ event: 'subscribe_tournament', tournamentId: tournamentId.value })),
  )
  sendWsMessage({ event: 'subscribe_tournament', tournamentId: tournamentId.value })

  if (store.tournament?.mode === 'ranked') {
    // Leaderboard/stats freshness is not personal data — unauthenticated viewers need
    // these refreshes too, so they sit outside the isAuthenticated block below.
    offWsHandlers.push(
      onWsEvent('leaderboard_recalculating', (data) => {
        if ((data as { seasonId: string }).seasonId !== tournamentId.value) return
        store.isLeaderboardRecalculating = true
      }),
      onWsEvent('leaderboard_updated', (data) => {
        if ((data as { seasonId: string }).seasonId !== tournamentId.value) return
        store.isLeaderboardRecalculating = false
        store.refreshAfterLeaderboardUpdate()
      }),
    )
  }

  if (store.tournament?.mode === 'ranked' && store.isAuthenticated) {
    await animationQueue.loadPending(tournamentId.value)
    // Pending animations mean a finalization just happened (possibly while this
    // view was unmounted during match entry, so the transient leaderboard_updated
    // WS event was missed). Force a reload so the leaderboard isn't stale.
    if (animationQueue.queue.value.length > 0) store.reloadLeaderboard()
    offWsHandlers.push(
      onWsEvent('mmr_animation', (data) => {
        const payload = data as MmrAnimationWsPayload
        if (payload.tournamentId !== tournamentId.value) return
        animationQueue.enqueue(payload)
      }),
      onWsEvent('badge_animation', (data) => {
        const payload = data as BadgeAnimationWsPayload
        if (payload.tournamentId !== tournamentId.value) return
        animationQueue.enqueueBadge(payload)
      }),
      // Bulk recalc/cancellation: refetch all pending events at once so they
      // surface as one grouped recap instead of trickling in individually.
      onWsEvent('mmr_recap_ready', (data) => {
        const payload = data as MmrRecapReadyPayload
        if (payload.tournamentId !== tournamentId.value) return
        animationQueue.loadPending(tournamentId.value)
      }),
    )
  }
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  sendWsMessage({ event: 'unsubscribe_tournament', tournamentId: tournamentId.value })
  store.$dispose()
  offWsHandlers.forEach((off) => off())
})
</script>

<style scoped>
.tournament-detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}
</style>
