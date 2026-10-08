<template>
  <!-- Icon buttons from `sm` up; a single menu below, where a row of icons would squeeze the data. -->
  <template v-if="visibleActions.length">
    <div class="hidden justify-end gap-1 sm:flex">
      <UTooltip v-for="action in visibleActions" :key="action.label" :text="action.label">
        <UButton
          :icon="action.icon"
          :color="action.color ?? 'neutral'"
          variant="ghost"
          size="sm"
          :to="action.to"
          :loading="action.loading"
          :disabled="action.disabled"
          :aria-label="action.label"
          @click="action.onSelect?.()"
        />
      </UTooltip>
    </div>
    <UDropdownMenu :items="menuItems" :content="{ align: 'end' }" class="sm:hidden">
      <UButton
        icon="i-fa7-solid:ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('common.actions')"
        class="sm:hidden"
      />
    </UDropdownMenu>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RouteLocationRaw } from 'vue-router'

export interface RowAction {
  label: string
  icon: string
  color?: 'neutral' | 'primary' | 'error' | 'warning' | 'success'
  to?: RouteLocationRaw
  onSelect?: () => void
  loading?: boolean
  disabled?: boolean
  hidden?: boolean
}

const props = defineProps<{ actions: RowAction[] }>()

const { t } = useI18n()

const visibleActions = computed(() => props.actions.filter((action) => !action.hidden))

const menuItems = computed<DropdownMenuItem[]>(() =>
  visibleActions.value.map((action) => ({
    label: action.label,
    icon: action.icon,
    color: action.color === 'neutral' ? undefined : action.color,
    to: action.to,
    disabled: action.disabled || action.loading,
    onSelect: action.onSelect,
  })),
)
</script>
