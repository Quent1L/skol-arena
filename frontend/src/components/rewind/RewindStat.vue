<template>
  <div class="flex flex-col items-center gap-0.5 rounded-2xl bg-white/5 px-3 py-3">
    <i v-if="icon" :class="[icon, valueClass]" class="text-base" />
    <span class="text-3xl font-black tabular-nums leading-tight" :class="valueClass">
      {{ prefix }}{{ display }}{{ suffix }}
    </span>
    <span
      class="text-balance text-center text-xs uppercase leading-tight tracking-wide text-gray-300"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { useCountUp } from '@/composables/ui/useCountUp'

const props = withDefaults(
  defineProps<{
    value: number
    label: string
    /** Rendered before the number, e.g. '+' for a positive delta. */
    prefix?: string
    suffix?: string
    valueClass?: string
    from?: number
    /** Font Awesome class, shown above the value in the same colour. */
    icon?: string
  }>(),
  { prefix: '', suffix: '', valueClass: 'text-white', from: 0 },
)

const { value: display } = useCountUp(toRef(props, 'value'), { from: props.from })
</script>
