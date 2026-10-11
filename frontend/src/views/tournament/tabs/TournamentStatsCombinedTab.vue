<template>
  <div v-if="hasOwnProfile" class="flex gap-6">
    <SubTabSidebar :options="subTabs" :model-value="sub" @update:model-value="setSub" />

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div v-if="sub === 'profile'">
        <RewindEntryCard
          :season-id="store.tournamentId"
          :season-status="store.tournament?.status"
        />
        <PlayerMmrProfile
          v-if="store.playerMmr"
          :mmr="store.playerMmr"
          :tiers="store.rankedTiers"
          :leaderboard-rank="store.playerLeaderboardRank"
          :placement-matches="store.rankedPlacementMatches"
          :career-peak="store.playerCareerPeak"
          :history="store.profileChartHistory"
          :opponent-quality="store.playerOpponentQuality"
          :recent-form="store.playerStats?.stats?.recentForm"
          :most-frequent-partners="store.playerStats?.stats?.mostFrequentPartners"
          :best-partners="store.playerStats?.stats?.bestPartners"
          :nemeses="store.playerStats?.stats?.nemeses"
          :outcome-type-stats="store.playerStats?.stats?.outcomeTypeStats"
          :format-stats="store.playerStats?.stats?.formatStats"
          :season-id="store.tournamentId"
          :allow-draw="store.tournament?.allowDraw"
        />
        <div v-else-if="store.rankedLoading" class="flex justify-center py-12">
          <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
        </div>
        <div v-else class="text-center py-12 text-gray-500 dark:text-gray-400">
          <i class="fa fa-user-slash text-4xl mb-4 block"></i>
          <p>{{ t('tournamentStatsCombinedTab.noMmr') }}</p>
          <p class="text-sm mt-2">{{ t('tournamentStatsCombinedTab.noMmrHint') }}</p>
        </div>

        <!-- The full history lives on the player's own page: it spans every
             discipline, which a season's profile has no room to say. -->
        <RankedCareerLink
          v-if="store.hasDisciplineCareer && store.appUser"
          :player-id="store.appUser.id"
          :discipline-id="store.currentDisciplineId"
          own
          class="mt-4"
        />
      </div>
      <TournamentStatsTab v-else />
    </div>
  </div>

  <TournamentStatsTab v-else />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import { useSubTabs } from '@/composables/ui/useSubTabs'
import SubTabSidebar from '@/components/ui/SubTabSidebar.vue'
import PlayerMmrProfile from '@/components/ranked/PlayerMmrProfile.vue'
import RankedCareerLink from '@/components/ranked/RankedCareerLink.vue'
import RewindEntryCard from '@/components/rewind/RewindEntryCard.vue'
import TournamentStatsTab from './TournamentStatsTab.vue'

const store = useTournamentDetailStore()
const { t } = useI18n()

// Same values and same query param as the mobile switcher, so a link opened on the
// other form factor lands on the same pane.
const subTabs = computed(() => [
  { value: 'profile' as const, label: t('tournamentStatsCombinedTab.nav.myProfile') },
  { value: 'global' as const, label: t('tournamentStatsCombinedTab.nav.global') },
])

const { active: sub, setActive: setSub } = useSubTabs({ options: subTabs, queryKey: 'statsSub' })

/**
 * The profile pane is about the viewer's own run of this season, which only a
 * registered participant has. A visitor who never joined gets the global stats
 * alone rather than a sub-tab that can only ever say it has nothing to show.
 */
const hasOwnProfile = computed(
  () =>
    store.tournament?.mode === 'ranked' &&
    store.isAuthenticated &&
    !!store.appUser &&
    store.isParticipant,
)

onMounted(async () => {
  if (hasOwnProfile.value) {
    await Promise.all([store.ensurePlayerProfile(), store.ensurePlayerCareer()])
  }
})
</script>
