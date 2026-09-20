<template>
  <div>
    <Toast />
    <div class="ranked-season-form-view p-4">
      <div class="flex items-center gap-3 mb-6">
        <Button icon="fa fa-arrow-left" text rounded @click="router.push('/admin/ranked')" />
        <h1 class="text-2xl font-bold">
          {{
            isEditMode ? t('rankedSeasonFormView.editTitle') : t('rankedSeasonFormView.newTitle')
          }}
        </h1>
      </div>

      <Message v-if="error" severity="error" :closable="true" class="mb-4">
        {{ error }}
      </Message>

      <form @submit="onSubmit" class="max-w-4xl">
        <Card>
          <template #content>
            <!-- General information -->
            <div class="mb-6">
              <GeneralInfoSection
                :discipline-options="disciplineOptions"
                :rules-options="rulesOptions"
                :organizations="organizations"
                :is-super-admin="isSuperAdmin"
                :discipline-locked="isEditMode"
                :locked-discipline-name="currentSeason?.discipline?.name ?? ''"
                :description-placeholder="t('rankedSeasonFormView.descriptionPlaceholder')"
                :name-placeholder="t('rankedSeasonFormView.namePlaceholder')"
              />
            </div>

            <!-- Configuration Elo -->
            <div class="mb-6">
              <h2 class="text-xl font-semibold mb-4">
                {{ t('rankedSeasonFormView.eloConfigTitle') }}
              </h2>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label for="baseMmr" class="block text-sm font-medium mb-2">{{
                    t('rankedSeasonFormView.labelBaseMmr')
                  }}</label>
                  <InputNumber
                    id="baseMmr"
                    v-model="baseMmr"
                    :min="100"
                    :max="5000"
                    class="w-full"
                    :class="{ 'p-invalid': errors.baseMmr }"
                  />
                  <small class="p-error">{{ errors.baseMmr }}</small>
                </div>

                <div>
                  <label for="kFactor" class="block text-sm font-medium mb-2">{{
                    t('rankedSeasonFormView.labelKFactor')
                  }}</label>
                  <InputNumber
                    id="kFactor"
                    v-model="kFactor"
                    :min="8"
                    :max="128"
                    class="w-full"
                    :class="{ 'p-invalid': errors.kFactor }"
                  />
                  <small class="p-error">{{ errors.kFactor }}</small>
                </div>

                <div>
                  <label for="placementMatches" class="block text-sm font-medium mb-2">
                    {{ t('rankedSeasonFormView.labelPlacementMatches') }}
                  </label>
                  <InputNumber
                    id="placementMatches"
                    v-model="placementMatches"
                    :min="0"
                    :max="20"
                    class="w-full"
                    :class="{ 'p-invalid': errors.placementMatches }"
                  />
                  <small class="p-error">{{ errors.placementMatches }}</small>
                </div>
              </div>

              <div class="flex flex-col gap-3 mt-4">
                <div class="flex items-center gap-2">
                  <Checkbox id="usePreviousMmr" v-model="usePreviousMmr" :binary="true" />
                  <label for="usePreviousMmr" class="text-sm">
                    {{ t('rankedSeasonFormView.labelUsePreviousMmr') }}
                  </label>
                </div>
                <!-- Carry-over settings: only meaningful once it is switched on. -->
                <div v-if="usePreviousMmr" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
                  <div>
                    <label for="softResetFactor" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelSoftResetFactor') }}
                    </label>
                    <InputNumber
                      id="softResetFactor"
                      v-model="softResetFactor"
                      :min="0"
                      :max="1"
                      :step="0.05"
                      :min-fraction-digits="0"
                      :max-fraction-digits="2"
                      class="w-full"
                      :class="{ 'p-invalid': errors.softResetFactor }"
                    />
                    <small v-if="errors.softResetFactor" class="p-error">{{
                      errors.softResetFactor
                    }}</small>
                    <small v-else class="text-surface-400">
                      {{ t('rankedSeasonFormView.helpSoftResetFactor') }}
                    </small>
                  </div>

                  <div>
                    <label for="sourceMmrSeasonId" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelSourceMmrSeasonId') }}
                    </label>
                    <Select
                      id="sourceMmrSeasonId"
                      v-model="sourceMmrSeasonId"
                      :options="sourceTierOptions"
                      option-label="label"
                      option-value="value"
                      :placeholder="t('rankedSeasonFormView.placeholderSourceMmrSeasonId')"
                      class="w-full"
                      show-clear
                    />
                    <small class="text-surface-400">
                      {{ t('rankedSeasonFormView.helpSourceMmrSeasonId') }}
                    </small>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="allowAsymmetricMatches"
                    v-model="allowAsymmetricMatches"
                    :binary="true"
                  />
                  <label for="allowAsymmetricMatches" class="text-sm">
                    {{ t('rankedSeasonFormView.labelAllowAsymmetricMatches') }}
                  </label>
                </div>
              </div>

              <!-- Consumed once by startSeason: past draft, these two mean nothing and
                   the API refuses them, so they are not offered at all. -->
              <div v-if="isDraft" class="mt-4">
                <label for="sourceTierSeasonId" class="block text-sm font-medium mb-2">
                  {{ t('rankedSeasonFormView.labelSourceTierSeasonId') }}
                </label>
                <Select
                  id="sourceTierSeasonId"
                  v-model="sourceTierSeasonId"
                  :options="sourceTierOptions"
                  option-label="label"
                  option-value="value"
                  :placeholder="t('rankedSeasonFormView.placeholderSourceTierSeasonId')"
                  class="w-full"
                  show-clear
                />
                <small class="text-surface-400">
                  {{ t('rankedSeasonFormView.helpSourceTierSeasonId') }}
                </small>
              </div>

              <!-- Only matters when a ladder is actually copied. -->
              <div v-if="isDraft && sourceTierSeasonId" class="mt-4">
                <label for="tierScalingMode" class="block text-sm font-medium mb-2">
                  {{ t('rankedSeasonFormView.labelTierScalingMode') }}
                </label>
                <Select
                  id="tierScalingMode"
                  v-model="tierScalingMode"
                  :options="tierScalingOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                />
                <small class="text-surface-400">
                  {{
                    tierScalingMode === 'percentile'
                      ? t('rankedSeasonFormView.helpTierScalingPercentile')
                      : t('rankedSeasonFormView.helpTierScalingKeep')
                  }}
                </small>
              </div>
            </div>

            <!-- Fin de saison automatique : enchaînement ou simple clôture -->
            <div class="mb-6">
              <h3 class="text-lg font-semibold mb-4">
                {{ t('rankedSeasonFormView.automationTitle') }}
              </h3>
              <p class="text-sm text-surface-400 mb-4">
                {{ t('rankedSeasonFormView.automationIntro') }}
              </p>

              <div class="flex items-center gap-2">
                <Checkbox id="automationEnabled" v-model="automationEnabled" :binary="true" />
                <label for="automationEnabled" class="text-sm">
                  {{ t('rankedSeasonFormView.labelAutomationEnabled') }}
                </label>
              </div>

              <div v-if="automationEnabled" class="mt-4 pl-6 flex flex-col gap-4">
                <div>
                  <label for="automationMode" class="block text-sm font-medium mb-2">
                    {{ t('rankedSeasonFormView.labelAutomationMode') }}
                  </label>
                  <SelectButton
                    id="automationMode"
                    v-model="automation.mode"
                    :options="automationModeOptions"
                    option-label="label"
                    option-value="value"
                    :allow-empty="false"
                  />
                  <small class="block text-surface-400 mt-1">
                    {{
                      automation.mode === 'close'
                        ? t('rankedSeasonFormView.helpAutomationModeClose')
                        : t('rankedSeasonFormView.helpAutomationModeChain')
                    }}
                  </small>
                </div>

                <template v-if="automation.mode === 'chain'">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label for="durationDays" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelDurationDays') }}
                    </label>
                    <InputNumber
                      id="durationDays"
                      v-model="automation.durationDays"
                      :min="1"
                      :max="365"
                      class="w-full"
                      :class="{ 'p-invalid': automationErrors.durationDays }"
                    />
                    <small v-if="automationErrors.durationDays" class="p-error">{{
                      automationErrors.durationDays
                    }}</small>
                    <small v-else class="text-surface-400">
                      {{ t('rankedSeasonFormView.helpDurationDays') }}
                    </small>
                  </div>

                  <div>
                    <label for="nameTemplate" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelNameTemplate') }}
                    </label>
                    <InputText
                      id="nameTemplate"
                      v-model="automation.nameTemplate"
                      class="w-full"
                      :class="{ 'p-invalid': automationErrors.nameTemplate }"
                    />
                    <small v-if="automationErrors.nameTemplate" class="p-error">{{
                      automationErrors.nameTemplate
                    }}</small>
                    <small v-else class="text-surface-400">
                      {{
                        t('rankedSeasonFormView.helpNameTemplate', {
                          placeholder: seasonNumberPlaceholder,
                          example: nameTemplatePreview,
                        })
                      }}
                    </small>
                  </div>
                </div>

                <div class="flex flex-col gap-3">
                  <div class="flex items-center gap-2">
                    <Checkbox
                      id="carryParticipants"
                      v-model="automation.carryParticipants"
                      :binary="true"
                    />
                    <label for="carryParticipants" class="text-sm">
                      {{ t('rankedSeasonFormView.labelCarryParticipants') }}
                    </label>
                  </div>
                  <small class="text-surface-400 pl-6 -mt-2">
                    {{ t('rankedSeasonFormView.helpCarryParticipants') }}
                  </small>

                  <div v-if="automation.carryParticipants" class="pl-6">
                    <label for="participantsMinMatches" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelParticipantsMinMatches') }}
                    </label>
                    <InputNumber
                      id="participantsMinMatches"
                      v-model="automation.participantsMinMatches"
                      :min="0"
                      :max="50"
                      class="w-full sm:w-48"
                    />
                    <small class="block text-surface-400 mt-1">
                      {{ t('rankedSeasonFormView.helpParticipantsMinMatches') }}
                    </small>
                  </div>

                  <div class="flex items-center gap-2">
                    <Checkbox id="carryTiers" v-model="automation.carryTiers" :binary="true" />
                    <label for="carryTiers" class="text-sm">
                      {{ t('rankedSeasonFormView.labelCarryTiers') }}
                    </label>
                  </div>

                  <div v-if="automation.carryTiers" class="pl-6">
                    <label for="automationTierScaling" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelTierScalingMode') }}
                    </label>
                    <Select
                      id="automationTierScaling"
                      v-model="automation.tierScalingMode"
                      :options="tierScalingOptions"
                      option-label="label"
                      option-value="value"
                      class="w-full"
                    />
                    <small class="text-surface-400">
                      {{
                        automation.tierScalingMode === 'percentile'
                          ? t('rankedSeasonFormView.helpTierScalingPercentile')
                          : t('rankedSeasonFormView.helpTierScalingKeep')
                      }}
                    </small>
                  </div>

                  <div class="flex items-center gap-2">
                    <Checkbox id="carryMmr" v-model="automation.carryMmr" :binary="true" />
                    <label for="carryMmr" class="text-sm">
                      {{ t('rankedSeasonFormView.labelCarryMmr') }}
                    </label>
                  </div>

                  <div v-if="automation.carryMmr" class="pl-6">
                    <label for="automationSoftReset" class="block text-sm font-medium mb-2">
                      {{ t('rankedSeasonFormView.labelSoftResetFactor') }}
                    </label>
                    <InputNumber
                      id="automationSoftReset"
                      v-model="automation.softResetFactor"
                      :min="0"
                      :max="1"
                      :step="0.05"
                      :min-fraction-digits="0"
                      :max-fraction-digits="2"
                      class="w-full sm:w-48"
                    />
                    <small class="block text-surface-400 mt-1">
                      {{ t('rankedSeasonFormView.helpSoftResetFactor') }}
                    </small>
                  </div>
                </div>
                </template>
              </div>
            </div>

            <!-- Contraintes de score -->
            <div class="mb-6">
              <ScoreConstraintsSection />
            </div>

            <!-- Mode de validation -->
            <div class="mb-6">
              <ValidationModeSection />
            </div>

            <!-- Actions -->
            <div class="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
              <Button
                :label="t('common.cancel')"
                severity="secondary"
                @click="router.push('/admin/ranked')"
                :disabled="loading"
                class="w-full sm:w-auto"
              />
              <Button
                type="submit"
                :label="isEditMode ? t('common.update') : t('rankedSeasonFormView.createSeason')"
                icon="fa fa-check"
                :loading="loading"
                class="w-full sm:w-auto"
              />
            </div>
          </template>
        </Card>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
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

const { handleSubmit, defineField, setValues, errors } = useForm({
  validationSchema: toTypedSchema(
    isEditMode.value ? updateRankedSeasonFormSchema : createRankedSeasonFormSchema,
  ),
})

const [baseMmr] = defineField('baseMmr')
const [kFactor] = defineField('kFactor')
const [placementMatches] = defineField('placementMatches')
const [usePreviousMmr] = defineField('usePreviousMmr')
const [softResetFactor] = defineField('softResetFactor')
const [allowAsymmetricMatches] = defineField('allowAsymmetricMatches')
const [sourceTierSeasonId] = defineField('sourceTierSeasonId')
const [tierScalingMode] = defineField('tierScalingMode')
const [sourceMmrSeasonId] = defineField('sourceMmrSeasonId')

/**
 * The chain settings are not part of the season payload — they live behind their own endpoint
 * and must never travel through `updateSeason`, which replays the season's MMR whenever a
 * config field moves. Hence plain refs validated by hand rather than vee-validate fields.
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

const onSubmit = handleSubmit(
  async (values) => {
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
  },
  ({ errors: formErrors }) => {
    const errs = formErrors as Record<string, string>
    const detail = Object.keys(errs)
      .map((k) => `• ${fieldLabels[k] ?? k}: ${errs[k]}`)
      .join('\n')
    toast.add({
      severity: 'error',
      summary: t('rankedSeasonFormView.invalidFieldsTitle'),
      detail,
      life: 8000,
    })
  },
)

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
      setValues(loaded)
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
    setValues({
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

<style scoped>
.ranked-season-form-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
