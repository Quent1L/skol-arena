<template>
  <div>
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
      :season-id="store.tournamentId"
      :allow-draw="store.tournament?.allowDraw"
    />
    <div v-else-if="store.rankedLoading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
    </div>
    <div v-else class="text-center py-12 text-gray-500 dark:text-gray-400">
      <i class="fa fa-user-slash text-4xl mb-4 block"></i>
      <p>{{ t('tournamentProfileTab.noMmr') }}</p>
      <p class="text-sm mt-2">{{ t('tournamentProfileTab.noMmrHint') }}</p>
    </div>

    <!-- The full history lives on the player's own page: it spans every
         discipline, which a season's profile has no room to say. -->
    <RankedCareerLink
      v-if="store.playerCareer?.length && store.appUser"
      :player-id="store.appUser.id"
      :discipline-id="store.currentDisciplineId"
      own
      class="mt-4"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import PlayerMmrProfile from '@/components/ranked/PlayerMmrProfile.vue'
import RankedCareerLink from '@/components/ranked/RankedCareerLink.vue'

const store = useTournamentDetailStore()
const { t } = useI18n()

onMounted(async () => {
  await Promise.all([store.ensurePlayerProfile(), store.ensurePlayerCareer()])
})
</script>
