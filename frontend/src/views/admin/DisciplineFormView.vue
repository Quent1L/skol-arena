<template>
  <div class="max-w-4xl">
    <AdminPageHeader
      :title="isEditMode ? (currentDiscipline?.name ?? '') : t('disciplineList.newDiscipline')"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <!-- Outcome types save as you edit them, so drift can appear at any moment
         and not just when the discipline form is submitted. This stays visible
         for as long as a running competition is out of step. -->
    <UAlert
      v-if="driftingCompetitionCount > 0"
      color="warning"
      variant="subtle"
      icon="i-fa7-solid:triangle-exclamation"
      :description="t('disciplineFormView.driftBanner', { count: driftingCompetitionCount })"
      :actions="[
        {
          label: t('disciplineFormView.reviewPropagation'),
          icon: 'i-fa7-solid:arrows-rotate',
          color: 'warning',
          onClick: () => (propagateDialogVisible = true),
        },
      ]"
      orientation="horizontal"
      class="mb-4"
      :ui="{ root: 'flex-col sm:flex-row', actions: 'sm:ms-auto' }"
    />

    <UForm :schema="schema" :state="state" @submit="onSubmit">
      <UCard>
        <h2 class="mb-4 text-lg font-semibold text-highlighted">
          {{ t('disciplineFormView.sectionInfo') }}
        </h2>

        <div class="space-y-4">
          <UFormField name="name" :label="t('disciplineFormView.nameLabel')" required>
            <UInput v-model="state.name" class="w-full" />
          </UFormField>

          <UFormField
            name="scoreInstructions"
            :label="t('disciplineFormView.scoreInstructionsLabel')"
          >
            <UTextarea
              v-model="scoreInstructions"
              :rows="3"
              autoresize
              :placeholder="t('disciplineFormView.scoreInstructionsPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField name="icon" :label="t('disciplineFormView.iconLabel')">
            <FontAwesomeIconPicker v-model="icon" />
          </UFormField>

          <UFormField
            name="teamInteractionMode"
            :label="t('disciplineFormView.teamInteractionModeLabel')"
          >
            <USelectMenu
              v-model="state.teamInteractionMode"
              :items="interactionModeOptions"
              value-key="value"
              :search-input="false"
              clear
              :placeholder="t('disciplineFormView.selectModePlaceholder')"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Outcome types (edit mode only) -->
        <OutcomeTypeTable
          v-if="isEditMode && currentDiscipline"
          ref="outcomeTypeTableRef"
          class="mt-6"
          :outcome-types="outcomeTypes"
          :outcome-reasons="outcomeReasons"
          :loading="loading"
          :load-outcome-reasons="loadOutcomeReasons"
          @add-outcome-type="showOutcomeTypeDialog()"
          @edit-outcome-type="showOutcomeTypeDialog"
          @delete-outcome-type="confirmDeleteOutcomeType"
          @restore-outcome-type="handleRestoreOutcomeType"
          @add-outcome-reason="showOutcomeReasonDialog"
          @edit-outcome-reason="(type, reason) => showOutcomeReasonDialog(type, reason)"
          @delete-outcome-reason="confirmDeleteOutcomeReason"
        />

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

    <!-- Outcome Type Dialog -->
    <OutcomeTypeDialog
      v-model:visible="outcomeTypeDialogVisible"
      :editing="editingOutcomeType"
      :loading="loading"
      @submit="handleOutcomeTypeSubmit"
    />

    <!-- Push this discipline onto competitions that are still running -->
    <PropagateRulesetDialog
      ref="propagateDialogRef"
      v-model:visible="propagateDialogVisible"
      :discipline-id="(route.params.id as string) ?? null"
      @load="refreshDrift"
      @propagate="handlePropagate"
    />

    <!-- Outcome Reason Dialog -->
    <OutcomeReasonDialog
      v-model:visible="outcomeReasonDialogVisible"
      :editing="editingOutcomeReason"
      :loading="loading"
      @submit="handleOutcomeReasonSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  createDisciplineSchema,
  updateDisciplineSchema,
  type CreateDisciplineRequestData,
  type OutcomeType,
  type ImpactedCompetition,
} from '@skol-arena/shared/types/index'
import type { OutcomeReason } from '@skol-arena/shared/types/outcome-reason'
import { useDisciplineService } from '@/composables/discipline/discipline.service'
import { disciplineApi, type InteractionModeOption } from '@/composables/discipline/discipline.api'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import OutcomeTypeTable from './components/OutcomeTypeTable.vue'
import OutcomeTypeDialog from './components/OutcomeTypeDialog.vue'
import OutcomeReasonDialog from './components/OutcomeReasonDialog.vue'
import PropagateRulesetDialog from './components/PropagateRulesetDialog.vue'
import { useAppToast } from '@/composables/useAppToast'
import FontAwesomeIconPicker from '@/components/forms/FontAwesomeIconPicker.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const confirm = useConfirmDialog()
const toast = useAppToast()
const {
  currentDiscipline,
  outcomeTypes,
  outcomeReasons,
  loading,
  error,
  getDiscipline,
  createDiscipline,
  updateDiscipline,
  createOutcomeType,
  updateOutcomeType,
  deleteOutcomeType,
  archiveOutcomeType,
  restoreOutcomeType,
  loadOutcomeReasons,
  createOutcomeReason,
  updateOutcomeReason,
  deleteOutcomeReason,
} = useDisciplineService()

const isEditMode = computed(() => route.params.id !== 'new' && !!route.params.id)

// Discipline form
const schema = computed(() => (isEditMode.value ? updateDisciplineSchema : createDisciplineSchema))
const state = reactive<CreateDisciplineRequestData>({
  name: '',
  icon: null,
  scoreInstructions: null,
  teamInteractionMode: null,
})
// The inputs speak `string`, the schema `string | null`: bridge the empty value.
const icon = computed({
  get: () => state.icon ?? '',
  set: (value: string) => (state.icon = value || null),
})
const scoreInstructions = computed({
  get: () => state.scoreInstructions ?? '',
  set: (value: string) => (state.scoreInstructions = value || null),
})

const interactionModeOptions = ref<InteractionModeOption[]>([])

// Outcome Types management
const outcomeTypeTableRef = ref<InstanceType<typeof OutcomeTypeTable> | null>(null)
const outcomeTypeDialogVisible = ref(false)
const editingOutcomeType = ref<OutcomeType | null>(null)

// Pushing a discipline edit onto competitions that are still running
const propagateDialogVisible = ref(false)
const propagateDialogRef = ref<InstanceType<typeof PropagateRulesetDialog> | null>(null)
const impactedCompetitions = ref<ImpactedCompetition[]>([])
const driftingCompetitionCount = computed(
  () => impactedCompetitions.value.filter((competition) => competition.hasDrift).length,
)

// Outcome Reasons management
const outcomeReasonDialogVisible = ref(false)
const editingOutcomeReason = ref<OutcomeReason | null>(null)
const currentOutcomeTypeForReason = ref<OutcomeType | null>(null)

function showOutcomeTypeDialog(outcomeType?: OutcomeType) {
  editingOutcomeType.value = outcomeType || null
  outcomeTypeDialogVisible.value = true
}

async function handleOutcomeTypeSubmit(values: {
  name: string
  isDefault: boolean
  points: number
  mmrMultiplier: number
  scoreCountsForMmr: boolean
}) {
  if (!currentDiscipline.value) return

  try {
    if (editingOutcomeType.value) {
      await updateOutcomeType(editingOutcomeType.value.id, {
        name: values.name,
        isDefault: values.isDefault,
        points: values.points,
        mmrMultiplier: values.mmrMultiplier,
        scoreCountsForMmr: values.scoreCountsForMmr,
      })
    } else {
      await createOutcomeType({
        disciplineId: currentDiscipline.value.id,
        name: values.name,
        isDefault: values.isDefault,
        points: values.points,
        mmrMultiplier: values.mmrMultiplier,
        scoreCountsForMmr: values.scoreCountsForMmr,
      })
    }

    outcomeTypeDialogVisible.value = false
    editingOutcomeType.value = null
    await refreshDrift()
  } catch (err) {
    console.error('Erreur lors de la sauvegarde du type de résultat:', err)
  }
}

function showOutcomeReasonDialog(outcomeType: OutcomeType, outcomeReason?: OutcomeReason) {
  editingOutcomeReason.value = outcomeReason || null
  currentOutcomeTypeForReason.value = outcomeType
  outcomeReasonDialogVisible.value = true
}

async function handleOutcomeReasonSubmit(values: { name: string }) {
  if (!currentOutcomeTypeForReason.value) return

  try {
    if (editingOutcomeReason.value) {
      await updateOutcomeReason(editingOutcomeReason.value.id, {
        name: values.name,
      })
    } else {
      await createOutcomeReason({
        outcomeTypeId: currentOutcomeTypeForReason.value.id,
        name: values.name,
      })
    }

    const outcomeTypeId = currentOutcomeTypeForReason.value.id
    outcomeReasonDialogVisible.value = false
    editingOutcomeReason.value = null
    currentOutcomeTypeForReason.value = null

    // Reload reasons for this type
    await loadOutcomeReasons(outcomeTypeId)
    await refreshDrift()
  } catch (err) {
    console.error('Error saving outcome reason:', err)
  }
}

async function confirmDeleteOutcomeType(outcomeType: OutcomeType) {
  const confirmed = await confirm({
    title: t('disciplineFormView.confirmDeleteOutcomeTypeHeader'),
    message: t('disciplineFormView.confirmDeleteOutcomeTypeMessage'),
    confirmLabel: t('common.delete'),
    color: 'error',
  })
  if (!confirmed) return
  const idToDelete = outcomeType.id
  try {
    await deleteOutcomeType(idToDelete)
    // Remove from expandedRows if present
    if (outcomeTypeTableRef.value?.expandedRows[idToDelete]) {
      delete outcomeTypeTableRef.value.expandedRows[idToDelete]
    }
    await refreshDrift()
  } catch (err) {
    // A type nothing has been played under deletes cleanly. Once matches
    // reference it the backend refuses, and archiving is the way out — so
    // offer it rather than leaving the admin with a dead end.
    if ((err as Error)?.cause === 'OUTCOME_TYPE_IN_USE') {
      await promptArchiveOutcomeType(outcomeType)
    }
  }
}

async function promptArchiveOutcomeType(outcomeType: OutcomeType) {
  const confirmed = await confirm({
    title: t('disciplineFormView.archiveOutcomeTypeHeader'),
    message: t('disciplineFormView.archiveOutcomeTypeMessage', { name: outcomeType.name }),
    confirmLabel: t('disciplineFormView.archive'),
    icon: 'i-fa7-solid:box-archive',
    color: 'warning',
  })
  if (!confirmed) return
  try {
    await archiveOutcomeType(outcomeType.id)
    await refreshDrift()
  } catch {
    // Handled by the service toast.
  }
}

async function handleRestoreOutcomeType(outcomeType: OutcomeType) {
  try {
    await restoreOutcomeType(outcomeType.id)
    await refreshDrift()
  } catch {
    // Handled by the service toast.
  }
}

async function confirmDeleteOutcomeReason(outcomeReason: OutcomeReason) {
  const confirmed = await confirm({
    title: t('disciplineFormView.confirmDeleteOutcomeReasonHeader'),
    message: t('disciplineFormView.confirmDeleteOutcomeReasonMessage'),
    confirmLabel: t('common.delete'),
    color: 'error',
  })
  if (!confirmed) return
  try {
    const outcomeTypeId = outcomeReason.outcomeTypeId
    await deleteOutcomeReason(outcomeReason.id)
    await loadOutcomeReasons(outcomeTypeId)
    await refreshDrift()
  } catch (err) {
    console.error('Erreur lors de la suppression:', err)
  }
}

async function onSubmit({ data: values }: FormSubmitEvent<CreateDisciplineRequestData>) {
  try {
    if (isEditMode.value && route.params.id) {
      await updateDiscipline(route.params.id as string, values)
      await refreshDrift()
      // Leaving now would hide the banner the save may just have raised.
      if (driftingCompetitionCount.value > 0) return
    } else {
      await createDiscipline(values)
    }
    router.push('/admin/disciplines')
  } catch (err) {
    console.error('Erreur lors de la sauvegarde:', err)
  }
}

/**
 * How many running competitions are out of step with this discipline.
 *
 * Recomputed after every mutation on this page, not only on submit: outcome
 * types are saved the moment they are edited, and their points and MMR
 * multiplier are the changes that matter most — tying the prompt to the
 * discipline's own save button would have missed all of them.
 */
async function refreshDrift() {
  if (!isEditMode.value || !route.params.id) return
  try {
    const impacted = await disciplineApi.listImpactedCompetitions(route.params.id as string)
    impactedCompetitions.value = impacted
    propagateDialogRef.value?.setCompetitions(impacted)
  } catch {
    // Never let the preflight break the page; the banner simply stays hidden.
    impactedCompetitions.value = []
  }
}

async function handlePropagate(tournamentIds: string[]) {
  if (!route.params.id) return
  try {
    const results = await disciplineApi.propagate(route.params.id as string, tournamentIds)
    const failed = results.filter((result) => result.status === 'failed').length
    toast.add({
      severity: failed > 0 ? 'warn' : 'success',
      summary: t('common.success'),
      detail:
        failed > 0
          ? t('propagateRuleset.partialSuccess', { failed, total: results.length })
          : t('propagateRuleset.success', { count: results.length }),
      life: 5000,
    })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: err instanceof Error ? err.message : t('propagateRuleset.failed'),
      life: 5000,
    })
  } finally {
    propagateDialogRef.value?.setSubmitted()
    propagateDialogVisible.value = false
    // Stay on the page: whatever was left unselected is still drifting, and the
    // banner has to keep saying so.
    await refreshDrift()
  }
}

onMounted(async () => {
  const [modes] = await Promise.all([
    disciplineApi.listInteractionModes(),
    isEditMode.value && route.params.id ? getDiscipline(route.params.id as string) : Promise.resolve(),
  ])
  interactionModeOptions.value = modes
  if (isEditMode.value && currentDiscipline.value) {
    Object.assign(state, {
      name: currentDiscipline.value.name,
      icon: currentDiscipline.value.icon,
      scoreInstructions: currentDiscipline.value.scoreInstructions,
      teamInteractionMode: currentDiscipline.value.teamInteractionMode,
    })
    // Drift may already exist from an earlier visit that never propagated.
    await refreshDrift()
  }
})
</script>
