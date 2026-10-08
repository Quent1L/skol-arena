<template>
  <UModal
    :open="visible"
    :title="editing ? 'Modifier la raison de résultat' : 'Ajouter une raison de résultat'"
    @update:open="(open) => emit('update:visible', open)"
  >
    <template #body>
      <UForm :schema="formSchema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField name="name" label="Nom" required>
          <UInput v-model="state.name" autofocus class="w-full" />
        </UFormField>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            label="Annuler"
            color="neutral"
            variant="ghost"
            class="justify-center"
            @click="emit('update:visible', false)"
          />
          <UButton
            type="submit"
            label="Enregistrer"
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
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { OutcomeReason } from '@skol-arena/shared/types/outcome-reason'

interface Props {
  visible: boolean
  editing: OutcomeReason | null
  loading: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [values: { name: string }]
}>()

const formSchema = z.object({
  name: z
    .string({ message: 'Le nom est requis' })
    .min(1, 'Le nom ne peut pas être vide')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
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
