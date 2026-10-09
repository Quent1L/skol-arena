<template>
  <div class="max-w-4xl">
    <AdminPageHeader
      :title="
        isEditMode
          ? (currentTournament?.name ?? t('routes.adminTournamentEdit'))
          : t('tournamentList.newTournament')
      "
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <UForm :schema="schema" :state="state" @submit="onSubmit">
      <UCard :ui="{ body: 'space-y-8' }">
        <GeneralInfoSection
          v-model:state="state"
          :discipline-options="disciplineOptions"
          :rules-options="rulesOptions"
          :organizations="organizations"
          :is-super-admin="isSuperAdmin"
          :discipline-locked="isEditMode"
          :locked-discipline-name="currentDisciplineName"
          :editability="sectionEditability"
        >
          <template #after-discipline>
            <UFormField v-if="isEditMode" name="status" :label="t('common.status')">
              <USelect
                v-model="state.status"
                :items="statusOptions"
                :disabled="!isFieldEditable('status')"
                class="w-full"
              />
            </UFormField>
          </template>

          <template #before-team-size>
            <UFormField name="mode" :label="t('tournamentFormView.labelMode')" required>
              <USelect
                v-model="state.mode"
                :items="modeOptions"
                :disabled="!isFieldEditable('mode')"
                class="w-full"
              />
            </UFormField>
            <UFormField name="teamMode" :label="t('tournamentFormView.labelTeamMode')" required>
              <USelect
                v-model="state.teamMode"
                :items="teamModeOptions"
                :disabled="!isFieldEditable('teamMode')"
                class="w-full"
              />
            </UFormField>
          </template>
        </GeneralInfoSection>

        <section v-if="state.mode === 'championship'">
          <h2 class="mb-4 text-lg font-semibold text-highlighted">
            {{ t('tournamentFormView.championshipRulesTitle') }}
          </h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField name="maxMatchesPerPlayer" :label="t('tournamentFormView.labelMaxMatchesPerPlayer')">
            <UInputNumber
              v-model="state.maxMatchesPerPlayer"
              :min="CHAMPIONSHIP_LIMITS.maxMatchesPerPlayer.min"
              :max="CHAMPIONSHIP_LIMITS.maxMatchesPerPlayer.max"
              :disabled="!isFieldEditable('maxMatchesPerPlayer')"
              class="w-full"
            />
            <FieldEditabilityNote :recalculates="fieldTriggersRecalculation('maxMatchesPerPlayer')" />
          </UFormField>
          <UFormField name="maxTimesWithSamePartner" :label="t('tournamentFormView.labelMaxTimesWithSamePartner')">
            <UInputNumber
              v-model="state.maxTimesWithSamePartner"
              :min="CHAMPIONSHIP_LIMITS.maxTimesWithSamePartner.min"
              :max="CHAMPIONSHIP_LIMITS.maxTimesWithSamePartner.max"
              :disabled="!isFieldEditable('maxTimesWithSamePartner')"
              class="w-full"
            />
          </UFormField>
          <UFormField name="maxTimesWithSameOpponent" :label="t('tournamentFormView.labelMaxTimesWithSameOpponent')">
            <UInputNumber
              v-model="state.maxTimesWithSameOpponent"
              :min="CHAMPIONSHIP_LIMITS.maxTimesWithSameOpponent.min"
              :max="CHAMPIONSHIP_LIMITS.maxTimesWithSameOpponent.max"
              :disabled="!isFieldEditable('maxTimesWithSameOpponent')"
              class="w-full"
            />
          </UFormField>
          <UFormField name="pointPerVictory" :label="t('tournamentFormView.labelPointPerVictory')">
            <UInputNumber
              v-model="state.pointPerVictory"
              :min="0"
              :disabled="!isFieldEditable('pointPerVictory')"
              class="w-full"
            />
            <FieldEditabilityNote :recalculates="fieldTriggersRecalculation('pointPerVictory')" />
          </UFormField>
          <UFormField name="pointPerDraw" :label="t('tournamentFormView.labelPointPerDraw')">
            <UInputNumber
              v-model="state.pointPerDraw"
              :min="0"
              :disabled="!isFieldEditable('pointPerDraw')"
              class="w-full"
            />
            <FieldEditabilityNote :recalculates="fieldTriggersRecalculation('pointPerDraw')" />
          </UFormField>
          <UFormField name="pointPerLoss" :label="t('tournamentFormView.labelPointPerLoss')">
            <UInputNumber
              v-model="state.pointPerLoss"
              :min="0"
              :disabled="!isFieldEditable('pointPerLoss')"
              class="w-full"
            />
            <FieldEditabilityNote :recalculates="fieldTriggersRecalculation('pointPerLoss')" />
          </UFormField>
          </div>
        </section>

        <ScoreConstraintsSection v-model:state="state" :editability="sectionEditability" />

        <ValidationModeSection v-model:state="state" :editability="sectionEditability" />

        <template #footer>
          <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              class="justify-center"
              :disabled="loading"
              @click="router.back()"
            />
            <UButton
              type="submit"
              :label="isEditMode ? t('common.update') : t('common.create')"
              icon="i-fa7-solid:check"
              class="justify-center"
              :loading="loading"
            />
          </div>
        </template>
      </UCard>
    </UForm>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useI18n } from 'vue-i18n'
import {
  type CreateTournamentFormData,
  type UpdateTournamentFormData,
  type TournamentEditability,
  baseTournamentFormSchema,
  baseTournamentUpdateFormSchema,
  CHAMPIONSHIP_DEFAULTS,
  CHAMPIONSHIP_LIMITS,
  SCORING_DEFAULTS,
  resolveChampionshipConfig,
  resolveScoringConfig,
} from '@skol-arena/shared/types/index'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import { useFormReferences } from '@/composables/useFormReferences'
import { useAuth } from '@/composables/useAuth'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import FieldEditabilityNote from '@/components/forms/FieldEditabilityNote.vue'
import GeneralInfoSection from '@/components/forms/sections/GeneralInfoSection.vue'
import ScoreConstraintsSection from '@/components/forms/sections/ScoreConstraintsSection.vue'
import ValidationModeSection from '@/components/forms/sections/ValidationModeSection.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const {
  currentTournament,
  loading,
  error,
  getTournament,
  createTournament,
  updateTournament,
  getEditability,
} = useTournamentService()

const {
  organizations,
  disciplineOptions,
  rulesOptions,
  loadAll: loadFormReferences,
} = useFormReferences()
const { isSuperAdmin } = useAuth()

const isEditMode = computed(() => route.params.id !== 'new' && !!route.params.id)

/**
 * What the API will accept, fetched rather than guessed. A new tournament has no
 * constraints yet, so everything is open until we know otherwise.
 */
const editability = ref<TournamentEditability>({
  editable: [],
  recalculating: [],
  locked: [],
  enteredMatchCount: 0,
})

const currentDisciplineName = computed(
  () => currentTournament.value?.discipline?.name || t('tournamentFormView.undefinedDiscipline'),
)

const modeOptions = [
  { label: t('tournamentFormView.modeChampionship'), value: 'championship' },
  { label: t('tournamentFormView.modeBracket'), value: 'bracket' },
]

const teamModeOptions = [
  { label: t('tournamentFormView.teamModeStatic'), value: 'static' },
  { label: t('tournamentFormView.teamModeFlex'), value: 'flex' },
]

const statusOptions = [
  { label: t('tournamentFormView.statusDraft'), value: 'draft' },
  { label: t('tournamentFormView.statusOpen'), value: 'open' },
  { label: t('tournamentFormView.statusOngoing'), value: 'ongoing' },
  { label: t('tournamentFormView.statusFinished'), value: 'finished' },
]

const schema = computed(() =>
  isEditMode.value ? baseTournamentUpdateFormSchema : baseTournamentFormSchema,
)

type TournamentFormState = Partial<CreateTournamentFormData & UpdateTournamentFormData>
// A ref, not a reactive: the sections bind it with `v-model:state`, which needs
// a binding it can reassign.
const state = ref<TournamentFormState>({})

/**
 * What the shared sections get: `null` while creating, which they read as "everything
 * open". The ref itself starts as an empty policy, and handing that over made every
 * section field (name, description, dates…) read-only on a new tournament.
 */
const sectionEditability = computed(() => (isEditMode.value ? editability.value : null))

function isFieldEditable(fieldName: string): boolean {
  if (!isEditMode.value) return true
  return editability.value.editable.includes(fieldName)
}

/** Changing this field is allowed but rewrites results that are already published. */
function fieldTriggersRecalculation(fieldName: string): boolean {
  return isEditMode.value && editability.value.recalculating.includes(fieldName)
}

async function onSubmit({ data: values }: FormSubmitEvent<TournamentFormState>) {
  try {
    const formData = values as CreateTournamentFormData & UpdateTournamentFormData

    if (formData.startDate && formData.endDate && formData.startDate >= formData.endDate) {
      throw new Error(t('tournamentFormView.errorDateRange'))
    }

    if (
      formData.minTeamSize &&
      formData.maxTeamSize &&
      formData.maxTeamSize < formData.minTeamSize
    ) {
      throw new Error(t('tournamentFormView.errorTeamSize'))
    }

    if (isEditMode.value && route.params.id) {
      // Filtered against what the API actually accepts, so the form can never
      // send a field the server is about to refuse.
      const updateData = Object.entries(values).reduce(
        (acc, [key, value]) => {
          if (editability.value.editable.includes(key)) {
            acc[key] = value
          }
          return acc
        },
        {} as Record<string, unknown>,
      )
      await updateTournament(route.params.id as string, updateData as UpdateTournamentFormData)
    } else {
      await createTournament({
        ...(values as CreateTournamentFormData),
        organizationId: state.value.organizationId ?? undefined,
      })
    }
    router.push('/admin/tournaments')
  } catch (err) {
    console.error('Erreur lors de la sauvegarde:', err)
  }
}

onMounted(async () => {
  await loadFormReferences()

  if (isEditMode.value && route.params.id) {
    await getTournament(route.params.id as string)
    if (currentTournament.value) {
      editability.value = await getEditability(route.params.id as string)
      Object.assign(state.value, {
        name: currentTournament.value.name,
        description: currentTournament.value.description ?? '',
        mode: currentTournament.value.mode,
        teamMode: currentTournament.value.teamMode,
        status: currentTournament.value.status,
        minTeamSize: currentTournament.value.minTeamSize,
        maxTeamSize: currentTournament.value.maxTeamSize,
        ...resolveChampionshipConfig(currentTournament.value.championshipConfig),
        ...resolveScoringConfig(currentTournament.value.scoringConfig),
        allowDraw: currentTournament.value.allowDraw ?? true,
        startDate: currentTournament.value.startDate,
        endDate: currentTournament.value.endDate,
        disciplineId: currentTournament.value.disciplineId,
        minScore: currentTournament.value.minScore ?? null,
        maxScore: currentTournament.value.maxScore ?? null,
        scoreEnabled: currentTournament.value.scoreEnabled ?? true,
        rulesId: currentTournament.value.rulesId ?? null,
        organizationId: currentTournament.value.organizationId ?? null,
        validationMode: currentTournament.value.validationMode ?? 'strict',
        validationTimerHours: currentTournament.value.validationTimerHours ?? null,
      })
    }
  } else {
    Object.assign(state.value, {
      mode: 'championship',
      teamMode: 'flex',
      status: 'draft',
      minTeamSize: 1,
      maxTeamSize: 2,
      ...CHAMPIONSHIP_DEFAULTS,
      ...SCORING_DEFAULTS,
      allowDraw: true,
      scoreEnabled: true,
      validationMode: 'strict',
      validationTimerHours: null,
    })
  }
})
</script>
