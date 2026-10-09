<template>
  <RewindCardShell
    :eyebrow="t('rewind.journey.eyebrow')"
    :title="t('rewind.journey.title')"
    :subtitle="t('rewind.journey.subtitle')"
  >
    <div class="flex flex-col gap-2.5">
      <div class="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-2.5">
        <div class="flex flex-col items-center gap-1">
          <span class="text-xs uppercase tracking-wide text-gray-300">
            {{ t('rewind.journey.start') }}
          </span>
          <span class="text-xl font-bold tabular-nums text-gray-300">
            {{ player.journey.initialMmr }}
          </span>
        </div>

        <i class="fa fa-arrow-right text-gray-600" />

        <div class="flex flex-col items-center gap-1">
          <span class="text-xs uppercase tracking-wide text-gray-300">
            {{ t('rewind.journey.end') }}
          </span>
          <span class="text-xl font-bold tabular-nums">{{ player.journey.finalMmr }}</span>
        </div>
      </div>

      <RewindStat
        :value="player.journey.netDelta"
        :label="t('rewind.journey.netDelta')"
        :prefix="player.journey.netDelta > 0 ? '+' : ''"
        :value-class="player.journey.netDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'"
      />

      <!-- The reveal is a clip animated on the element itself, not a Chart.js
           animation: the canvas is built while the card's enter transition is
           still running, and any later resize — the mobile URL bar, a scrollbar
           — redraws it without replaying anything. Clipping survives both. -->
      <div class="h-32 rounded-2xl bg-white/5 p-2 [@media(max-height:720px)]:h-24">
        <div ref="revealRef" class="h-full">
          <AppChart type="line" :data="chartData" :options="chartOptions" class="h-full" />
        </div>
      </div>
    </div>
  </RewindCardShell>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppChart from '@/components/charts/AppChart.vue'
import type { PlayerRewindPayload } from '@skol-arena/shared/types/index'
import RewindCardShell from '../RewindCardShell.vue'
import RewindStat from '../RewindStat.vue'
import { formatRewindDate } from '@/composables/ranked/rewind.service'

const props = defineProps<{ player: PlayerRewindPayload }>()

const { t, locale } = useI18n()

/**
 * The curve is swept in left to right by animating a clip on the chart box.
 *
 * A Web Animation rather than a CSS class flip: the canvas is created while the
 * card's enter transition is still running, so a class toggled around mount can
 * land before the box is in the DOM and then never transition — which is why
 * the chart used to appear already drawn. Starting from the template ref means
 * the sweep begins exactly when the box exists, on every visit to the card.
 */
const revealRef = useTemplateRef<HTMLElement>('revealRef')

watch(
  revealRef,
  (element) => {
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    element.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
      duration: 900,
      easing: 'ease-out',
    })
  },
  { immediate: true },
)

const points = computed(() => props.player.journey.points)

// The curve starts on the MMR the panel above calls "start", not on the result
// of the first match: otherwise the season opens at a number shown nowhere.
// Index 0 is that starting point, so match n sits at index n.
const series = computed(() =>
  points.value.length === 0
    ? []
    : [points.value[0].mmrBefore, ...points.value.map((point) => point.mmrAfter)],
)

const chartData = computed(() => ({
  labels: series.value.map((_, index) => index),
  datasets: [
    {
      data: series.value,
      borderColor: '#6366f1',
      borderWidth: 2,
      backgroundColor: 'rgba(99, 102, 241, 0.15)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // The curve is drawn in one go; the clip animation above sweeps it in.
  animation: false as const,
  resizeDelay: 120,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items: { dataIndex: number }[]) => {
          const point = points.value[items[0].dataIndex - 1]
          return point ? formatRewindDate(point.playedAt, locale.value) : t('rewind.journey.start')
        },
        label: (item: { dataIndex: number }) => {
          const point = points.value[item.dataIndex - 1]
          if (!point) return `${props.player.journey.initialMmr} MMR`
          return `${point.mmrAfter} MMR (${point.mmrDelta > 0 ? '+' : ''}${point.mmrDelta})`
        },
      },
    },
  },
  scales: {
    x: { display: false },
    y: {
      grid: { color: 'rgba(255,255,255,0.08)' },
      ticks: { color: 'rgba(255,255,255,0.55)', font: { size: 11 } },
    },
  },
}))
</script>
