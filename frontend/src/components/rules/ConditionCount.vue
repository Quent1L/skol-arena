<template>
  <div data-condition-count class="rounded-md border border-warning/50 bg-elevated p-2 sm:p-3">
    <div class="mb-2 flex items-center gap-2">
      <UIcon
        name="i-fa7-solid:grip-vertical"
        class="drag-handle size-4 shrink-0 cursor-grab text-dimmed"
      />
      <UIcon name="i-fa7-solid:hashtag" class="size-4 shrink-0 text-warning" />
      <span class="min-w-0 flex-1 text-sm font-semibold">{{ t('conditionCount.title') }}</span>
      <UButton
        icon="i-fa7-solid:trash"
        color="error"
        variant="ghost"
        size="sm"
        :aria-label="t('common.delete')"
        @click="$emit('remove')"
      />
    </div>

    <UFormField
      :label="t('conditionCount.windowLabel')"
      :help="disciplineWindowAllowed ? undefined : t('conditionCount.windowHint')"
      size="sm"
      class="mb-3"
    >
      <USelectMenu
        :model-value="node.window ?? 'season'"
        :items="windowOptions"
        value-key="value"
        :search-input="false"
        class="w-full sm:w-64"
        @update:model-value="node.window = $event"
      />
    </UFormField>

    <!-- The sub-conditions a counted match must meet, rendered by the parent group. -->
    <slot />

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">{{ t('conditionCount.comparison') }}</span>
      <USelectMenu
        v-model="node.operator"
        :items="operatorOptions"
        value-key="value"
        :search-input="false"
        class="w-full sm:w-48"
      />
      <div class="flex items-center gap-2">
        <UInputNumber
          :model-value="node.value as number"
          :min="0"
          class="w-28"
          @update:model-value="node.value = $event ?? 0"
        />
        <span class="text-sm text-muted">{{ t('conditionCount.matchesLabel') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MATCH_COUNT_OPERATORS } from '@skol-arena/shared/types/index'
import type { BuilderNode } from './condition-tree'

const { t } = useI18n()

const node = defineModel<Extract<BuilderNode, { kind: 'count' }>>({ required: true })
defineEmits<{ remove: [] }>()

const disciplineWindowAllowed = inject<Ref<boolean>>('disciplineWindowAllowed', ref(false))

const windowOptions = computed(() => [
  { label: t('conditionCount.windowSeason'), value: 'season' as const },
  {
    label: t('conditionCount.windowDiscipline'),
    value: 'discipline' as const,
    disabled: !disciplineWindowAllowed.value,
  },
])

// A count compares like any number, so it reuses the number operators' labels.
const operatorOptions = computed(() =>
  MATCH_COUNT_OPERATORS.map((op) => ({
    label: t(`conditionRow.operator${op[0].toUpperCase()}${op.slice(1)}`),
    value: op,
  })),
)
</script>
