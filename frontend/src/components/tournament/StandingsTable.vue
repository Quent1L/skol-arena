<template>
  <div class="standings-table">
    <div class="mb-4 flex items-center justify-between w-full">
      <div>
        <SelectButton
          v-if="props.showProvisionalToggle !== false"
          v-model="standingsType"
          :options="standingsTypeOptions"
          option-label="label"
          option-value="value"
          class="w-full sm:w-auto"
          size="small"
        />
      </div>
      <div>
        <button
          class="flex items-center gap-2 px-2 py-1 text-gray-400 hover:text-blue-500 transition-colors duration-200 cursor-pointer text-xs"
          v-tooltip.top="isMobile ? null : t('standingsTable.howRankingTooltip')"
          @click="infoVisible = true"
        >
          <i class="fa fa-circle-question text-sm" />
        </button>
      </div>
    </div>

    <Dialog
      v-model:visible="infoVisible"
      modal
      :header="t('standingsTable.howRankingTooltip')"
      :style="{ width: '90vw', maxWidth: '700px' }"
      :draggable="false"
    >
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
    </Dialog>

    <Message v-if="error" severity="error" class="mb-4">
      {{ error }}
    </Message>

    <div
      v-if="standings.length === 0 && !loading"
      class="text-center py-8 text-gray-500 dark:text-gray-400"
    >
      {{ t('standingsTable.noStandings') }}
    </div>

    <div class="standings-container">
      <Transition :name="`standings-slide-${slideDirection}`" mode="out-in">
        <div v-if="standings.length > 0" :key="`standings-${standingsType}`" class="relative">
          <DataTable :value="standings" class="p-datatable-sm" striped-rows :loading="loading">
            <Column field="rank" header="#" style="width: 4rem">
              <template #body="{ index }">
                <div class="flex items-center justify-center">
                  <i v-if="index === 0" class="fa fa-trophy text-yellow-500" :title="t('standingsTable.rankFirst')"></i>
                  <i v-if="index === 1" class="fa fa-medal text-gray-400" :title="t('standingsTable.rankSecond')"></i>
                  <i v-if="index === 2" class="fa fa-medal text-orange-600" :title="t('standingsTable.rankThird')"></i>
                  <span
                    :class="[
                      'font-semibold',
                      {
                        'text-yellow-500': index === 0,
                        'text-gray-400': index === 1,
                        'text-orange-600': index === 2,
                      },
                    ]"
                  >
                    {{ index + 1 }}
                  </span>
                </div>
              </template>
            </Column>

            <Column field="name" :header="t('common.name')">
              <template #body="{ data }">
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
            </Column>

            <Column field="points" :header="t('standingsTable.columnPoints')">
              <template #body="{ data }">
                <div class="font-semibold text-blue-600 dark:text-blue-400">
                  {{ data.points }}
                </div>
              </template>
            </Column>

            <Column field="matchesPlayed" :header="t('standingsTable.columnMatchesPlayed')">
              <template #body="{ data }">
                {{ data.matchesPlayed }}
              </template>
            </Column>

            <Column field="wins" :header="t('standingsTable.columnWins')">
              <template #body="{ data }">
                <span class="text-green-600 dark:text-green-400 font-medium">
                  {{ data.wins }}
                </span>
              </template>
            </Column>

            <Column v-if="allowDraw" field="draws" :header="t('standingsTable.columnDraws')">
              <template #body="{ data }">
                <span class="text-gray-600 dark:text-gray-400 font-medium">
                  {{ data.draws }}
                </span>
              </template>
            </Column>

            <Column field="losses" :header="t('standingsTable.columnLosses')">
              <template #body="{ data }">
                <span class="text-red-600 dark:text-red-400 font-medium">
                  {{ data.losses }}
                </span>
              </template>
            </Column>

            <Column v-if="scoreEnabled" field="scoreDiff" :header="t('standingsTable.columnDiff')">
              <template #body="{ data }">
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
            </Column>

            <Column v-if="allowDraw && !isMobile" field="winLossRatio" :header="t('standingsTable.columnWinLossRatio')">
              <template #body="{ data }">
                <span class="text-gray-600 dark:text-gray-400">{{
                  formatRatio(data.winLossRatio)
                }}</span>
              </template>
            </Column>

            <Column
              field="buchholzScore"
              class="hidden md:table-cell"
              header-class="hidden md:table-cell"
            >
              <template #header>
                <span class="flex items-center gap-1">
                  {{ t('standingsTable.columnBuchholz') }}
                  <i
                    class="fa fa-circle-question text-xs text-gray-400 cursor-help"
                    v-tooltip.top="t('standingsTable.tooltipBuchholz')"
                  />
                </span>
              </template>
              <template #body="{ data }">
                <span class="text-gray-600 dark:text-gray-400">{{ data.buchholzScore }}</span>
              </template>
            </Column>

            <Column
              field="victoryQuality"
              class="hidden md:table-cell"
              header-class="hidden md:table-cell"
            >
              <template #header>
                <span class="flex items-center gap-1">
                  {{ t('standingsTable.columnVictoryQuality') }}
                  <i
                    class="fa fa-circle-question text-xs text-gray-400 cursor-help"
                    v-tooltip.top="t('standingsTable.tooltipVictoryQuality')"
                  />
                </span>
              </template>
              <template #body="{ data }">
                <span
                  class="text-gray-600 dark:text-gray-400 cursor-help"
                  @mouseenter="(e) => openQualityPanel(e, data)"
                  @mouseleave="qualityDetailPanel?.hide()"
                  >{{ Math.round(data.victoryQuality) }}</span
                >
              </template>
            </Column>

            <Column
              field="winRate"
              :header="t('standingsTable.columnWinRate')"
              class="hidden md:table-cell"
              header-class="hidden md:table-cell"
            >
              <template #body="{ data }">
                <span class="text-gray-600 dark:text-gray-400">{{
                  formatPercent(data.winRate)
                }}</span>
              </template>
            </Column>

            <Column header="" style="width: 3rem" class="md:hidden" header-class="md:hidden">
              <template #body="{ data }">
                <Button
                  icon="fa fa-circle-question"
                  text
                  rounded
                  size="small"
                  class="text-gray-400 hover:text-blue-500"
                  :aria-label="t('standingsTable.tiebreakerDetails', { name: data.name })"
                  @click="(e) => toggleTiebreakerPanel(e, data)"
                />
              </template>
            </Column>
          </DataTable>
        </div>
      </Transition>
    </div>

    <Popover ref="tiebreakerPanel">
      <div v-if="selectedEntry" class="p-3 min-w-[220px]">
        <p class="font-semibold text-sm mb-2 text-gray-800 dark:text-gray-100">
          {{ selectedEntry.name }} — {{ t('standingsTable.tiebreakerCriteria') }}
        </p>
        <ul class="text-sm space-y-1 text-gray-700 dark:text-gray-300">
          <li v-if="allowDraw" class="flex items-center gap-4">
            <span class="flex-1">{{ t('standingsTable.tiebreakerWinLossRatio') }}</span>
            <span class="font-medium">{{ formatRatio(selectedEntry.winLossRatio) }}</span>
            <span class="w-4 shrink-0" />
          </li>
          <li class="flex items-center gap-4">
            <span class="flex-1">{{ t('standingsTable.tiebreakerBuchholz') }}</span>
            <span class="font-medium">{{ selectedEntry.buchholzScore }} {{ t('standingsTable.ptsUnit') }}</span>
            <span class="w-4 shrink-0" />
          </li>
          <li>
            <button
              class="flex items-center gap-4 w-full text-left"
              @click="qualityExpanded = !qualityExpanded"
            >
              <span class="flex-1">{{ t('standingsTable.tiebreakerQuality') }}</span>
              <span class="font-medium">{{ selectedEntry.victoryQuality.toFixed(1) }} {{ t('standingsTable.ptsUnit') }}</span>
              <span class="w-4 shrink-0 text-center">
                <i
                  class="fa text-xs text-gray-400"
                  :class="{
                    'fa-chevron-right': !qualityExpanded,
                    'fa-chevron-down': qualityExpanded,
                  }"
                />
              </span>
            </button>
            <ul
              v-if="qualityExpanded && selectedEntry.victoryQualityBreakdown.length > 0"
              class="mt-1 ml-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400"
            >
              <li
                v-for="detail in selectedEntry.victoryQualityBreakdown"
                :key="detail.outcomeTypeName"
                class="flex justify-between gap-3"
              >
                <span
                  >{{ detail.outcomeTypeName }}
                  <span class="text-gray-400">({{ detail.points }} {{ t('standingsTable.ptPerResult') }})</span></span
                >
                <span class="flex gap-1 items-center">
                  <span v-if="detail.wins > 0" class="text-green-600 dark:text-green-400"
                    >{{ detail.wins }}{{ t('standingsTable.columnWins') }}</span
                  >
                  <span v-if="detail.losses > 0" class="text-red-600 dark:text-red-400"
                    >{{ detail.losses }}{{ t('standingsTable.columnLosses') }}</span
                  >
                  <span
                    class="font-medium"
                    :class="
                      detail.contribution >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    "
                  >
                    {{ detail.contribution >= 0 ? '+' : '' }}{{ detail.contribution }}
                  </span>
                </span>
              </li>
              <li
                class="flex justify-between gap-3 border-t border-gray-200 dark:border-gray-600 pt-1 font-semibold"
              >
                <span>{{ t('standingsTable.total') }}</span>
                <span
                  :class="
                    selectedEntry.victoryQuality >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  "
                >
                  {{ selectedEntry.victoryQuality >= 0 ? '+' : ''
                  }}{{ selectedEntry.victoryQuality.toFixed(1) }}
                </span>
              </li>
            </ul>
          </li>
          <li class="flex items-center gap-4">
            <span class="flex-1">{{ t('standingsTable.tiebreakerWinRate') }}</span>
            <span class="font-medium">{{ formatPercent(selectedEntry.winRate) }}</span>
            <span class="w-4 shrink-0" />
          </li>
        </ul>
      </div>
    </Popover>

    <Popover ref="qualityDetailPanel">
      <div v-if="selectedQualityEntry" class="p-3 min-w-[260px]">
        <p class="font-semibold text-sm mb-2 text-gray-800 dark:text-gray-100">
          {{ selectedQualityEntry.name }} — {{ t('standingsTable.victoryQualityLabel') }}
        </p>
        <div
          v-if="selectedQualityEntry.victoryQualityBreakdown.length > 0"
          class="text-sm text-gray-700 dark:text-gray-300"
        >
          <div
            v-for="detail in selectedQualityEntry.victoryQualityBreakdown"
            :key="detail.outcomeTypeName"
            class="flex items-center justify-between gap-4 py-0.5"
          >
            <span class="text-gray-600 dark:text-gray-400">
              {{ detail.outcomeTypeName }}
              <span class="text-xs text-gray-400">({{ detail.points }} {{ t('standingsTable.ptPerResult') }})</span>
            </span>
            <span class="flex gap-2 items-center">
              <span v-if="detail.wins > 0" class="text-green-600 dark:text-green-400"
                >{{ detail.wins }}{{ t('standingsTable.columnWins') }}</span
              >
              <span v-if="detail.losses > 0" class="text-red-600 dark:text-red-400"
                >{{ detail.losses }}{{ t('standingsTable.columnLosses') }}</span
              >
              <span
                class="font-medium"
                :class="
                  detail.contribution >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                "
              >
                {{ detail.contribution >= 0 ? '+' : '' }}{{ detail.contribution }}
              </span>
            </span>
          </div>
          <div
            class="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between font-semibold text-sm"
          >
            <span>{{ t('standingsTable.total') }}</span>
            <span
              :class="
                selectedQualityEntry.victoryQuality >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              "
            >
              {{ selectedQualityEntry.victoryQuality >= 0 ? '+' : ''
              }}{{ selectedQualityEntry.victoryQuality.toFixed(1) }}
            </span>
          </div>
        </div>
        <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('standingsTable.noMatchesPlayed') }}</p>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import Dialog from 'primevue/dialog'
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
const tiebreakerPanel = ref()
const qualityDetailPanel = ref()
const selectedEntry = ref<StandingsEntry | null>(null)
const qualityExpanded = ref(false)
const selectedQualityEntry = ref<StandingsEntry | null>(null)
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

function toggleTiebreakerPanel(event: Event, entry: StandingsEntry) {
  selectedEntry.value = entry
  qualityExpanded.value = false
  tiebreakerPanel.value?.toggle(event)
}

function openQualityPanel(event: MouseEvent, entry: StandingsEntry) {
  selectedQualityEntry.value = entry
  qualityDetailPanel.value?.show(event)
}

function formatRatio(ratio: number): string {
  if (!isFinite(ratio)) return '∞'
  return ratio.toFixed(2)
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

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
