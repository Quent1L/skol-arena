<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('signupView.subtitle') }}</p>
        <p class="mt-1 text-sm text-gray-300">
          {{
            invitationRequired
              ? t('signupView.invitationRequired')
              : t('signupView.invitationOptional')
          }}
        </p>
      </div>

      <UCard variant="soft">
        <!-- Error message if no authentication method is available -->
        <UAlert
          v-if="noAuthMethodAvailable"
          color="error"
          variant="subtle"
          icon="i-fa7-solid:triangle-exclamation"
          :title="t('signupView.noAuthMethodTitle')"
          :description="t('signupView.noAuthMethodDesc')"
        />

        <div v-else class="space-y-6">
          <UFormField
            :label="
              invitationRequired
                ? t('signupView.invitationCodeLabel')
                : t('signupView.invitationCodeOptionalLabel')
            "
            size="xl"
          >
            <UInput
              id="code"
              v-model="invitationCode"
              :placeholder="t('signupView.invitationCodePlaceholder')"
              :disabled="isValidating || codeValid"
              class="w-full"
              @input="debouncedValidate"
            />

            <template #help>
              <div v-if="isValidating" class="flex items-center gap-2 text-info">
                <i class="fa fa-spinner fa-spin"></i>
                <span class="text-sm">{{ t('signupView.validating') }}</span>
              </div>

              <UAlert
                v-else-if="codeError"
                color="error"
                variant="subtle"
                icon="i-fa7-solid:circle-xmark"
                :title="codeError"
              />

              <UAlert
                v-else-if="codeValid"
                color="success"
                variant="subtle"
                icon="i-fa7-solid:circle-check"
                :title="
                  remainingUses === null
                    ? t('signupView.codeValidUnlimited')
                    : t('signupView.codeValidMessage', { count: remainingUses })
                "
              />
            </template>
          </UFormField>

          <div v-if="canChooseMethod" class="space-y-4">
            <p class="text-center text-sm text-muted font-medium">
              {{ t('signupView.chooseMethod') }}
            </p>

            <UButton
              v-if="emailPasswordEnabled"
              size="xl"
              block
              variant="outline"
              icon="i-fa7-solid:envelope"
              :label="t('signupView.emailPasswordButton')"
              @click="proceedToEmailPasswordRegistration"
            />

            <SsoButtons
              :providers="ssoProviders"
              sign-up
              variant="subtle"
              :prepare="storeInvitationCode"
              @error="codeError = $event"
            />
          </div>

          <UAlert
            v-else-if="!codeError"
            color="info"
            variant="subtle"
            :title="t('signupView.enterCodePrompt')"
          />

          <div class="text-center">
            <ULink to="/login" class="text-sm text-primary">{{
              t('signupView.backToLogin')
            }}</ULink>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { INVITATION_CODE_REGEX } from '@skol-arena/shared/schemas/invitation.schema'
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import SsoButtons from '@/components/auth/SsoButtons.vue'
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
const remainingUses = ref<number | null>(0)

const emailPasswordEnabled = computed(() => config.value?.auth?.emailPassword?.enabled ?? true)
const ssoProviders = computed(() => config.value?.auth?.oidc ?? [])
const invitationRequired = computed(() => config.value?.auth?.invitationRequired ?? true)
// Open sign-up: a code is optional, but a typed code that does not work must not be ignored.
const canChooseMethod = computed(
  () => codeValid.value || (!invitationRequired.value && !invitationCode.value.trim()),
)
const noAuthMethodAvailable = computed(
  () => !emailPasswordEnabled.value && !ssoProviders.value.length,
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

  if (!INVITATION_CODE_REGEX.test(invitationCode.value.trim().toLowerCase())) {
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

// Read back by the backend once the account exists (config/auth.ts, processInvitationCode).
function storeInvitationCode() {
  if (!codeValid.value) return
  document.cookie = `invitation_code=${invitationCode.value.trim().toLowerCase()}; path=/; max-age=600; SameSite=Lax`
}

function proceedToEmailPasswordRegistration() {
  storeInvitationCode()
  router.push('/register')
}
</script>
