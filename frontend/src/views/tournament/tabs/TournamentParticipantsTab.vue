<template>
  <div class="space-y-6">
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <div class="flex items-center gap-2 mb-4 text-base font-semibold text-gray-900 dark:text-white">
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
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import TournamentParticipantsList from '@/components/tournament/TournamentParticipantsList.vue'

const store = useTournamentDetailStore()
const { t } = useI18n()
</script>
