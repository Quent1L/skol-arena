<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="true"
    :ui="{ footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="flex items-start gap-3">
        <UIcon :name="icon" class="size-6 shrink-0" :class="iconClass" />
        <p class="text-sm text-default whitespace-pre-line">{{ message }}</p>
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        :label="cancelLabel ?? t('common.cancel')"
        block
        class="sm:w-auto"
        @click="emit('close', false)"
      />
      <UButton
        :color="color"
        :label="confirmLabel ?? t('common.confirm')"
        block
        class="sm:w-auto"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export interface ConfirmModalProps {
  title: string
  message: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'primary' | 'error' | 'warning'
  icon?: string
}

const props = withDefaults(defineProps<ConfirmModalProps>(), {
  description: undefined,
  confirmLabel: undefined,
  cancelLabel: undefined,
  color: 'primary',
  icon: 'i-fa7-solid:triangle-exclamation',
})

const emit = defineEmits<{ close: [confirmed: boolean] }>()

const { t } = useI18n()

const iconClass = computed(() =>
  props.color === 'primary' ? 'text-primary' : props.color === 'error' ? 'text-error' : 'text-warning',
)
</script>
