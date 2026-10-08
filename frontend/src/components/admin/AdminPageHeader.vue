<template>
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold text-highlighted">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
    </div>
    <!-- Actions go full width on phones, where they would otherwise wrap unevenly. -->
    <div v-if="$slots.actions" class="flex flex-col gap-2 sm:flex-row sm:shrink-0 [&>*]:justify-center">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
