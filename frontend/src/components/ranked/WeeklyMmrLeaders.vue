<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
    <div v-for="column in columns" :key="column.key">
      <div
        class="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2"
      >
        <i :class="column.icon" />
        {{ column.title }}
      </div>
      <div v-if="column.entries.length" :data-test="`${column.key}-list`">
        <div
          v-for="(entry, i) in column.entries"
          :key="entry.playerId"
          class="py-1.5 border-b border-gray-200 dark:border-gray-700 last:border-0"
        >
          <div class="flex justify-between items-center gap-2">
            <RouterLink
              :to="playerLink(entry.playerId, tournamentId)"
              class="flex items-center gap-2 min-w-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
            >
              <span
                class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                :class="podiumClass(i)"
                >{{ i + 1 }}</span
              >
              <PlayerAvatar
                :name="entry.displayName"
                :color-key="entry.shortName"
                :player-id="entry.playerId"
                size="xs"
                shape="square"
                class="shrink-0"
              />
              <span class="truncate">{{ entry.displayName }}</span>
            </RouterLink>
            <span class="text-sm font-black tabular-nums shrink-0" :class="column.deltaClass">
              {{ formatDelta(entry.mmrGained) }}
            </span>
          </div>
          <div class="flex items-center gap-2 mt-1 pl-7">
            <div class="h-1 flex-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="column.barClass"
                :style="{ width: `${relativeWidth(entry.mmrGained, column.entries[0].mmrGained)}%` }"
              />
            </div>
            <span class="text-[10px] text-gray-500 tabular-nums shrink-0">
              {{ t('tournamentStatsTab.weeklyMmr.matchCount', entry.matchesPlayed) }}
            </span>
          </div>
        </div>
      </div>
      <p v-else class="text-xs text-gray-500 py-1.5">
        {{ t('tournamentStatsTab.weeklyMmr.empty') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WeeklyMmrLeader } from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { playerLink } from '@/utils/player-link'

const props = defineProps<{
  gainers: WeeklyMmrLeader[]
  losers: WeeklyMmrLeader[]
  tournamentId?: string | null
}>()

const { t } = useI18n()

const columns = computed(() => [
  {
    key: 'gainers',
    title: t('tournamentStatsTab.weeklyMmr.gainers'),
    icon: 'fa fa-arrow-trend-up text-emerald-500',
    entries: props.gainers,
    deltaClass: 'text-emerald-600 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
  },
  {
    key: 'losers',
    title: t('tournamentStatsTab.weeklyMmr.losers'),
    icon: 'fa fa-arrow-trend-down text-red-500',
    entries: props.losers,
    deltaClass: 'text-red-600 dark:text-red-400',
    barClass: 'bg-red-500',
  },
])

function formatDelta(mmrGained: number): string {
  return `${mmrGained > 0 ? '+' : ''}${mmrGained}`
}

/** Bar width relative to the column leader, so gaps read at a glance. */
function relativeWidth(mmrGained: number, leaderGain: number): number {
  if (leaderGain === 0) return 0
  return Math.round((mmrGained / leaderGain) * 100)
}

function podiumClass(i: number): string {
  if (i === 0) return 'bg-yellow-400 text-yellow-900'
  if (i === 1) return 'bg-gray-300 text-gray-700'
  return 'bg-amber-600 text-white'
}
</script>
