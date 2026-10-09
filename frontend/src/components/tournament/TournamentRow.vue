<template>
  <div
    class="flex cursor-pointer items-center gap-3 border-t border-white/5 px-4 py-2.5 transition-colors first:border-t-0 hover:bg-white/5"
    @click="$emit('click', tournament)"
  >
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5"
      aria-hidden="true"
    >
      <i :class="[displayIcon, 'text-sm text-gray-500']"></i>
    </div>

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-semibold text-gray-200">{{ tournament.name }}</div>
      <div class="truncate text-[11px] text-muted">
        {{ metaLine }}
      </div>
    </div>

    <span class="shrink-0 text-xs tabular-nums text-gray-500">{{
      formatDate(tournament.endDate)
    }}</span>
    <i class="fa fa-chevron-right shrink-0 text-xs text-gray-600" aria-hidden="true"></i>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ClientTournamentSummary } from '@skol-arena/shared/types/index'

const { t, locale } = useI18n()

interface Props {
  tournament: ClientTournamentSummary
}

const props = defineProps<Props>()

defineEmits<{
  click: [tournament: ClientTournamentSummary]
}>()

const modeIcons: Record<string, string> = {
  championship: 'fa fa-trophy',
  bracket: 'fa fa-sitemap',
  ranked: 'fa fa-ranking-star',
}

const displayIcon = computed(
  () => props.tournament.discipline?.icon || modeIcons[props.tournament.mode] || 'fa fa-trophy',
)

const metaLine = computed(() => {
  const mode = t(`tournamentCard.mode.${props.tournament.mode}`)
  const discipline = props.tournament.discipline?.name
  return discipline ? `${discipline} · ${mode}` : mode
})

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString(locale?.value ?? 'fr', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}
</script>
