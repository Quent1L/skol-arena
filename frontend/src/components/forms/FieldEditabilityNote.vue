<template>
  <p v-if="recalculates" class="mt-1 flex items-center gap-1 text-xs text-warning">
    <UIcon name="i-fa7-solid:triangle-exclamation" />
    {{ t('fieldEditability.recalculates') }}
  </p>
  <p v-else-if="lockedByMatches" class="mt-1 flex items-center gap-1 text-xs text-muted">
    <UIcon name="i-fa7-solid:lock" />
    {{ t('fieldEditability.lockedByMatches', { count: matchCount }) }}
  </p>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * The one line under a field that says why it is disabled, or what saving it will
 * cost. A field that is simply locked by the competition's structure gets no note:
 * it can never be edited and there is nothing actionable to say.
 */
defineProps<{
  recalculates?: boolean
  lockedByMatches?: boolean
  matchCount?: number
}>()

const { t } = useI18n()
</script>
