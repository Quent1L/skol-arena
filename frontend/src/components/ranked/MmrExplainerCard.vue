<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
  >
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <div
        class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0"
      >
        <i class="fa fa-chart-line text-violet-600 dark:text-violet-400 text-sm sm:text-base" />
      </div>
      <div>
        <div class="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
          {{ t('mmrExplainerCard.title') }}
        </div>
        <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          {{ t('mmrExplainerCard.subtitle') }}
        </div>
      </div>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-2">
      <USkeleton class="h-[2.5rem] w-full rounded-lg" />
      <USkeleton class="h-[2.5rem] w-full rounded-lg" />
      <USkeleton class="h-[2.5rem] w-full rounded-lg" />
    </div>

    <!-- Content -->
    <div v-else class="space-y-2">
      <!-- Starting MMR -->
      <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
        <i class="fa fa-star text-violet-500 w-4 shrink-0 text-sm text-center" />
        <div>
          <span class="font-medium text-gray-700 dark:text-gray-300 text-sm">{{ t('mmrExplainerCard.startingMmr') }}</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('mmrExplainerCard.startingMmrPre') }}
            <span class="font-semibold text-gray-700 dark:text-gray-300"
              >{{ rankedConfig?.baseMmr ?? '—' }} {{ t('mmrExplainerCard.points') }}</span
            >.
          </p>
        </div>
      </div>

      <!-- Matchs de placement -->
      <div
        v-if="(rankedConfig?.placementMatches ?? 0) > 0"
        class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg"
      >
        <i class="fa fa-flag-checkered text-violet-500 w-4 shrink-0 text-sm text-center" />
        <div>
          <span class="font-medium text-gray-700 dark:text-gray-300 text-sm"
            >{{ t('mmrExplainerCard.placementMatches') }}</span
          >
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('mmrExplainerCard.placementMatchesPre') }}
            <span class="font-semibold text-gray-700 dark:text-gray-300"
              >{{ rankedConfig?.placementMatches ?? '—' }} {{ t('mmrExplainerCard.placementMatchesMid') }}</span
            >
            {{ t('mmrExplainerCard.placementMatchesPost') }}
          </p>
        </div>
      </div>

      <!-- Gain / Perte -->
      <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
        <i class="fa fa-arrows-up-down text-violet-500 w-4 shrink-0 text-sm text-center" />
        <div>
          <span class="font-medium text-gray-700 dark:text-gray-300 text-sm">{{ t('mmrExplainerCard.gainLoss') }}</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('mmrExplainerCard.gainLossDesc') }}
          </p>
        </div>
      </div>

      <!-- Facteur adversaire -->
      <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
        <i class="fa fa-scale-balanced text-violet-500 w-4 shrink-0 text-sm text-center" />
        <div>
          <span class="font-medium text-gray-700 dark:text-gray-300 text-sm"
            >{{ t('mmrExplainerCard.opponentFactor') }}</span
          >
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('mmrExplainerCard.opponentFactorDesc') }}
          </p>
        </div>
      </div>

      <!-- Team split -->
      <div
        v-if="hasTeamMode"
        class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg"
      >
        <i class="fa fa-users text-violet-500 w-4 shrink-0 text-sm text-center" />
        <div>
          <span class="font-medium text-gray-700 dark:text-gray-300 text-sm">
            {{ t('mmrExplainerCard.teamDistribution') }}
            <span class="text-violet-600 dark:text-violet-400">{{ teamModeLabel }}</span>
          </span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ teamModeDescription }}</p>
        </div>
      </div>

      <!-- Formulas accordion -->
      <details
        class="group mt-2 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <summary
          class="flex items-center justify-between px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-700/40 select-none hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 list-none"
        >
          <span>{{ t('mmrExplainerCard.seeCalculationDetail') }}</span>
          <i
            class="fa fa-chevron-down text-gray-400 text-xs transition-transform group-open:rotate-180"
          />
        </summary>

        <div class="px-4 py-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div class="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
            <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('mmrExplainerCard.expectedScore') }}</p>
            <p class="text-xs leading-relaxed">
              {{ t('mmrExplainerCard.expectedScoreDesc') }}
            </p>
          </div>

          <div class="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
            <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('mmrExplainerCard.baseGainLoss') }}</p>
            <p class="text-xs leading-relaxed">
              {{ t('mmrExplainerCard.baseGainLossDescPre') }}
              <span class="font-semibold text-gray-700 dark:text-gray-300"
                >({{ rankedConfig?.kFactor ?? '?' }})</span
              >
              {{ t('mmrExplainerCard.baseGainLossDescPost') }}
            </p>
          </div>

          <div
            v-if="(rankedConfig?.placementMatches ?? 0) > 0"
            class="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3"
          >
            <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('mmrExplainerCard.placementMatches') }}</p>
            <p class="text-xs leading-relaxed">
              {{ t('mmrExplainerCard.placementDetailPre') }}
              <span class="font-semibold text-gray-700 dark:text-gray-300"
                >{{ rankedConfig?.placementMatches ?? '?' }} {{ t('mmrExplainerCard.placementDetailMid') }}</span
              >{{ t('mmrExplainerCard.placementDetailPost') }}
            </p>
          </div>

          <div v-if="hasTeamMode" class="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
            <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('mmrExplainerCard.individualTeamAdjustment') }}
            </p>
            <p class="text-xs leading-relaxed">{{ teamModeDetailDescription }}</p>
          </div>

          <div class="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
            <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('mmrExplainerCard.conservation') }}
            </p>
            <p class="text-xs leading-relaxed">{{ t('mmrExplainerCard.conservationDesc') }}</p>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { rankedApi } from '@/composables/ranked/ranked.api'
import type { RankedSeason } from '@/composables/ranked/ranked.api'

const { t } = useI18n()

type SeasonWithFullDiscipline = RankedSeason & {
  discipline?: { id: string; name: string; teamInteractionMode?: string | null } | null
}

const props = defineProps<{ tournamentId: string }>()

const loading = ref(true)
const rankedConfig = ref<{ baseMmr: number; kFactor: number; placementMatches: number } | null>(
  null,
)
const teamInteractionMode = ref<string | null>(null)

onMounted(async () => {
  try {
    const season = (await rankedApi.getSeasonById(props.tournamentId)) as SeasonWithFullDiscipline
    rankedConfig.value = season.rankedConfig ?? null
    teamInteractionMode.value = season.discipline?.teamInteractionMode ?? null
  } finally {
    loading.value = false
  }
})

const hasTeamMode = computed(() => !!teamInteractionMode.value)

const teamModeLabel = computed(() => {
  switch (teamInteractionMode.value) {
    case 'INDIVIDUAL': return t('mmrExplainerCard.teamMode.individual')
    case 'SHARED_RESOURCE': return t('mmrExplainerCard.teamMode.sharedResource')
    case 'COLLABORATIVE': return t('mmrExplainerCard.teamMode.collaborative')
    default: return ''
  }
})

const teamModeDescription = computed(() => {
  switch (teamInteractionMode.value) {
    case 'INDIVIDUAL': return t('mmrExplainerCard.teamModeDesc.individual')
    case 'SHARED_RESOURCE': return t('mmrExplainerCard.teamModeDesc.sharedResource')
    case 'COLLABORATIVE': return t('mmrExplainerCard.teamModeDesc.collaborative')
    default: return ''
  }
})

const teamModeDetailDescription = computed(() => {
  switch (teamInteractionMode.value) {
    case 'INDIVIDUAL': return t('mmrExplainerCard.teamModeDetail.individual')
    case 'SHARED_RESOURCE': return t('mmrExplainerCard.teamModeDetail.sharedResource')
    case 'COLLABORATIVE': return t('mmrExplainerCard.teamModeDetail.collaborative')
    default: return ''
  }
})
</script>
