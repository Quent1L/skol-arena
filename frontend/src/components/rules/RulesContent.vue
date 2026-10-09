<template>
  <div>
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
    </div>

    <UAlert v-else-if="error" color="error" variant="subtle" :title="error" />

    <UCard v-else-if="rule" variant="soft">
        <article
          class="prose prose-gray dark:prose-invert max-w-none"
          v-html="sanitizeHtml(rule.content)"
        />
    </UCard>

    <UCard v-else variant="soft">
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          {{ t('rulesContent.noRules') }}
        </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ClientGameRule } from '@skol-arena/shared/types/index'
import { sanitizeHtml } from '@/utils/sanitize-html'

const { t } = useI18n()

defineProps<{
  rule: ClientGameRule | null
  loading: boolean
  error: string | null
}>()
</script>

<style scoped>
:deep(.prose h1) {
  font-size: 1.875rem;
  font-weight: 700;
  margin-bottom: 1rem;
}
:deep(.prose h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}
:deep(.prose h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}
:deep(.prose ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
:deep(.prose ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
:deep(.prose p) {
  margin: 0.5rem 0;
}
:deep(.prose strong) {
  font-weight: 700;
}
:deep(.prose em) {
  font-style: italic;
}
:deep(.prose u) {
  text-decoration: underline;
}
</style>
