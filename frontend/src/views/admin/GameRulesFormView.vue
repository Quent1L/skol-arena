<template>
  <div class="max-w-4xl">
    <AdminPageHeader
      :title="isEditMode ? t('gameRulesFormView.editTitle') : t('gameRulesFormView.newTitle')"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <UForm :schema="schema" :state="state" @submit="onSubmit">
      <UCard>
        <div class="space-y-4">
          <UFormField name="title" :label="t('gameRulesFormView.titleLabel')" required>
            <UInput
              v-model="state.title"
              :placeholder="t('gameRulesFormView.titlePlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField name="content" :label="t('gameRulesFormView.contentLabel')" required>
            <RichTextEditor v-model="state.content" />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              to="/admin/rules"
              :disabled="loading"
              class="justify-center"
            />
            <UButton
              type="submit"
              :label="isEditMode ? t('common.update') : t('common.create')"
              icon="i-fa7-solid:check"
              :loading="loading"
              class="justify-center"
            />
          </div>
        </template>
      </UCard>
    </UForm>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  createGameRuleSchema,
  updateGameRuleSchema,
  type CreateGameRuleData,
} from '@skol-arena/shared/types/index'
import { useGameRulesService } from '@/composables/game-rules/game-rules.service'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import RichTextEditor from '@/components/editor/RichTextEditor.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { currentRule, loading, error, loadRuleById, createRule, updateRule } = useGameRulesService()

const isEditMode = computed(() => !!route.params.id && route.params.id !== 'new')
const schema = computed(() => (isEditMode.value ? updateGameRuleSchema : createGameRuleSchema))

const state = reactive<CreateGameRuleData>({ title: '', content: '' })

async function onSubmit({ data }: FormSubmitEvent<CreateGameRuleData>) {
  const saved =
    isEditMode.value && route.params.id
      ? await updateRule(route.params.id as string, data)
      : await createRule(data)
  if (saved) router.push('/admin/rules')
}

onMounted(async () => {
  if (!isEditMode.value || !route.params.id) return
  await loadRuleById(route.params.id as string)
  if (currentRule.value) {
    state.title = currentRule.value.title
    state.content = currentRule.value.content
  }
})
</script>
