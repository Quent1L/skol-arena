<template>
  <div class="flex flex-col items-center px-4 py-10 text-center">
    <i :class="icon" class="mb-4 block text-4xl text-gray-500 opacity-30" aria-hidden="true" />
    <h3 class="text-base font-semibold text-gray-300">{{ title }}</h3>
    <p v-if="message" class="mt-1 max-w-sm text-sm text-muted">{{ message }}</p>
    <UButton
      v-if="actionLabel"
      variant="ghost"
      :label="actionLabel"
      class="mt-3"
      size="md"
      @click="emit('action')"
    >
      <template v-if="actionIcon" #leading>
        <!-- A Font Awesome class from the caller, not an Iconify name. -->
        <i :class="actionIcon" />
      </template>
    </UButton>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  message?: string
  actionLabel?: string
  actionIcon?: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>
