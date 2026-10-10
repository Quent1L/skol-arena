<template>
  <!-- The title bar of a secondary screen (tournament badges, teams, rules): one look
       everywhere, so a sub-page reads the same whichever way it was reached. -->
  <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
    <div class="h-14 flex items-center gap-2 px-4" :class="innerClass">
      <slot name="leading" />
      <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
        {{ title }}
      </h1>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  /** Width constraint of the content, for a page whose body is centred. */
  innerClass?: string
}>()
</script>
