<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('registerView.subtitle') }}</p>
      </div>

      <UCard variant="soft">
        <UForm
          :schema="registerSchema"
          :state="state"
          :disabled="loading"
          class="space-y-6"
          @submit="onSubmit"
        >
          <UFormField name="email" :label="t('registerView.emailLabel')" size="xl">
            <UInput
              id="email"
              v-model="state.email"
              type="email"
              autocomplete="email"
              :placeholder="t('registerView.emailPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField name="name" :label="t('registerView.nameLabel')" size="xl">
            <UInput id="name" v-model="state.name" autocomplete="name" placeholder="John Doe" class="w-full" />
          </UFormField>

          <UFormField name="password" :label="t('registerView.passwordLabel')" size="xl">
            <PasswordInput id="password" v-model="state.password" autocomplete="new-password" />
          </UFormField>

          <UFormField name="passwordConfirm" :label="t('registerView.passwordConfirmLabel')" size="xl">
            <PasswordInput id="passwordConfirm" v-model="state.passwordConfirm" autocomplete="new-password" />
          </UFormField>

          <UAlert v-if="error" color="error" variant="subtle" :title="error" />

          <UAlert color="info" variant="subtle" :title="t('registerView.infoMessage')" />

          <div class="space-y-3">
            <UButton
              type="submit"
              size="xl"
              block
              :loading="loading"
              :label="t('registerView.createAccount')"
            />

            <div class="text-center text-sm">
              <span class="text-muted">{{ t('registerView.alreadyHaveAccount') }}</span>
              <ULink to="/login" class="ml-1 text-primary">{{ t('registerView.login') }}</ULink>
            </div>

            <div class="text-center">
              <ULink to="/" class="text-sm text-primary">{{ t('registerView.backToHome') }}</ULink>
            </div>
          </div>
        </UForm>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import PasswordInput from '@/components/forms/PasswordInput.vue'
import { registerSchema, type RegisterFormData } from '@/schemas/auth.schema'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { register, loading, error } = useAuth()

// Note: Invitation code verification is handled by the backend hook
// during sign-up. No need to check the cookie on the frontend side.

const state = reactive<RegisterFormData>({ email: '', name: '', password: '', passwordConfirm: '' })

async function onSubmit({ data: values }: FormSubmitEvent<RegisterFormData>) {
  try {
    await register({
      email: values.email,
      // An empty field must fall back to the email prefix, not register a blank name.
      name: values.name?.trim() || undefined,
      password: values.password,
      passwordConfirm: values.passwordConfirm,
    })

    const redirectPath = route.query.redirect as string
    router.push(redirectPath || '/')
  } catch (err) {
    console.error("Erreur d'inscription:", err)
  }
}
</script>
