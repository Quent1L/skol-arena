<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('loginView.subtitle') }}</p>
      </div>

      <Card>
        <template #content>
          <!-- Error message if no authentication method is available -->
          <Message v-if="noAuthMethodAvailable" severity="error" :closable="false" class="mb-6">
            <div class="space-y-2">
              <p class="font-semibold">
                <i class="fa fa-exclamation-triangle mr-2"></i>
                {{ t('loginView.noAuthTitle') }}
              </p>
              <p class="text-sm">
                {{ t('loginView.noAuthDescription') }}
              </p>
            </div>
          </Message>

          <form v-if="!noAuthMethodAvailable" @submit="onSubmit" class="space-y-6">
            <!-- Email/Password form (only if enabled or ?native=true) -->
            <template v-if="showEmailPassword">
              <div class="flex flex-col gap-2">
                <label for="email" class="font-medium">{{ t('loginView.emailLabel') }}</label>
                <InputText
                  id="email"
                  v-model="email"
                  type="email"
                  :placeholder="t('loginView.emailPlaceholder')"
                  :disabled="loading"
                  :invalid="!!errors.email"
                  class="w-full"
                />
                <small v-if="errors.email" class="text-red-500">
                  {{ errors.email }}
                </small>
              </div>

              <div class="flex flex-col gap-2">
                <label for="password" class="font-medium">{{ t('loginView.passwordLabel') }}</label>
                <Password
                  id="password"
                  v-model="password"
                  :feedback="false"
                  toggle-mask
                  :disabled="loading"
                  :invalid="!!errors.password"
                  class="w-full"
                  input-class="w-full"
                />
                <small v-if="errors.password" class="text-red-500">
                  {{ errors.password }}
                </small>
                <div class="text-right">
                  <Button
                    link
                    :label="t('loginView.forgotPassword')"
                    @click="router.push('/forgot-password')"
                    class="text-sm text-blue-600 hover:text-blue-700 p-0"
                    type="button"
                  />
                </div>
              </div>

              <Message v-if="error" severity="error" :closable="false">
                {{ error }}
              </Message>

              <Button
                type="submit"
                :loading="loading"
                :label="t('loginView.loginButton')"
                class="w-full"
                :disabled="loading"
              />

              <!-- "Or" separator only if both methods are shown -->
              <div v-if="keycloakEnabled && showEmailPassword" class="relative">
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full border-t border-gray-300"></div>
                </div>
                <div class="relative flex justify-center text-sm">
                  <span class="px-2 bg-white text-gray-500">{{ t('loginView.or') }}</span>
                </div>
              </div>
            </template>

            <!-- Keycloak button (shown if enabled) -->
            <Button
              v-if="keycloakEnabled"
              @click="loginWithKeycloak"
              :loading="isKeycloakLoading"
              :disabled="isKeycloakLoading || loading"
              class="w-full"
              outlined
              severity="secondary"
              type="button"
            >
              <i class="fa fa-building mr-2"></i>
              {{ isKeycloakLoading ? t('loginView.keycloakLoading') : keycloakLoginLabel }}
            </Button>

            <!-- Sign-up link -->
            <div class="text-center text-sm">
              <span class="text-gray-600">{{ t('loginView.noAccount') }}</span>
              <Button
                link
                :label="t('loginView.register')"
                @click="router.push('/signup')"
                class="ml-1 p-0"
                type="button"
              />
            </div>

            <!-- Back to home -->
            <div class="text-center">
              <Button
                link
                :label="t('loginView.backToHome')"
                @click="router.push('/public')"
                class="text-sm text-gray-600"
                type="button"
              />
            </div>
          </form>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useConfigService } from '@/composables/config/config.service'
import { authClient } from '@/lib/auth-client'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { loginSchema } from '@/schemas/auth.schema'

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

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(loginSchema),
})

const [email] = defineField('email')
const [password] = defineField('password')

const onSubmit = handleSubmit(async (values) => {
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
})

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
