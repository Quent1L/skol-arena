<template>
  <div v-if="loading" class="flex justify-center py-8">
    <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
  </div>

  <div v-else-if="groups.length" class="space-y-4" data-test="ranked-career">
    <div class="flex items-start gap-3">
      <div class="min-w-0">
        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide">
          {{ t('playerRankedCareer.title') }}
        </div>
        <div class="text-xs text-gray-500 mt-0.5">
          {{ detailed ? t('playerRankedCareer.subtitle') : t('playerRankedCareer.subtitleCompact') }}
        </div>
      </div>
      <button
        type="button"
        class="ml-auto shrink-0 text-xs font-bold text-gray-400 hover:text-white transition-colors"
        :aria-expanded="detailed"
        data-test="career-detail-toggle"
        @click="detailed = !detailed"
      >
        {{ detailed ? t('playerRankedCareer.showLess') : t('playerRankedCareer.showDetails') }}
      </button>
    </div>

    <div v-for="group in groups" :key="group.disciplineId ?? 'none'" class="space-y-2">
      <!-- Discipline header -->
      <div class="flex items-center gap-2">
        <i :class="group.disciplineIcon || 'fa fa-layer-group'" class="text-sm text-gray-400" />
        <span class="font-bold text-sm text-white">
          {{ group.disciplineName || t('playerRankedCareer.noDiscipline') }}
        </span>
        <span class="ml-auto text-xs text-gray-500 shrink-0">
          {{ t('playerRankedCareer.seasonCount', group.seasons.length) }}
        </span>
      </div>

      <!-- Discipline totals. They live here rather than in the generic per-discipline
           block, which skips the seasons this card already covers: the same seasons
           listed twice with the same match counts is what this replaces. -->
      <div class="grid grid-cols-3 gap-2" data-test="career-totals">
        <div class="rounded-xl bg-gray-800 p-2.5 text-center">
          <div class="text-lg font-black text-white tabular-nums">{{ group.totals.matches }}</div>
          <div class="text-xs text-gray-400 mt-0.5">{{ t('playerRankedCareer.matches') }}</div>
        </div>
        <div class="rounded-xl bg-gray-800 p-2.5 text-center">
          <div class="text-lg font-black text-white tabular-nums">{{ group.totals.winRate }}%</div>
          <div class="text-xs text-gray-400 mt-0.5">{{ t('playerRankedCareer.winrate') }}</div>
        </div>
        <div class="rounded-xl bg-gray-800 p-2.5 text-center">
          <div class="text-base font-black">
            <span class="text-green-400">{{ group.totals.wins }}{{ t('playerRankedCareer.winsShort') }}</span>
            <span v-if="group.totals.draws > 0" class="text-gray-600 text-sm mx-0.5">/</span>
            <span v-if="group.totals.draws > 0" class="text-amber-400">
              {{ group.totals.draws }}{{ t('playerRankedCareer.drawsShort') }}
            </span>
            <span class="text-gray-600 text-sm mx-0.5">/</span>
            <span class="text-red-400">{{ group.totals.losses }}{{ t('playerRankedCareer.lossesShort') }}</span>
          </div>
          <div class="text-xs text-gray-400 mt-0.5">{{ t('playerRankedCareer.wdLabel') }}</div>
        </div>
      </div>

      <!-- Compact: one chip per season, peak only, several to a line -->
      <div v-if="!detailed" class="flex flex-wrap gap-2">
        <RouterLink
          v-for="season in group.seasons"
          :key="season.seasonId"
          :to="`/tournaments/${season.seasonId}`"
          class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 transition-colors border border-transparent"
          :class="{ 'border-amber-400/40': season.seasonId === group.recordSeasonId }"
          data-test="career-chip"
        >
          <i
            v-if="peakTier(season)"
            :class="[tierIcon(peakTier(season)!), tierTextClass(peakTier(season)!)]"
            class="text-sm shrink-0"
            :title="tierName(peakTier(season))"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-black text-white tabular-nums leading-tight">
                {{ season.peakMmr.toLocaleString('fr-FR') }}
              </span>
              <i
                v-if="season.seasonId === group.recordSeasonId"
                class="fa fa-trophy text-[10px] text-amber-400"
                :title="t('playerRankedCareer.recordTooltip')"
                data-test="career-record"
              />
            </div>
            <div class="text-[11px] text-gray-500 truncate leading-tight" :title="season.seasonName">
              {{ season.seasonName }}
            </div>
          </div>
        </RouterLink>
      </div>

      <!-- Detailed: the full per-season breakdown -->
      <template v-else>
        <div
          v-for="season in group.seasons"
          :key="season.seasonId"
          class="rounded-xl p-3 bg-gray-800 border border-transparent"
          :class="{ 'border-amber-400/40': season.seasonId === group.recordSeasonId }"
          data-test="career-season"
        >
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <RouterLink
              :to="`/tournaments/${season.seasonId}`"
              class="font-bold text-sm text-white truncate hover:underline"
            >
              {{ season.seasonName }}
            </RouterLink>
            <span class="text-xs text-gray-500 shrink-0">
              {{ formatDate(season.startDate) }} → {{ formatDate(season.endDate) }}
            </span>
            <span
              v-if="season.seasonId === group.recordSeasonId"
              class="text-xs font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-400/10 shrink-0"
              :title="t('playerRankedCareer.recordTooltip')"
              data-test="career-record"
            >
              <i class="fa fa-trophy mr-1" />{{ t('playerRankedCareer.record') }}
            </span>
            <span
              v-if="season.seasonStatus !== 'finished'"
              class="text-xs font-bold text-green-400 px-1.5 py-0.5 rounded bg-green-400/10 shrink-0"
            >
              {{ t('playerRankedCareer.ongoing') }}
            </span>
            <span
              v-if="!season.placementsComplete"
              class="text-xs text-gray-400 px-1.5 py-0.5 rounded bg-gray-700 shrink-0"
              data-test="career-provisional"
            >
              {{ t('playerRankedCareer.provisional') }}
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              v-for="metric in metricsFor(season)"
              :key="metric.key"
              class="rounded-lg p-2 text-center bg-gray-900/50"
            >
              <div class="flex items-center justify-center gap-1.5">
                <i
                  v-if="metric.tier"
                  :class="[tierIcon(metric.tier), tierTextClass(metric.tier)]"
                  class="text-sm"
                  :title="tierName(metric.tier)"
                />
                <span class="text-base font-black text-white tabular-nums">
                  {{ metric.value.toLocaleString('fr-FR') }}
                </span>
              </div>
              <div class="text-xs text-gray-400 mt-0.5">{{ metric.label }}</div>
            </div>

            <div class="rounded-lg p-2 text-center bg-gray-900/50">
              <div class="text-base font-black text-white tabular-nums">
                {{ season.matchesPlayed }}
              </div>
              <div class="text-xs text-gray-400 mt-0.5">
                {{ t('playerRankedCareer.matches') }}
                <span class="text-gray-500">· {{ record(season) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <div v-else class="text-center py-8 text-gray-500 text-sm" data-test="ranked-career-empty">
    <i class="fa fa-chart-line text-3xl mb-3 block opacity-30" />
    {{ t('playerRankedCareer.empty') }}
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { ClientRankTier, PlayerCareerSeason } from '@skol-arena/shared/types/index'
import { careerPeak, groupCareerByDiscipline } from '@/composables/ranked/career'
import { getTierForMmr } from '@/composables/ranked/tier-math'
import { TIER_TEXT_CLASS, getTierIconClass, tierStyleIdx } from '@/composables/ranked/tier-style'
import { formatDate } from '@/utils/DateUtils'
import { useServerLabels } from '@/i18n/serverLabels'

/**
 * A player's ranked history, grouped by discipline.
 *
 * Compact by default — one chip per season carrying the peak alone, so several
 * seasons fit on a line and the card stays a summary. The full per-season
 * breakdown is one click away for whoever actually wants it.
 *
 * Every figure is read against the ladder of its own season: `rank_tiers` is per
 * season and its thresholds move, so resolving a past peak on today's ladder would
 * rewrite what the player actually held at the time.
 */
const props = defineProps<{
  seasons: PlayerCareerSeason[]
  loading?: boolean
}>()

const { t } = useI18n()
const { tierName } = useServerLabels()

const detailed = ref(false)

const groups = computed(() =>
  groupCareerByDiscipline(props.seasons).map((group) => ({
    ...group,
    // The season that set the discipline's all-time record — ties go to the oldest.
    recordSeasonId: careerPeak(group.seasons, null)?.seasonId ?? null,
    totals: totalsFor(group.seasons),
  })),
)

function totalsFor(seasons: PlayerCareerSeason[]) {
  const sum = (pick: (s: PlayerCareerSeason) => number) =>
    seasons.reduce((total, season) => total + pick(season), 0)
  const matches = sum((s) => s.matchesPlayed)
  const wins = sum((s) => s.wins)
  return {
    matches,
    wins,
    draws: sum((s) => s.draws),
    losses: sum((s) => s.losses),
    winRate: matches > 0 ? Math.round((wins / matches) * 100) : 0,
  }
}

type SeasonMetric = {
  key: 'peak' | 'average' | 'final'
  label: string
  value: number
  tier: ClientRankTier | null
}

function metricsFor(season: PlayerCareerSeason): SeasonMetric[] {
  return [
    { key: 'peak', label: t('playerRankedCareer.peak'), value: season.peakMmr },
    { key: 'average', label: t('playerRankedCareer.average'), value: season.avgMmr },
    { key: 'final', label: t('playerRankedCareer.final'), value: season.finalMmr },
  ].map((metric) => ({
    ...metric,
    tier: getTierForMmr(metric.value, season.tiers),
  })) as SeasonMetric[]
}

function peakTier(season: PlayerCareerSeason): ClientRankTier | null {
  return getTierForMmr(season.peakMmr, season.tiers)
}

function record(season: PlayerCareerSeason): string {
  const parts = [
    `${season.wins}${t('playerRankedCareer.winsShort')}`,
    `${season.losses}${t('playerRankedCareer.lossesShort')}`,
  ]
  // Draws only surface where the discipline allows them.
  if (season.draws > 0) {
    parts.splice(1, 0, `${season.draws}${t('playerRankedCareer.drawsShort')}`)
  }
  return parts.join(' ')
}

const tierIcon = (tier: ClientRankTier) => getTierIconClass(tier)
const tierTextClass = (tier: ClientRankTier) =>
  TIER_TEXT_CLASS[tierStyleIdx(tier)] ?? 'text-gray-400'
</script>
