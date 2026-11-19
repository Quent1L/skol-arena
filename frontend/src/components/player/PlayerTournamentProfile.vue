<template>
  <div class="space-y-4" data-testid="player-tournament-profile">
    <!-- Fixed teams: every result below is the team's, shared by all its members. -->
    <div v-if="fixedTeam && myTeam" class="flex items-center gap-2 text-sm font-semibold text-white" data-testid="my-team">
      <i class="fa fa-users text-primary" />
      {{ t('playerTournamentProfile.myTeam', { name: myTeam.name }) }}
    </div>

    <template v-if="stats.totalMatches > 0">
      <PlayerStatsKpis :stats="stats" />
      <RecentFormSection v-if="stats.recentForm.length" :results="stats.recentForm" />
      <PlayerProfileSections
        :player-id="playerId"
        :tournament-id="tournamentId"
        :outcome-type-stats="stats.outcomeTypeStats"
        :format-stats="stats.formatStats"
        :most-frequent-partners="stats.mostFrequentPartners"
        :best-partners="stats.bestPartners"
        :nemeses="stats.nemeses"
        :fixed-team="fixedTeam"
      />
    </template>
    <div v-else class="text-center py-12 text-gray-500 dark:text-gray-400">
      <i class="fa fa-gamepad text-4xl mb-4 block"></i>
      <p>{{ t('playerTournamentProfile.noMatches') }}</p>
      <PlayerBadges :player-id="playerId" :tournament-id="tournamentId" class="mt-6 text-left" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlayerDetailStats } from '@skol-arena/shared/types/index'
import { useTeamService } from '@/composables/team/team.service'
import PlayerStatsKpis from './PlayerStatsKpis.vue'
import PlayerProfileSections from './PlayerProfileSections.vue'
import PlayerBadges from './PlayerBadges.vue'
import RecentFormSection from './RecentFormSection.vue'

/** The viewer's own run of a non-ranked competition: no MMR, the record alone. */
const props = defineProps<{
  stats: PlayerDetailStats
  playerId: string
  tournamentId: string
  /** Fixed teams: the record is the team's, and the per-partner sections drop out. */
  fixedTeam?: boolean
}>()

const { t } = useI18n()
const teamSvc = useTeamService()

watch(
  () => (props.fixedTeam ? props.tournamentId : null),
  (id) => id && teamSvc.loadTeams(id),
  { immediate: true },
)

const myTeam = computed(() =>
  teamSvc.teams.value.find((team) => team.members.some((m) => m.userId === props.playerId)),
)
</script>
