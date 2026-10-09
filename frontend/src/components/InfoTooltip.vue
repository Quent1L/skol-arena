<template>
  <!-- A popover rather than UTooltip: a tooltip never opens on touch, and on a phone
       this help text would be unreachable. Hover on desktop, tap on touch screens. -->
  <UPopover mode="hover" enable-touch :content="{ side: 'top', sideOffset: 6 }">
    <button
      type="button"
      class="text-gray-500 hover:text-gray-300 text-xs focus:outline-none cursor-help leading-none"
      :aria-label="html ? undefined : text"
    >
      <i class="fa fa-circle-question" />
    </button>

    <template #content>
      <!-- eslint-disable-next-line vue/no-v-html -- callers pass i18n strings, never user input -->
      <div v-if="html" class="max-w-xs px-3 py-2 text-sm" v-html="text" />
      <div v-else class="max-w-xs px-3 py-2 text-sm">{{ text }}</div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
defineProps<{ text: string; html?: boolean }>()
</script>
