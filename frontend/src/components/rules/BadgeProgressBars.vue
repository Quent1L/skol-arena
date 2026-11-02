<template>
  <div class="w-full space-y-2">
    <div v-for="(counter, index) in counters" :key="index" data-test="counter">
      <UProgress :model-value="percent(counter)" size="sm" />
      <div class="mt-1 text-xs tabular-nums text-slate-500">
        {{ t('badgeProgress.count', { current: counter.current, target: counter.target }) }}
        <template v-if="counter.window === 'discipline'"> · {{ t('badgeProgress.allSeasons') }}</template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { BadgeCounterProgress } from '@skol-arena/shared/types/index'

defineProps<{ counters: BadgeCounterProgress[] }>()

const { t } = useI18n()

/** A count can pass its target while another condition of the badge is still unmet. */
function percent({ current, target }: BadgeCounterProgress): number {
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100
}
</script>
