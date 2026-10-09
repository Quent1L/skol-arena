<template>
  <div class="standings-table">
    <div class="mb-4 flex items-center justify-between w-full">
      <div>
        <UTabs
          v-if="props.showProvisionalToggle !== false"
          v-model="standingsType"
          :items="standingsTypeOptions"
          :content="false"
          color="neutral"
          size="sm"
          class="w-full sm:w-auto"
          :ui="{
            list: 'bg-slate-950',
            indicator: 'bg-slate-700',
            trigger: 'data-[state=active]:text-highlighted',
          }"
          data-testid="standings-type"
        />
      </div>
      <div>
        <UTooltip :text="t('standingsTable.howRankingTooltip')" :disabled="isMobile">
          <button
            class="flex items-center gap-2 px-2 py-1 text-gray-400 hover:text-blue-500 transition-colors duration-200 cursor-pointer text-xs"
            :aria-label="t('standingsTable.howRankingTooltip')"
            @click="infoVisible = true"
          >
            <i class="fa fa-circle-question text-sm" />
          </button>
        </UTooltip>
      </div>
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

    <UAlert v-if="error" color="error" variant="subtle" class="mb-4" :title="error" />

    <div
      v-if="standings.length === 0 && !loading"
      class="text-center py-8 text-gray-500 dark:text-gray-400"
    >
      {{ t('standingsTable.noStandings') }}
    </div>

    <div class="standings-container">
      <Transition :name="`standings-slide-${slideDirection}`" mode="out-in">
        <div v-if="standings.length > 0" :key="`standings-${standingsType}`" class="relative">
          <UTable
            :data="standings"
            :columns="columns"
            :loading="loading"
            :ui="{
              root: 'overflow-x-auto',
              thead: '[&>tr]:after:bg-default',
              tbody: 'divide-y-0',
              th: 'px-2 py-2 text-base font-bold text-highlighted whitespace-nowrap',
              td: 'px-2 py-2 text-base whitespace-nowrap text-default',
              tr: 'even:bg-slate-950',
            }"
          >
            <template #rank-cell="{ row }">
              <div class="flex items-center justify-center">
                <i v-if="row.index === 0" class="fa fa-trophy text-yellow-500" :title="t('standingsTable.rankFirst')"></i>
                <i v-if="row.index === 1" class="fa fa-medal text-gray-400" :title="t('standingsTable.rankSecond')"></i>
                <i v-if="row.index === 2" class="fa fa-medal text-orange-600" :title="t('standingsTable.rankThird')"></i>
                <span
                  :class="[
                    'font-semibold',
                    {
                      'text-yellow-500': row.index === 0,
                      'text-gray-400': row.index === 1,
                      'text-orange-600': row.index === 2,
                    },
                  ]"
                >
                  {{ row.index + 1 }}
                </span>
              </div>
            </template>

            <template #name-cell="{ row: { original: data } }">
              <RouterLink
                v-if="teamMode === 'flex'"
                :to="{ path: `/players/${data.id}`, query: { tournamentId: props.tournamentId } }"
                class="inline-flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400 hover:underline"
                :title="data.name"
              >
                <PlayerAvatar
                  :name="data.name"
                  :color-key="data.shortName"
                  :player-id="data.id"
                  size="xs"
                  shape="square"
                />
                <span class="md:hidden">{{ data.shortName }}</span
                ><span class="hidden md:inline">{{ data.name }}</span>
              </RouterLink>
              <div v-else class="font-medium text-gray-900 dark:text-white" :title="data.name">
                <span class="md:hidden">{{ data.shortName }}</span
                ><span class="hidden md:inline">{{ data.name }}</span>
              </div>
            </template>

            <template #points-cell="{ row: { original: data } }">
              <div class="font-semibold text-blue-600 dark:text-blue-400">
                {{ data.points }}
              </div>
            </template>

            <template #wins-cell="{ row: { original: data } }">
              <span class="text-green-600 dark:text-green-400 font-medium">{{ data.wins }}</span>
            </template>

            <template #draws-cell="{ row: { original: data } }">
              <span class="text-gray-600 dark:text-gray-400 font-medium">{{ data.draws }}</span>
            </template>

            <template #losses-cell="{ row: { original: data } }">
              <span class="text-red-600 dark:text-red-400 font-medium">{{ data.losses }}</span>
            </template>

            <template #scoreDiff-cell="{ row: { original: data } }">
              <span
                :class="[
                  'font-medium',
                  {
                    'text-green-600 dark:text-green-400': data.scoreDiff > 0,
                    'text-red-600 dark:text-red-400': data.scoreDiff < 0,
                    'text-gray-600 dark:text-gray-400': data.scoreDiff === 0,
                  },
                ]"
              >
                {{ data.scoreDiff > 0 ? '+' : '' }}{{ data.scoreDiff }}
              </span>
            </template>

            <template #winLossRatio-cell="{ row: { original: data } }">
              <span class="text-gray-600 dark:text-gray-400">{{ formatRatio(data.winLossRatio) }}</span>
            </template>

            <template #buchholzScore-header>
              <span class="flex items-center gap-1">
                {{ t('standingsTable.columnBuchholz') }}
                <UTooltip :text="t('standingsTable.tooltipBuchholz')">
                  <i class="fa fa-circle-question text-xs text-gray-400 cursor-help" />
                </UTooltip>
              </span>
            </template>
            <template #buchholzScore-cell="{ row: { original: data } }">
              <span class="text-gray-600 dark:text-gray-400">{{ data.buchholzScore }}</span>
            </template>

            <template #victoryQuality-header>
              <span class="flex items-center gap-1">
                {{ t('standingsTable.columnVictoryQuality') }}
                <UTooltip :text="t('standingsTable.tooltipVictoryQuality')">
                  <i class="fa fa-circle-question text-xs text-gray-400 cursor-help" />
                </UTooltip>
              </span>
            </template>
            <template #victoryQuality-cell="{ row: { original: data } }">
              <UPopover mode="hover" :open-delay="100">
                <span class="text-gray-600 dark:text-gray-400 cursor-help">{{ Math.round(data.victoryQuality) }}</span>
                <template #content>
                  <QualityBreakdown :entry="data" />
                </template>
              </UPopover>
            </template>

            <template #winRate-cell="{ row: { original: data } }">
              <span class="text-gray-600 dark:text-gray-400">{{ formatPercent(data.winRate) }}</span>
            </template>

            <template #details-cell="{ row: { original: data } }">
              <UPopover>
                <UButton
                  icon="i-fa7-solid:circle-question"
                  variant="ghost"
                  size="sm"
                  class="rounded-full"
                  :aria-label="t('standingsTable.tiebreakerDetails', { name: data.name })"
                />
                <template #content>
                  <TiebreakerDetails :entry="data" :allow-draw="allowDraw" />
                </template>
              </UPopover>
            </template>
          </UTable>
        </div>
      </Transition>
    </div>


  </div>
</template>

<script setup lang="ts">
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import TiebreakerDetails from '@/components/tournament/standings/TiebreakerDetails.vue'
import QualityBreakdown from '@/components/tournament/standings/QualityBreakdown.vue'
import { formatPercent, formatRatio } from '@/components/tournament/standings/standings-format'
import { hiddenBelow } from '@/components/admin/table-columns'
import { useStandingsService } from '@/composables/standings.service'
import { outcomeTypeApi } from '@/composables/outcome-type.api'
import { SCORING_DEFAULTS, type StandingsEntry, type OutcomeType } from '@skol-arena/shared'
import { useViewport } from '@/composables/useViewport.ts'
import type { StandingsTournamentConfig } from '@/utils/standings-config'

interface Props {
  tournamentId: string
  allowDraw?: boolean
  scoreEnabled?: boolean
  teamMode?: 'static' | 'flex'
  standingsType?: 'official' | 'provisional'
  tournamentConfig?: StandingsTournamentConfig
  showProvisionalToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  allowDraw: true,
  scoreEnabled: true,
  teamMode: 'flex',
})

const emit = defineEmits<{
  (e: 'update:standingsType', value: 'official' | 'provisional'): void
}>()

const { t } = useI18n()

const { standings, loading, error, loadOfficialStandings, loadProvisionalStandings } =
  useStandingsService()
const { isMobile } = useViewport()

const internalStandingsType = ref<'official' | 'provisional'>('official')
const slideDirection = ref<'left' | 'right'>('left')
const infoVisible = ref(false)
const outcomeTypes = ref<OutcomeType[]>([])

watch(infoVisible, async (visible) => {
  if (visible && outcomeTypes.value.length === 0 && props.tournamentConfig?.disciplineId) {
    outcomeTypes.value = await outcomeTypeApi.list(props.tournamentConfig.disciplineId)
  }
})

const standingsType = computed({
  get: () => props.standingsType ?? internalStandingsType.value,
  set: (val) => {
    internalStandingsType.value = val
    emit('update:standingsType', val)
  },
})

const standingsTypeOptions = computed(() => [
  { label: t('standingsTable.official'), value: 'official' },
  { label: t('standingsTable.provisional'), value: 'provisional' },
])

const MOBILE_ONLY = { class: { th: 'md:hidden w-12', td: 'md:hidden w-12' } }

/** Cells are rendered by the `#<id>-cell` slots of the template. */
const columns = computed<TableColumn<StandingsEntry>[]>(() => {
  const cols: (TableColumn<StandingsEntry> | false)[] = [
    { id: 'rank', header: '#', meta: { class: { th: 'w-16 text-center', td: 'w-16' } } },
    { accessorKey: 'name', header: t('common.name') },
    { accessorKey: 'points', header: t('standingsTable.columnPoints') },
    { accessorKey: 'matchesPlayed', header: t('standingsTable.columnMatchesPlayed') },
    { accessorKey: 'wins', header: t('standingsTable.columnWins') },
    props.allowDraw && { accessorKey: 'draws', header: t('standingsTable.columnDraws') },
    { accessorKey: 'losses', header: t('standingsTable.columnLosses') },
    props.scoreEnabled && { accessorKey: 'scoreDiff', header: t('standingsTable.columnDiff') },
    props.allowDraw &&
      !isMobile.value && { accessorKey: 'winLossRatio', header: t('standingsTable.columnWinLossRatio') },
    { accessorKey: 'buchholzScore', meta: hiddenBelow('md') },
    { accessorKey: 'victoryQuality', meta: hiddenBelow('md') },
    { accessorKey: 'winRate', header: t('standingsTable.columnWinRate'), meta: hiddenBelow('md') },
    { id: 'details', header: '', meta: MOBILE_ONLY },
  ]
  return cols.filter((c): c is TableColumn<StandingsEntry> => c !== false)
})

watch(standingsType, async (newType, oldType) => {
  const order = ['official', 'provisional']
  slideDirection.value = order.indexOf(newType) > order.indexOf(oldType) ? 'left' : 'right'
  await loadStandings(newType)
})

async function loadStandings(type: 'official' | 'provisional') {
  if (type === 'official') {
    await loadOfficialStandings(props.tournamentId)
  } else {
    await loadProvisionalStandings(props.tournamentId)
  }
}

onMounted(async () => {
  await loadStandings(standingsType.value)
})
</script>

<style scoped>
.standings-table {
  width: 100%;
}

.standings-container {
  position: relative;
  min-height: 200px;
}

.standings-slide-left-enter-active,
.standings-slide-left-leave-active,
.standings-slide-right-enter-active,
.standings-slide-right-leave-active {
  transition:
    transform 0.28s ease-out,
    opacity 0.28s ease-out;
}

.standings-slide-left-leave-active,
.standings-slide-right-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
}

.standings-slide-left-enter-from {
  transform: translateX(40px);
  opacity: 0;
}
.standings-slide-left-leave-to {
  transform: translateX(-40px);
  opacity: 0;
}

.standings-slide-right-enter-from {
  transform: translateX(-40px);
  opacity: 0;
}
.standings-slide-right-leave-to {
  transform: translateX(40px);
  opacity: 0;
}
</style>
