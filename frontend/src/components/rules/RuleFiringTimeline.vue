<template>
  <div class="h-48">
    <AppChart type="bar" :data="chartData" :options="chartOptions" class="h-full" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { format, startOfDay, subDays } from 'date-fns'
import AppChart from '@/components/charts/AppChart.vue'
import type { ClientRuleFiringOverview } from '@skol-arena/shared/types/index'

const props = defineProps<{
  timeline: ClientRuleFiringOverview['timeline']
  days: number
}>()

const { t } = useI18n()

/**
 * One bar per day of the window, quiet days included: the server only returns days
 * that saw a firing, and a gap-free axis is what makes a lull readable.
 */
const filledDays = computed(() => {
  const byDay = new Map(props.timeline.map((d) => [format(d.day, 'yyyy-MM-dd'), d]))
  const today = startOfDay(new Date())
  return Array.from({ length: props.days }, (_, i) => {
    const day = subDays(today, props.days - 1 - i)
    const stat = byDay.get(format(day, 'yyyy-MM-dd'))
    return { day, messages: stat?.messages ?? 0, badges: stat?.badges ?? 0 }
  })
})

const chartData = computed(() => ({
  labels: filledDays.value.map((d) => format(d.day, 'dd/MM')),
  datasets: [
    {
      label: t('rulesEngineOverview.timelineMessages'),
      data: filledDays.value.map((d) => d.messages),
      backgroundColor: '#3b82f6',
    },
    {
      label: t('rulesEngineOverview.timelineBadges'),
      data: filledDays.value.map((d) => d.badges),
      backgroundColor: '#f59e0b',
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' as const } },
  scales: {
    x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true } },
    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
  },
}
</script>
