<template>
  <div>
    <div
      class="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2"
    >
      <i :class="icon" />
      {{ title }}

      <LowSampleBadge v-if="board.isLowSample" />

      <InfoTooltip :text="tooltip" />
    </div>

    <!-- Nobody is ahead of anybody: a podium would invent a hierarchy. -->
    <div v-if="board.isFlat" data-test="honour-roll">
      <p class="text-[11px] text-gray-500 mb-2">
        {{ t('tournamentStatsTab.outcomeTypeFunStats.noRanking') }}
      </p>
      <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {{ honourRollTitle }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="p in board.leaders"
          :key="p.playerId"
          :to="playerLink(p.playerId, tournamentId)"
          class="inline-flex items-center gap-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 pl-1 pr-2.5 py-1 max-w-full"
        >
          <PlayerAvatar
            :name="p.displayName"
            :color-key="p.shortName"
            :player-id="p.playerId"
            size="xs"
            shape="circle"
            class="shrink-0"
          />
          <span class="text-xs text-indigo-600 dark:text-indigo-300 truncate">{{
            p.displayName
          }}</span>
        </RouterLink>
      </div>
      <p v-if="board.omittedCount" class="text-[10px] text-gray-500 mt-2" data-test="more-tied">
        {{ moreTiedLabel }}
      </p>
    </div>

    <div v-else-if="board.leaders.length" :data-test="`${metric}-list`">
      <StatLeaderRow
        v-for="(p, i) in board.leaders"
        :key="p.playerId"
        :players="[{ id: p.playerId, displayName: p.displayName, shortName: p.shortName }]"
        :rank="p.rank"
        :tied-count="p.tiedCount"
        :show-tie="startsTiedGroup(i)"
        :tie-label="t('tournamentStatsTab.outcomeTypeFunStats.exAequo')"
        :tie-tooltip="
          t('tournamentStatsTab.outcomeTypeFunStats.exAequoTooltip', { count: p.tiedCount })
        "
        :value="valueLabel(p)"
        :sub-label="subLabel(p)"
        :bar-pct="barWidth(p)"
        :bar-class="barClass"
        :tournament-id="tournamentId"
      />
      <p v-if="board.omittedCount" class="text-[10px] text-gray-500 pt-1.5" data-test="more-tied">
        {{ moreTiedLabel }}
      </p>
    </div>

    <p v-else class="text-xs text-gray-500 py-1.5">
      {{ t('tournamentStatsTab.outcomeTypeFunStats.noRateData') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MIN_WEIGHTED_RATE_MATCHES,
  type OutcomeTypeLeader,
  type OutcomeTypeLeaderboard,
} from '@skol-arena/shared'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import LowSampleBadge from '@/components/stats/LowSampleBadge.vue'
import StatLeaderRow from '@/components/stats/StatLeaderRow.vue'
import { playerLink } from '@/utils/player-link'

const props = defineProps<{
  board: OutcomeTypeLeaderboard
  /** Raw counts, or the rate weighted by sample size. */
  metric: 'volume' | 'rate'
  side: 'winners' | 'losers'
  tournamentId?: string | null
}>()

const { t } = useI18n()

const isWinners = computed(() => props.side === 'winners')
const isVolume = computed(() => props.metric === 'volume')

// A high loss rate is not "efficiency" — the rate column changes meaning with the side.
const title = computed(() => {
  if (isVolume.value) return t('tournamentStatsTab.outcomeTypeFunStats.volume')
  return t(
    isWinners.value
      ? 'tournamentStatsTab.outcomeTypeFunStats.efficiency'
      : 'tournamentStatsTab.outcomeTypeFunStats.vulnerability',
  )
})

const tooltip = computed(() => {
  if (isVolume.value) return t('tournamentStatsTab.outcomeTypeFunStats.volumeTooltip')
  // The low-sample caveat replaces the usual explanation: on a board that had to drop
  // its own threshold, describing the threshold would be beside the point.
  if (props.board.isLowSample) {
    return t('tournamentStatsTab.lowSampleTooltip', { count: MIN_WEIGHTED_RATE_MATCHES })
  }
  return t(
    isWinners.value
      ? 'tournamentStatsTab.outcomeTypeFunStats.efficiencyTooltip'
      : 'tournamentStatsTab.outcomeTypeFunStats.vulnerabilityTooltip',
    { count: MIN_WEIGHTED_RATE_MATCHES },
  )
})

const icon = computed(() => {
  if (isVolume.value) return isWinners.value ? 'fa fa-trophy text-amber-500' : 'fa fa-skull text-gray-400'
  return isWinners.value ? 'fa fa-bullseye text-emerald-500' : 'fa fa-heart-crack text-red-400'
})

const barClass = computed(() => {
  if (isVolume.value) return isWinners.value ? 'bg-amber-500' : 'bg-gray-500'
  return isWinners.value ? 'bg-emerald-500' : 'bg-red-500'
})

const honourRollTitle = computed(() =>
  t(
    isWinners.value
      ? 'tournamentStatsTab.outcomeTypeFunStats.honourRollWinners'
      : 'tournamentStatsTab.outcomeTypeFunStats.honourRollLosers',
    { count: props.board.leaders.length + props.board.omittedCount },
  ),
)

const moreTiedLabel = computed(() =>
  t('tournamentStatsTab.outcomeTypeFunStats.moreTied', { count: props.board.omittedCount }, props.board.omittedCount),
)

function valueLabel(leader: OutcomeTypeLeader): string {
  if (!isVolume.value) return `${leader.ratePct} %`
  const key = isWinners.value ? 'winCount' : 'lossCount'
  return t(`tournamentStatsTab.outcomeTypeFunStats.${key}`, { count: leader.count }, leader.count)
}

function subLabel(leader: OutcomeTypeLeader): string {
  if (isVolume.value) {
    return t('tournamentStatsTab.outcomeTypeFunStats.shareOfTotal', { pct: leader.sharePct })
  }
  return t(
    'tournamentStatsTab.outcomeTypeFunStats.matchCount',
    { count: leader.matchesPlayed },
    leader.matchesPlayed,
  )
}

/** Volume bars are relative to the column leader, so gaps read at a glance. */
function barWidth(leader: OutcomeTypeLeader): number {
  if (!isVolume.value) return leader.ratePct
  const leaderCount = props.board.leaders[0]?.count ?? 0
  if (leaderCount <= 0) return 0
  return Math.round((leader.count / leaderCount) * 100)
}

/** The tie marker belongs to the group, not to each of its rows. */
function startsTiedGroup(index: number): boolean {
  const leader = props.board.leaders[index]
  if (!leader || leader.tiedCount < 2) return false
  return props.board.leaders[index - 1]?.rank !== leader.rank
}
</script>
