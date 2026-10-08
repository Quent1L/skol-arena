<template>
  <section>
    <h2 class="mb-4 text-lg font-semibold text-highlighted">
      {{ t('scoreConstraintsSection.title') }}
    </h2>

    <div class="mb-4">
      <USwitch
        v-model="state.scoreEnabled"
        :disabled="!canEdit('scoreEnabled')"
        :label="t('scoreConstraintsSection.fields.scoreEnabled')"
      />
      <FieldEditabilityNote
        :locked-by-matches="lockedByMatches('scoreEnabled')"
        :match-count="enteredMatchCount"
      />
    </div>

    <div v-if="state.scoreEnabled !== false" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField name="minScore" :label="t('scoreConstraintsSection.fields.minScore')">
        <UInputNumber
          v-model="state.minScore"
          :min="0"
          :disabled="!canEdit('minScore')"
          :placeholder="t('scoreConstraintsSection.placeholders.noLimit')"
          class="w-full"
        />
        <FieldEditabilityNote
          :locked-by-matches="lockedByMatches('minScore')"
          :match-count="enteredMatchCount"
        />
      </UFormField>
      <UFormField name="maxScore" :label="t('scoreConstraintsSection.fields.maxScore')">
        <UInputNumber
          v-model="state.maxScore"
          :min="0"
          :disabled="!canEdit('maxScore')"
          :placeholder="t('scoreConstraintsSection.placeholders.noLimit')"
          class="w-full"
        />
        <FieldEditabilityNote
          :locked-by-matches="lockedByMatches('maxScore')"
          :match-count="enteredMatchCount"
        />
      </UFormField>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TournamentEditability } from '@skol-arena/shared/types/index'
import { useFieldEditability } from '@/composables/useFieldEditability'
import FieldEditabilityNote from '../FieldEditabilityNote.vue'
import type { ScoreConstraintsState } from './section-state'

const { t } = useI18n()

const props = defineProps<{
  editability?: TournamentEditability | null
}>()

const state = defineModel<ScoreConstraintsState>('state', { required: true })

const { canEdit, lockedByMatches, enteredMatchCount } = useFieldEditability(
  () => props.editability,
)
</script>
