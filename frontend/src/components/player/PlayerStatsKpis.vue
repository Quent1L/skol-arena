<template>
  <div class="space-y-3">
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl p-3 text-center bg-gray-800">
        <div class="text-xl font-black text-white">{{ stats.totalMatches }}</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ t('playerDetailView.matches') }}</div>
      </div>
      <div class="rounded-xl p-3 text-center bg-gray-800">
        <div class="text-xl font-black text-white">{{ stats.winRate }}%</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ t('playerDetailView.winrate') }}</div>
      </div>
      <div class="rounded-xl p-3 text-center bg-gray-800">
        <div class="text-xl font-black">
          <span class="text-green-400">{{ stats.wins }}</span>
          <span class="text-gray-600 text-base mx-0.5">/</span>
          <span class="text-gray-400">{{ stats.draws }}</span>
          <span class="text-gray-600 text-base mx-0.5">/</span>
          <span class="text-red-400">{{ stats.losses }}</span>
        </div>
        <div class="text-xs text-gray-400 mt-0.5">{{ t('playerDetailView.wldLabel') }}</div>
      </div>
    </div>
    <div v-if="stats.averageScore > 0" class="rounded-xl p-3 text-center bg-gray-800">
      <div class="text-xl font-black text-white">{{ stats.averageScore }}</div>
      <div class="text-xs text-gray-400 mt-0.5">{{ t('playerDetailView.avgScore') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PlayerDetailStats } from '@skol-arena/shared/types/index'

/** Matches, win rate, W/D/L and average score of a player in one competition. */
defineProps<{ stats: PlayerDetailStats }>()
const { t } = useI18n()
</script>
