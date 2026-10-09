<template>
  <UDropdownMenu v-if="items.length > 0" :items="menuItems" :content="{ align: 'end' }">
    <UButton
      icon="i-fa7-solid:ellipsis-vertical"
      color="neutral"
      variant="outline"
      :aria-label="t('common.actions')"
    />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DropdownMenuItem } from '@nuxt/ui'

export interface OverflowMenuItem {
  label: string
  /** Iconify name, e.g. `i-fa7-solid:pen`. */
  icon: string
  command: () => void
}

const props = defineProps<{ items: OverflowMenuItem[] }>()

const { t } = useI18n()

const menuItems = computed<DropdownMenuItem[]>(() =>
  props.items.map(({ label, icon, command }) => ({ label, icon, onSelect: command })),
)
</script>
