<template>
  <div
    class="rounded-md border p-2 sm:p-3"
    :class="depth % 2 === 0 ? 'border-primary/50' : 'border-info/50'"
  >
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <UTabs v-model="node.operator" :items="operatorButtons" :content="false" size="xs" />
      <span class="text-xs text-muted">
        {{ node.operator === 'all' ? t('conditionGroup.allTrue') : t('conditionGroup.anyTrue') }}
      </span>
      <div class="flex basis-full gap-1 sm:ms-auto sm:basis-auto">
        <UButton
          :label="t('conditionGroup.addCondition')"
          icon="i-fa7-solid:plus"
          size="xs"
          variant="ghost"
          @click="addLeaf"
        />
        <UButton
          :label="t('conditionGroup.addGroup')"
          icon="i-fa7-solid:plus"
          size="xs"
          variant="ghost"
          @click="addGroup"
        />
        <UButton
          v-if="removable"
          icon="i-fa7-solid:trash"
          size="xs"
          color="error"
          variant="ghost"
          class="ms-auto sm:ms-0"
          :aria-label="t('common.delete')"
          @click="$emit('remove')"
        />
      </div>
    </div>

    <VueDraggable
      v-model="node.children"
      :group="{ name: 'cond', pull: true, put: true }"
      handle=".drag-handle"
      class="flex min-h-12 flex-col gap-2 rounded-md bg-muted/40 p-1"
    >
      <div v-for="(child, idx) in node.children" :key="idx">
        <ConditionGroup
          v-if="child.kind === 'group'"
          :model-value="child"
          :facts="facts"
          :players="players"
          :depth="depth + 1"
          removable
          @update:model-value="node.children[idx] = $event"
          @remove="removeChild(idx)"
        />
        <ConditionRow
          v-else-if="child.kind === 'leaf'"
          :model-value="child"
          :facts="facts"
          :players="players"
          @update:model-value="node.children[idx] = $event"
          @remove="removeChild(idx)"
        />
      </div>

      <p v-if="node.children.length === 0" class="py-3 text-center text-xs text-dimmed">
        {{ t('conditionGroup.emptyHint') }}
      </p>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import ConditionRow from './ConditionRow.vue'
import { emptyGroup, emptyLeaf, type BuilderNode, type PlayerOption } from './condition-tree'
import type { CatalogFact } from '@/composables/rules/rules.api'

const { t } = useI18n()

const node = defineModel<Extract<BuilderNode, { kind: 'group' }>>({ required: true })
withDefaults(
  defineProps<{
    facts: CatalogFact[]
    players: PlayerOption[]
    depth?: number
    removable?: boolean
  }>(),
  { depth: 0, removable: false },
)

defineEmits<{ remove: [] }>()

const operatorButtons = computed(() => [
  { label: t('conditionGroup.operatorAnd'), value: 'all' },
  { label: t('conditionGroup.operatorOr'), value: 'any' },
])

function addLeaf() {
  node.value.children.push(emptyLeaf())
}

function addGroup() {
  node.value.children.push(emptyGroup('all'))
}

function removeChild(idx: number) {
  node.value.children.splice(idx, 1)
}
</script>
