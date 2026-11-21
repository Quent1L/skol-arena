<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="flex justify-end mb-4">
        <LocaleSwitcher />
      </div>
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
            <!-- Demo instance: the super admin's sign-in, one click away -->
            <UAlert
              v-if="demo"
              color="info"
              variant="subtle"
              icon="i-fa7-solid:flask"
              :title="t('loginView.demo.title')"
              data-testid="demo-credentials"
            >
              <template #description>
                <p>{{ t('loginView.demo.description') }}</p>
                <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt class="text-muted">{{ t('loginView.emailLabel') }}</dt>
                  <dd class="font-mono select-all break-all">{{ demo.email }}</dd>
                  <dt class="text-muted">{{ t('loginView.passwordLabel') }}</dt>
                  <dd class="font-mono select-all break-all">{{ demo.password }}</dd>
                </dl>
                <UButton
                  type="submit"
                  class="mt-3"
                  color="info"
                  variant="solid"
                  size="sm"
                  icon="i-fa7-solid:right-to-bracket"
                  :label="t('loginView.demo.useButton')"
                  @click="fillDemoAccount"
                />
              </template>
            </UAlert>

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
            <USeparator v-if="ssoProviders.length" :label="t('loginView.or')" />
          </template>

          <SsoButtons :providers="ssoProviders" :disabled="loading" @error="error = $event" />

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
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import { reactive, computed } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import PasswordInput from '@/components/forms/PasswordInput.vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useConfigService } from '@/composables/config/config.service'
import SsoButtons from '@/components/auth/SsoButtons.vue'
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { login, loading, error } = useAuth()
const { config } = useConfigService()

const emailPasswordEnabled = computed(() => config.value?.auth?.emailPassword?.enabled ?? true)
const ssoProviders = computed(() => config.value?.auth?.oidc ?? [])
const demo = computed(() => config.value?.demo ?? null)
const forceNative = computed(() => route.query.native === 'true')
const showEmailPassword = computed(() => emailPasswordEnabled.value || forceNative.value)
const noAuthMethodAvailable = computed(() => !showEmailPassword.value && !ssoProviders.value.length)

// Detect OAuth errors in the URL (redirect from Better Auth)
if (route.query.error) {
  const errorDescription = route.query.error_description as string
  error.value = errorDescription || t('loginView.oauthError')

  // Nettoyer l'URL
  router.replace({ query: {} })
}

const state = reactive<LoginFormData>({ email: '', password: '' })

// Runs before the submit event, so the form validates and sends the demo sign-in.
function fillDemoAccount() {
  if (demo.value) Object.assign(state, demo.value)
}

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
</script>
