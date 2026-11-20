<template>
  <!-- Outcome type distribution -->
  <div v-if="outcomeTypeStats?.length" class="rounded-xl p-4 bg-gray-800">
    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
      {{ t('playerMmrProfile.outcomeDistribution') }}
    </div>
    <MatchOutcomeDistribution
      :items="
        outcomeTypeStats.map((s) => ({
          label: s.outcomeTypeName,
          count: s.matchesPlayed,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
        }))
      "
    />
  </div>

  <!-- Win rate by format: compact rows, like the head-to-head split of the comparison -->
  <div
    v-if="!fixedTeam && formatStats?.length"
    class="rounded-xl p-4 bg-gray-800"
    data-test="format-stats"
  >
    <div
      class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"
    >
      {{ t('playerMmrProfile.winrateByFormat') }}
      <InfoTooltip :text="t('playerMmrProfile.formatTooltip')" />
    </div>
    <div class="space-y-1">
      <div
        v-for="format in formatStats"
        :key="`${format.teamSize}v${format.opponentSize}`"
        class="grid grid-cols-[4rem_1fr_3rem_3rem] items-center text-xs px-3 py-1.5 rounded-lg bg-gray-700/50"
        data-test="format-row"
      >
        <span class="text-gray-400">
          <i class="fa mr-1" :class="format.teamSize === 1 ? 'fa-user' : 'fa-users'" />
          {{ format.teamSize }}v{{ format.opponentSize }}
        </span>
        <span class="tabular-nums font-bold text-center">
          <span class="text-green-400">{{ format.wins }}</span>
          <span class="text-gray-600 mx-1">-</span>
          <template v-if="format.draws > 0">
            <span class="text-gray-400">{{ format.draws }}</span>
            <span class="text-gray-600 mx-1">-</span>
          </template>
          <span class="text-red-400">{{ format.losses }}</span>
        </span>
        <span class="tabular-nums font-black text-white text-right">{{ format.winRate }}%</span>
        <span class="tabular-nums text-gray-500 text-right">{{ format.matchesPlayed }} m</span>
      </div>
    </div>
  </div>

  <!-- Partner / nemesis stats: with fixed teams, the partners are always the teammates
       and every member of a rival team has the same record against them. -->
  <PlayerRelationStats
    v-if="!fixedTeam"
    :most-frequent-partners="mostFrequentPartners"
    :best-partners="bestPartners"
    :nemeses="nemeses"
    :tournament-id="tournamentId"
  />

  <!-- Earned badges -->
  <PlayerBadges :player-id="playerId" :tournament-id="tournamentId" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type {
  PlayerFormatStat,
  PlayerOutcomeTypeStat,
  PlayerRelationStat,
} from '@skol-arena/shared/types/index'
import InfoTooltip from '@/components/InfoTooltip.vue'
import PlayerRelationStats from '@/components/player/PlayerRelationStats.vue'
import PlayerBadges from '@/components/player/PlayerBadges.vue'
import MatchOutcomeDistribution from '@/components/stats/MatchOutcomeDistribution.vue'

/** The profile sections that hold in any mode: none of them reads the MMR. */
defineProps<{
  playerId: string
  tournamentId?: string
  outcomeTypeStats?: PlayerOutcomeTypeStat[]
  /** Record split by match format (1v1, 2v2, 2v1…), even formats first. */
  formatStats?: PlayerFormatStat[]
  mostFrequentPartners?: PlayerRelationStat[]
  bestPartners?: PlayerRelationStat[]
  nemeses?: PlayerRelationStat[]
  /** Fixed teams: drops the sections where every teammate would read the same thing. */
  fixedTeam?: boolean
}>()

const { t } = useI18n()
</script>
