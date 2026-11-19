<template>
  <div
    class="py-1.5 border-b border-gray-200 dark:border-gray-700 last:border-0"
    data-test="stat-leader-row"
  >
    <div class="flex justify-between items-center gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span
          v-if="rank"
          class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          :class="podiumClass(rank)"
          >{{ rank }}</span
        >
        <PlayerAvatarStack :players="players" size="xs" class="shrink-0" />
        <!-- A team has no page of its own, so each of its players carries its own link. -->
        <span class="truncate text-sm font-medium">
          <template v-for="(player, i) in players" :key="player.id">
            <span v-if="i > 0" class="text-gray-400 dark:text-gray-600"> / </span>
            <RouterLink
              v-if="linkPlayers && rowsArePlayers"
              :to="playerLink(player.id, tournamentId)"
              class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
              >{{ player.displayName }}</RouterLink
            >
            <span v-else class="text-gray-900 dark:text-white">{{ player.displayName }}</span>
          </template>
        </span>
      </div>
      <span
        class="text-sm font-semibold tabular-nums shrink-0"
        :class="valueClass ?? 'text-gray-900 dark:text-gray-100'"
        >{{ value }}</span
      >
    </div>

    <div class="flex items-center gap-2 mt-1" :class="indentClass">
      <div class="h-1 flex-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div class="h-full rounded-full" :class="barClass" :style="{ width: `${clampedBar}%` }" />
      </div>
      <span class="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
        {{ subLabel }}
      </span>
    </div>

    <div
      v-if="showTie && tiedCount"
      class="flex items-center gap-1 mt-1 text-[10px] text-amber-600 dark:text-amber-400/80"
      :class="indentClass"
      data-test="ex-aequo"
    >
      <i class="fa fa-equals shrink-0" />
      <span>{{ tieLabel }} ({{ tiedCount }})</span>
      <InfoTooltip :text="tieTooltip" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import PlayerAvatarStack from '@/components/PlayerAvatarStack.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import { playerLink, STAT_ROWS_ARE_PLAYERS } from '@/utils/player-link'

const rowsArePlayers = inject(STAT_ROWS_ARE_PLAYERS, ref(true))

export interface StatLeaderPlayer {
  id: string
  displayName: string
  shortName: string
}

const props = withDefaults(
  defineProps<{
    players: StatLeaderPlayer[]
    /** Competition rank; omitted on boards that rank nothing, such as the streaks. */
    rank?: number
    tiedCount?: number
    /** The tie marker belongs to the group, so only its first row shows it. */
    showTie?: boolean
    tieLabel?: string
    tieTooltip?: string
    /** The headline figure, already formatted — "82 %", "5", "37 victoires". */
    value: string
    valueClass?: string
    subLabel: string
    /** Width of the bar, relative to the board leader. */
    barPct: number
    barClass: string
    tournamentId?: string | null
    linkPlayers?: boolean
  }>(),
  { linkPlayers: true, tieLabel: '', tieTooltip: '' },
)

// The second and third lines line up with the name, not with the rank badge.
const indentClass = computed(() => (props.rank ? 'pl-7' : ''))

const clampedBar = computed(() => Math.max(0, Math.min(100, Math.round(props.barPct))))

function podiumClass(rank: number): string {
  if (rank === 1) return 'bg-yellow-400 text-yellow-900'
  if (rank === 2) return 'bg-gray-300 text-gray-700'
  return 'bg-amber-600 text-white'
}
</script>
