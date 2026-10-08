<template>
  <UModal
    :open="visible"
    :title="t('propagateRuleset.header')"
    :ui="{ content: 'sm:max-w-2xl', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="(open) => emit('update:visible', open)"
  >
    <template #body>
      <div v-if="loading" class="flex justify-center py-6">
        <UIcon name="i-fa7-solid:spinner" class="size-6 animate-spin text-muted" />
      </div>

      <p v-else-if="competitions.length === 0" class="py-4 text-muted">
        {{ t('propagateRuleset.emptyState') }}
      </p>

      <div v-else class="space-y-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-fa7-solid:triangle-exclamation"
          :description="t('propagateRuleset.warning')"
        />

        <!-- A checklist rather than a table: it reads the same at every width. -->
        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="competition in competitions"
            :key="competition.id"
            class="px-3 py-2"
            data-testid="propagate-row"
          >
            <UCheckbox
              :model-value="isSelected(competition)"
              :ui="{ wrapper: 'min-w-0' }"
              @update:model-value="(checked) => toggle(competition, checked === true)"
            >
              <template #label>
                <span class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{{ competition.name }}</span>
                  <UBadge
                    v-if="!competition.hasDrift"
                    color="neutral"
                    variant="subtle"
                    :label="t('propagateRuleset.upToDateTag')"
                  />
                </span>
              </template>
              <template #description>
                {{ competition.status }} ·
                <template v-if="competition.matchCount === 0">
                  {{ t('propagateRuleset.noMatches') }}
                </template>
                <template v-else>
                  {{ t('propagateRuleset.matchesEntered', { count: competition.matchCount }) }}
                </template>
              </template>
            </UCheckbox>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <UButton
        :label="t('common.cancel')"
        color="neutral"
        variant="ghost"
        class="justify-center"
        @click="close"
      />
      <UButton
        :label="t('propagateRuleset.apply')"
        icon="i-fa7-solid:arrows-rotate"
        class="justify-center"
        :disabled="selected.length === 0 || submitting"
        :loading="submitting"
        data-testid="propagate-apply"
        @click="submit"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ImpactedCompetition } from '@skol-arena/shared/types/index'

interface Props {
  visible: boolean
  disciplineId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  propagate: [tournamentIds: string[]]
  load: [disciplineId: string]
}>()

const { t } = useI18n()

const competitions = ref<ImpactedCompetition[]>([])
const selected = ref<ImpactedCompetition[]>([])
const loading = ref(false)
const submitting = ref(false)

/**
 * Competitions that have already drifted are preselected: they are the ones the
 * admin just caused by saving the discipline. An up-to-date one is listed but
 * left unchecked, since propagating to it would only cost a recalculation.
 */
function setCompetitions(rows: ImpactedCompetition[]) {
  competitions.value = rows
  selected.value = rows.filter((row) => row.hasDrift)
  loading.value = false
}

function isSelected(competition: ImpactedCompetition) {
  return selected.value.some((row) => row.id === competition.id)
}

function toggle(competition: ImpactedCompetition, checked: boolean) {
  selected.value = checked
    ? [...selected.value, competition]
    : selected.value.filter((row) => row.id !== competition.id)
}

function setLoading() {
  loading.value = true
  competitions.value = []
  selected.value = []
}

function close() {
  emit('update:visible', false)
}

function submit() {
  submitting.value = true
  emit(
    'propagate',
    selected.value.map((row) => row.id),
  )
}

function setSubmitted() {
  submitting.value = false
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && props.disciplineId) {
      setLoading()
      emit('load', props.disciplineId)
    }
  },
)

defineExpose({ setCompetitions, setSubmitted })
</script>
