<template>
  <div class="relative">
    <canvas ref="canvas" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { Chart, ChartData, ChartOptions, ChartType } from 'chart.js'

/**
 * Thin Chart.js host, the drop-in successor of PrimeVue's <Chart>: same props, the
 * chart is rebuilt whenever its data or options change. Chart.js is loaded lazily so
 * it stays out of the bundles of screens without a chart.
 */
const props = defineProps<{
  type: ChartType
  data: ChartData
  options?: ChartOptions
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const chart = shallowRef<Chart | null>(null)

async function render() {
  if (!canvas.value) return
  const { default: ChartJs } = await import('./chart-setup')
  chart.value?.destroy()
  // The canvas may have been unmounted while chart.js was loading.
  if (!canvas.value) return
  chart.value = new ChartJs(canvas.value, {
    type: props.type,
    data: props.data,
    options: props.options,
  })
}

onMounted(render)
watch(() => [props.type, props.data, props.options], render, { deep: true })
onBeforeUnmount(() => {
  chart.value?.destroy()
  chart.value = null
})
</script>
