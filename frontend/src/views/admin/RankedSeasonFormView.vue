<template>
  <div class="max-w-4xl">
    <AdminPageHeader
      :title="isEditMode ? t('rankedSeasonFormView.editTitle') : t('rankedSeasonFormView.newTitle')"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <UForm :schema="schema" :state="state" @submit="onSubmit" @error="onInvalid">
      <UCard :ui="{ body: 'space-y-8' }">
        <GeneralInfoSection
          v-model:state="state"
          :discipline-options="disciplineOptions"
          :rules-options="rulesOptions"
          :organizations="organizations"
          :is-super-admin="isSuperAdmin"
          :discipline-locked="isEditMode"
          :locked-discipline-name="currentSeason?.discipline?.name ?? ''"
          :name-placeholder="t('rankedSeasonFormView.namePlaceholder')"
        />

        <!-- Elo configuration -->
        <section class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ t('rankedSeasonFormView.eloConfigTitle') }}
          </h2>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UFormField name="baseMmr" :label="t('rankedSeasonFormView.labelBaseMmr')">
              <UInputNumber v-model="state.baseMmr" :min="100" :max="5000" class="w-full" />
            </UFormField>
            <UFormField name="kFactor" :label="t('rankedSeasonFormView.labelKFactor')">
              <UInputNumber v-model="state.kFactor" :min="8" :max="128" class="w-full" />
            </UFormField>
            <UFormField
              name="placementMatches"
              :label="t('rankedSeasonFormView.labelPlacementMatches')"
            >
              <UInputNumber v-model="state.placementMatches" :min="0" :max="20" class="w-full" />
            </UFormField>
          </div>

          <UCheckbox
            v-model="state.usePreviousMmr"
            :label="t('rankedSeasonFormView.labelUsePreviousMmr')"
          />
          <!-- Carry-over settings: only meaningful once it is switched on. -->
          <div v-if="state.usePreviousMmr" class="grid grid-cols-1 gap-4 ps-6 sm:grid-cols-2">
            <UFormField
              name="softResetFactor"
              :label="t('rankedSeasonFormView.labelSoftResetFactor')"
              :help="t('rankedSeasonFormView.helpSoftResetFactor')"
            >
              <UInputNumber
                v-model="state.softResetFactor"
                :min="0"
                :max="1"
                :step="0.05"
                :format-options="{ maximumFractionDigits: 2 }"
                class="w-full"
              />
            </UFormField>
            <UFormField
              name="sourceMmrSeasonId"
              :label="t('rankedSeasonFormView.labelSourceMmrSeasonId')"
              :help="t('rankedSeasonFormView.helpSourceMmrSeasonId')"
            >
              <USelectMenu
                v-model="state.sourceMmrSeasonId"
                :items="sourceTierOptions"
                value-key="value"
                clear
                :placeholder="t('rankedSeasonFormView.placeholderSourceMmrSeasonId')"
                class="w-full"
              />
            </UFormField>
          </div>

          <UCheckbox
            v-model="state.allowAsymmetricMatches"
            :label="t('rankedSeasonFormView.labelAllowAsymmetricMatches')"
          />

          <!-- Consumed once by startSeason: past draft, these two mean nothing and
               the API refuses them, so they are not offered at all. -->
          <UFormField
            v-if="isDraft"
            name="sourceTierSeasonId"
            :label="t('rankedSeasonFormView.labelSourceTierSeasonId')"
            :help="t('rankedSeasonFormView.helpSourceTierSeasonId')"
          >
            <USelectMenu
              v-model="state.sourceTierSeasonId"
              :items="sourceTierOptions"
              value-key="value"
              clear
              :placeholder="t('rankedSeasonFormView.placeholderSourceTierSeasonId')"
              class="w-full"
            />
          </UFormField>

          <!-- Only matters when a ladder is actually copied. -->
          <UFormField
            v-if="isDraft && state.sourceTierSeasonId"
            name="tierScalingMode"
            :label="t('rankedSeasonFormView.labelTierScalingMode')"
            :help="tierScalingHelp(state.tierScalingMode)"
          >
            <USelect v-model="state.tierScalingMode" :items="tierScalingOptions" class="w-full" />
          </UFormField>
        </section>

        <!-- Automatic end of season: chaining into the next one, or simply closing -->
        <section class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('rankedSeasonFormView.automationTitle') }}
            </h2>
            <p class="mt-1 text-sm text-muted">{{ t('rankedSeasonFormView.automationIntro') }}</p>
          </div>

          <UCheckbox
            v-model="automationEnabled"
            :label="t('rankedSeasonFormView.labelAutomationEnabled')"
          />

          <div v-if="automationEnabled" class="flex flex-col gap-4 ps-6">
            <UFormField
              :label="t('rankedSeasonFormView.labelAutomationMode')"
              :help="
                automation.mode === 'close'
                  ? t('rankedSeasonFormView.helpAutomationModeClose')
                  : t('rankedSeasonFormView.helpAutomationModeChain')
              "
            >
              <UTabs
                v-model="automation.mode"
                :items="automationModeOptions"
                :content="false"
                size="sm"
                class="w-full sm:w-auto"
                :ui="{ label: 'whitespace-normal text-center' }"
              />
            </UFormField>

            <template v-if="automation.mode === 'chain'">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UFormField
                  :label="t('rankedSeasonFormView.labelDurationDays')"
                  :error="automationErrors.durationDays"
                  :help="t('rankedSeasonFormView.helpDurationDays')"
                >
                  <UInputNumber
                    v-model="automation.durationDays"
                    :min="1"
                    :max="365"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  :label="t('rankedSeasonFormView.labelNameTemplate')"
                  :error="automationErrors.nameTemplate"
                  :help="
                    t('rankedSeasonFormView.helpNameTemplate', {
                      placeholder: seasonNumberPlaceholder,
                      example: nameTemplatePreview,
                    })
                  "
                >
                  <UInput v-model="automation.nameTemplate" class="w-full" />
                </UFormField>
              </div>

              <UCheckbox
                v-model="automation.carryParticipants"
                :label="t('rankedSeasonFormView.labelCarryParticipants')"
                :description="t('rankedSeasonFormView.helpCarryParticipants')"
              />
              <UFormField
                v-if="automation.carryParticipants"
                class="ps-6"
                :label="t('rankedSeasonFormView.labelParticipantsMinMatches')"
                :help="t('rankedSeasonFormView.helpParticipantsMinMatches')"
              >
                <UInputNumber
                  v-model="automation.participantsMinMatches"
                  :min="0"
                  :max="50"
                  class="w-full sm:w-48"
                />
              </UFormField>

              <UCheckbox
                v-model="automation.carryTiers"
                :label="t('rankedSeasonFormView.labelCarryTiers')"
              />
              <UFormField
                v-if="automation.carryTiers"
                class="ps-6"
                :label="t('rankedSeasonFormView.labelTierScalingMode')"
                :help="tierScalingHelp(automation.tierScalingMode)"
              >
                <USelect
                  v-model="automation.tierScalingMode"
                  :items="tierScalingOptions"
                  class="w-full"
                />
              </UFormField>

              <UCheckbox v-model="automation.carryMmr" :label="t('rankedSeasonFormView.labelCarryMmr')" />
              <UFormField
                v-if="automation.carryMmr"
                class="ps-6"
                :label="t('rankedSeasonFormView.labelSoftResetFactor')"
                :help="t('rankedSeasonFormView.helpSoftResetFactor')"
              >
                <UInputNumber
                  v-model="automation.softResetFactor"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :format-options="{ maximumFractionDigits: 2 }"
                  class="w-full sm:w-48"
                />
              </UFormField>
            </template>
          </div>
        </section>

        <ScoreConstraintsSection v-model:state="state" />

        <ValidationModeSection v-model:state="state" />

        <template #footer>
          <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              to="/admin/ranked"
              class="justify-center"
              :disabled="loading"
            />
            <UButton
              type="submit"
              :label="isEditMode ? t('common.update') : t('rankedSeasonFormView.createSeason')"
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
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import {
  type CreateRankedSeasonFormData,
  type UpdateRankedSeasonFormData,
  type RankedSeasonAutomationInput,
  createRankedSeasonFormSchema,
  updateRankedSeasonFormSchema,
  rankedSeasonAutomationFormSchema,
  renderSeasonName,
  SEASON_NUMBER_PLACEHOLDER,
} from '@skol-arena/shared/types/index'
import { useRankedService } from '@/composables/ranked/ranked.service'
import { useFormReferences } from '@/composables/useFormReferences'
import { useAuth } from '@/composables/useAuth'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import GeneralInfoSection from '@/components/forms/sections/GeneralInfoSection.vue'
import ScoreConstraintsSection from '@/components/forms/sections/ScoreConstraintsSection.vue'
import ValidationModeSection from '@/components/forms/sections/ValidationModeSection.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const {
  currentSeason,
  finishedSeasons,
  loading,
  error,
  loadSeasonById,
  createSeason,
  updateSeason,
  setAutomation,
  deleteAutomation,
  loadFinishedSeasons,
} = useRankedService()

const {
  organizations,
  disciplineOptions,
  rulesOptions,
  loadAll: loadFormReferences,
} = useFormReferences()
const { isSuperAdmin } = useAuth()

const isEditMode = computed(() => !!route.params.id && route.params.id !== 'new')

const toast = useAppToast()

const schema = computed(() =>
  isEditMode.value ? updateRankedSeasonFormSchema : createRankedSeasonFormSchema,
)

type RankedSeasonFormState = Partial<CreateRankedSeasonFormData>
// A ref, not a reactive: the sections bind it with `v-model:state`, which needs
// a binding it can reassign.
const state = ref<RankedSeasonFormState>({})

/**
 * The chain settings are not part of the season payload — they live behind their own endpoint
 * and must never travel through `updateSeason`, which replays the season's MMR whenever a
 * config field moves. Hence plain refs validated by hand, outside the season's UForm schema.
 */
const automationEnabled = ref(false)
const automationErrors = ref<Record<string, string>>({})
const seasonNumberPlaceholder = SEASON_NUMBER_PLACEHOLDER

function defaultAutomation(): RankedSeasonAutomationInput {
  return {
    enabled: true,
    mode: 'chain',
    durationDays: 30,
    nameTemplate: `${t('rankedSeasonFormView.defaultNameWord')} ${SEASON_NUMBER_PLACEHOLDER}`,
    carryParticipants: true,
    participantsMinMatches: 0,
    carryTiers: true,
    tierScalingMode: 'keep',
    carryMmr: true,
    softResetFactor: 0.5,
  }
}

const automation = ref<RankedSeasonAutomationInput>(defaultAutomation())

/**
 * What the next season will be called, so the template is not read blind. The number is the
 * server's: it counts the seasons already run for this organization and discipline, which a
 * form that has never been saved cannot know — hence the 1 until it has.
 */
const nameTemplatePreview = computed(() =>
  renderSeasonName(
    automation.value.nameTemplate,
    currentSeason.value?.automation?.nextSeasonNumber ?? 1,
  ),
)

/** Returns false and fills `automationErrors` when the chain settings do not validate. */
function validateAutomation(): boolean {
  automationErrors.value = {}
  if (!automationEnabled.value) return true

  const parsed = rankedSeasonAutomationFormSchema.safeParse(automation.value)
  if (parsed.success) return true

  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string') automationErrors.value[key] = issue.message
  }
  return false
}

/**
 * Saved after the season itself: on a create the season has no id until then, and on an edit
 * the two are independent writes anyway.
 */
async function persistAutomation(seasonId: string): Promise<void> {
  if (automationEnabled.value) {
    await setAutomation(seasonId, { ...automation.value, enabled: true })
  } else if (currentSeason.value?.automation) {
    await deleteAutomation(seasonId)
  }
}

const automationModeOptions = computed(() => [
  { label: t('rankedSeasonFormView.automationModeChain'), value: 'chain' },
  { label: t('rankedSeasonFormView.automationModeClose'), value: 'close' },
])

const tierScalingOptions = computed(() => [
  { label: t('rankedSeasonFormView.tierScalingKeep'), value: 'keep' },
  { label: t('rankedSeasonFormView.tierScalingPercentile'), value: 'percentile' },
])

function tierScalingHelp(mode: string | undefined) {
  return mode === 'percentile'
    ? t('rankedSeasonFormView.helpTierScalingPercentile')
    : t('rankedSeasonFormView.helpTierScalingKeep')
}

const currentSeasonId = computed(() => (isEditMode.value ? (route.params.id as string) : null))

/**
 * Once a season leaves draft the API locks its structural fields. The form used
 * to resend them untouched, so editing a name failed with the whole payload
 * rejected — the values are compared against what was loaded and only the ones
 * that actually moved are sent.
 */
const isDraft = computed(() => !isEditMode.value || currentSeason.value?.status === 'draft')

type FormValues = Record<string, unknown>
const initialValues = ref<FormValues | null>(null)

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : NaN
    const tb = b instanceof Date ? b.getTime() : NaN
    return ta === tb
  }
  // The form normalises "no value" to null, the payload may carry undefined.
  if (a == null && b == null) return true
  return a === b
}

function changedValues(values: FormValues): FormValues {
  const initial = initialValues.value
  if (!initial) return values
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, initial[key])),
  )
}
const sourceTierOptions = computed(() =>
  finishedSeasons.value
    .filter((s) => s.id !== currentSeasonId.value)
    .map((s) => {
      const disciplineSuffix = s.discipline ? ` — ${s.discipline.name}` : ''
      return { label: `${s.name}${disciplineSuffix}`, value: s.id }
    }),
)

const fieldLabels: Record<string, string> = {
  name: t('rankedSeasonFormView.fieldName'),
  disciplineId: t('rankedSeasonFormView.fieldDisciplineId'),
  startDate: t('rankedSeasonFormView.fieldStartDate'),
  endDate: t('rankedSeasonFormView.fieldEndDate'),
  minTeamSize: t('rankedSeasonFormView.fieldMinTeamSize'),
  maxTeamSize: t('rankedSeasonFormView.fieldMaxTeamSize'),
  baseMmr: t('rankedSeasonFormView.labelBaseMmr'),
  kFactor: t('rankedSeasonFormView.labelKFactor'),
  placementMatches: t('rankedSeasonFormView.labelPlacementMatches'),
  softResetFactor: t('rankedSeasonFormView.labelSoftResetFactor'),
  tierScalingMode: t('rankedSeasonFormView.labelTierScalingMode'),
  sourceMmrSeasonId: t('rankedSeasonFormView.labelSourceMmrSeasonId'),
  minScore: t('rankedSeasonFormView.fieldMinScore'),
  maxScore: t('rankedSeasonFormView.fieldMaxScore'),
  validationMode: t('rankedSeasonFormView.fieldValidationMode'),
}

async function onSubmit({ data: values }: FormSubmitEvent<RankedSeasonFormState>) {
  if (!validateAutomation()) {
    toast.add({
      severity: 'error',
      summary: t('rankedSeasonFormView.invalidFieldsTitle'),
      detail: Object.values(automationErrors.value).join('\n'),
      life: 8000,
    })
    return
  }

  if (isEditMode.value) {
    const id = route.params.id as string
    const changes = changedValues(values as FormValues)
    const seasonChanged = Object.keys(changes).length > 0
    const success = seasonChanged
      ? await updateSeason(id, changes as UpdateRankedSeasonFormData)
      : true
    if (!success) return
    await persistAutomation(id)
    router.push('/admin/ranked')
  } else {
    const season = await createSeason(values as CreateRankedSeasonFormData)
    if (!season) return
    await persistAutomation(season.id)
    router.push('/admin/ranked')
  }
}

/** The form is long: list what failed in one place rather than leaving it to scrolling. */
function onInvalid(event: FormErrorEvent) {
  const detail = event.errors
    .map((err) => `• ${fieldLabels[err.name ?? ''] ?? err.name}: ${err.message}`)
    .join('\n')
  toast.add({
    severity: 'error',
    summary: t('rankedSeasonFormView.invalidFieldsTitle'),
    detail,
    life: 8000,
  })
}

onMounted(async () => {
  await Promise.all([loadFormReferences(), loadFinishedSeasons()])
  if (isEditMode.value) {
    const id = route.params.id as string
    await loadSeasonById(id)
    if (currentSeason.value) {
      const s = currentSeason.value
      const loaded = {
        name: s.name,
        description: s.description ?? '',
        disciplineId: s.disciplineId,
        startDate: s.startDate ? new Date(s.startDate) : undefined,
        endDate: s.endDate ? new Date(s.endDate) : undefined,
        minTeamSize: s.minTeamSize,
        maxTeamSize: s.maxTeamSize,
        rulesId: s.rulesId ?? null,
        scoreEnabled: s.scoreEnabled ?? true,
        minScore: s.minScore ?? null,
        maxScore: s.maxScore ?? null,
        allowDraw: s.allowDraw ?? true,
        baseMmr: s.rankedConfig?.baseMmr ?? 1000,
        kFactor: s.rankedConfig?.kFactor ?? 32,
        placementMatches: s.rankedConfig?.placementMatches ?? 5,
        usePreviousMmr: s.rankedConfig?.usePreviousMmr ?? false,
        softResetFactor: s.rankedConfig?.softResetFactor ?? 0.5,
        allowAsymmetricMatches: s.rankedConfig?.allowAsymmetricMatches ?? false,
        sourceTierSeasonId: s.rankedConfig?.sourceTierSeasonId ?? null,
        tierScalingMode: s.rankedConfig?.tierScalingMode ?? 'keep',
        sourceMmrSeasonId: s.rankedConfig?.sourceMmrSeasonId ?? null,
        validationMode: (s.validationMode ?? 'strict') as 'none' | 'auto' | 'strict' | 'admin',
        validationTimerHours: s.validationTimerHours ?? null,
      }
      Object.assign(state.value, loaded)
      initialValues.value = { ...loaded }
      if (s.automation) {
        automationEnabled.value = s.automation.enabled
        automation.value = {
          enabled: s.automation.enabled,
          mode: s.automation.mode,
          durationDays: s.automation.durationDays,
          nameTemplate: s.automation.nameTemplate,
          carryParticipants: s.automation.carryParticipants,
          participantsMinMatches: s.automation.participantsMinMatches,
          carryTiers: s.automation.carryTiers,
          tierScalingMode: s.automation.tierScalingMode,
          carryMmr: s.automation.carryMmr,
          softResetFactor: s.automation.softResetFactor,
        }
      }
    }
  } else {
    Object.assign(state.value, {
      minTeamSize: 1,
      maxTeamSize: 2,
      baseMmr: 1000,
      kFactor: 32,
      placementMatches: 5,
      usePreviousMmr: false,
      softResetFactor: 0.5,
      sourceMmrSeasonId: null,
      tierScalingMode: 'keep',
      allowAsymmetricMatches: false,
      scoreEnabled: true,
      allowDraw: true,
      validationMode: 'strict',
      validationTimerHours: null,
    })
  }
})
</script>
