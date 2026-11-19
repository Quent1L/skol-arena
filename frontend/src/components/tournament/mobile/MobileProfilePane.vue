<template>
  <div>
    <RewindEntryCard v-if="isRanked" :season-id="store.tournamentId" :season-status="store.tournament?.status" />
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
    <!--
      Held to the height of the content area rather than to its own text: the swipe
      between the two panes is picked up on the track, so a short empty state would
      leave most of the screen inert to the finger.
    -->
    <PlayerTournamentProfile
      v-else-if="!isRanked && store.playerStats"
      class="p-2"
      :stats="store.playerStats.stats"
      :player-id="store.appUser!.id"
      :tournament-id="store.tournamentId"
      :fixed-team="store.tournament?.teamMode === 'static'"
    />
    <div
      v-else-if="isRanked && store.playerProfileLoaded"
      class="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400"
    >
      <i class="fa fa-user-slash text-4xl mb-4 block"></i>
      <p>{{ t('tournamentDetailMobile.noMmrYet') }}</p>
      <p class="text-sm mt-2">
        {{ t('tournamentDetailMobile.declareFirstMatch') }}
      </p>
    </div>
    <div v-else class="p-4 space-y-3">
      <USkeleton class="h-[6rem] w-full rounded-xl" />
      <USkeleton class="h-[4rem] w-full rounded-xl" />
      <USkeleton class="h-[10rem] w-full rounded-xl" />
    </div>

    <MyVoteStatsCard v-if="votesEnabled" :tournament-id="store.tournamentId" class="my-4" />

    <!-- The full history lives on the player's own page: it spans every
         discipline, which a season's profile has no room to say. -->
    <RankedCareerLink
      v-if="store.hasDisciplineCareer && store.appUser"
      :player-id="store.appUser.id"
      :discipline-id="store.currentDisciplineId"
      own
      class="my-4"
    />

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import PlayerMmrProfile from '@/components/ranked/PlayerMmrProfile.vue'
import RankedCareerLink from '@/components/ranked/RankedCareerLink.vue'
import RewindEntryCard from '@/components/rewind/RewindEntryCard.vue'
import PlayerTournamentProfile from '@/components/player/PlayerTournamentProfile.vue'
import MyVoteStatsCard from '@/components/votes/MyVoteStatsCard.vue'

const { t } = useI18n()
const store = useTournamentDetailStore()

const isRanked = computed(() => store.tournament?.mode === 'ranked')
const votesEnabled = computed(
  () => !!store.tournament?.voteConfig?.fairPlayEnabled || !!store.tournament?.voteConfig?.mvpEnabled,
)
</script>
