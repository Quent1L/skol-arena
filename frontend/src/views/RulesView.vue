<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <PageTitleBar
      class="sticky top-0 z-10"
      inner-class="max-w-4xl mx-auto"
      :title="currentRule?.title || t('rulesView.defaultTitle')"
    >
      <!-- On mobile the header's back button does this job. -->
      <template v-if="!isMobile" #leading>
        <UButton
          variant="ghost"
          icon="i-fa7-solid:arrow-left"
          @click="router.back()"
          class="text-gray-700 dark:text-gray-200 rounded-full"
          size="lg"
        />
      </template>
    </PageTitleBar>

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
import PageTitleBar from '@/components/ui/PageTitleBar.vue'
import { useViewport } from '@/composables/useViewport'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isMobile } = useViewport()
const { currentRule, loading, error, loadRuleById } = useGameRulesService()

onMounted(async () => {
  await loadRuleById(route.params.id as string)
})
</script>
