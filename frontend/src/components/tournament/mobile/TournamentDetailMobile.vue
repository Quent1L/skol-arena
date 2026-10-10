<template>
  <div
    class="flex flex-col h-full bg-gray-50 dark:bg-gray-900"
    style="min-height: calc(100vh - 7rem)"
  >
    <!-- Content Area -->
    <!--
      A column, so the tabs holding a swipeable track can stretch down to the bottom nav:
      the track only reacts to gestures inside its own box, and a short list must not
      leave the rest of the screen dead to a swipe.
    -->
    <div ref="contentAreaRef" class="flex-1 flex flex-col pb-16">
      <!-- Tab: Detail & Navigation cards -->
      <div v-show="activeTab === 'infos'" class="space-y-4 p-4">
        <TournamentHeader
          :name="store.tournament!.name"
          :status="store.tournament!.status"
          :mode="store.tournament!.mode"
          :is-authenticated="store.isAuthenticated"
          :is-participant="store.isParticipant"
          :can-join="store.canJoinTournament"
          :can-leave="store.canLeaveTournament"
          :can-create-match="false"
          :items="store.menuItems"
          :joining="store.joining"
          :leaving="store.leaving"
          @join="store.joinTournament()"
          @leave="store.leaveTournament()"
        />

        <TournamentInfosTab />
      </div>

      <!-- Tab: Participants -->
      <div v-if="isVisited('participants')" v-show="activeTab === 'participants'" class="h-full p-4">
        <TournamentParticipantsTab />
      </div>

      <!--
        Tab: Stats. No `h-full` here: a sticky child only sticks within its parent's box,
        and a height capped to the viewport would drop the switcher after one screen.
      -->
      <div v-if="isVisited('stats')" v-show="activeTab === 'stats'" class="flex-1 flex flex-col">
        <!-- Sub-tabs: ranked + authenticated only. Mounted from the first visit onwards. -->
        <template v-if="hasStatsSubTabs">
          <SubTabTrack
            class="flex-1"
            :options="statsSubTabs"
            :model-value="statsSubTab"
            :enabled="statsDragEnabled"
            :scroll-root="contentAreaRef"
            @update:model-value="setStatsSubTab"
          >
            <template #profile>
              <MobileRankedProfilePane />
            </template>
            <template #global>
              <TournamentStatsTab />
            </template>
          </SubTabTrack>
        </template>

        <!-- Non-ranked / unauthenticated -->
        <div v-else class="p-2">
          <TournamentStatsTab />
        </div>
      </div>

      <!-- Tab: Standings (championship only) -->
      <!-- No padding here: like the ranked leaderboard, the panes carry their own. -->
      <div
        v-if="store.tournament!.mode === 'championship' && isVisited('standings')"
        v-show="activeTab === 'standings'"
        class="flex-1 flex flex-col"
      >
        <StandingsTable
          class="flex-1"
          :tournament-id="store.tournamentId"
          :allow-draw="store.tournament!.allowDraw"
          :score-enabled="store.tournament!.scoreEnabled ?? true"
          :team-mode="store.tournament!.teamMode"
          :show-provisional-toggle="store.tournament!.validationMode !== 'none'"
          :tournament-config="toStandingsConfig(store.tournament!)"
          :current-user-id="store.appUser?.id"
        />
      </div>

      <!-- Tab: Bracket -->
      <div
        v-if="store.tournament!.mode === 'bracket' && isVisited('bracket')"
        v-show="activeTab === 'bracket'"
        class="p-2"
      >
        <BracketView
          :tournament-id="store.tournamentId"
          :tournament="store.tournament!"
          style="--bracket-sticky-top: 0rem"
        />
      </div>

      <!-- Tab: Matches -->
      <div v-if="isVisited('matches')" v-show="activeTab === 'matches'" class="h-full p-2">
        <MatchList
          :tournament-id="store.tournamentId"
          :bracket-mode="store.tournament!.mode === 'bracket'"
          :players="
            store.participants.map((p) => ({ id: p.userId, displayName: p.user.displayName }))
          "
          :current-player-id="store.appUser?.id"
          :allow-draw="store.tournament!.allowDraw"
          :show-disputed-filter="store.canManageTournament"
          :refresh-key="store.matchesRefreshKey"
        />
      </div>

      <!-- Tab: Ranked leaderboard. Padding is left to the leaderboard itself: the
           switchable views need it inside each pane, so that two of them never touch
           while the finger drags between them. -->
      <div
        v-if="store.tournament!.mode === 'ranked' && isVisited('standings')"
        v-show="activeTab === 'standings'"
        class="flex-1 flex flex-col"
      >
        <RankedLeaderboard
          class="flex-1"
          :players="store.rankedLeaderboard"
          :provisional-players="store.rankedProvisionalLeaderboard"
          :season-mmr-players="store.rankedSeasonMmrLeaderboard"
          :tiers="store.rankedTiers"
          :placement-matches="store.rankedPlacementMatches"
          :loading="store.rankedLoading"
          :provisional-loading="store.rankedProvisionalLoading"
          :season-mmr-loading="store.rankedSeasonMmrLoading"
          :is-recalculating="store.isLeaderboardRecalculating"
          :current-user-id="store.appUser?.id"
          :show-mode-toggle="store.tournament!.validationMode !== 'none'"
          :show-season-stats="store.tournament!.status === 'finished'"
          :tournament-id="store.tournamentId"
          @load-provisional="store.loadProvisionalLeaderboard()"
          @load-season-stats="store.loadSeasonMmrLeaderboard()"
        />
      </div>
    </div>

    <!-- Bottom Navigation -->
    <MobileBottomNav
      :active-tab="activeTab"
      :tournament-mode="store.tournament!.mode"
      :team-mode="store.tournament!.teamMode"
      :is-authenticated="store.isAuthenticated"
      :can-create-match="store.canCreateMatch"
      @navigate="handleNavigate"
      @create-match="handleCreateMatch"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import { useSubTabs } from '@/composables/ui/useSubTabs'
import SubTabTrack from '@/components/ui/SubTabTrack.vue'
import TournamentHeader from '@/components/tournament/TournamentHeader.vue'
import { toStandingsConfig } from '@/utils/standings-config'
import TournamentInfosTab from '@/views/tournament/tabs/TournamentInfosTab.vue'
import MobileBottomNav from '@/components/tournament/mobile/MobileBottomNav.vue'

// One tab is on screen at a time, and each of these drags in something substantial —
// the standings table brings PrimeVue's DataTable, the bracket its own renderer. Kept
// out of this chunk, they land while the reader is already looking at their tab.
const MatchList = defineAsyncComponent(() => import('@/components/MatchList.vue'))
const StandingsTable = defineAsyncComponent(() => import('@/components/tournament/StandingsTable.vue'))
const BracketView = defineAsyncComponent(() => import('@/components/bracket/BracketView.vue'))
const RankedLeaderboard = defineAsyncComponent(() => import('@/components/ranked/RankedLeaderboard.vue'))
const TournamentParticipantsTab = defineAsyncComponent(() => import('@/views/tournament/tabs/TournamentParticipantsTab.vue'))
const TournamentStatsTab = defineAsyncComponent(() => import('@/views/tournament/tabs/TournamentStatsTab.vue'))
const MobileRankedProfilePane = defineAsyncComponent(() => import('@/components/tournament/mobile/MobileRankedProfilePane.vue'))

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const store = useTournamentDetailStore()

const contentAreaRef = ref<HTMLElement | null>(null)

const activeTab = computed(() => (route.params.tab as string) || 'infos')

watch(
  () => activeTab.value === 'stats' && store.tournament?.mode === 'ranked',
  async (shouldLoad) => {
    if (shouldLoad) {
      await Promise.all([store.ensurePlayerProfile(), store.ensurePlayerCareer()])
    }
  },
  { immediate: true },
)

/**
 * The profile pane is about the viewer's own run of this season, which only a
 * registered participant has. Offering it to anyone else costs a swipe that lands
 * on an empty pane, so a visitor gets the global stats alone.
 */
const hasStatsSubTabs = computed(
  () => store.tournament?.mode === 'ranked' && store.isAuthenticated && store.isParticipant,
)

const statsSubTabs = computed(() => [
  { value: 'profile' as const, label: t('tournamentDetailMobile.myProfile') },
  { value: 'global' as const, label: t('tournamentDetailMobile.globalStats') },
])

const { active: statsSubTab, setActive: setStatsSubTab } = useSubTabs({
  options: statsSubTabs,
  queryKey: 'statsSub',
})

/**
 * A tab mounts on its first visit and stays mounted afterwards, so coming back is
 * instant while a tab that is never opened costs nothing — neither its chunk nor the
 * requests it would fire.
 */
const visitedTabs = ref(new Set<string>())
watch(activeTab, (tab) => visitedTabs.value.add(tab), { immediate: true })

function isVisited(tab: string): boolean {
  return visitedTabs.value.has(tab)
}

// The track stays mounted under the other tabs, where its gestures mean nothing.
const statsDragEnabled = computed(() => activeTab.value === 'stats')

function navigate(tab: string) {
  router.push({ name: 'tournament-tab', params: { id: store.tournamentId, tab } })
}

async function handleNavigate(tab: string) {
  navigate(tab)
  if (tab === 'stats' && store.tournament?.mode === 'ranked') {
    await Promise.all([store.ensurePlayerProfile(), store.ensurePlayerCareer()])
  }
}

function handleCreateMatch() {
  router.push(`/tournaments/${store.tournamentId}/create-match`)
}
</script>

