<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('signupView.subtitle') }}</p>
        <p class="mt-1 text-sm text-gray-300">{{ t('signupView.invitationRequired') }}</p>
      </div>

      <Card>
        <template #content>
          <!-- Error message if no authentication method is available -->
          <Message v-if="noAuthMethodAvailable" severity="error" :closable="false" class="mb-6">
            <div class="space-y-2">
              <p class="font-semibold">
                <i class="fa fa-exclamation-triangle mr-2"></i>
                {{ t('signupView.noAuthMethodTitle') }}
              </p>
              <p class="text-sm">
                {{ t('signupView.noAuthMethodDesc') }}
              </p>
            </div>
          </Message>

          <div v-if="!noAuthMethodAvailable" class="space-y-6">
            <div class="flex flex-col gap-2">
              <label for="code" class="font-medium">{{ t('signupView.invitationCodeLabel') }}</label>
              <InputText
                id="code"
                v-model="invitationCode"
                :placeholder="t('signupView.invitationCodePlaceholder')"
                :disabled="isValidating || codeValid"
                class="w-full"
                @input="debouncedValidate"
              />

              <div v-if="isValidating" class="flex items-center gap-2 text-blue-600">
                <i class="fa fa-spinner fa-spin"></i>
                <span class="text-sm">{{ t('signupView.validating') }}</span>
              </div>

              <Message v-else-if="codeError" severity="error" :closable="false">
                <i class="fa fa-times-circle mr-2"></i>
                {{ codeError }}
              </Message>

              <Message v-else-if="codeValid" severity="success" :closable="false">
                <i class="fa fa-check-circle mr-2"></i>
                {{ t('signupView.codeValidMessage', { count: remainingUses }) }}
              </Message>
            </div>

            <div v-if="codeValid" class="space-y-4">
              <div class="text-center">
                <p class="text-sm text-gray-600 font-medium">
                  {{ t('signupView.chooseMethod') }}
                </p>
              </div>

              <Button
                v-if="emailPasswordEnabled"
                @click="proceedToEmailPasswordRegistration"
                class="w-full"
                size="large"
                outlined
              >
                <i class="fa fa-envelope mr-2"></i>
                {{ t('signupView.emailPasswordButton') }}
              </Button>

              <Button
                v-if="keycloakEnabled"
                @click="proceedToKeycloakRegistration"
                :loading="isSigningIn"
                class="w-full"
                size="large"
                severity="secondary"
              >
                <i class="fa fa-building mr-2"></i>
                {{ isSigningIn ? t('signupView.signingIn') : keycloakLoginLabel }}
              </Button>
            </div>

            <Message v-else-if="!codeError" severity="info" :closable="false">
              {{ t('signupView.enterCodePrompt') }}
            </Message>

            <div class="text-center">
              <Button
                link
                :label="t('signupView.backToLogin')"
                @click="router.push('/login')"
                class="text-sm text-gray-600"
                type="button"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { authClient } from '@/lib/auth-client'
import { useInvitationService } from '@/composables/invitation/invitation.service'
import { useConfigService } from '@/composables/config/config.service'
import { useAppToast } from '@/composables/useAppToast'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useAppToast()
const { validateCode: validateCodeApi } = useInvitationService()
const { config } = useConfigService()

const invitationCode = ref('')
const codeValid = ref(false)
const codeError = ref('')
const isValidating = ref(false)
const remainingUses = ref(0)
const isSigningIn = ref(false)

const emailPasswordEnabled = computed(() => config.value?.auth?.emailPassword?.enabled ?? true)
const keycloakEnabled = computed(() => config.value?.auth?.keycloak?.enabled ?? false)
const noAuthMethodAvailable = computed(() => !emailPasswordEnabled.value && !keycloakEnabled.value)
const keycloakLoginLabel = computed(
  () => config.value?.auth?.keycloak?.loginLabel ?? t('signupView.keycloakLabel')
)

onMounted(() => {
  // Check if an OAuth error is present in the URL
  const error = route.query.error as string
  const errorDescription = route.query.error_description as string

  if (error) {
    const errorMessage = errorDescription || t('signupView.oauthError')

    // Show the error to the user
    toast.add({
      severity: 'error',
      summary: t('signupView.errorSummary'),
      detail: errorMessage,
      life: 8000,
    })

    // Clean up the URL
    router.replace({ query: {} })
  }

  const urlCode = route.query.code as string
  if (urlCode) {
    invitationCode.value = urlCode
    validateCode()
  }
})

async function validateCode() {
  if (!invitationCode.value.trim()) {
    codeValid.value = false
    codeError.value = ''
    return
  }

  if (!/^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/.test(invitationCode.value)) {
    codeValid.value = false
    codeError.value = t('signupView.invalidFormat')
    return
  }

  isValidating.value = true
  codeError.value = ''

  try {
    const result = await validateCodeApi(invitationCode.value)

    if (result.valid) {
      codeValid.value = true
      remainingUses.value = result.remainingUses
    } else {
      codeValid.value = false
      codeError.value = t('signupView.codeInvalid')
    }
  } catch (error: unknown) {
    codeValid.value = false
    codeError.value = (error as Error).message || t('signupView.validationError')
  } finally {
    isValidating.value = false
  }
}

const debouncedValidate = useDebounceFn(validateCode, 500)

function proceedToEmailPasswordRegistration() {
  document.cookie = `invitation_code=${invitationCode.value}; path=/; max-age=600; SameSite=Lax`
  router.push('/register')
}

async function proceedToKeycloakRegistration() {
  isSigningIn.value = true

  try {
    document.cookie = `invitation_code=${invitationCode.value}; path=/; max-age=600; SameSite=Lax`

    // In dev, the frontend is on localhost:5173, so the full URL must be specified
    // In prod (dockerized), the frontend is served by the backend, so '/' is enough
    // Redirects to the home page. If there's no invitation code, the guard will detect
    // the INVITATION_CODE_REQUIRED error and automatically redirect to /submit-invitation
    const callbackURL = import.meta.env.MODE === 'dev' ? 'http://localhost:5173/' : '/'

    // IMPORTANT: requestSignUp: true to force account creation
    await authClient.signIn.oauth2({
      providerId: 'keycloak',
      callbackURL,
      requestSignUp: true, // Force sign-up (with invitation code)
    })
  } catch (error: unknown) {
    isSigningIn.value = false
    codeError.value = (error as Error).message || t('signupView.validationError')
    console.error('Keycloak sign-in error:', error)
  }
}
</script>
