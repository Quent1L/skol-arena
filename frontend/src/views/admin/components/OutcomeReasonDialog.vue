<template>
  <UModal
    :open="visible"
    :title="editing ? t('outcomeTypeAdmin.editReasonTitle') : t('outcomeTypeAdmin.addReasonTitle')"
    @update:open="(open) => emit('update:visible', open)"
  >
    <template #body>
      <UForm :schema="formSchema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField name="name" :label="t('common.name')" required>
          <UInput v-model="state.name" autofocus class="w-full" />
        </UFormField>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            class="justify-center"
            @click="emit('update:visible', false)"
          />
          <UButton
            type="submit"
            :label="t('common.save')"
            icon="i-fa7-solid:check"
            class="justify-center"
            :loading="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { vmsg } from '@skol-arena/shared'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { OutcomeReason } from '@skol-arena/shared/types/outcome-reason'

interface Props {
  visible: boolean
  editing: OutcomeReason | null
  loading: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [values: { name: string }]
}>()

const formSchema = z.object({
  name: z
    .string(vmsg('validation.nameRequired'))
    .min(1, vmsg('validation.nameNotEmpty'))
    .max(100, vmsg('validation.nameMax100')),
})
type FormValues = z.infer<typeof formSchema>

const state = reactive<FormValues>({ name: '' })

watch(
  () => props.visible,
  (open) => {
    if (open) state.name = props.editing?.name ?? ''
  },
)

function onSubmit({ data }: FormSubmitEvent<FormValues>) {
  emit('submit', data)
}
</script>
