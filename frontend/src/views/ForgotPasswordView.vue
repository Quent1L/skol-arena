<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('forgotPasswordView.subtitle') }}</p>
      </div>

      <UCard variant="soft">
        <div v-if="!submitted">
          <p class="text-white mb-6">
            {{ t('forgotPasswordView.instructions') }}
          </p>

          <UForm
            :schema="forgotPasswordSchema"
            :state="state"
            :disabled="loading"
            class="space-y-6"
            @submit="onSubmit"
          >
            <UFormField name="email" :label="t('forgotPasswordView.emailLabel')" size="xl">
              <UInput
                id="email"
                v-model="state.email"
                type="email"
                autocomplete="email"
                :placeholder="t('forgotPasswordView.emailPlaceholder')"
                class="w-full"
              />
            </UFormField>

            <UAlert v-if="error" color="error" variant="subtle" :title="error" />

            <div class="space-y-3">
              <UButton
                type="submit"
                size="xl"
                block
                :loading="loading"
                :label="t('forgotPasswordView.submitButton')"
              />

              <div class="text-center text-sm">
                <ULink to="/login" class="text-primary">{{ t('forgotPasswordView.backToLoginLink') }}</ULink>
              </div>
            </div>
          </UForm>
        </div>

        <div v-else class="text-center py-4">
          <i class="fa fa-check-circle text-green-500 text-5xl mb-4"></i>
          <h3 class="text-xl font-semibold mb-2">{{ t('forgotPasswordView.successTitle') }}</h3>
          <p class="text-white mb-6">
            {{ t('forgotPasswordView.successMessage') }}
          </p>
          <p class="text-sm text-white mb-6">
            {{ t('forgotPasswordView.spamNote') }}
          </p>
          <UButton size="xl" :label="t('forgotPasswordView.backToLoginButton')" to="/login" />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/schemas/auth.schema'

const { t } = useI18n()
const { requestPasswordReset, loading, error } = useAuth()
const submitted = ref(false)

const state = reactive<ForgotPasswordFormData>({ email: '' })

async function onSubmit({ data: values }: FormSubmitEvent<ForgotPasswordFormData>) {
  try {
    await requestPasswordReset(values.email)
    submitted.value = true
  } catch (err) {
    console.error('Erreur de demande de réinitialisation:', err)
  }
}
</script>
