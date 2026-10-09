<template>
  <div class="p-3 min-w-[220px]">
    <p class="font-semibold text-sm mb-2 text-gray-800 dark:text-gray-100">
      {{ entry.name }} — {{ t('standingsTable.tiebreakerCriteria') }}
    </p>
    <ul class="text-sm space-y-1 text-gray-700 dark:text-gray-300">
      <li v-if="allowDraw" class="flex items-center gap-4">
        <span class="flex-1">{{ t('standingsTable.tiebreakerWinLossRatio') }}</span>
        <span class="font-medium">{{ formatRatio(entry.winLossRatio) }}</span>
        <span class="w-4 shrink-0" />
      </li>
      <li class="flex items-center gap-4">
        <span class="flex-1">{{ t('standingsTable.tiebreakerBuchholz') }}</span>
        <span class="font-medium">{{ entry.buchholzScore }} {{ t('standingsTable.ptsUnit') }}</span>
        <span class="w-4 shrink-0" />
      </li>
      <li>
        <button
          class="flex items-center gap-4 w-full text-left"
          @click="qualityExpanded = !qualityExpanded"
        >
          <span class="flex-1">{{ t('standingsTable.tiebreakerQuality') }}</span>
          <span class="font-medium">{{ entry.victoryQuality.toFixed(1) }} {{ t('standingsTable.ptsUnit') }}</span>
          <span class="w-4 shrink-0 text-center">
            <i
              class="fa text-xs text-gray-400"
              :class="{
                'fa-chevron-right': !qualityExpanded,
                'fa-chevron-down': qualityExpanded,
              }"
            />
          </span>
        </button>
        <ul
          v-if="qualityExpanded && entry.victoryQualityBreakdown.length > 0"
          class="mt-1 ml-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400"
        >
          <li
            v-for="detail in entry.victoryQualityBreakdown"
            :key="detail.outcomeTypeName"
            class="flex justify-between gap-3"
          >
            <span
              >{{ detail.outcomeTypeName }}
              <span class="text-gray-400">({{ detail.points }} {{ t('standingsTable.ptPerResult') }})</span></span
            >
            <span class="flex gap-1 items-center">
              <span v-if="detail.wins > 0" class="text-green-600 dark:text-green-400"
                >{{ detail.wins }}{{ t('standingsTable.columnWins') }}</span
              >
              <span v-if="detail.losses > 0" class="text-red-600 dark:text-red-400"
                >{{ detail.losses }}{{ t('standingsTable.columnLosses') }}</span
              >
              <span
                class="font-medium"
                :class="
                  detail.contribution >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                "
              >
                {{ detail.contribution >= 0 ? '+' : '' }}{{ detail.contribution }}
              </span>
            </span>
          </li>
          <li
            class="flex justify-between gap-3 border-t border-gray-200 dark:border-gray-600 pt-1 font-semibold"
          >
            <span>{{ t('standingsTable.total') }}</span>
            <span
              :class="
                entry.victoryQuality >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              "
            >
              {{ entry.victoryQuality >= 0 ? '+' : ''
              }}{{ entry.victoryQuality.toFixed(1) }}
            </span>
          </li>
        </ul>
      </li>
      <li class="flex items-center gap-4">
        <span class="flex-1">{{ t('standingsTable.tiebreakerWinRate') }}</span>
        <span class="font-medium">{{ formatPercent(entry.winRate) }}</span>
        <span class="w-4 shrink-0" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StandingsEntry } from '@skol-arena/shared'
import { formatPercent, formatRatio } from './standings-format'

/** Tiebreaker breakdown of one standings row, shown from the row's help button on phones. */
defineProps<{ entry: StandingsEntry; allowDraw: boolean }>()

const { t } = useI18n()
const qualityExpanded = ref(false)
</script>
