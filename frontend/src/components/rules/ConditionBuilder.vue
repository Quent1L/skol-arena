<template>
  <!-- Sized by its own width, not the viewport's: the builder sits in a column of
       the rule form whose width varies with the sidebar and the other panels. -->
  <div class="@container">
    <div class="grid grid-cols-1 gap-4 @3xl:grid-cols-[200px_minmax(0,1fr)]">
      <ConditionPalette />
      <ConditionGroup v-model="tree" :facts="facts" :players="players" :depth="0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, provide, onMounted } from 'vue'
import ConditionPalette from './ConditionPalette.vue'
import ConditionGroup from './ConditionGroup.vue'
import { fromConditions, toConditions, type BuilderNode, type PlayerOption } from './condition-tree'
import type { RuleConditions } from '@skol-arena/shared/types/index'
import type { CatalogFact } from '@/composables/rules/rules.api'
import { disciplineApi } from '@/composables/discipline/discipline.api'
import { organizationApi } from '@/composables/organization/organization.api'
import type {
  Discipline,
  OrganizationWithMemberCount,
  OutcomeType,
  OutcomeReason,
} from '@skol-arena/shared/types/index'

const props = defineProps<{
  modelValue: RuleConditions | null
  facts: CatalogFact[]
  players: PlayerOption[]
  /**
   * Outcome catalog, owned by the parent because the rule simulator needs the very
   * same lists — fetching here too would just duplicate the requests.
   */
  outcomeTypes: OutcomeType[]
  outcomeReasons: OutcomeReason[]
  /** Discipline of a `scope: 'discipline'` rule — narrows the outcome pickers. */
  disciplineId?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: RuleConditions] }>()

const disciplines = ref<Discipline[]>([])
const organisations = ref<OrganizationWithMemberCount[]>([])

// Outcome types are per-discipline: a discipline-scoped rule only ever sees its own.
// Filtered here rather than refetched, so switching discipline costs nothing.
const scopedOutcomeTypes = computed(() =>
  props.disciplineId
    ? props.outcomeTypes.filter((o) => o.disciplineId === props.disciplineId)
    : props.outcomeTypes,
)
const scopedOutcomeReasons = computed(() =>
  props.disciplineId
    ? props.outcomeReasons.filter((r) => r.outcomeType?.disciplineId === props.disciplineId)
    : props.outcomeReasons,
)

provide('disciplines', disciplines)
provide('organisations', organisations)
provide('outcomeTypes', scopedOutcomeTypes)
provide('outcomeReasons', scopedOutcomeReasons)

onMounted(async () => {
  const [d, o] = await Promise.all([disciplineApi.list(), organizationApi.list()])
  disciplines.value = d
  organisations.value = o
})

type GroupNode = Extract<BuilderNode, { kind: 'group' }>

const tree = ref<GroupNode>(ensureGroup(fromConditions(props.modelValue)))

function ensureGroup(node: BuilderNode): GroupNode {
  return node.kind === 'group' ? node : { kind: 'group', operator: 'all', children: [node] }
}

// Re-hydrate when the parent loads an existing rule.
watch(
  () => props.modelValue,
  (value) => {
    const next = ensureGroup(fromConditions(value))
    if (JSON.stringify(toConditions(next)) !== JSON.stringify(toConditions(tree.value))) {
      tree.value = next
    }
  },
)

// Propagate edits upward in json-rules-engine format.
watch(tree, (value) => emit('update:modelValue', toConditions(value)), { deep: true })
</script>
