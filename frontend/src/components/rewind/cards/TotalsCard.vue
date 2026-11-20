<template>
  <RewindCardShell
    :eyebrow="t('rewind.totals.eyebrow')"
    :title="t('rewind.totals.title')"
    :subtitle="t('rewind.totals.subtitle')"
  >
    <div class="flex flex-col gap-2.5">
      <RewindStat
        :value="player.totals.matchesPlayed"
        :label="t('rewind.totals.matches')"
        value-class="text-indigo-300"
      />

      <!-- A discipline without draws has no reason to be shown a "0 draws" tile. -->
      <div class="grid gap-2" :class="allowDraw ? 'grid-cols-3' : 'grid-cols-2'">
        <RewindStat
          :value="player.totals.wins"
          :label="t('rewind.totals.wins')"
          value-class="text-emerald-400"
        />
        <RewindStat
          v-if="allowDraw"
          :value="player.totals.draws"
          :label="t('rewind.totals.draws')"
          value-class="text-gray-300"
        />
        <RewindStat
          :value="player.totals.losses"
          :label="t('rewind.totals.losses')"
          value-class="text-rose-400"
        />
      </div>

      <div class="flex flex-col gap-2 rounded-2xl bg-white/5 px-4 py-3">
        <div class="flex items-baseline justify-between">
          <span class="text-xs uppercase tracking-wide text-gray-400">
            {{ t('rewind.totals.winRate') }}
          </span>
          <span class="text-xl font-black tabular-nums">{{ player.totals.winRate }} %</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-emerald-400 transition-[width] duration-1000 ease-out"
            :style="{ width: `${barWidth}%` }"
          />
        </div>
      </div>
    </div>
  </RewindCardShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlayerRewindPayload } from '@skol-arena/shared/types/index'
import RewindCardShell from '../RewindCardShell.vue'
import RewindStat from '../RewindStat.vue'

const props = withDefaults(defineProps<{ player: PlayerRewindPayload; allowDraw?: boolean }>(), {
  allowDraw: true,
})

const { t } = useI18n()

const barWidth = ref(0)
onMounted(() => requestAnimationFrame(() => (barWidth.value = props.player.totals.winRate)))
</script>
