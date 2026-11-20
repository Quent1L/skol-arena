<template>
  <RewindCardShell
    :eyebrow="t('rewind.intro.eyebrow')"
    :title="season.season.name"
    :subtitle="season.season.disciplineName ?? undefined"
  >
    <div class="flex flex-col items-center gap-4">
      <div class="relative flex h-20 w-20 items-center justify-center">
        <div class="absolute inset-0 rounded-full bg-indigo-500/20 blur-2xl" />
        <i class="fa fa-film relative text-5xl text-indigo-300" />
      </div>

      <p class="text-center text-sm text-gray-400">
        {{
          t('rewind.intro.period', {
            start: formatDate(season.season.startDate),
            end: formatDate(season.season.endDate),
          })
        }}
      </p>

      <div class="grid w-full grid-cols-2 gap-3">
        <RewindStat :value="season.totals.playerCount" :label="t('rewind.intro.players')" />
        <RewindStat :value="season.totals.matchCount" :label="t('rewind.intro.matches')" />
      </div>
    </div>
  </RewindCardShell>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SeasonRewindPayload } from '@skol-arena/shared/types/index'
import RewindCardShell from '../RewindCardShell.vue'
import RewindStat from '../RewindStat.vue'
import { formatRewindDate } from '@/composables/ranked/rewind.service'

defineProps<{ season: SeasonRewindPayload }>()

const { t, locale } = useI18n()

function formatDate(value: Date): string {
  return formatRewindDate(value, locale.value)
}
</script>
