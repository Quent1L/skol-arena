<template>
  <EmptyState
    icon="fa fa-hourglass-start"
    :title="t('tournamentNotStarted.title', { date: formatDay(store.tournament!.startDate) })"
    :message="
      t('tournamentNotStarted.message', {
        start: formatDay(store.tournament!.startDate),
        end: formatDay(store.tournament!.endDate),
      })
    "
    :action-label="canJoin ? t('tournamentHeader.participate') : undefined"
    action-icon="fa fa-user-plus"
    data-testid="tournament-not-started"
    @action="store.joinTournament()"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import EmptyState from '@/components/ui/EmptyState.vue'

const store = useTournamentDetailStore()
const { t, locale } = useI18n()

const canJoin = computed(
  () => store.isAuthenticated && !store.isParticipant && store.canJoinTournament && !store.joining,
)

function formatDay(date: Date | string): string {
  const day = date instanceof Date ? date : new Date(date)
  return day.toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>
