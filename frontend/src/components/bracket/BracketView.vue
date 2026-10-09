<template>
  <div class="bracket-view">
    <!-- Wrong Tournament Type Guard -->
    <div
      v-if="!isBracketTournament"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <i class="fa fa-exclamation-triangle text-6xl text-orange-400 mb-4" />
      <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {{ t('bracketView.notBracketTitle') }}
      </h3>
      <p class="text-gray-600 dark:text-gray-400">
        {{ t('bracketView.notBracketDesc') }}
      </p>
    </div>

    <template v-else>
      <!-- Avertissement nombre de participants non optimal -->
      <div
        v-if="currentParticipants > 0 && !isOptimalCount"
        class="mb-4 px-4 py-3 bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-lg text-sm text-orange-700 dark:text-orange-300 flex items-start gap-2"
      >
        <i class="fa fa-exclamation-triangle mt-0.5 shrink-0" />
        <span>{{ t('bracketView.optimalCountWarning', { lower: nearestPowersOf2(currentParticipants)[0], upper: nearestPowersOf2(currentParticipants)[1], count: currentParticipants }) }}</span>
      </div>

      <!-- Admin Controls -->
      <div v-if="canManage" class="mb-6 flex gap-3 items-center flex-wrap">
      <UButton
        v-if="!hasBracket"
        :label="t('bracketView.generateBracket')"
        icon="i-fa7-solid:sitemap"
        size="lg"
        :disabled="!isOptimalCount"
        @click="showGenerateDialog = true"
      />

      <template v-else>
        <UButton
          :label="t('bracketView.regenerate')"
          icon="i-fa7-solid:rotate-right"
          variant="outline"
          size="lg"
          @click="handleRegenerate"
        />
        <UButton
          :label="t('bracketView.deleteBracket')"
          icon="i-fa7-solid:trash"
          color="error"
          variant="outline"
          size="lg"
          @click="confirmDelete"
        />
      </template>

      <UButton
        :label="t('bracketView.refresh')"
        icon="i-fa7-solid:arrows-rotate"
        color="neutral"
        variant="outline"
        size="lg"
        :loading="loading"
        @click="loadBracketData"
      />
    </div>

    <!-- Loading State -->
    <div v-if="loading && !bracketData" class="flex justify-center items-center py-20">
      <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!bracketData"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <i class="fa fa-sitemap text-6xl text-gray-300 dark:text-gray-600 mb-4" />
      <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {{ t('bracketView.noBracketTitle') }}
      </h3>
      <p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        {{ t('bracketView.noBracketDesc') }}
        <template v-if="canManage">
          {{ t('bracketView.noBracketDescAdmin') }}
        </template>
        <template v-else>
          {{ t('bracketView.noBracketDescUser') }}
        </template>
      </p>

      <UButton
        v-if="canManage"
        :label="t('bracketView.generateBracket')"
        icon="i-fa7-solid:sitemap"
        size="xl"
        :disabled="!isOptimalCount"
        @click="showGenerateDialog = true"
      />
    </div>

    <!-- Bracket Display -->
    <div v-else class="bracket-container">
      <!-- Bracket Info -->
      <div class="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-gray-600 dark:text-gray-400">{{ t('bracketView.infoType') }}</div>
            <div class="font-semibold capitalize">
              {{ bracketData.config.bracketType.replace('_', ' ') }}
            </div>
          </div>
          <div>
            <div class="text-gray-600 dark:text-gray-400">{{ t('bracketView.infoSeeding') }}</div>
            <div class="font-semibold capitalize">
              {{ bracketData.config.seedingType.replace('_', ' ') }}
            </div>
          </div>
          <div>
            <div class="text-gray-600 dark:text-gray-400">{{ t('bracketView.infoParticipants') }}</div>
            <div class="font-semibold">{{ bracketData.config.totalParticipants }}</div>
          </div>
          <div>
            <div class="text-gray-600 dark:text-gray-400">{{ t('bracketView.infoRounds') }}</div>
            <div class="font-semibold">{{ bracketData.config.roundsCount }}</div>
          </div>
        </div>
      </div>

      <!-- Tournament Bracket Component -->
      <TournamentBracket :bracket-data="bracketData" />
    </div>

      <!-- Generate/Regenerate Dialog -->
      <GenerateBracketDialog
        v-model="showGenerateDialog"
        :is-regeneration="hasBracket"
        :current-discipline-id="tournament?.disciplineId"
        @submit="handleGenerateSubmit"
      />

      <!-- Delete Confirmation Dialog -->
      <UModal
        v-model:open="showDeleteDialog"
        :title="t('bracketView.deleteDialogHeader')"
        :ui="{ footer: 'justify-end' }"
      >
        <template #body>
          <div class="flex items-start gap-4">
            <i class="fa fa-exclamation-triangle text-4xl text-orange-500" />
            <div>
              <p class="mb-3">
                {{ t('bracketView.deleteConfirmText') }}
              </p>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('bracketView.deleteHint') }}
              </p>
            </div>
          </div>
        </template>

        <template #footer>
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="outline"
            @click="showDeleteDialog = false"
          />
          <UButton
            :label="t('common.delete')"
            color="error"
            :loading="deleting"
            @click="handleDeleteBracket"
          />
        </template>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

function nearestPowersOf2(n: number): [number, number] {
  if (n <= 1) return [1, 2]
  const lower = Math.pow(2, Math.floor(Math.log2(n)))
  const upper = lower === n ? n : lower * 2
  return [lower, upper]
}

function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}
import { useBracketService } from '@/composables/bracket/bracket.service'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'
import GenerateBracketDialog from './GenerateBracketDialog.vue'
import type { GenerateBracketInput } from '@skol-arena/shared'
import type { TournamentResponse } from '@/composables/tournament/tournament.api'

interface Props {
  tournamentId: string
  tournament?: TournamentResponse
}

const props = defineProps<Props>()

const { t } = useI18n()

const {
  bracketData,
  loading,
  hasBracket,
  currentParticipants,
  loadBracket,
  generateBracket,
  regenerateBracket,
  deleteBracket,
  checkCanGenerate,
} = useBracketService()

const { canManageTournament } = useTournamentService()

const showGenerateDialog = ref(false)
const showDeleteDialog = ref(false)
const deleting = ref(false)

const canManage = computed(() => {
  return props.tournament ? canManageTournament(props.tournament) : false
})

const isOptimalCount = computed(() =>
  currentParticipants.value >= 2 && isPowerOf2(currentParticipants.value)
)

const isBracketTournament = computed(() => {
  return props.tournament?.mode === 'bracket'
})

onMounted(async () => {
  // Only load bracket data if this is a bracket tournament
  if (isBracketTournament.value) {
    await loadBracketData()
  }
})

async function loadBracketData() {
  try {
    await loadBracket(props.tournamentId)
    await checkCanGenerate(props.tournamentId)
  } catch (error) {
    console.error('Failed to load bracket:', error)
  }
}

async function handleGenerateSubmit(input: GenerateBracketInput) {
  try {
    if (hasBracket.value) {
      await regenerateBracket(props.tournamentId, input)
    } else {
      await generateBracket(props.tournamentId, input)
    }
    showGenerateDialog.value = false
  } catch (error) {
    console.error('Failed to generate bracket:', error)
  }
}

function handleRegenerate() {
  showGenerateDialog.value = true
}

function confirmDelete() {
  showDeleteDialog.value = true
}

async function handleDeleteBracket() {
  deleting.value = true
  try {
    await deleteBracket(props.tournamentId)
    showDeleteDialog.value = false
  } catch (error) {
    console.error('Failed to delete bracket:', error)
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.bracket-view {
  width: 100%;
}

.bracket-container {
  width: 100%;

}
</style>
