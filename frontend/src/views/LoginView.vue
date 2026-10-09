<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('loginView.subtitle') }}</p>
      </div>

      <UCard variant="soft">
        <!-- Error message if no authentication method is available -->
        <UAlert
          v-if="noAuthMethodAvailable"
          color="error"
          variant="subtle"
          icon="i-fa7-solid:triangle-exclamation"
          :title="t('loginView.noAuthTitle')"
          :description="t('loginView.noAuthDescription')"
        />

        <UForm
          v-else
          :schema="loginSchema"
          :state="state"
          :disabled="loading"
          class="space-y-6"
          @submit="onSubmit"
        >
          <!-- Email/Password form (only if enabled or ?native=true) -->
          <template v-if="showEmailPassword">
            <UFormField name="email" :label="t('loginView.emailLabel')" size="xl">
              <UInput
                id="email"
                v-model="state.email"
                type="email"
                autocomplete="email"
                :placeholder="t('loginView.emailPlaceholder')"
                class="w-full"
              />
            </UFormField>

            <UFormField name="password" :label="t('loginView.passwordLabel')" size="xl">
              <PasswordInput id="password" v-model="state.password" />
              <template #help>
                <div class="text-right">
                  <ULink to="/forgot-password" class="text-sm text-primary">
                    {{ t('loginView.forgotPassword') }}
                  </ULink>
                </div>
              </template>
            </UFormField>

            <UAlert v-if="error" color="error" variant="subtle" :title="error" />

            <UButton
              type="submit"
              size="xl"
              block
              :loading="loading"
              :label="t('loginView.loginButton')"
            />

            <!-- "Or" separator only if both methods are shown -->
            <USeparator v-if="keycloakEnabled" :label="t('loginView.or')" />
          </template>

          <!-- Keycloak button (shown if enabled) -->
          <UButton
            v-if="keycloakEnabled"
            type="button"
            size="xl"
            block
            color="neutral"
            variant="outline"
            icon="i-fa7-solid:building"
            :loading="isKeycloakLoading"
            :disabled="isKeycloakLoading || loading"
            :label="isKeycloakLoading ? t('loginView.keycloakLoading') : keycloakLoginLabel"
            @click="loginWithKeycloak"
          />

          <!-- Sign-up link -->
          <div class="text-center text-sm">
            <span class="text-muted">{{ t('loginView.noAccount') }}</span>
            <ULink to="/signup" class="ml-1 text-primary">{{ t('loginView.register') }}</ULink>
          </div>

          <!-- Back to home -->
          <div class="text-center">
            <ULink to="/public" class="text-sm text-primary">{{ t('loginView.backToHome') }}</ULink>
          </div>
        </UForm>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { ref, reactive, computed } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import PasswordInput from '@/components/forms/PasswordInput.vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useConfigService } from '@/composables/config/config.service'
import { authClient } from '@/lib/auth-client'
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { login, loading, error } = useAuth()
const { config } = useConfigService()

const isKeycloakLoading = ref(false)
const emailPasswordEnabled = computed(() => config.value?.auth?.emailPassword?.enabled ?? true)
const keycloakEnabled = computed(() => config.value?.auth?.keycloak?.enabled ?? false)
const keycloakLoginLabel = computed(
  () => config.value?.auth?.keycloak?.loginLabel ?? t('loginView.keycloakDefaultLabel'),
)
const forceNative = computed(() => route.query.native === 'true')
const showEmailPassword = computed(() => emailPasswordEnabled.value || forceNative.value)
const noAuthMethodAvailable = computed(() => !showEmailPassword.value && !keycloakEnabled.value)

// Detect OAuth errors in the URL (redirect from Better Auth)
if (route.query.error) {
  const errorDescription = route.query.error_description as string
  error.value = errorDescription || t('loginView.oauthError')

  // Nettoyer l'URL
  router.replace({ query: {} })
}

const state = reactive<LoginFormData>({ email: '', password: '' })

async function onSubmit({ data: values }: FormSubmitEvent<LoginFormData>) {
  try {
    await login({
      email: values.email,
      password: values.password,
    })
    console.log('Connexion réussie')

    const redirectPath = route.query.redirect as string
    router.push(redirectPath ?? '/')
  } catch (err: unknown) {
    if ((err as { cause?: string })?.cause === 'INVITATION_CODE_REQUIRED') {
      await router.push('/submit-invitation')
      return
    }
    console.error('Erreur de connexion:', err)
  }
}

async function loginWithKeycloak() {
  isKeycloakLoading.value = true

  try {
    const callbackURL = import.meta.env.MODE === 'dev' ? 'http://localhost:5173/' : '/'

    await authClient.signIn.oauth2({
      providerId: 'keycloak',
      callbackURL,
    })
  } catch (err: unknown) {
    isKeycloakLoading.value = false
    error.value = err instanceof Error ? err.message : t('loginView.keycloakError')
    console.error('Keycloak sign-in error:', err)
  }
}
</script>
