<template>
  <MatchList
    :tournament-id="store.tournamentId"
    :bracket-mode="store.tournament!.mode === 'bracket'"
    :players="store.participants.map((p) => ({ id: p.userId, displayName: p.user.displayName }))"
    :current-player-id="store.appUser?.id"
    :allow-draw="store.tournament!.allowDraw"
    :show-disputed-filter="store.canManageTournament"
    :refresh-key="store.matchesRefreshKey"
    scroll-mode="window"
  />
</template>

<script setup lang="ts">
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import MatchList from '@/components/MatchList.vue'

const store = useTournamentDetailStore()
</script>
