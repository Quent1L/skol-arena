<template>
  <!-- Infos: the navigation cards, then the description block. -->
  <div v-if="kind === 'infos'" class="space-y-4 sm:space-y-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <div
        v-for="i in 3"
        :key="i"
        class="flex items-center justify-between p-4 sm:p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800"
      >
        <div class="flex items-center gap-3">
          <USkeleton class="h-[2.5rem] w-[2.5rem] rounded-lg!" />
          <div class="space-y-1.5">
            <USkeleton class="h-[0.9rem] w-[7rem]" />
            <USkeleton class="h-[0.7rem] w-[10rem]" />
          </div>
        </div>
        <USkeleton class="h-[0.9rem] w-[0.6rem]" />
      </div>
    </div>
    <div
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-2"
    >
      <USkeleton class="h-[0.85rem] w-full" />
      <USkeleton class="h-[0.85rem] w-full" />
      <USkeleton class="h-[0.85rem] w-[60%]" />
    </div>
  </div>

  <!-- Matches: the filter chips, then the card grid. -->
  <div v-else-if="kind === 'matches'">
    <div class="mb-4 flex gap-2">
      <USkeleton v-for="i in 3" :key="i" class="h-[2rem] w-[6rem] rounded-full!" />
    </div>
    <div :class="gridClass">
      <div
        v-for="i in cardCount"
        :key="i"
        class="rounded-xl bg-slate-800 border border-slate-700/10 px-3 pt-2.5 pb-2 space-y-3"
      >
        <div class="flex items-center justify-between">
          <USkeleton class="h-[0.7rem] w-[4rem]" />
          <USkeleton class="h-[0.7rem] w-[3rem]" />
        </div>
        <div class="flex items-center gap-2 pt-1">
          <div class="flex-1 flex flex-col items-center gap-1.5">
            <USkeleton class="size-[2rem] rounded-full" />
            <USkeleton class="h-[0.7rem] w-[4rem]" />
          </div>
          <USkeleton class="h-[1.6rem] w-[3rem]" />
          <div class="flex-1 flex flex-col items-center gap-1.5">
            <USkeleton class="size-[2rem] rounded-full" />
            <USkeleton class="h-[0.7rem] w-[4rem]" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Standings: tier bands, each holding a few player rows. The same shape carries
       the ranked tier list and the championship table closely enough that the layout
       does not jump whichever one lands. -->
  <div v-else-if="kind === 'standings'" class="space-y-3">
    <div
      v-for="group in 2"
      :key="group"
      class="rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/10"
    >
      <div class="flex items-center gap-3 px-4 py-3">
        <USkeleton class="size-[2rem] rounded-full" />
        <USkeleton class="h-[1rem] w-[7rem]" />
      </div>
      <div
        v-for="row in 3"
        :key="row"
        class="flex items-center gap-3 px-4 py-2.5 border-t border-white/5"
      >
        <USkeleton class="h-[1rem] w-[1.2rem]" />
        <USkeleton class="size-[1.75rem] rounded-full" />
        <USkeleton class="h-[0.9rem] w-[40%]" />
        <div class="flex-1" />
        <USkeleton class="h-[0.9rem] w-[2.5rem]" />
      </div>
    </div>
  </div>

  <!-- Participants / teams / badges: a flat list of rows. -->
  <div v-else-if="kind === 'list'" class="space-y-2">
    <div
      v-for="i in 6"
      :key="i"
      class="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800"
    >
      <USkeleton class="size-[2.25rem] rounded-full" />
      <div class="space-y-1.5 flex-1">
        <USkeleton class="h-[0.9rem] w-[45%]" />
        <USkeleton class="h-[0.7rem] w-[25%]" />
      </div>
      <USkeleton class="h-[1.5rem] w-[3rem] rounded-full!" />
    </div>
  </div>

  <!-- Stats: the sub-tab switch, then the chart cards. -->
  <div v-else-if="kind === 'stats'" class="space-y-4">
    <div class="flex gap-2">
      <USkeleton class="h-[2rem] w-[8rem] rounded-full!" />
      <USkeleton class="h-[2rem] w-[8rem] rounded-full!" />
    </div>
    <div :class="gridClass">
      <USkeleton v-for="i in cardCount" :key="i" class="h-[11rem] w-full rounded-xl!" />
    </div>
  </div>

  <!-- Bracket: rounds of match boxes, spaced as columns. -->
  <div v-else class="flex gap-4 overflow-hidden">
    <div v-for="round in 3" :key="round" class="flex-1 flex flex-col justify-around gap-4 min-w-32">
      <USkeleton v-for="box in 4 - round" :key="box" class="h-[4.5rem] w-full rounded-xl!" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * The body of a tournament tab while it loads. Each shape mirrors what that tab
 * actually renders, so the page settles instead of being rebuilt when the data lands.
 */
const props = defineProps<{
  /** Route tab. Absent while the view is still resolving its default tab. */
  tab?: string
  variant: 'mobile' | 'desktop'
}>()

type Kind = 'infos' | 'matches' | 'standings' | 'list' | 'stats' | 'bracket'

const KINDS: Record<string, Kind> = {
  infos: 'infos',
  matches: 'matches',
  standings: 'standings',
  participants: 'list',
  teams: 'list',
  badges: 'list',
  stats: 'stats',
  bracket: 'bracket',
}

// No tab in the URL means the view is about to redirect to the mode's default one,
// which is standings for every mode but bracket — so that is what to draw.
const kind = computed<Kind>(() => KINDS[props.tab ?? ''] ?? 'standings')

const cardCount = computed(() => (props.variant === 'mobile' ? 3 : 6))

const gridClass = computed(() =>
  props.variant === 'mobile' ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-2 gap-4',
)
</script>
