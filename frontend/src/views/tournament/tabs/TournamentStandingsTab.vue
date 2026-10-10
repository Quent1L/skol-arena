<template>
  <div>
    <StandingsTable
      v-if="store.tournament!.mode === 'championship'"
      :tournament-id="store.tournamentId"
      :allow-draw="store.tournament!.allowDraw"
      :score-enabled="store.tournament!.scoreEnabled ?? true"
      :team-mode="store.tournament!.teamMode"
      :show-provisional-toggle="store.tournament!.validationMode !== 'none'"
      :tournament-config="toStandingsConfig(store.tournament!)"
      :current-user-id="store.appUser?.id"
    />
    <RankedLeaderboard
      v-else-if="store.tournament!.mode === 'ranked'"
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
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import StandingsTable from '@/components/tournament/StandingsTable.vue'
import { toStandingsConfig } from '@/utils/standings-config'
import RankedLeaderboard from '@/components/ranked/RankedLeaderboard.vue'

const store = useTournamentDetailStore()

// Leaderboard WS handling (recalc flag + reload) lives in TournamentDetailView,
// which stays mounted across tab switches, so events aren't missed while this
// tab is unmounted.
onMounted(async () => {
  if (store.tournament?.mode === 'ranked') {
    await store.ensureLeaderboard()
  }
})
</script>
