<template>
  <div class="player-mmr-profile space-y-3">
    <!-- Main rank card -->
    <div class="rounded-2xl overflow-hidden" :class="cardBgClass">
      <!-- Top: icon + rank -->
      <div class="flex flex-col items-center pt-8 pb-4 px-6">
        <div
          class="w-20 h-20 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
          :class="iconBgClass"
        >
          <i :class="tierIcon" class="text-white text-3xl" />
        </div>
        <div class="text-xs font-bold tracking-widest uppercase text-white/50 mb-1">
          {{ t('playerMmrProfile.currentRank') }}
        </div>
        <div class="text-2xl font-black tracking-wide uppercase" :class="tierTextClass">
          {{ tierName(rank) }}
        </div>
      </div>

      <!-- MMR + position -->
      <div class="text-center pb-4 px-6">
        <div class="text-5xl font-black text-white tabular-nums">
          {{ mmr.currentMmr.toLocaleString('fr-FR') }}
        </div>
        <div class="text-xs uppercase tracking-widest text-white/40 mt-1">
          {{ t('playerMmrProfile.mmrLabel') }}
        </div>
        <div class="flex items-center justify-center gap-3 mt-3">
          <!-- Unranked until the placement matches are done: says so, rather than
               leaving the missing position unexplained. -->
          <div
            v-if="placementRemaining > 0"
            class="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-sm font-bold text-white/70"
          >
            <i class="fa fa-hourglass-half text-xs" />
            {{
              t('playerMmrProfile.placementProgress', {
                played: mmr.matchesPlayed,
                total: props.placementMatches,
              })
            }}
          </div>
          <div
            v-else-if="leaderboardRank"
            class="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-sm font-bold text-white"
          >
            <i class="fa fa-trophy text-amber-400 text-xs" />
            #{{ leaderboardRank }}
          </div>
          <div
            v-if="mmrDelta !== null"
            class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold"
            :class="mmrDelta >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'"
          >
            {{ mmrDelta > 0 ? '+' : '' }}{{ mmrDelta }}
          </div>
        </div>
      </div>

      <!-- LP progress bar toward next tier -->
      <div v-if="lpProgress" class="px-6 pb-6">
        <div class="flex justify-between text-xs text-white/40 mb-1.5">
          <span class="font-semibold" :class="tierTextClass">{{ tierName(rank) }}</span>
          <span>{{ lpProgress.lp }} / {{ lpProgress.tierRange }} LP</span>
          <span class="font-semibold" :class="nextTierTextClass">{{ lpProgress.nextLabel }}</span>
        </div>
        <div class="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="progressBarClass"
            :style="{ width: `${lpProgress.percent}%` }"
          />
        </div>
      </div>
    </div>

    <!-- Stats row -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl p-3 text-center bg-gray-800">
        <div class="text-xl font-black text-white">{{ mmr.matchesPlayed }}</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ t('playerMmrProfile.matchesLabel') }}</div>
      </div>
      <div class="rounded-xl p-3 text-center bg-gray-800">
        <div class="text-xl font-black text-white">{{ winrate }}%</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ t('playerMmrProfile.winrateLabel') }}</div>
      </div>
      <div class="rounded-xl p-3 text-center bg-gray-800">
        <div
          class="text-xl font-black"
          :class="
            mmr.winStreak > 1
              ? 'text-orange-400'
              : mmr.lossStreak > 1
                ? 'text-blue-400'
                : 'text-gray-500'
          "
        >
          {{
            mmr.winStreak > 1
              ? `🔥 ${mmr.winStreak}`
              : mmr.lossStreak > 1
                ? `💀 ${mmr.lossStreak}`
                : '—'
          }}
        </div>
        <div class="text-xs text-gray-400 mt-0.5">{{ t('playerMmrProfile.currentStreak') }}</div>
      </div>
      <!-- Wider labels than the tiles above, so they get half the row each -->
      <div class="col-span-3 grid grid-cols-2 gap-3">
        <div
          class="rounded-xl p-3 text-center bg-gray-800 flex flex-col justify-center"
          data-test="peak-tile"
        >
          <div class="flex items-center justify-center gap-2">
            <i
              v-if="peakTier"
              :class="[peakTierIcon, peakTierTextClass]"
              class="text-lg"
              :title="tierName(peakTier)"
            />
            <span class="text-xl font-black text-white tabular-nums">
              {{ peakMmr !== null ? peakMmr.toLocaleString('fr-FR') : '—' }}
            </span>
          </div>
          <div class="text-xs text-gray-400 mt-0.5">{{ t('playerMmrProfile.peakLabel') }}</div>
          <div
            v-if="careerPeak"
            class="text-xs text-gray-500 truncate"
            :title="careerPeak.seasonName"
            data-test="peak-season"
          >
            {{ t('playerMmrProfile.peakInSeason', { season: careerPeak.seasonName }) }}
          </div>
        </div>
        <div
          class="rounded-xl p-3 text-center bg-gray-800 flex flex-col justify-center"
          data-test="weekly-tile"
        >
          <div
            class="text-xl font-black tabular-nums"
            :class="
              weekly.matchesPlayed === 0
                ? 'text-gray-500'
                : weekly.mmrGained >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
            "
          >
            {{
              weekly.matchesPlayed === 0
                ? '—'
                : `${weekly.mmrGained > 0 ? '+' : ''}${weekly.mmrGained}`
            }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">
            {{ t('playerMmrProfile.weeklyMmrLabel') }}
          </div>
          <div v-if="weekly.matchesPlayed > 0" class="text-xs text-gray-500">
            {{ t('playerMmrProfile.weeklyMmrMatches', weekly.matchesPlayed) }}
          </div>
        </div>
      </div>
    </div>

    <!-- W/L + max streaks -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div class="col-span-2 sm:col-span-1 rounded-xl p-4 bg-gray-800">
        <div
          class="text-xs font-bold text-gray-400 normal-case sm:uppercase tracking-normal sm:tracking-wide mb-2"
        >
          {{ showDraws ? t('playerMmrProfile.winsDrawsLosses') : t('playerMmrProfile.winsLosses') }}
        </div>
        <div class="text-2xl font-black">
          <span class="text-green-400">{{ mmr.wins }}{{ t('playerMmrProfile.winsShort') }}</span>
          <template v-if="showDraws">
            <span class="text-gray-600 mx-1">/</span>
            <span class="text-yellow-400"
              >{{ mmr.draws }}{{ t('playerMmrProfile.drawsShort') }}</span
            >
          </template>
          <span class="text-gray-600 mx-1">/</span>
          <span class="text-red-400">{{ mmr.losses }}{{ t('playerMmrProfile.lossesShort') }}</span>
        </div>
      </div>
      <div class="rounded-xl p-4 bg-gray-800">
        <div
          class="text-xs font-bold text-gray-400 normal-case sm:uppercase tracking-normal sm:tracking-wide mb-2"
        >
          {{ t('playerMmrProfile.bestStreak') }}
        </div>
        <div class="text-2xl font-black text-orange-400">
          {{ mmr.maxWinStreak > 0 ? `🔥 ${mmr.maxWinStreak}` : '—' }}
        </div>
      </div>
      <div class="rounded-xl p-4 bg-gray-800">
        <div
          class="text-xs font-bold text-gray-400 normal-case sm:uppercase tracking-normal sm:tracking-wide mb-2"
        >
          {{ t('playerMmrProfile.worstStreak') }}
        </div>
        <div class="text-2xl font-black text-blue-400">
          {{ mmr.maxLossStreak > 0 ? `💀 ${mmr.maxLossStreak}` : '—' }}
        </div>
      </div>
    </div>

    <!-- Recent form -->
    <RecentFormSection v-if="recentForm?.length" :results="recentForm" />

    <!-- MMR Progression Chart -->
    <div v-if="isMounted && allChartPoints.length > 1" class="rounded-xl p-4 bg-gray-800">
      <div class="flex items-center justify-between mb-3 gap-2">
        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide">
          {{ t('playerMmrProfile.mmrProgression') }}
        </div>
        <SelectButton
          v-if="matchCountFilterOptions.length > 1"
          v-model="matchCountFilter"
          :options="matchCountFilterOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
        />
      </div>
      <Chart type="line" :data="chartData" :options="chartOptions" class="h-40" />
    </div>

    <!-- Outcome type distribution -->
    <div v-if="outcomeTypeStats?.length" class="rounded-xl p-4 bg-gray-800">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
        {{ t('playerMmrProfile.outcomeDistribution') }}
      </div>
      <MatchOutcomeDistribution
        :items="
          outcomeTypeStats.map((s) => ({
            label: s.outcomeTypeName,
            count: s.matchesPlayed,
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
          }))
        "
      />
    </div>

    <!-- Opponent quality -->
    <div v-if="opponentQuality" class="rounded-xl p-4 bg-gray-800">
      <div
        class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"
      >
        {{ t('playerMmrProfile.winrateByOpponentLevel') }}
        <InfoTooltip :text="t('playerMmrProfile.opponentLevelTooltip')" html />
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-lg bg-gray-700/50 p-2">
          <div class="text-xs text-gray-400 mb-1">{{ t('playerMmrProfile.vsStronger') }}</div>
          <div
            class="text-sm font-black"
            :class="opponentQuality.vsStronger.matchesPlayed > 0 ? 'text-white' : 'text-gray-600'"
          >
            {{
              opponentQuality.vsStronger.matchesPlayed > 0
                ? `${opponentQuality.vsStronger.winRate}%`
                : '—'
            }}
          </div>
          <div class="text-[10px] text-gray-500">
            {{ opponentQuality.vsStronger.matchesPlayed }} {{ t('playerMmrProfile.matchesCount') }}
          </div>
        </div>
        <div class="rounded-lg bg-gray-700/50 p-2">
          <div class="text-xs text-gray-400 mb-1">{{ t('playerMmrProfile.vsEqual') }}</div>
          <div
            class="text-sm font-black"
            :class="opponentQuality.vsEqual.matchesPlayed > 0 ? 'text-white' : 'text-gray-600'"
          >
            {{
              opponentQuality.vsEqual.matchesPlayed > 0
                ? `${opponentQuality.vsEqual.winRate}%`
                : '—'
            }}
          </div>
          <div class="text-[10px] text-gray-500">
            {{ opponentQuality.vsEqual.matchesPlayed }} {{ t('playerMmrProfile.matchesCount') }}
          </div>
        </div>
        <div class="rounded-lg bg-gray-700/50 p-2">
          <div class="text-xs text-gray-400 mb-1">{{ t('playerMmrProfile.vsWeaker') }}</div>
          <div
            class="text-sm font-black"
            :class="opponentQuality.vsWeaker.matchesPlayed > 0 ? 'text-white' : 'text-gray-600'"
          >
            {{
              opponentQuality.vsWeaker.matchesPlayed > 0
                ? `${opponentQuality.vsWeaker.winRate}%`
                : '—'
            }}
          </div>
          <div class="text-[10px] text-gray-500">
            {{ opponentQuality.vsWeaker.matchesPlayed }} {{ t('playerMmrProfile.matchesCount') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Partner / nemesis stats -->
    <PlayerRelationStats
      :most-frequent-partners="mostFrequentPartners"
      :best-partners="bestPartners"
      :nemeses="nemeses"
      :tournament-id="seasonId"
    />

    <!-- Earned badges -->
    <PlayerBadges :player-id="mmr.playerId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Chart from 'primevue/chart'
import SelectButton from 'primevue/selectbutton'
import type {
  ClientPlayerMmr,
  MmrChartPoint,
  ClientRankTier,
  PlayerRelationStat,
  OpponentQualityStats,
  PlayerOutcomeTypeStat,
} from '@skol-arena/shared/types/index'
import { useServerLabels } from '@/i18n/serverLabels'
import InfoTooltip from '@/components/InfoTooltip.vue'
import PlayerRelationStats from '@/components/player/PlayerRelationStats.vue'
import PlayerBadges from '@/components/player/PlayerBadges.vue'
import RecentFormSection from '@/components/player/RecentFormSection.vue'
import MatchOutcomeDistribution from '@/components/stats/MatchOutcomeDistribution.vue'
import {
  getLp,
  isTopTier,
  TIER_SIZE,
  getTierForMmr,
  getNextTier,
  getPeakMmr,
  getWeeklyMmrGain,
  getCurrentWeekStart,
} from '@/composables/ranked/ranked.service'
import type { CareerPeak } from '@/composables/ranked/career'
import {
  getTierIconClass,
  TIER_TEXT_CLASS as TIER_TEXT,
  TIER_ICON_BG_CLASS as ICON_BG,
  TIER_CARD_BG_CLASS as CARD_BG,
  TIER_PROGRESS_BAR_CLASS as PROGRESS_BAR,
  tierStyleIdx as styleIdx,
} from '@/composables/ranked/tier-style'

const { t } = useI18n()
const { tierName } = useServerLabels()

const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})
onBeforeUnmount(() => {
  isMounted.value = false
})

const props = defineProps<{
  mmr: ClientPlayerMmr
  tiers: ClientRankTier[]
  initialMmr?: number
  leaderboardRank?: number
  history?: MmrChartPoint[]
  seasonId?: string
  mostFrequentPartners?: PlayerRelationStat[]
  bestPartners?: PlayerRelationStat[]
  nemeses?: PlayerRelationStat[]
  opponentQuality?: OpponentQualityStats
  recentForm?: Array<'V' | 'D' | 'N'>
  outcomeTypeStats?: PlayerOutcomeTypeStat[]
  allowDraw?: boolean
  /** Matches needed to be ranked; below it the player holds no position. */
  placementMatches?: number
  /**
   * All-time record in this discipline, seasons included. Optional: without it the
   * tile falls back to the peak of the season being shown, so the component stays
   * usable on its own.
   */
  careerPeak?: CareerPeak | null
}>()

const placementRemaining = computed(() =>
  Math.max(0, (props.placementMatches ?? 0) - props.mmr.matchesPlayed),
)

const showDraws = computed(() => props.allowDraw === true || props.mmr.draws > 0)

const rank = computed(() => getTierForMmr(props.mmr.currentMmr, props.tiers))

// The all-time record when the caller resolved one, the season's own peak otherwise.
const peakMmr = computed(() => {
  if (props.careerPeak) return props.careerPeak.mmr
  const peak = getPeakMmr(props.history ?? [])
  // No history yet: the current MMR is, by definition, the highest reached.
  return peak ?? (props.mmr.matchesPlayed > 0 ? props.mmr.currentMmr : null)
})

// A past record is read on the ladder of the season that set it — `careerPeak`
// carries that tier. Only the in-season fallback resolves against today's ladder.
const peakTier = computed(() => {
  if (props.careerPeak) return props.careerPeak.tier
  return peakMmr.value === null ? null : getTierForMmr(peakMmr.value, props.tiers)
})

const peakTierTextClass = computed(() => TIER_TEXT[styleIdx(peakTier.value)])

const peakTierIcon = computed(() => getTierIconClass(peakTier.value))

const weekly = computed(() => getWeeklyMmrGain(props.history ?? [], getCurrentWeekStart()))

const mmrDelta = computed(() => {
  if (props.initialMmr === undefined) return null
  return props.mmr.currentMmr - props.initialMmr
})

// Same rate as every other stat screen: wins over every match played, draws included.
const winrate = computed(() => {
  const total = props.mmr.matchesPlayed
  if (total === 0) return 0
  return Math.round((props.mmr.wins / total) * 100)
})

const lpProgress = computed(() => {
  if (!props.tiers.length || !rank.value) return null
  if (isTopTier(rank.value, props.tiers)) return null
  const mmrVal = props.mmr.currentMmr
  const nextTier = getNextTier(rank.value, props.tiers)
  const lp = getLp(mmrVal, rank.value)
  const tierRange = nextTier ? nextTier.minMmr - rank.value.minMmr : TIER_SIZE
  const percent = Math.min(100, Math.round((lp / tierRange) * 100))
  return {
    lp,
    tierRange,
    percent,
    nextLabel: nextTier ? tierName(nextTier) : '',
    nextTierForStyle: nextTier ?? rank.value,
  }
})

const cardBgClass = computed(() => CARD_BG[styleIdx(rank.value)])
const iconBgClass = computed(() => ICON_BG[styleIdx(rank.value)])
const tierTextClass = computed(() => TIER_TEXT[styleIdx(rank.value)])
const nextTierTextClass = computed(() => (lpProgress.value ? TIER_TEXT[styleIdx(rank.value)] : ''))
const progressBarClass = computed(() =>
  lpProgress.value ? PROGRESS_BAR[styleIdx(rank.value)] : '',
)
const tierIcon = computed(() => getTierIconClass(rank.value))

const allChartPoints = computed(() => props.history ?? [])

const matchCountFilterOptions = computed(() => {
  const total = allChartPoints.value.length
  const opts: { label: string; value: number | 'all' }[] = []
  if (total > 25) opts.push({ label: '25', value: 25 })
  if (total > 50) opts.push({ label: '50', value: 50 })
  if (total > 100) opts.push({ label: '100', value: 100 })
  opts.push({ label: t('playerMmrProfile.allMatches'), value: 'all' })
  return opts
})

const matchCountFilter = ref<number | 'all'>(50)

const chartPoints = computed(() => {
  if (matchCountFilter.value === 'all') return allChartPoints.value
  return allChartPoints.value.slice(-matchCountFilter.value)
})

const chartStartIndex = computed(() => allChartPoints.value.length - chartPoints.value.length)

const chartData = computed(() => ({
  labels: chartPoints.value.map((_, i) => `M${chartStartIndex.value + i + 1}`),
  datasets: [
    {
      label: t('playerMmrProfile.mmrLabel'),
      data: chartPoints.value.map((e) => e.mmrAfter),
      pointBackgroundColor: chartPoints.value.map((e) => (e.mmrDelta >= 0 ? '#22c55e' : '#ef4444')),
      pointBorderColor: chartPoints.value.map((e) => (e.mmrDelta >= 0 ? '#22c55e' : '#ef4444')),
      pointRadius: 5,
      borderColor: '#6366f1',
      borderWidth: 2,
      fill: true,
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      tension: 0.3,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items: { dataIndex: number }[]) => {
          const entry = chartPoints.value[items[0].dataIndex]
          return new Date(entry.playedAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          })
        },
        label: (item: { dataIndex: number }) => {
          const entry = chartPoints.value[item.dataIndex]
          const d = entry.mmrDelta
          return `${entry.mmrAfter} MMR (${d > 0 ? '+' : ''}${d})`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.08)' },
      ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.08)' },
      ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
    },
  },
}))
</script>
