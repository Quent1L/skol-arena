<template>
  <UCard variant="soft">
    <h2 class="flex items-center gap-2 text-xl font-medium mb-3">
      <i :class="icon"></i>
      <span>{{ title }}</span>
    </h2>
    <slot />
  </UCard>
</template>

<script setup lang="ts">
defineProps<{ title: string; icon: string }>()
</script>
