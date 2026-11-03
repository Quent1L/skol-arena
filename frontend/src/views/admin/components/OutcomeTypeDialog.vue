<template>
  <UModal
    :open="visible"
    :title="editing ? t('outcomeTypeAdmin.editTypeTitle') : t('outcomeTypeAdmin.addTypeTitle')"
    @update:open="(open) => emit('update:visible', open)"
  >
    <template #body>
      <UForm :schema="formSchema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField name="name" :label="t('common.name')" required>
          <UInput v-model="state.name" autofocus class="w-full" />
        </UFormField>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField name="points" :label="t('outcomeTypeAdmin.pointsPerResult')" required>
            <UInputNumber v-model="state.points" :min="0" class="w-full" />
          </UFormField>
          <UFormField name="mmrMultiplier" :label="t('outcomeTypeAdmin.mmrMultiplier')" required>
            <UInputNumber
              v-model="state.mmrMultiplier"
              :min="0"
              :step="0.1"
              :format-options="{ minimumFractionDigits: 1, maximumFractionDigits: 2 }"
              class="w-full"
            />
          </UFormField>
        </div>
        <USwitch v-model="state.scoreCountsForMmr" :label="t('outcomeTypeAdmin.countsForMmr')" />
        <USwitch v-model="state.isDefault" :label="t('outcomeTypeAdmin.defaultType')" />

        <div class="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
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
import type { OutcomeType } from '@skol-arena/shared/types/outcome-type'

interface Props {
  visible: boolean
  editing: OutcomeType | null
  loading: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

const formSchema = z.object({
  name: z
    .string(vmsg('validation.nameRequired'))
    .min(1, vmsg('validation.nameNotEmpty'))
    .max(100, vmsg('validation.nameMax100')),
  isDefault: z.boolean(),
  points: z.number().int().min(0),
  mmrMultiplier: z.number().positive(),
  scoreCountsForMmr: z.boolean(),
})
type FormValues = z.infer<typeof formSchema>

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [values: FormValues]
}>()

const DEFAULTS: FormValues = {
  name: '',
  isDefault: false,
  points: 3,
  mmrMultiplier: 1,
  scoreCountsForMmr: true,
}

const state = reactive<FormValues>({ ...DEFAULTS })

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    const editing = props.editing
    Object.assign(
      state,
      editing
        ? {
            name: editing.name,
            isDefault: editing.isDefault,
            points: editing.points,
            mmrMultiplier: editing.mmrMultiplier,
            scoreCountsForMmr: editing.scoreCountsForMmr,
          }
        : DEFAULTS,
    )
  },
)

function onSubmit({ data }: FormSubmitEvent<FormValues>) {
  emit('submit', data)
}
</script>
