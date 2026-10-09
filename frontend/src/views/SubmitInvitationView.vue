<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8 text-white">
        <SkolLogo :width="240" class="mx-auto" />
        <p class="mt-2">{{ t('submitInvitationView.subtitle') }}</p>
        <p class="mt-1 text-sm text-gray-300">{{ t('submitInvitationView.hint') }}</p>
      </div>

      <UCard variant="soft">
        <div class="space-y-6">
          <UAlert
            color="info"
            variant="subtle"
            icon="i-fa7-solid:circle-info"
            :title="t('submitInvitationView.infoTitle')"
            :description="t('submitInvitationView.infoDesc')"
          />

          <UFormField :label="t('submitInvitationView.codeLabel')" size="xl">
            <UInput
              id="code"
              v-model="invitationCode"
              :placeholder="t('submitInvitationView.codePlaceholder')"
              :disabled="isValidating || codeValid || isSubmitting"
              class="w-full"
              @input="debouncedValidate"
            />

            <template #help>
              <div v-if="isValidating" class="flex items-center gap-2 text-info">
                <i class="fa fa-spinner fa-spin"></i>
                <span class="text-sm">{{ t('submitInvitationView.validating') }}</span>
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
                :title="t('submitInvitationView.codeValid', { count: remainingUses })"
              />
            </template>
          </UFormField>

          <UAlert
            v-if="submitError"
            color="error"
            variant="subtle"
            icon="i-fa7-solid:circle-xmark"
            :title="submitError"
          />

          <div class="flex flex-col sm:flex-row gap-2">
            <UButton
              size="xl"
              icon="i-fa7-solid:check"
              class="flex-1 justify-center"
              :disabled="!codeValid || isSubmitting"
              :loading="isSubmitting"
              :label="isSubmitting ? t('submitInvitationView.submitting') : t('submitInvitationView.submit')"
              @click="submitCode"
            />

            <UButton
              size="xl"
              color="neutral"
              variant="outline"
              icon="i-fa7-solid:right-from-bracket"
              class="justify-center"
              :disabled="isSubmitting"
              :label="t('submitInvitationView.logout')"
              @click="logout"
            />
          </div>

          <UAlert
            v-if="!codeError && !codeValid"
            color="info"
            variant="subtle"
            :title="t('submitInvitationView.enterCodePrompt')"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { useInvitationService } from '@/composables/invitation/invitation.service'
import { useAuth } from '@/composables/useAuth'

const { t } = useI18n()
const router = useRouter()
const { validateCode, consumeCode } = useInvitationService()
const { logout: authLogout, fetchUserData } = useAuth()

const invitationCode = ref('')
const isValidating = ref(false)
const codeValid = ref(false)
const codeError = ref<string | null>(null)
const remainingUses = ref(0)
const isSubmitting = ref(false)
const submitError = ref<string | null>(null)

onMounted(async () => {
  const cookieCode = document.cookie
    .split('; ')
    .find(row => row.startsWith('invitation_code='))
    ?.split('=')[1]

  if (!cookieCode) return

  invitationCode.value = cookieCode
  isValidating.value = true
  codeError.value = null

  try {
    const result = await validateCode(cookieCode)
    if (result.valid) {
      codeValid.value = true
      remainingUses.value = result.remainingUses
      await submitCode()
    }
  } catch (err: unknown) {
    codeError.value = (err as Error).message || t('submitInvitationView.codeInvalid')
  } finally {
    isValidating.value = false
  }
})

const debouncedValidate = useDebounceFn(async () => {
  if (!/^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/.test(invitationCode.value)) {
    codeValid.value = false
    codeError.value = null
    return
  }

  isValidating.value = true
  codeError.value = null
  codeValid.value = false

  try {
    const result = await validateCode(invitationCode.value)
    if (result.valid) {
      codeValid.value = true
      remainingUses.value = result.remainingUses
    }
  } catch (err: unknown) {
    codeError.value = (err as Error).message || t('submitInvitationView.codeInvalid')
  } finally {
    isValidating.value = false
  }
}, 500)

async function submitCode() {
  if (!codeValid.value || isSubmitting.value) return

  isSubmitting.value = true
  submitError.value = null

  try {
    await consumeCode(invitationCode.value)
    document.cookie = 'invitation_code=; path=/; max-age=0'

    // Refresh user data to obtain the appUser
    await fetchUserData()

    // Redirect to the home page
    router.push('/')
  } catch (err: unknown) {
    submitError.value = (err as Error).message || t('submitInvitationView.submitError')
  } finally {
    isSubmitting.value = false
  }
}

async function logout() {
  try {
    await authLogout()
    router.push('/login')
  } catch (err) {
    console.error('Erreur lors de la déconnexion:', err)
  }
}
</script>
