<template>
  <div class="flex items-start gap-2 rounded-md bg-elevated p-2">
    <UIcon
      name="i-fa7-solid:grip-vertical"
      class="drag-handle mt-2 size-4 shrink-0 cursor-grab text-dimmed"
    />

    <!-- Variable, operator and value stack in a narrow builder, sit side by side once it is wide enough. -->
    <div
      class="grid min-w-0 flex-1 grid-cols-1 gap-2 @xl:grid-cols-[13rem_11rem_minmax(0,1fr)] [&>*]:w-full"
    >
      <USelectMenu
        v-model="node.fact"
        :items="facts"
        value-key="key"
        label-key="label"
        :placeholder="t('conditionRow.placeholderVariable')"
        @update:model-value="onFactChange"
      />

      <USelectMenu
        v-model="node.operator"
        :items="operatorOptions"
        value-key="value"
        :search-input="false"
        :placeholder="t('conditionRow.placeholderOperator')"
      />

      <template v-if="selectedFact">
        <USelectMenu
          v-if="valueSelect"
          v-model="selectValue"
          :items="valueSelect.items"
          :value-key="valueSelect.valueKey"
          :label-key="valueSelect.labelKey"
          :multiple="valueSelect.multiple"
          :search-input="valueSelect.searchable"
          :placeholder="valueSelect.placeholder"
        />
        <UInputTime
          v-else-if="isTimeFact && !isListOperator"
          v-model="timeValue"
          :hour-cycle="24"
        />
        <UInputDate v-else-if="isDateFact && !isListOperator" v-model="dateValue" />
        <UInputNumber
          v-else-if="selectedFact.type === 'number' && !isListOperator"
          :model-value="node.value as number"
          @update:model-value="node.value = $event ?? ''"
        />
        <UInput
          v-else
          :model-value="stringValue"
          :placeholder="
            isListOperator
              ? t('conditionRow.placeholderListValues')
              : t('conditionRow.placeholderValue')
          "
          @update:model-value="onTextValue(String($event ?? ''))"
        />
      </template>
    </div>

    <UButton
      icon="i-fa7-solid:trash"
      color="error"
      variant="ghost"
      size="sm"
      :aria-label="t('common.delete')"
      @click="$emit('remove')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Time, parseDate, type DateValue } from '@internationalized/date'
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

const isTimeFact = computed(() => selectedFact.value?.ref === 'time')

const isDateFact = computed(() => selectedFact.value?.type === 'date')

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

/** `YYYY-MM-DD` string, the stored form, <-> calendar day for the date input. */
const dateValue = computed<DateValue | undefined>({
  get: () => {
    const v = node.value.value
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
    return parseDate(v)
  },
  set: (d) => {
    node.value.value = d ? d.toString() : ''
  },
})

/** Minute-of-day number, the stored form, <-> time for the time input. */
const timeValue = computed<Time | undefined>({
  get: () => {
    const min = node.value.value
    return typeof min === 'number' ? new Time(Math.floor(min / 60), min % 60) : undefined
  },
  set: (time) => {
    node.value.value = time ? time.hour * 60 + time.minute : ''
  },
})

const booleanOptions = computed(() => [
  { label: t('conditionRow.booleanTrue'), value: true },
  { label: t('conditionRow.booleanFalse'), value: false },
])

interface ValueSelect {
  items: object[]
  valueKey: string
  labelKey: string
  multiple: boolean
  searchable: boolean
  placeholder: string
}

/**
 * Facts that reference an entity pick their value from a list — one entity for a
 * comparison operator, several for a list operator. Null for free-form values.
 */
const valueSelect = computed<ValueSelect | null>(() => {
  const fact = selectedFact.value
  if (!fact) return null
  const multiple = isListOperator.value
  const pick = (
    items: object[],
    labelKey: string,
    valueKey: string,
    placeholders: [string, string],
    searchable = true,
  ): ValueSelect => ({
    items,
    labelKey,
    valueKey,
    multiple,
    searchable,
    placeholder: t(multiple ? placeholders[1] : placeholders[0]),
  })
  if (fact.type === 'boolean') {
    return {
      ...pick(booleanOptions.value, 'label', 'value', ['', ''], false),
      multiple: false,
      placeholder: '',
    }
  }
  switch (fact.ref) {
    case 'player':
      return pick(props.players, 'displayName', 'id', [
        'conditionRow.placeholderPlayer',
        'conditionRow.placeholderPlayers',
      ])
    case 'discipline':
      return pick(disciplines.value, 'name', 'id', [
        'common.discipline',
        'conditionRow.placeholderDisciplines',
      ])
    case 'site':
      return pick(organisations.value, 'name', 'id', [
        'conditionRow.placeholderOrganisation',
        'conditionRow.placeholderOrganisations',
      ])
    case 'outcomeType':
      return pick(outcomeTypeOptions.value, 'label', 'id', [
        'conditionRow.placeholderOutcomeType',
        'conditionRow.placeholderOutcomeTypes',
      ])
    case 'outcomeReason':
      return pick(outcomeReasonOptions.value, 'label', 'id', [
        'conditionRow.placeholderOutcomeReason',
        'conditionRow.placeholderOutcomeReasons',
      ])
    case 'weekday':
      return pick(
        weekdayOptions.value,
        'label',
        'value',
        ['conditionRow.placeholderDay', 'conditionRow.placeholderDays'],
        false,
      )
    default:
      return null
  }
})

/** One value, or an array of them under a list operator. */
const selectValue = computed({
  get: () => {
    const v = node.value.value
    if (valueSelect.value?.multiple) return Array.isArray(v) ? v : []
    return v === '' ? undefined : v
  },
  set: (val: unknown) => {
    node.value.value = (val ?? '') as typeof node.value.value
  },
})

const stringValue = computed(() =>
  Array.isArray(node.value.value)
    ? (node.value.value as unknown[]).join(', ')
    : String(node.value.value ?? ''),
)

function onFactChange() {
  node.value.operator = ''
  node.value.value = selectedFact.value?.type === 'boolean' ? true : ''
}

function onTextValue(val: string | undefined) {
  const value = val ?? ''
  node.value.value = isListOperator.value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value
}
</script>
