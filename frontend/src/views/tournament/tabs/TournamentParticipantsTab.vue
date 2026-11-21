<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
      {{ t('tournamentParticipantsTab.title') }}
      <UBadge :label="store.participantCount" color="info" size="sm" />
    </div>
    <TournamentParticipantsList
      :participants="store.participants"
      :loading="store.loadingParticipants"
      :tournament-id="store.tournamentId"
      @participant-added="store.reloadParticipants()"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import TournamentParticipantsList from '@/components/tournament/TournamentParticipantsList.vue'

const store = useTournamentDetailStore()
const { t } = useI18n()
</script>
