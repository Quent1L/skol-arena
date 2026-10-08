<template>
  <section>
    <h2 class="mb-4 text-lg font-semibold text-highlighted">{{ t('generalInfoSection.title') }}</h2>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <UFormField name="name" :label="t('generalInfoSection.fields.name')" required>
        <UInput
          v-model="state.name"
          :disabled="!canEdit('name')"
          :placeholder="namePlaceholder"
          class="w-full"
        />
      </UFormField>

      <UFormField name="disciplineId" :label="t('generalInfoSection.fields.discipline')" required>
        <UInput v-if="disciplineLocked" :model-value="lockedDisciplineName" disabled class="w-full" />
        <USelectMenu
          v-else
          v-model="state.disciplineId"
          :items="disciplineOptions"
          value-key="value"
          :placeholder="t('generalInfoSection.placeholders.discipline')"
          class="w-full"
        />
      </UFormField>

      <!-- Slot for extra fields at the top (tournament mode: status) -->
      <slot name="after-discipline" />

      <UFormField name="rulesId" :label="t('generalInfoSection.fields.rules')">
        <USelectMenu
          v-model="state.rulesId"
          :items="rulesOptions"
          value-key="value"
          clear
          :placeholder="t('generalInfoSection.placeholders.noRules')"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="isSuperAdmin"
        name="organizationId"
        :label="t('generalInfoSection.fields.organization')"
      >
        <USelectMenu
          v-model="state.organizationId"
          :items="organizations"
          value-key="id"
          label-key="name"
          clear
          :placeholder="t('generalInfoSection.placeholders.noOrganization')"
          class="w-full"
        />
      </UFormField>

      <UFormField
        name="description"
        :label="t('generalInfoSection.fields.description')"
        class="lg:col-span-2"
      >
        <RichTextEditor
          :model-value="state.description ?? ''"
          :disabled="!canEdit('description')"
          @update:model-value="state.description = $event"
        />
      </UFormField>

      <!-- Slot for fields specific before team sizes (tournament mode: mode / teamMode) -->
      <slot name="before-team-size" />

      <UFormField name="minTeamSize" :label="t('generalInfoSection.fields.minTeamSize')" required>
        <UInputNumber
          v-model="state.minTeamSize"
          :min="1"
          :max="10"
          :disabled="!canEdit('minTeamSize')"
          class="w-full"
        />
        <FieldEditabilityNote
          :locked-by-matches="lockedByMatches('minTeamSize')"
          :match-count="enteredMatchCount"
        />
      </UFormField>

      <UFormField name="maxTeamSize" :label="t('generalInfoSection.fields.maxTeamSize')" required>
        <UInputNumber
          v-model="state.maxTeamSize"
          :min="1"
          :max="10"
          :disabled="!canEdit('maxTeamSize')"
          class="w-full"
        />
      </UFormField>

      <UFormField name="startDate" :label="t('generalInfoSection.fields.startDate')" required>
        <UInputDate v-model="startDate" :disabled="!canEdit('startDate')" class="w-full" />
      </UFormField>

      <UFormField name="endDate" :label="t('generalInfoSection.fields.endDate')" required>
        <UInputDate v-model="endDate" :disabled="!canEdit('endDate')" class="w-full" />
      </UFormField>
    </div>

    <UCheckbox
      v-if="showAllowDraw"
      v-model="state.allowDraw"
      :label="t('generalInfoSection.fields.allowDraw')"
      :disabled="!canEdit('allowDraw')"
      class="py-4"
    />

    <!-- Slot for extra fields at the bottom -->
    <slot name="footer" />
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { OrganizationWithMemberCount, TournamentEditability } from '@skol-arena/shared'
import { useFieldEditability } from '@/composables/useFieldEditability'
import { useCalendarDateModel } from '@/utils/calendar-date'
import FieldEditabilityNote from '../FieldEditabilityNote.vue'
import RichTextEditor from '@/components/editor/RichTextEditor.vue'
import type { GeneralInfoState } from './section-state'

const { t } = useI18n()

interface SelectOption {
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    disciplineOptions: SelectOption[]
    rulesOptions: SelectOption[]
    organizations: OrganizationWithMemberCount[]
    isSuperAdmin: boolean
    disciplineLocked?: boolean
    lockedDisciplineName?: string
    namePlaceholder?: string
    editability?: TournamentEditability | null
    showAllowDraw?: boolean
  }>(),
  {
    disciplineLocked: false,
    lockedDisciplineName: '',
    namePlaceholder: '',
    editability: null,
    showAllowDraw: true,
  },
)

/** The parent form's state; this section edits its general-information fields in place. */
const state = defineModel<GeneralInfoState>('state', { required: true })

const startDate = useCalendarDateModel(
  () => state.value.startDate,
  (value) => (state.value.startDate = value),
)
const endDate = useCalendarDateModel(
  () => state.value.endDate,
  (value) => (state.value.endDate = value),
)

const { canEdit, lockedByMatches, enteredMatchCount } = useFieldEditability(
  () => props.editability,
)
</script>
