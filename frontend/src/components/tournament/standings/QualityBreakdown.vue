<template>
  <div class="p-3 min-w-[260px]">
    <p class="font-semibold text-sm mb-2 text-gray-800 dark:text-gray-100">
      {{ entry.name }} — {{ t('standingsTable.victoryQualityLabel') }}
    </p>
    <div
      v-if="entry.victoryQualityBreakdown.length > 0"
      class="text-sm text-gray-700 dark:text-gray-300"
    >
      <div
        v-for="detail in entry.victoryQualityBreakdown"
        :key="detail.outcomeTypeName"
        class="flex items-center justify-between gap-4 py-0.5"
      >
        <span class="text-gray-600 dark:text-gray-400">
          {{ detail.outcomeTypeName }}
          <span class="text-xs text-gray-400">({{ detail.points }} {{ t('standingsTable.ptPerResult') }})</span>
        </span>
        <span class="flex gap-2 items-center">
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
      </div>
      <div
        class="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between font-semibold text-sm"
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
      </div>
    </div>
    <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('standingsTable.noMatchesPlayed') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { StandingsEntry } from '@skol-arena/shared'

/** Victory quality breakdown of one standings row, shown on hover of its value. */
defineProps<{ entry: StandingsEntry }>()

const { t } = useI18n()
</script>
