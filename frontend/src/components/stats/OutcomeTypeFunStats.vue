<template>
  <div class="space-y-4">
    <div
      v-for="stat in stats"
      :key="stat.outcomeTypeId"
      class="rounded-xl p-3 sm:p-4 bg-gray-900/40 border border-gray-700/60"
      data-test="outcome-type-card"
    >
      <div
        class="transition-all duration-150 ease-out"
        :class="isSwapping(stat) ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'"
      >
        <!-- Mobile stacks the title on its own row: truncating it hid which outcome type the card is about. -->
        <div class="flex flex-col gap-2 mb-3 sm:flex-row sm:items-baseline sm:justify-between">
          <h3
            class="text-sm font-bold text-gray-200 uppercase tracking-wide text-balance sm:truncate"
          >
            {{ cardTitle(stat) }}
          </h3>
          <div class="flex items-center justify-between gap-2 sm:justify-end sm:shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-gray-600 bg-gray-800/80 px-2.5 py-1 text-[10px] font-semibold text-gray-300 cursor-pointer transition-colors hover:border-indigo-400 hover:text-indigo-300 hover:bg-gray-800 focus:outline-none focus-visible:outline-none"
              data-test="outcome-type-side-toggle"
              @click="toggleCardSide(stat)"
            >
              <i class="fa fa-arrow-right-arrow-left" />
              {{ toggleLabel(stat) }}
            </button>
            <span class="text-[10px] text-gray-500 tabular-nums">
              {{
                t('tournamentStatsTab.outcomeTypeFunStats.matchCount', { count: stat.totalMatches })
              }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <OutcomeTypeLeaderColumn
            :board="volumeOf(stat)"
            metric="volume"
            :side="sideOf(stat)"
            :tournament-id="tournamentId"
          />
          <OutcomeTypeLeaderColumn
            :board="rateOf(stat)"
            metric="rate"
            :side="sideOf(stat)"
            :tournament-id="tournamentId"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OutcomeTypeFunStat, OutcomeTypeLeaderboard } from '@skol-arena/shared/types/index'
import OutcomeTypeLeaderColumn from '@/components/stats/OutcomeTypeLeaderColumn.vue'

defineProps<{
  stats: OutcomeTypeFunStat[]
  tournamentId?: string | null
}>()

const { t } = useI18n()

// Toggling fades + slides the content out, swaps it underneath, then fades it back
// in — a real transition between the two views, not an instant content swap.
const SWAP_HALF_DURATION_MS = 150

const cardSides = ref<Record<string, 'winners' | 'losers'>>({})
const swappingIds = ref<Set<string>>(new Set())

function sideOf(stat: OutcomeTypeFunStat): 'winners' | 'losers' {
  return cardSides.value[stat.outcomeTypeId] ?? 'winners'
}

function isSwapping(stat: OutcomeTypeFunStat): boolean {
  return swappingIds.value.has(stat.outcomeTypeId)
}

function toggleCardSide(stat: OutcomeTypeFunStat): void {
  const id = stat.outcomeTypeId
  swappingIds.value = new Set(swappingIds.value).add(id)
  setTimeout(() => {
    const next = sideOf(stat) === 'winners' ? 'losers' : 'winners'
    cardSides.value = { ...cardSides.value, [id]: next }
    const updated = new Set(swappingIds.value)
    updated.delete(id)
    swappingIds.value = updated
  }, SWAP_HALF_DURATION_MS)
}

/** The button always names the view it leads to, not the action — no guessing what "switch" does. */
function toggleLabel(stat: OutcomeTypeFunStat): string {
  const targetKey = sideOf(stat) === 'winners' ? 'viewLosers' : 'viewWinners'
  return t(`tournamentStatsTab.outcomeTypeFunStats.${targetKey}`)
}

function volumeOf(stat: OutcomeTypeFunStat): OutcomeTypeLeaderboard {
  return sideOf(stat) === 'winners' ? stat.topWinnersByVolume : stat.topLosersByVolume
}

function rateOf(stat: OutcomeTypeFunStat): OutcomeTypeLeaderboard {
  return sideOf(stat) === 'winners' ? stat.topWinnersByRate : stat.topLosersByRate
}

/** "Rois de Fin normale" / "Victimes de Fin normale" — keeps the fun framing of the card. */
function cardTitle(stat: OutcomeTypeFunStat): string {
  const key = sideOf(stat) === 'winners' ? 'king' : 'victim'
  return t(`tournamentStatsTab.outcomeTypeFunStats.${key}`, { name: stat.outcomeTypeName })
}
</script>
