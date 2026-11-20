<template>
  <!-- Laid out in a row rather than a stack: six centred lines for a single
       award pushed the rest of the card below the fold on a phone. -->
  <div
    class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-4 py-3"
    :class="isMine ? 'bg-amber-500/15 ring-1 ring-amber-400/50' : 'bg-white/5'"
  >
    <div v-if="isMine" class="absolute inset-0 animate-pulse bg-amber-400/5" />

    <i :class="icon" class="relative shrink-0 text-3xl" :style="{ color: accent }" />

    <div class="relative min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-xs font-semibold uppercase tracking-widest text-gray-300">
          {{ label }}
        </span>
        <span
          v-if="isMine"
          class="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-300"
        >
          {{ t('rewind.awards.yours') }}
        </span>
      </div>
      <div class="truncate text-lg font-bold leading-tight">{{ playerName }}</div>
      <div v-if="detail" class="truncate text-xs text-gray-400">{{ detail }}</div>
    </div>

    <!-- The unit sits under the figure instead of extending it: "+342 MMR" on a
         single line ate the width the player's name needed. -->
    <div class="relative shrink-0 text-right">
      <div class="text-3xl font-black leading-none tabular-nums" :style="{ color: accent }">
        {{ prefix }}{{ counted }}
      </div>
      <div v-if="unit" class="text-xs uppercase tracking-widest text-gray-400">{{ unit }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCountUp } from '@/composables/ui/useCountUp'

const props = withDefaults(
  defineProps<{
    label: string
    playerName: string
    value: number
    icon: string
    accent: string
    detail?: string
    prefix?: string
    suffix?: string
    isMine?: boolean
  }>(),
  { prefix: '', suffix: '', isMine: false },
)

const { t } = useI18n()
const { value: counted } = useCountUp(toRef(props, 'value'))

// Callers pass the suffix as it would read inline (" MMR", " %"); on its own
// line the leading space has to go.
const unit = computed(() => props.suffix.trim())
</script>
