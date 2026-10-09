<template>
  <UModal
    v-model:open="visible"
    :title="isRegeneration ? t('generateBracketDialog.headerRegenerate') : t('generateBracketDialog.headerGenerate')"
    :ui="{ content: 'sm:max-w-xl', footer: 'justify-end' }"
  >
    <template #body>
    <div class="space-y-6">
      <!-- Warning for regeneration -->
      <UAlert
        v-if="isRegeneration"
        color="warning"
        variant="subtle"
        icon="i-fa7-solid:triangle-exclamation"
        :title="t('generateBracketDialog.warningTitle')"
        :description="t('generateBracketDialog.warningDesc')"
      />

      <!-- Bracket Type -->
      <div class="space-y-2">
        <span class="block font-medium text-sm text-gray-700 dark:text-gray-300">
          {{ t('generateBracketDialog.bracketTypeLabel') }}
        </span>
        <div class="grid grid-cols-2 gap-3">
          <div
            class="border rounded-lg p-4 cursor-pointer transition-all"
            :class="
              formData.bracketType === 'single_elimination'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            "
            @click="formData.bracketType = 'single_elimination'"
          >
            <i class="fa fa-trophy text-2xl mb-2 block text-blue-600" />
            <div class="font-medium">{{ t('generateBracketDialog.singleEliminationTitle') }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ t('generateBracketDialog.singleEliminationDesc') }}</div>
          </div>

          <div
            class="border rounded-lg p-4 cursor-pointer transition-all"
            :class="
              formData.bracketType === 'double_elimination'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            "
            @click="formData.bracketType = 'double_elimination'"
          >
            <i class="fa fa-shield-alt text-2xl mb-2 block text-green-600" />
            <div class="font-medium">{{ t('generateBracketDialog.doubleEliminationTitle') }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {{ t('generateBracketDialog.doubleEliminationDesc') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Seeding Type -->
      <div class="space-y-2">
        <span class="block font-medium text-sm text-gray-700 dark:text-gray-300">
          {{ t('generateBracketDialog.seedingTypeLabel') }}
        </span>
        <div class="grid grid-cols-2 gap-3">
          <div
            class="border rounded-lg p-4 cursor-pointer transition-all"
            :class="
              formData.seedingType === 'random'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            "
            @click="((formData.seedingType = 'random'), (formData.sourceTournamentId = undefined))"
          >
            <i class="fa fa-random text-2xl mb-2 block text-purple-600" />
            <div class="font-medium">{{ t('generateBracketDialog.randomTitle') }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {{ t('generateBracketDialog.randomDesc') }}
            </div>
          </div>

          <div
            class="border rounded-lg p-4 cursor-pointer transition-all"
            :class="
              formData.seedingType === 'championship_based'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            "
            @click="formData.seedingType = 'championship_based'"
          >
            <i class="fa fa-medal text-2xl mb-2 block text-yellow-600" />
            <div class="font-medium">{{ t('generateBracketDialog.championshipTitle') }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {{ t('generateBracketDialog.championshipDesc') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Source Tournament (championship seeding only) -->
      <div v-if="formData.seedingType === 'championship_based'" class="space-y-2">
        <label
          for="source-tournament"
          class="block font-medium text-sm text-gray-700 dark:text-gray-300"
        >
          {{ t('generateBracketDialog.sourceTournamentLabel') }}
        </label>
        <USelectMenu
          id="source-tournament"
          v-model="formData.sourceTournamentId"
          :items="finishedTournaments"
          value-key="id"
          label-key="name"
          :placeholder="t('generateBracketDialog.sourceTournamentPlaceholder')"
          :loading="loadingTournaments"
          size="xl"
          class="w-full"
        />
        <small class="text-gray-600 dark:text-gray-400">
          {{ t('generateBracketDialog.sourceTournamentHint') }}
        </small>
      </div>

      <!-- Bronze Match (single elimination only) -->
      <UCheckbox
        v-if="formData.bracketType === 'single_elimination'"
        id="bronze-match"
        v-model="formData.hasBronzeMatch"
        :label="t('generateBracketDialog.bronzeMatchLabel')"
      />
    </div>
    </template>

    <template #footer>
      <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="close" />
      <UButton
        :label="isRegeneration ? t('generateBracketDialog.regenerate') : t('generateBracketDialog.generate')"
        :loading="loading"
        :disabled="!isFormValid || loading"
        @click="handleSubmit"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GenerateBracketInput } from '@skol-arena/shared/types/index'
import { tournamentApi } from '@/composables/tournament/tournament.api'
import type { TournamentResponse } from '@/composables/tournament/tournament.api'

interface Props {
  modelValue: boolean
  isRegeneration?: boolean
  currentDisciplineId?: string
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', data: GenerateBracketInput): Promise<void>
}

const props = withDefaults(defineProps<Props>(), {
  isRegeneration: false,
})

const emit = defineEmits<Emits>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const loading = ref(false)
const loadingTournaments = ref(false)
const finishedTournaments = ref<TournamentResponse[]>([])

const formData = ref<GenerateBracketInput>({
  bracketType: 'single_elimination',
  seedingType: 'random',
  hasBronzeMatch: false,
})

const isFormValid = computed(() => {
  if (formData.value.seedingType === 'championship_based') {
    return !!formData.value.sourceTournamentId
  }
  return true
})

// Load finished tournaments when championship seeding is selected
watch(
  () => formData.value.seedingType,
  async (newType) => {
    if (newType === 'championship_based' && finishedTournaments.value.length === 0) {
      await loadFinishedTournaments()
    }
  },
)

// Load finished tournaments on mount if already championship_based
watch(
  visible,
  async (isVisible) => {
    if (
      isVisible &&
      formData.value.seedingType === 'championship_based' &&
      finishedTournaments.value.length === 0
    ) {
      await loadFinishedTournaments()
    }
  },
  { immediate: true },
)

async function loadFinishedTournaments() {
  loadingTournaments.value = true
  try {
    const tournaments = await tournamentApi.list({ status: 'finished' })

    // Filter by discipline if provided
    finishedTournaments.value = props.currentDisciplineId
      ? tournaments.filter((t) => t.disciplineId === props.currentDisciplineId)
      : tournaments
  } catch (error) {
    console.error('Failed to load finished tournaments:', error)
  } finally {
    loadingTournaments.value = false
  }
}

async function handleSubmit() {
  if (!isFormValid.value) return

  loading.value = true
  try {
    await emit('submit', formData.value)
  } finally {
    loading.value = false
  }
}

function close() {
  visible.value = false
  loading.value = false
}

// Reset form when dialog opens
watch(visible, (isVisible) => {
  if (isVisible) {
    formData.value = {
      bracketType: 'single_elimination',
      seedingType: 'random',
      hasBronzeMatch: false,
    }
  } else {
    loading.value = false
  }
})
</script>

<style scoped>
/* Additional custom styles if needed */
</style>
