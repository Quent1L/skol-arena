<template>
  <div class="rounded-2xl bg-gray-800 p-4">
    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
      {{ t('outcomeTypeStats.title') }}
    </div>
    <div class="space-y-2">
      <div
        v-for="s in stats"
        :key="s.outcomeTypeId"
        class="flex items-center justify-between py-1.5 border-b border-gray-700 last:border-0"
      >
        <span class="text-sm text-gray-200">{{ s.outcomeTypeName }}</span>
        <div class="flex items-center gap-2 text-xs shrink-0">
          <span class="text-green-400">{{ s.wins }}{{ t('outcomeTypeStats.winSuffix') }}</span>
          <span v-if="s.draws" class="text-gray-400"
            >{{ s.draws }}{{ t('outcomeTypeStats.drawSuffix') }}</span
          >
          <span class="text-red-400">{{ s.losses }}{{ t('outcomeTypeStats.lossSuffix') }}</span>
          <span class="text-gray-500 tabular-nums w-10 text-right">{{ s.winRate }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PlayerOutcomeTypeStat } from '@skol-arena/shared/types/index'

defineProps<{
  stats: PlayerOutcomeTypeStat[]
}>()

const { t } = useI18n()
</script>
