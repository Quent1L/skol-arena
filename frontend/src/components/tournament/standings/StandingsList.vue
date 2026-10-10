<template>
  <!-- Loading (first load only) -->
  <div v-if="loading && entries.length === 0" class="flex justify-center items-center h-40">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-10 animate-spin text-muted"
      data-testid="standings-spinner"
    />
  </div>

  <UAlert v-else-if="error" color="error" variant="subtle" :title="error" />

  <div v-else-if="entries.length === 0" class="text-center py-12 text-gray-500">
    <i class="fa fa-trophy text-4xl mb-4 block opacity-30"></i>
    {{ t('standingsTable.noStandings') }}
  </div>

  <!-- Same card as a ranked tier band, so both kinds of leaderboard read alike. -->
  <div v-else class="rounded-2xl overflow-hidden bg-gray-800/70">
    <div class="flex items-center gap-3 px-4 py-3">
      <div class="w-1 h-5 rounded-full shrink-0 bg-primary-500" />
      <i class="fa fa-trophy text-sm w-4 text-center shrink-0 text-primary-400" />
      <span class="font-bold text-sm text-primary-300">{{ title }}</span>
      <button
        type="button"
        class="ml-auto shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
        :aria-label="t('standingsTable.howRankingTooltip')"
        data-testid="standings-info"
        @click="emit('show-info')"
      >
        <i class="fa fa-circle-question text-sm" />
      </button>
    </div>

    <!-- Large screens show the tiebreakers as columns; a phone opens them per row. -->
    <div
      class="hidden md:flex items-center gap-3 px-4 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500"
      data-testid="standings-columns"
    >
      <div class="flex-1" />
      <div v-if="allowDraw" class="w-14 text-right">{{ t('standingsTable.columnWinLossRatio') }}</div>
      <UTooltip :text="t('standingsTable.tooltipBuchholz')">
        <div class="w-14 text-right cursor-help">{{ t('standingsTable.columnBuchholz') }}</div>
      </UTooltip>
      <UTooltip :text="t('standingsTable.tooltipVictoryQuality')">
        <div class="w-14 text-right cursor-help">{{ t('standingsTable.columnVictoryQuality') }}</div>
      </UTooltip>
      <div class="w-14 text-right">{{ t('standingsTable.columnWinRate') }}</div>
      <div class="w-10 text-right">{{ t('standingsTable.ptsUnit') }}</div>
    </div>

    <div
      v-for="(entry, index) in entries"
      :key="entry.id"
      class="flex items-center border-t border-white/5 transition-colors"
      :class="entry.id === currentUserId ? 'bg-primary-900/30 hover:bg-primary-800/40' : 'hover:bg-white/5'"
      data-testid="standings-row"
    >
      <component
        :is="teamMode === 'flex' ? RouterLink : 'div'"
        v-bind="teamMode === 'flex' ? { to: playerLink(entry.id, tournamentId) } : {}"
        class="flex flex-1 min-w-0 items-center gap-3 pl-4 py-2.5 md:pr-4"
      >
        <div class="w-5 text-center text-xs font-bold shrink-0" :class="rankClass(index)">
          {{ index + 1 }}
        </div>

        <PlayerAvatar
          :name="entry.name"
          :color-key="entry.shortName"
          :player-id="teamMode === 'flex' ? entry.id : undefined"
          shape="square"
          size="sm"
          class="shrink-0"
        />

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-semibold text-sm truncate">{{ entry.name }}</span>
            <span
              v-if="entry.id === currentUserId"
              class="text-[9px] font-bold text-primary-400 uppercase tracking-wide shrink-0"
              >{{ t('rankedLeaderboard.you') }}</span
            >
          </div>
          <div class="flex items-center gap-2 text-[10px] text-gray-400 tabular-nums">
            <span>{{ playedLabel(entry) }}</span>
            <span v-if="entry.matchesPlayed > 0">
              <span class="text-green-400">{{ entry.wins }}{{ t('standingsTable.columnWins') }}</span>
              <template v-if="allowDraw">
                · <span>{{ entry.draws }}{{ t('standingsTable.columnDraws') }}</span>
              </template>
              · <span class="text-red-400">{{ entry.losses }}{{ t('standingsTable.columnLosses') }}</span>
            </span>
            <span v-if="scoreEnabled && entry.matchesPlayed > 0" :class="diffClass(entry.scoreDiff)">
              {{ entry.scoreDiff > 0 ? '+' : '' }}{{ entry.scoreDiff }}
            </span>
          </div>
        </div>

        <div class="hidden md:contents text-sm text-gray-300 tabular-nums">
          <div v-if="allowDraw" class="w-14 text-right shrink-0">
            {{ formatRatio(entry.winLossRatio) }}
          </div>
          <div class="w-14 text-right shrink-0">{{ entry.buchholzScore }}</div>
          <UPopover mode="hover" :open-delay="100">
            <div class="w-14 text-right shrink-0 cursor-help">
              {{ Math.round(entry.victoryQuality) }}
            </div>
            <template #content>
              <QualityBreakdown :entry="entry" />
            </template>
          </UPopover>
          <div class="w-14 text-right shrink-0">{{ formatPercent(entry.winRate) }}</div>
        </div>

        <div class="w-10 text-right shrink-0">
          <div class="font-black text-sm tabular-nums">{{ entry.points }}</div>
          <div class="text-[10px] text-gray-500 md:hidden">{{ t('standingsTable.ptsUnit') }}</div>
        </div>
      </component>

      <!-- Outside the link: opening the tiebreakers must not open the profile. -->
      <UPopover>
        <UButton
          icon="i-fa7-solid:circle-question"
          color="neutral"
          variant="ghost"
          size="sm"
          class="mx-1.5 shrink-0 rounded-full text-gray-500 md:hidden"
          :aria-label="t('standingsTable.tiebreakerDetails', { name: entry.name })"
        />
        <template #content>
          <TiebreakerDetails :entry="entry" :allow-draw="allowDraw" />
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { StandingsEntry } from '@skol-arena/shared'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import TiebreakerDetails from '@/components/tournament/standings/TiebreakerDetails.vue'
import QualityBreakdown from '@/components/tournament/standings/QualityBreakdown.vue'
import { formatPercent, formatRatio } from '@/components/tournament/standings/standings-format'
import { playerLink } from '@/utils/player-link'

defineProps<{
  entries: StandingsEntry[]
  title: string
  tournamentId: string
  teamMode: 'static' | 'flex'
  allowDraw: boolean
  scoreEnabled: boolean
  currentUserId?: string
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ 'show-info': [] }>()

const { t } = useI18n()

const PODIUM_CLASSES = ['text-yellow-500', 'text-gray-300', 'text-orange-500']

function rankClass(index: number): string {
  return PODIUM_CLASSES[index] ?? 'text-gray-500'
}

function diffClass(diff: number): string {
  if (diff > 0) return 'text-green-400'
  if (diff < 0) return 'text-red-400'
  return ''
}

function playedLabel(entry: StandingsEntry): string {
  const count = entry.matchesPlayed
  if (count === 0) return t('standingsTable.noMatchesPlayed')
  return t(count === 1 ? 'rankedLeaderboard.matchSingular' : 'rankedLeaderboard.matchPlural', {
    number: count,
  })
}

</script>
