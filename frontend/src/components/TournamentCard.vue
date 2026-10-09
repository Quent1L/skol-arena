<template>
  <div
    class="tournament-card group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
    :class="[modeAccentClass, surfaceClass]"
    @click="$emit('click', tournament)"
  >
    <!-- Oversized mode glyph, the depth motif already used by the rewind banner -->
    <i
      :class="displayIcon"
      class="pointer-events-none absolute -right-4 -top-3 text-7xl text-white/[0.04] transition-transform duration-300 group-hover:scale-110"
      aria-hidden="true"
    />

    <div class="relative flex flex-1 flex-col gap-3">
      <!-- Top row: status pill -->
      <div class="flex items-center gap-2">
        <span
          class="status-pill rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider"
          :class="statusPillClass"
        >
          {{ statusLabel }}
        </span>

        <!-- Live indicator: real state, only on the player's own cards -->
        <span v-if="showLiveDot" class="relative flex h-2 w-2" aria-hidden="true">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"
          ></span>
          <span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
        </span>

        <span
          v-if="showParticipantChip"
          class="ml-auto shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-300"
        >
          {{ t(isFinished ? 'tournamentCard.youParticipated' : 'tournamentCard.youParticipate') }}
        </span>
      </div>

      <!-- Body: icon + name + tags -->
      <div class="flex items-start gap-3">
        <div
          class="mode-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-lg transition-transform duration-200 group-hover:scale-105"
          :class="modeIconBgClass"
        >
          <i :class="[displayIcon, modeIconColorClass, 'text-lg']"></i>
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="mb-1.5 truncate text-base font-bold leading-tight text-white">
            {{ tournament.name }}
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="tournament.discipline"
              class="tag rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300"
            >
              <i class="fa fa-gamepad mr-1 text-gray-400"></i>{{ tournament.discipline.name }}
            </span>
            <span class="tag rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
              {{ modeLabel }}
            </span>
          </div>
        </div>
      </div>

      <!-- Progress bar section, pinned to the bottom so cards line up whatever the title wraps to -->
      <div class="mt-auto space-y-1.5 pt-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold uppercase tracking-wider text-gray-400">{{
            t('tournamentCard.period.label')
          }}</span>
          <span class="font-semibold" :class="periodLabelClass">{{ periodLabel }}</span>
        </div>
        <div class="progress-track h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            class="progress-bar h-full rounded-full transition-all duration-500"
            :class="[modeProgressClass, { 'animate-pulse': isProgressPulsing }]"
            :style="{ width: `${timeProgress}%` }"
          ></div>
        </div>
      </div>

      <!-- Bottom: participants + dates, or the results affordance once finished -->
      <div
        class="flex items-center gap-2 border-t border-white/10 pt-2 text-xs text-gray-500"
      >
        <i class="fa fa-users text-gray-600" aria-hidden="true"></i>
        <span class="tabular-nums">{{
          t('tournamentCard.participants', tournament.participantCount ?? 0)
        }}</span>

        <span v-if="isFinished" class="ml-auto flex items-center gap-1.5 font-semibold text-gray-300">
          <i class="fa fa-chart-simple" aria-hidden="true"></i>
          {{ t('tournamentCard.viewResults') }}
        </span>
        <span v-else class="ml-auto flex items-center gap-1.5">
          <i class="fa fa-calendar-days text-gray-600" aria-hidden="true"></i>
          <span class="tabular-nums">{{ formatDate(tournament.startDate) }}</span>
          <span class="text-gray-600">→</span>
          <span class="tabular-nums">{{ formatDate(tournament.endDate) }}</span>
        </span>

        <i
          class="fa fa-chevron-right shrink-0 text-gray-600 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        ></i>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ClientTournamentSummary } from '@skol-arena/shared/types/index'

const { t, locale } = useI18n()

interface Props {
  tournament: ClientTournamentSummary
  /** `featured` is the richer treatment used for the player's own events */
  variant?: 'default' | 'featured'
}

const props = withDefaults(defineProps<Props>(), { variant: 'default' })

defineEmits<{
  click: [tournament: ClientTournamentSummary]
}>()

const isFinished = computed(() => props.tournament.status === 'finished')

// Status pill
const statusConfig: Record<string, { pillClass: string }> = {
  draft: {
    pillClass: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  },
  open: { pillClass: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  ongoing: {
    pillClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  },
  finished: {
    pillClass: 'bg-gray-500/20 text-gray-500 border border-gray-500/30',
  },
}

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    draft: t('tournamentCard.status.draft'),
    open: t('tournamentCard.status.open'),
    ongoing: t('tournamentCard.status.ongoing'),
    finished: t('tournamentCard.status.finished'),
  }
  return labels[props.tournament.status] ?? props.tournament.status
})
const statusPillClass = computed(
  () => statusConfig[props.tournament.status]?.pillClass ?? statusConfig.draft.pillClass,
)

// Mode config
const modeConfig: Record<
  string,
  {
    icon: string
    accentClass: string
    iconColorClass: string
    iconBgClass: string
    progressClass: string
    featuredClass: string
  }
> = {
  championship: {
    icon: 'fa fa-trophy',
    accentClass: 'mode-championship',
    iconColorClass: 'text-blue-400',
    iconBgClass: 'bg-blue-500/20',
    progressClass: 'bg-blue-500',
    featuredClass: 'bg-gradient-to-b from-blue-900/40 to-slate-800',
  },
  bracket: {
    icon: 'fa fa-sitemap',
    accentClass: 'mode-bracket',
    iconColorClass: 'text-gray-400',
    iconBgClass: 'bg-gray-500/20',
    progressClass: 'bg-gray-400',
    featuredClass: 'bg-gradient-to-b from-gray-700/50 to-slate-800',
  },
  ranked: {
    icon: 'fa fa-ranking-star',
    accentClass: 'mode-ranked',
    iconColorClass: 'text-violet-400',
    iconBgClass: 'bg-violet-500/20',
    progressClass: 'bg-violet-500',
    featuredClass: 'bg-gradient-to-b from-violet-900/40 to-slate-800',
  },
}

const modeLabel = computed(() => {
  const labels: Record<string, string> = {
    championship: t('tournamentCard.mode.championship'),
    bracket: t('tournamentCard.mode.bracket'),
    ranked: t('tournamentCard.mode.ranked'),
  }
  return labels[props.tournament.mode] ?? props.tournament.mode
})
const modeIcon = computed(() => modeConfig[props.tournament.mode]?.icon ?? 'fa fa-trophy')
const modeAccentClass = computed(() =>
  isFinished.value ? 'mode-finished' : (modeConfig[props.tournament.mode]?.accentClass ?? ''),
)

// A finished event keeps its mode icon but loses its accent: it should read as
// archive material next to the live cards it sits beside during the grace window.
const modeIconColorClass = computed(() =>
  isFinished.value
    ? 'text-gray-500'
    : (modeConfig[props.tournament.mode]?.iconColorClass ?? 'text-gray-400'),
)
const modeIconBgClass = computed(() =>
  isFinished.value
    ? 'bg-gray-500/10'
    : (modeConfig[props.tournament.mode]?.iconBgClass ?? 'bg-gray-500/20'),
)
const modeProgressClass = computed(() =>
  isFinished.value
    ? 'bg-gray-600'
    : (modeConfig[props.tournament.mode]?.progressClass ?? 'bg-gray-400'),
)

const surfaceClass = computed(() => {
  if (props.variant !== 'featured') return 'bg-slate-800'
  if (isFinished.value) return 'bg-gradient-to-b from-gray-700/40 to-slate-800'
  return modeConfig[props.tournament.mode]?.featuredClass ?? 'bg-slate-800'
})

const showLiveDot = computed(
  () => props.variant === 'featured' && props.tournament.status === 'ongoing',
)
const showParticipantChip = computed(
  () => props.variant === 'featured' && props.tournament.isParticipant === true,
)

const displayIcon = computed(() => props.tournament.discipline?.icon || modeIcon.value)

// Time progress bar
const timeProgress = computed(() => {
  const { status, startDate, endDate } = props.tournament
  if (status === 'finished') return 100
  const now = Date.now()
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  if (status !== 'ongoing' && status !== 'open') return 0
  if (end <= start) return 100
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
})

const isProgressPulsing = computed(() => props.tournament.status === 'open')

const periodLabel = computed(() => {
  const { status, startDate, endDate } = props.tournament
  const now = Date.now()
  if (status === 'finished') return t('tournamentCard.period.finished')
  if (status === 'draft') {
    const daysUntil = Math.ceil((new Date(startDate).getTime() - now) / 86_400_000)
    if (daysUntil <= 0) return t('tournamentCard.period.soon')
    return t('tournamentCard.period.startsIn', { days: daysUntil })
  }
  if (status === 'open') {
    const daysUntil = Math.ceil((new Date(startDate).getTime() - now) / 86_400_000)
    const daysLeft = Math.ceil((new Date(endDate).getTime() - now) / 86_400_000)
    if (daysLeft <= 0) return t('tournamentCard.period.endingSoon')
    if (daysUntil <= 0) return t('tournamentCard.period.registrationsOpen')
    return t('tournamentCard.period.startsIn', { days: daysUntil })
  }
  if (status === 'ongoing') {
    const daysLeft = Math.ceil((new Date(endDate).getTime() - now) / 86_400_000)
    if (daysLeft <= 0) return t('tournamentCard.period.endingSoon')
    return t('tournamentCard.period.daysLeft', { days: daysLeft })
  }
  return '-'
})

const periodLabelClass = computed(() => {
  const { status } = props.tournament
  if (status === 'finished') return 'text-gray-500'
  if (status === 'ongoing') return 'text-amber-400'
  return 'text-blue-400'
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

<style scoped>
.tournament-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left-width: 3px;
}

/* Championship — blue */
.tournament-card.mode-championship {
  border-left-color: rgb(59, 130, 246);
}
.tournament-card.mode-championship:hover {
  border-color: rgba(59, 130, 246, 0.3);
  border-left-color: rgb(59, 130, 246);
  box-shadow: 0 10px 25px -5px rgb(59 130 246 / 0.2);
}

/* Bracket — gray */
.tournament-card.mode-bracket {
  border-left-color: rgb(107, 114, 128);
}
.tournament-card.mode-bracket:hover {
  border-color: rgba(107, 114, 128, 0.3);
  border-left-color: rgb(156, 163, 175);
  box-shadow: 0 10px 25px -5px rgb(107 114 128 / 0.2);
}

/* Ranked — violet, the brand colour. Amber used to live here, which put the
   mode and the "ongoing" status on the same hue: a ranked event in progress lit
   both and the card flooded amber. */
.tournament-card.mode-ranked {
  border-left-color: rgb(139, 92, 246);
}
.tournament-card.mode-ranked:hover {
  border-color: rgba(139, 92, 246, 0.3);
  border-left-color: rgb(139, 92, 246);
  box-shadow: 0 10px 25px -5px rgb(139 92 246 / 0.25);
}

/* Finished — muted, whatever the mode */
.tournament-card.mode-finished {
  border-left-color: rgb(71, 85, 105);
}
.tournament-card.mode-finished:hover {
  border-color: rgba(148, 163, 184, 0.25);
  box-shadow: 0 10px 25px -5px rgb(15 23 42 / 0.5);
}
</style>
