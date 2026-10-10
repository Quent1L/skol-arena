<template>
  <!-- Mobile: the views sit side by side in a draggable track. -->
  <SubTabTrack
    v-if="isMobile && modeOptions.length > 1"
    :options="modeOptions"
    :model-value="mode"
    :label="t('rankedLeaderboard.modeLabel')"
    @update:model-value="setMode"
    @visible-values="prefetchModes"
  >
    <template v-for="option in modeOptions" :key="option.value" #[option.value]>
      <div class="leaderboard mx-auto text-white">
        <LeaderboardTierList v-bind="listPropsFor(option.value)" />
      </div>
    </template>
  </SubTabTrack>

  <!-- Desktop: a sidebar picks the view, only the active one is rendered. -->
  <div v-else-if="modeOptions.length > 1" class="flex justify-center gap-6">
    <SubTabSidebar
      :options="modeOptions"
      :model-value="mode"
      :label="t('rankedLeaderboard.modeLabel')"
      @update:model-value="setMode"
    />
    <!-- `w-full`, and no auto margin: the list keeps its own width and the group is
         centred as a whole, instead of the list eating the free space on its own and
         pinning the sidebar to the edge of the page. -->
    <div class="leaderboard w-full min-w-0 text-white">
      <LeaderboardTierList v-bind="listPropsFor(mode)" />
    </div>
  </div>

  <!-- A single view needs no switcher at all. It carries the padding the track puts on
       each of its panes, so both forms sit the same distance from the screen edge. -->
  <!-- `w-full`: the parent can be a flex column, where an auto margin would otherwise
       shrink the list to its content instead of letting it reach its max width. -->
  <div v-else class="leaderboard w-full mx-auto text-white" :class="{ 'p-2': isMobile }">
    <LeaderboardTierList v-bind="listPropsFor(mode)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ClientPlayerMmr,
  ClientSeasonMmrPlayer,
  ClientRankTier,
} from '@skol-arena/shared/types/index'
import { sortBySeasonMetric } from '@/composables/ranked/ranked.service'
import { useSubTabs } from '@/composables/ui/useSubTabs'
import { useViewport } from '@/composables/useViewport'
import SubTabSidebar from '@/components/ui/SubTabSidebar.vue'
import SubTabTrack from '@/components/ui/SubTabTrack.vue'
import LeaderboardTierList from '@/components/ranked/LeaderboardTierList.vue'

const { t } = useI18n()
const { isMobile } = useViewport()

type LeaderboardMode = 'official' | 'provisional' | 'peak' | 'average'

const props = defineProps<{
  players: ClientPlayerMmr[]
  provisionalPlayers?: ClientPlayerMmr[]
  seasonMmrPlayers?: ClientSeasonMmrPlayer[]
  tiers: ClientRankTier[]
  loading?: boolean
  provisionalLoading?: boolean
  seasonMmrLoading?: boolean
  isRecalculating?: boolean
  currentUserId?: string
  showModeToggle?: boolean
  showSeasonStats?: boolean
  tournamentId?: string
  /** Matches needed to be ranked; players below it are listed apart. */
  placementMatches?: number
}>()

const emit = defineEmits<{
  'load-provisional': []
  'load-season-stats': []
}>()

// Season-wide rankings only exist once the season is over, so the switcher is driven by
// the option list itself rather than by `showModeToggle` alone: a finished season with
// validation disabled still has three views to switch between.
const modeOptions = computed(() => {
  // A finished season has nothing left to validate: the provisional view would only
  // ever repeat the official one.
  const provisional =
    props.showModeToggle === false || props.showSeasonStats
      ? []
      : [{ label: t('rankedLeaderboard.modeProvisional'), value: 'provisional' as const }]
  const seasonStats = props.showSeasonStats
    ? [
        { label: t('rankedLeaderboard.modePeak'), value: 'peak' as const },
        { label: t('rankedLeaderboard.modeAverage'), value: 'average' as const },
      ]
    : []
  return [
    { label: t('rankedLeaderboard.modeOfficial'), value: 'official' as const },
    ...provisional,
    ...seasonStats,
  ]
})

const { active: mode, setActive: setMode } = useSubTabs<LeaderboardMode>({
  options: modeOptions,
  queryKey: 'lbMode',
  defaultValue: 'official',
})

function playersFor(value: LeaderboardMode): ClientPlayerMmr[] {
  if (value === 'peak' || value === 'average') {
    return sortBySeasonMetric(props.seasonMmrPlayers ?? [], value === 'peak' ? 'peak' : 'average')
  }
  return value === 'provisional' ? (props.provisionalPlayers ?? []) : props.players
}

function loadingFor(value: LeaderboardMode): boolean | undefined {
  if (value === 'peak' || value === 'average') return props.seasonMmrLoading
  return value === 'provisional' ? props.provisionalLoading : props.loading
}

function metricFor(value: LeaderboardMode): 'current' | 'peak' | 'average' {
  if (value === 'peak') return 'peak'
  if (value === 'average') return 'average'
  return 'current'
}

function listPropsFor(value: LeaderboardMode) {
  return {
    players: playersFor(value),
    tiers: props.tiers,
    metric: metricFor(value),
    currentUserId: props.currentUserId,
    tournamentId: props.tournamentId,
    loading: loadingFor(value),
    isRecalculating: props.isRecalculating,
    placementMatches: props.placementMatches,
  }
}

const provisionalLoaded = ref(false)
const seasonStatsLoaded = ref(false)

/** Each extra dataset is fetched once, the first time a view needing it is rendered. */
function ensureModeData(value: LeaderboardMode) {
  if (value === 'provisional' && !provisionalLoaded.value) {
    provisionalLoaded.value = true
    emit('load-provisional')
  }
  if ((value === 'peak' || value === 'average') && !seasonStatsLoaded.value) {
    seasonStatsLoaded.value = true
    emit('load-season-stats')
  }
}

/** Mobile mounts the neighbouring views too: they must not be empty mid-drag. */
function prefetchModes(values: string[]) {
  values.forEach((value) => ensureModeData(value as LeaderboardMode))
}

// Immediate, because the view can be restored from the URL rather than picked here.
watch(mode, ensureModeData, { immediate: true })
</script>

<style scoped>
.leaderboard {
  max-width: 640px;
}
</style>
