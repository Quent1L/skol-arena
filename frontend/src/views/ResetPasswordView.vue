<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('resetPasswordView.subtitle') }}</p>
      </div>

      <UCard variant="soft">
        <div v-if="!tokenValid">
          <UAlert color="error" variant="subtle" :title="t('resetPasswordView.invalidLink')" />
          <div class="text-center mt-4">
            <UButton size="xl" :label="t('resetPasswordView.requestNewLink')" to="/forgot-password" />
          </div>
        </div>

        <div v-else-if="!resetSuccess">
          <p class="mb-6">{{ t('resetPasswordView.instructions') }}</p>

          <UForm
            :schema="resetPasswordSchema"
            :state="state"
            :disabled="loading"
            class="space-y-6"
            @submit="onSubmit"
          >
            <UFormField name="password" :label="t('resetPasswordView.newPasswordLabel')" size="xl">
              <PasswordInput id="password" v-model="state.password" autocomplete="new-password" />
            </UFormField>

            <UFormField name="passwordConfirm" :label="t('resetPasswordView.confirmPasswordLabel')" size="xl">
              <PasswordInput id="passwordConfirm" v-model="state.passwordConfirm" autocomplete="new-password" />
            </UFormField>

            <UAlert v-if="error" color="error" variant="subtle" :title="error" />

            <UButton
              type="submit"
              size="xl"
              block
              :loading="loading"
              :label="t('resetPasswordView.resetButton')"
            />
          </UForm>
        </div>

        <div v-else class="text-center py-4">
          <i class="fa fa-check-circle text-green-500 text-5xl mb-4"></i>
          <h3 class="text-xl font-semibold mb-2">{{ t('resetPasswordView.successTitle') }}</h3>
          <p class="mb-6">
            {{ t('resetPasswordView.successMessage') }}
          </p>
          <UButton size="xl" :label="t('resetPasswordView.login')" to="/login" />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { reactive, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'
import PasswordInput from '@/components/forms/PasswordInput.vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { resetPasswordSchema, type ResetPasswordFormData } from '@/schemas/auth.schema'

const { t } = useI18n()
const route = useRoute()
const { resetPassword, loading, error } = useAuth()

const token = ref<string>('')
const tokenValid = ref(true)
const resetSuccess = ref(false)

const state = reactive<ResetPasswordFormData>({ password: '', passwordConfirm: '' })

onMounted(() => {
  // Extract token from URL query parameter
  token.value = (route.query.token as string) || ''

  if (!token.value) {
    tokenValid.value = false
  }
})

async function onSubmit({ data: values }: FormSubmitEvent<ResetPasswordFormData>) {
  try {
    await resetPassword(token.value, values.password)
    resetSuccess.value = true
  } catch (err) {
    console.error('Erreur de réinitialisation:', err)
    // If error indicates invalid token, update tokenValid
    if (error.value?.includes('invalide') || error.value?.includes('expiré')) {
      tokenValid.value = false
    }
  }
}
</script>
