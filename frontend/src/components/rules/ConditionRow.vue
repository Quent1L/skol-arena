<template>
  <div class="flex flex-wrap items-center gap-2 bg-surface-100 dark:bg-surface-800 px-2 py-2 rounded">
    <i class="fa fa-grip-vertical text-surface-400 cursor-grab"></i>

    <Select
      v-model="node.fact"
      :options="facts"
      option-label="label"
      option-value="key"
      :placeholder="t('conditionRow.placeholderVariable')"
      filter
      class="w-52"
      @change="onFactChange"
    />

    <Select
      v-model="node.operator"
      :options="operatorOptions"
      option-label="label"
      option-value="value"
      :placeholder="t('conditionRow.placeholderOperator')"
      class="w-44"
    />

    <template v-if="selectedFact">
      <Select
        v-if="selectedFact.type === 'boolean'"
        v-model="node.value"
        :options="booleanOptions"
        option-label="label"
        option-value="value"
        class="w-32"
      />
      <Select
        v-else-if="isPlayerFact && !isListOperator"
        v-model="node.value"
        :options="players"
        option-label="displayName"
        option-value="id"
        :placeholder="t('conditionRow.placeholderPlayer')"
        filter
        filter-match-mode="accentInsensitive"
        class="w-56"
      />
      <MultiSelect
        v-else-if="isPlayerFact && isListOperator"
        v-model="playerListValue"
        :options="players"
        option-label="displayName"
        option-value="id"
        :placeholder="t('conditionRow.placeholderPlayers')"
        filter
        filter-match-mode="accentInsensitive"
        display="chip"
        class="w-72"
      />
      <DatePicker
        v-else-if="isTimeFact && !isListOperator"
        v-model="timeValue"
        time-only
        hour-format="24"
        class="w-32"
      />
      <DatePicker
        v-else-if="isDateFact && !isListOperator"
        v-model="dateValue"
        date-format="yy-mm-dd"
        class="w-40"
      />
      <Select
        v-else-if="isDisciplineFact && !isListOperator"
        v-model="node.value"
        :options="disciplines"
        option-label="name"
        option-value="id"
        :placeholder="t('common.discipline')"
        filter
        class="w-52"
      />
      <MultiSelect
        v-else-if="isDisciplineFact && isListOperator"
        v-model="playerListValue"
        :options="disciplines"
        option-label="name"
        option-value="id"
        :placeholder="t('conditionRow.placeholderDisciplines')"
        display="chip"
        class="w-72"
      />
      <Select
        v-else-if="isSiteFact && !isListOperator"
        v-model="node.value"
        :options="organisations"
        option-label="name"
        option-value="id"
        :placeholder="t('conditionRow.placeholderOrganisation')"
        filter
        class="w-52"
      />
      <MultiSelect
        v-else-if="isSiteFact && isListOperator"
        v-model="playerListValue"
        :options="organisations"
        option-label="name"
        option-value="id"
        :placeholder="t('conditionRow.placeholderOrganisations')"
        display="chip"
        class="w-72"
      />
      <Select
        v-else-if="isOutcomeTypeFact && !isListOperator"
        v-model="node.value"
        :options="outcomeTypeOptions"
        option-label="label"
        option-value="id"
        :placeholder="t('conditionRow.placeholderOutcomeType')"
        filter
        class="w-56"
      />
      <MultiSelect
        v-else-if="isOutcomeTypeFact && isListOperator"
        v-model="playerListValue"
        :options="outcomeTypeOptions"
        option-label="label"
        option-value="id"
        :placeholder="t('conditionRow.placeholderOutcomeTypes')"
        filter
        display="chip"
        class="w-72"
      />
      <Select
        v-else-if="isOutcomeReasonFact && !isListOperator"
        v-model="node.value"
        :options="outcomeReasonOptions"
        option-label="label"
        option-value="id"
        :placeholder="t('conditionRow.placeholderOutcomeReason')"
        filter
        class="w-56"
      />
      <MultiSelect
        v-else-if="isOutcomeReasonFact && isListOperator"
        v-model="playerListValue"
        :options="outcomeReasonOptions"
        option-label="label"
        option-value="id"
        :placeholder="t('conditionRow.placeholderOutcomeReasons')"
        filter
        display="chip"
        class="w-72"
      />
      <Select
        v-else-if="isWeekdayFact && !isListOperator"
        v-model="node.value"
        :options="weekdayOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('conditionRow.placeholderDay')"
        class="w-40"
      />
      <MultiSelect
        v-else-if="isWeekdayFact && isListOperator"
        v-model="weekdayListValue"
        :options="weekdayOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('conditionRow.placeholderDays')"
        display="chip"
        class="w-64"
      />
      <InputNumber
        v-else-if="selectedFact.type === 'number' && !isListOperator"
        :model-value="node.value as number"
        class="w-32"
        @update:model-value="node.value = $event"
      />
      <InputText
        v-else
        :model-value="stringValue"
        :placeholder="isListOperator ? t('conditionRow.placeholderListValues') : t('conditionRow.placeholderValue')"
        class="w-52"
        @update:model-value="onTextValue"
      />
    </template>

    <Button icon="fa fa-trash" size="small" text rounded severity="danger" @click="$emit('remove')" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BuilderNode, PlayerOption } from './condition-tree'
import type { CatalogFact } from '@/composables/rules/rules.api'
import { LIST_VALUE_OPERATORS } from '@skol-arena/shared/types/index'
import type {
  Discipline,
  OrganizationWithMemberCount,
  OutcomeType,
  OutcomeReason,
} from '@skol-arena/shared/types/index'

const { t } = useI18n()

const node = defineModel<Extract<BuilderNode, { kind: 'leaf' }>>({ required: true })
const props = defineProps<{ facts: CatalogFact[]; players: PlayerOption[] }>()
defineEmits<{ remove: [] }>()

const disciplines = inject<Ref<Discipline[]>>('disciplines', ref([]))
const organisations = inject<Ref<OrganizationWithMemberCount[]>>('organisations', ref([]))
const outcomeTypes = inject<Ref<OutcomeType[]>>('outcomeTypes', ref([]))
const outcomeReasons = inject<Ref<OutcomeReason[]>>('outcomeReasons', ref([]))

function getOperatorLabel(op: string): string {
  const map: Record<string, string> = {
    equal: t('conditionRow.operatorEqual'),
    notEqual: t('conditionRow.operatorNotEqual'),
    greaterThan: t('conditionRow.operatorGreaterThan'),
    greaterThanInclusive: t('conditionRow.operatorGreaterThanInclusive'),
    lessThan: t('conditionRow.operatorLessThan'),
    lessThanInclusive: t('conditionRow.operatorLessThanInclusive'),
    in: t('conditionRow.operatorIn'),
    notIn: t('conditionRow.operatorNotIn'),
    contains: t('conditionRow.operatorContains'),
    doesNotContain: t('conditionRow.operatorDoesNotContain'),
    containsAll: t('conditionRow.operatorContainsAll'),
    containsAny: t('conditionRow.operatorContainsAny'),
    containsNone: t('conditionRow.operatorContainsNone'),
    containsExactly: t('conditionRow.operatorContainsExactly'),
  }
  return map[op] ?? op
}

const selectedFact = computed(() => props.facts.find((f) => f.key === node.value.fact))

const operatorOptions = computed(() =>
  (selectedFact.value?.operators ?? []).map((op) => ({ label: getOperatorLabel(op), value: op })),
)

const isListOperator = computed(() =>
  (LIST_VALUE_OPERATORS as readonly string[]).includes(node.value.operator),
)

const isPlayerFact = computed(() => selectedFact.value?.ref === 'player')

const isTimeFact = computed(() => selectedFact.value?.ref === 'time')

const isDateFact = computed(() => selectedFact.value?.type === 'date')

const isDisciplineFact = computed(() => selectedFact.value?.ref === 'discipline')
const isSiteFact = computed(() => selectedFact.value?.ref === 'site')
const isWeekdayFact = computed(() => selectedFact.value?.ref === 'weekday')
const isOutcomeTypeFact = computed(() => selectedFact.value?.ref === 'outcomeType')
const isOutcomeReasonFact = computed(() => selectedFact.value?.ref === 'outcomeReason')

// Outcome names repeat across disciplines, so each option carries its parent to
// stay distinguishable when the rule is global.
const outcomeTypeOptions = computed(() =>
  outcomeTypes.value.map((o) => ({
    id: o.id,
    label: o.discipline ? `${o.name} (${o.discipline.name})` : o.name,
  })),
)

const outcomeReasonOptions = computed(() =>
  outcomeReasons.value.map((r) => ({
    id: r.id,
    label: r.outcomeType ? `${r.name} (${r.outcomeType.name})` : r.name,
  })),
)

const weekdayOptions = computed(() => [
  { label: t('conditionRow.weekdayMonday'), value: 1 },
  { label: t('conditionRow.weekdayTuesday'), value: 2 },
  { label: t('conditionRow.weekdayWednesday'), value: 3 },
  { label: t('conditionRow.weekdayThursday'), value: 4 },
  { label: t('conditionRow.weekdayFriday'), value: 5 },
  { label: t('conditionRow.weekdaySaturday'), value: 6 },
  { label: t('conditionRow.weekdaySunday'), value: 7 },
])

const weekdayListValue = computed<number[]>({
  get: () => (Array.isArray(node.value.value) ? (node.value.value as number[]) : []),
  set: (val) => { node.value.value = val },
})

const dateValue = computed<Date | null>({
  get: () => {
    const v = node.value.value
    if (v instanceof Date) return v
    if (typeof v !== 'string' || !v) return null
    const [y, mo, d] = v.split('-').map(Number)
    return new Date(y, mo - 1, d)
  },
  set: (d) => {
    if (!d) { node.value.value = ''; return }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    node.value.value = `${y}-${m}-${day}`
  },
})

/** Minute-of-day number <-> Date for the time picker. */
const timeValue = computed<Date | null>({
  get: () => {
    const min = node.value.value
    if (typeof min !== 'number') return null
    const d = new Date()
    d.setHours(Math.floor(min / 60), min % 60, 0, 0)
    return d
  },
  set: (d) => {
    node.value.value = d ? d.getHours() * 60 + d.getMinutes() : ''
  },
})

const playerListValue = computed<string[]>({
  get: () => (Array.isArray(node.value.value) ? (node.value.value as string[]) : []),
  set: (val) => {
    node.value.value = val
  },
})

const booleanOptions = computed(() => [
  { label: t('conditionRow.booleanTrue'), value: true },
  { label: t('conditionRow.booleanFalse'), value: false },
])

const stringValue = computed(() =>
  Array.isArray(node.value.value) ? (node.value.value as unknown[]).join(', ') : String(node.value.value ?? ''),
)

function onFactChange() {
  node.value.operator = ''
  node.value.value = selectedFact.value?.type === 'boolean' ? true : ''
}

function onTextValue(val: string | undefined) {
  const value = val ?? ''
  node.value.value = isListOperator.value ? value.split(',').map((v) => v.trim()).filter(Boolean) : value
}
</script>
