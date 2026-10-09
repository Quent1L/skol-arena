<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Sticky header -->
    <div
      class="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm"
    >
      <div class="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
        <UButton
          variant="ghost"
          icon="i-fa7-solid:arrow-left"
          @click="router.back()"
          class="text-gray-700 dark:text-gray-200 rounded-full"
          size="lg"
        />
        <div class="flex-1 min-w-0">
          <h1 class="text-lg font-bold text-gray-900 dark:text-white truncate">
            {{ currentRule?.title || t('rulesView.defaultTitle') }}
          </h1>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="max-w-4xl mx-auto px-4 py-8">
      <RulesContent :rule="currentRule" :loading="loading" :error="error" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGameRulesService } from '@/composables/game-rules/game-rules.service'
import RulesContent from '@/components/rules/RulesContent.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { currentRule, loading, error, loadRuleById } = useGameRulesService()

onMounted(async () => {
  await loadRuleById(route.params.id as string)
})
</script>
