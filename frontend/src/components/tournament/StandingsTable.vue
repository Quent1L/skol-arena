<template>
  <div class="standings-table flex flex-col text-white">
    <!-- Mobile: the views sit side by side in a draggable track, as on a ranked season. -->
    <SubTabTrack
      v-if="isMobile && modeOptions.length > 1"
      class="flex-1"
      :options="modeOptions"
      :model-value="mode"
      :label="t('rankedLeaderboard.modeLabel')"
      @update:model-value="setMode"
      @visible-values="prefetchModes"
    >
      <template v-for="option in modeOptions" :key="option.value" #[option.value]>
        <div class="leaderboard mx-auto">
          <StandingsList v-bind="listPropsFor(option.value)" @show-info="infoVisible = true" />
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
      <div class="leaderboard w-full min-w-0">
        <StandingsList v-bind="listPropsFor(mode)" @show-info="infoVisible = true" />
      </div>
    </div>

    <!-- Without match validation there is only the official view: no switcher. -->
    <!-- `w-full`: in this flex column an auto margin would shrink the list to its content. -->
    <div v-else class="leaderboard w-full mx-auto" :class="{ 'p-2': isMobile }">
      <StandingsList v-bind="listPropsFor('official')" @show-info="infoVisible = true" />
    </div>

    <UModal
      v-model:open="infoVisible"
      :title="t('standingsTable.howRankingTooltip')"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
      <div class="space-y-5 text-sm text-gray-700 dark:text-gray-300">
        <section>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">{{ t('standingsTable.pointsAwarded') }}</h3>
          <ul class="space-y-1">
            <li class="flex justify-between">
              <span>{{ t('standingsTable.win') }}</span>
              <span class="font-medium text-green-600 dark:text-green-400"
                >{{ tournamentConfig?.pointPerVictory ?? SCORING_DEFAULTS.pointPerVictory }} {{ t('standingsTable.ptsUnit') }}</span
              >
            </li>
            <li v-if="allowDraw" class="flex justify-between">
              <span>{{ t('standingsTable.draw') }}</span>
              <span class="font-medium text-gray-600 dark:text-gray-400"
                >{{ tournamentConfig?.pointPerDraw ?? SCORING_DEFAULTS.pointPerDraw }} {{ t('standingsTable.ptsUnit') }}</span
              >
            </li>
            <li class="flex justify-between">
              <span>{{ t('standingsTable.loss') }}</span>
              <span class="font-medium text-red-600 dark:text-red-400"
                >{{ tournamentConfig?.pointPerLoss ?? SCORING_DEFAULTS.pointPerLoss }} {{ t('standingsTable.ptsUnit') }}</span
              >
            </li>
          </ul>
        </section>

        <section>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">{{ t('standingsTable.rankingCriteria') }}</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {{ t('standingsTable.rankingCriteriaSubtitle') }}
          </p>
          <ol class="space-y-1.5 list-decimal list-inside">
            <li>{{ t('standingsTable.criteriaPoints') }}</li>
            <li>{{ t('standingsTable.criteriaWins') }}</li>
            <li v-if="allowDraw">{{ t('standingsTable.criteriaWinLossRatio') }}</li>
            <li>
              {{ t('standingsTable.buchholzDesc') }}
              <div class="text-xs text-gray-500 dark:text-gray-400 ml-4">
                {{ t('standingsTable.buchholzExplanationLine1') }}<br />
                {{ t('standingsTable.buchholzExplanationLine2') }}
              </div>
            </li>
            <li>
              {{
                teamMode === 'flex'
                  ? t('standingsTable.directConfrontationsPlayers')
                  : t('standingsTable.directConfrontationsTeams')
              }}
            </li>
            <li>
              <span>{{ t('standingsTable.victoryQualityLabel') }}</span>
              <div class="mt-1 ml-4 space-y-0.5">
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {{ t('standingsTable.victoryQualityDesc') }}
                </p>
                <template v-if="outcomeTypes.length > 0">
                  <ul class="text-xs space-y-0.5">
                    <li v-for="ot in outcomeTypes" :key="ot.id" class="flex justify-between gap-4">
                      <span class="text-gray-600 dark:text-gray-400">{{ ot.name }}</span>
                      <span class="font-medium">{{ ot.points }} {{ t('standingsTable.ptUnit') }}</span>
                    </li>
                  </ul>
                </template>
                <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                  {{ t('standingsTable.defaultPoints') }}
                </p>
              </div>
            </li>
            <li>{{ t('standingsTable.winRateCriteria') }}</li>
          </ol>
        </section>

        <section>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">
            {{ t('standingsTable.officialVsProvisional') }}
          </h3>
          <ul class="space-y-1 text-xs">
            <li><span>{{ t('standingsTable.official') }}</span> — {{ t('standingsTable.officialDesc') }}</li>
            <li><span>{{ t('standingsTable.provisional') }}</span> — {{ t('standingsTable.provisionalDesc') }}</li>
          </ul>
        </section>
      </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StandingsList from '@/components/tournament/standings/StandingsList.vue'
import SubTabSidebar from '@/components/ui/SubTabSidebar.vue'
import SubTabTrack from '@/components/ui/SubTabTrack.vue'
import { useStandingsService } from '@/composables/standings.service'
import { useSubTabs } from '@/composables/ui/useSubTabs'
import { outcomeTypeApi } from '@/composables/outcome-type.api'
import { SCORING_DEFAULTS, type OutcomeType } from '@skol-arena/shared'
import { useViewport } from '@/composables/useViewport.ts'
import type { StandingsTournamentConfig } from '@/utils/standings-config'

type StandingsMode = 'official' | 'provisional'

interface Props {
  tournamentId: string
  allowDraw?: boolean
  scoreEnabled?: boolean
  teamMode?: 'static' | 'flex'
  tournamentConfig?: StandingsTournamentConfig
  /** False when matches need no validation: every result is official at once. */
  showProvisionalToggle?: boolean
  currentUserId?: string
}

const props = withDefaults(defineProps<Props>(), {
  allowDraw: true,
  scoreEnabled: true,
  teamMode: 'flex',
})

const { t } = useI18n()
const { isMobile } = useViewport()

const infoVisible = ref(false)
const outcomeTypes = ref<OutcomeType[]>([])

watch(infoVisible, async (visible) => {
  if (visible && outcomeTypes.value.length === 0 && props.tournamentConfig?.disciplineId) {
    outcomeTypes.value = await outcomeTypeApi.list(props.tournamentConfig.disciplineId)
  }
})

const modeOptions = computed(() => [
  { label: t('standingsTable.official'), value: 'official' as const },
  ...(props.showProvisionalToggle
    ? [{ label: t('standingsTable.provisional'), value: 'provisional' as const }]
    : []),
])

const { active: mode, setActive: setMode } = useSubTabs<StandingsMode>({
  options: modeOptions,
  queryKey: 'lbMode',
  defaultValue: 'official',
})

// One dataset per view: on mobile both panes are mounted side by side.
const sources = {
  official: useStandingsService(),
  provisional: useStandingsService(),
}
const loaded = new Set<StandingsMode>()

/** Each view is fetched once, the first time it is rendered. */
function ensureModeData(value: StandingsMode) {
  if (loaded.has(value)) return
  loaded.add(value)
  const load =
    value === 'official'
      ? sources.official.loadOfficialStandings
      : sources.provisional.loadProvisionalStandings
  // The service already turns a failure into the `error` the list displays.
  load(props.tournamentId).catch(() => {})
}

/** Mobile mounts the neighbouring view too: it must not be empty mid-drag. */
function prefetchModes(values: string[]) {
  values.forEach((value) => ensureModeData(value as StandingsMode))
}

// Immediate, because the view can be restored from the URL rather than picked here.
watch(mode, ensureModeData, { immediate: true })

function listPropsFor(value: StandingsMode) {
  const source = sources[value]
  return {
    entries: source.standings.value,
    loading: source.loading.value,
    error: source.error.value,
    title: t('tournamentDetailView.tabs.standings'),
    tournamentId: props.tournamentId,
    teamMode: props.teamMode,
    allowDraw: props.allowDraw,
    scoreEnabled: props.scoreEnabled,
    currentUserId: props.currentUserId,
  }
}
</script>

<style scoped>
.standings-table {
  width: 100%;
}

.leaderboard {
  max-width: 640px;
}

/* Room for the tiebreaker columns the list adds from `md` up. */
@media (min-width: 768px) {
  .leaderboard {
    max-width: 880px;
  }
}
</style>
