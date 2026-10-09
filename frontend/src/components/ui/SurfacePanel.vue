<template>
  <section class="overflow-hidden rounded-2xl border backdrop-blur-sm" :class="toneClass">
    <header v-if="$slots.header" class="border-b px-4 py-3" :class="headerBorderClass">
      <slot name="header" />
    </header>
    <div :class="padded ? 'p-4' : ''">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * The single panel shell for the match screen. Before this, the same card was hand-rolled
 * five times with five different border/background recipes, plus two PrimeVue Cards that
 * looked like neither.
 */
const props = withDefaults(
  defineProps<{
    tone?: 'default' | 'danger' | 'warn' | 'win'
    padded?: boolean
  }>(),
  { tone: 'default', padded: true },
)

const toneClass = computed(() => {
  switch (props.tone) {
    case 'danger':
      return 'border-match-loss/30 bg-match-loss/[0.06]'
    case 'warn':
      return 'border-amber-400/30 bg-amber-400/[0.06]'
    case 'win':
      return 'border-match-win/25 bg-match-win/[0.05]'
    default:
      return 'border-slate-700/40 bg-slate-800/60'
  }
})

const headerBorderClass = computed(() => {
  switch (props.tone) {
    case 'danger':
      return 'border-match-loss/25'
    case 'warn':
      return 'border-amber-400/25'
    case 'win':
      return 'border-match-win/20'
    default:
      return 'border-slate-700/40'
  }
})
</script>
