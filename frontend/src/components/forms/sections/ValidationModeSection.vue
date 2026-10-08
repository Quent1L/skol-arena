<template>
  <section>
    <h2 class="mb-4 text-lg font-semibold text-highlighted">{{ t('validationModeSection.title') }}</h2>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="state.validationMode === option.value"
        :disabled="!canEdit"
        class="rounded-lg border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-75"
        :class="
          state.validationMode === option.value
            ? 'border-primary bg-primary/10'
            : 'border-default hover:border-accented'
        "
        @click="setMode(option.value)"
      >
        <span class="mb-2 flex flex-wrap items-center gap-2">
          <UIcon :name="option.icon" class="size-5" />
          <span class="text-sm font-semibold">{{ option.label }}</span>
          <UBadge v-if="option.badge" :label="option.badge" color="neutral" variant="subtle" size="sm" />
        </span>
        <span class="block text-xs text-muted">{{ option.description }}</span>
      </button>
    </div>

    <UFormField
      v-if="state.validationMode === 'auto'"
      name="validationTimerHours"
      :label="t('validationModeSection.fields.validationTimerHours')"
      :help="t('validationModeSection.autoValidationHelp')"
    >
      <UInputNumber
        v-model="state.validationTimerHours"
        :min="1"
        :max="168"
        :disabled="!canEdit"
        placeholder="24"
        class="w-40"
      />
    </UFormField>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ValidationMode, TournamentEditability } from '@skol-arena/shared/types/index'
import { useFieldEditability } from '@/composables/useFieldEditability'
import type { ValidationModeState } from './section-state'

const { t } = useI18n()

const props = defineProps<{
  editability?: TournamentEditability | null
}>()

const state = defineModel<ValidationModeState>('state', { required: true })

const { canEdit: fieldCanEdit } = useFieldEditability(() => props.editability)
// Computed, not a plain const: this used to be evaluated once at setup, so it
// never reflected an editability that arrived after the component mounted.
const canEdit = computed(() => fieldCanEdit('validationMode'))

function setMode(mode: ValidationMode) {
  state.value.validationMode = mode
  if (mode !== 'auto') {
    state.value.validationTimerHours = null
  } else if (!state.value.validationTimerHours) {
    state.value.validationTimerHours = 24
  }
}

const modeOptions = computed<{ value: ValidationMode; label: string; icon: string; badge?: string; description: string }[]>(() => [
  {
    value: 'auto',
    label: t('validationModeSection.modes.auto.label'),
    icon: 'i-fa7-solid:bolt',
    badge: t('validationModeSection.modes.auto.badge'),
    description: t('validationModeSection.modes.auto.description'),
  },
  {
    value: 'strict',
    label: t('validationModeSection.modes.strict.label'),
    icon: 'i-fa7-solid:shield-halved',
    badge: t('validationModeSection.modes.strict.badge'),
    description: t('validationModeSection.modes.strict.description'),
  },
  {
    value: 'admin',
    label: t('validationModeSection.modes.admin.label'),
    icon: 'i-fa7-solid:crown',
    badge: t('validationModeSection.modes.admin.badge'),
    description: t('validationModeSection.modes.admin.description'),
  },
  {
    value: 'none',
    label: t('validationModeSection.modes.none.label'),
    icon: 'i-fa7-solid:eye-slash',
    badge: t('validationModeSection.modes.none.badge'),
    description: t('validationModeSection.modes.none.description'),
  },
])
</script>
