<template>
  <nav role="tablist" :aria-label="label" class="w-48 shrink-0 flex flex-col gap-1">
    <button
      v-for="option in options"
      :key="option.value"
      role="tab"
      :aria-selected="modelValue === option.value"
      class="block w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
      :class="
        modelValue === option.value
          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
      "
      :data-test="`subtab-${option.value}`"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </nav>
</template>

<script setup lang="ts" generic="V extends string">
import type { SubTabOption } from '@/composables/ui/useSubTabs'

defineProps<{
  options: readonly SubTabOption<V>[]
  modelValue: V
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [V] }>()
</script>
