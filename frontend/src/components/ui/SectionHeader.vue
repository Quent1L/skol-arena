<template>
  <div class="flex items-center gap-2.5">
    <span class="h-5 w-1 shrink-0 rounded-full" :class="accentClass ?? 'bg-primary'" />
    <i :class="icon" class="w-4 shrink-0 text-center text-sm text-muted" aria-hidden="true" />
    <h2 class="font-headline min-w-0 truncate text-sm font-black uppercase tracking-wider text-white">
      {{ title }}
    </h2>
    <span
      v-if="count != null"
      class="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-gray-300"
    >
      {{ count }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  count?: number
  accentClass?: string
}>()
</script>
