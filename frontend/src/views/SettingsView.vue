<template>
  <div>
    <div class="max-w-2xl mx-auto p-4">
      <h1 class="text-2xl font-bold mb-6">{{ t('settings.title') }}</h1>

      <div class="space-y-6">
        <!-- Langue -->
        <SettingsSection :title="t('settings.language.title')" icon="fas fa-language">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="font-medium">{{ t('settings.language.label') }}</p>
              <p class="text-sm opacity-70">{{ t('settings.language.desc') }}</p>
            </div>
            <USelect
              v-model="currentLocale"
              :items="availableLocales"
              value-key="code"
              label-key="label"
              size="xl"
              :aria-label="t('settings.language.label')"
              class="w-44 shrink-0"
              data-testid="language-select"
            >
              <template #leading>
                <span>{{ currentLocaleFlag }}</span>
              </template>
              <template #item-leading="{ item }">
                <span>{{ item.flag }}</span>
              </template>
            </USelect>
          </div>
        </SettingsSection>

        <!-- Profile picture: saved on its own, separately from the profile form -->
        <SettingsSection v-if="appUser" :title="t('settings.avatar.title')" icon="fas fa-camera">
          <p class="text-sm text-muted mb-4">{{ t('settings.avatar.description') }}</p>
          <AvatarEditor
            :user-id="appUser.id"
            :name="appUser.displayName"
            :color-key="appUser.shortName"
          />
        </SettingsSection>

        <!-- Profil -->
        <SettingsSection :title="t('settings.profile.title')" icon="fas fa-user-edit">
          <UForm
            :schema="profileSchema"
            :state="profile"
            :disabled="profileLoading"
            class="space-y-4"
            @submit="onSubmitProfile"
          >
            <UAlert
              v-if="profileSuccess"
              color="success"
              variant="subtle"
              icon="i-fa7-solid:check"
              :title="t('settings.profile.updateSuccess')"
            />

            <UFormField name="displayName" :label="t('settings.profile.displayName')" size="xl">
              <UInput id="display-name" v-model="profile.displayName" maxlength="50" class="w-full" />
            </UFormField>

            <UFormField
              name="shortName"
              :label="t('settings.profile.shortName')"
              :help="t('settings.profile.shortNameHint')"
              size="xl"
              :ui="{ help: 'text-xs' }"
            >
              <UInput
                id="short-name"
                :model-value="profile.shortName"
                maxlength="8"
                class="w-full"
                @update:model-value="profile.shortName = String($event ?? '').toUpperCase()"
              />
            </UFormField>

            <UAlert v-if="profileError" color="error" variant="subtle" :title="profileError" />

            <div class="flex justify-end gap-2 pt-2">
              <UButton
                :label="t('common.cancel')"
                color="neutral"
                variant="outline"
                size="lg"
                @click="$router.back()"
              />
              <UButton
                type="submit"
                :label="t('common.save')"
                icon="i-fa7-solid:floppy-disk"
                size="lg"
                :loading="profileLoading"
              />
            </div>
          </UForm>
        </SettingsSection>

        <!-- Application -->
        <SettingsSection :title="t('settings.application.title')" icon="fas fa-mobile-alt">
          <UAlert
            v-if="isInstalled"
            color="success"
            variant="subtle"
            :title="t('settings.application.installed')"
          />

          <div v-else-if="canInstall" class="flex items-center justify-between gap-4">
            <div>
              <p class="font-medium">{{ t('settings.application.install') }}</p>
              <p class="text-sm opacity-70">{{ t('settings.application.installDesc') }}</p>
            </div>
            <UButton
              icon="i-fa7-solid:download"
              :label="t('settings.application.installBtn')"
              @click="triggerInstall"
            />
          </div>

          <UAlert
            v-if="isIOS && showIOSInstructions"
            color="info"
            variant="subtle"
            class="mt-3"
            close
            @update:open="showIOSInstructions = false"
          >
            <template #description>
              {{ t('settings.application.iosTap') }} <i class="fas fa-share-from-square mx-1"></i>
              {{ t('settings.application.iosThen') }}
              <strong>"{{ t('settings.application.iosAddToHome') }}"</strong>
            </template>
          </UAlert>

          <UAlert
            v-else-if="!isInstalled && !canInstall"
            color="neutral"
            variant="outline"
            :title="t('settings.application.notAvailable')"
          />
        </SettingsSection>

        <!-- Notifications -->
        <SettingsSection :title="t('settings.notifications.title')" icon="fas fa-bell">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="font-medium">{{ t('settings.notifications.push') }}</p>
              <p class="text-sm opacity-70">{{ t('settings.notifications.pushDesc') }}</p>
            </div>
            <USwitch
              :model-value="pushEnabled"
              :disabled="pushLoading"
              size="lg"
              :aria-label="t('settings.notifications.push')"
              @update:model-value="togglePushNotifications"
            />
          </div>
          <UAlert
            v-if="!notificationSupported"
            color="warning"
            variant="subtle"
            class="mt-3"
            :title="t('settings.notifications.unsupported')"
          />
        </SettingsSection>

        <!-- Compte -->
        <SettingsSection :title="t('settings.account.title')" icon="fas fa-user">
          <!-- An SSO-only account has no password to re-enter, so the change
               flow is replaced by the email-based creation flow. -->
          <UButton
            v-if="hasNativePassword"
            :label="t('settings.account.changePassword')"
            icon="i-fa7-solid:key"
            color="neutral"
            variant="outline"
            size="lg"
            block
            @click="openChangePasswordDialog"
          />

          <div v-else class="space-y-3">
            <UAlert color="info" variant="subtle" :title="t('settings.account.ssoOnlyNotice')" />

            <UAlert
              v-if="setPasswordSent"
              color="success"
              variant="subtle"
              icon="i-fa7-solid:check"
              :title="t('settings.account.setPasswordSent')"
            />

            <UAlert v-if="setPasswordError" color="error" variant="subtle" :title="setPasswordError" />

            <UButton
              v-if="!setPasswordSent"
              :label="t('settings.account.setPassword')"
              icon="i-fa7-solid:envelope"
              color="neutral"
              variant="outline"
              size="lg"
              block
              :loading="setPasswordLoading"
              :disabled="setPasswordLoading || !userEmail"
              @click="sendSetPasswordLink"
            />
          </div>
        </SettingsSection>

        <!-- Groupes -->
        <SettingsSection :title="t('settings.groups.title')" icon="fas fa-users">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p class="font-medium">{{ t('settings.groups.join') }}</p>
              <p class="text-sm opacity-70">{{ t('settings.groups.joinDesc') }}</p>
            </div>
            <UButton
              icon="i-fa7-solid:user-plus"
              :label="t('common.join')"
              color="neutral"
              variant="outline"
              size="lg"
              class="shrink-0 justify-center"
              @click="openJoinOrgDialog"
            />
          </div>
        </SettingsSection>

        <!-- Mode kiosque -->
        <SettingsSection v-if="userRole === 'kiosk'" :title="t('settings.kiosk.title')" icon="fas fa-lock">
          <div class="space-y-3">
            <UAlert color="warning" variant="subtle" :title="t('settings.kiosk.warning')" />
            <UButton
              :label="t('settings.kiosk.lock')"
              icon="i-fa7-solid:lock"
              color="error"
              variant="outline"
              size="lg"
              block
              @click="showKioskLockDialog = true"
            />
          </div>
        </SettingsSection>
      </div>
    </div>

    <!-- Dialog rejoindre un groupe -->
    <UModal
      v-model:open="showJoinOrgDialog"
      :title="t('settings.groups.join')"
      :ui="{ footer: 'justify-end' }"
      @after:leave="resetJoinOrgDialog"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="joinOrgSuccess" color="success" variant="subtle" icon="i-fa7-solid:check">
            <template #title>
              {{ t('settings.groups.joinedPrefix') }} <strong>{{ joinOrgSuccessName }}</strong>.
            </template>
          </UAlert>

          <template v-else>
            <UFormField :label="t('settings.groups.invitationCode')" size="xl">
              <UInput
                id="org-code"
                v-model="joinOrgCode"
                :placeholder="t('settings.groups.codePlaceholder')"
                :disabled="joinOrgIsValidating || joinOrgLoading"
                class="w-full"
                @input="debouncedValidateOrgCode"
              />

              <template #help>
                <div v-if="joinOrgIsValidating" class="flex items-center gap-2 text-info">
                  <i class="fa fa-spinner fa-spin"></i>
                  <span class="text-sm">{{ t('settings.groups.validating') }}</span>
                </div>

                <UAlert
                  v-else-if="joinOrgCodeError"
                  color="error"
                  variant="subtle"
                  icon="i-fa7-solid:circle-xmark"
                  :title="joinOrgCodeError"
                />

                <UAlert
                  v-else-if="joinOrgCodeValid && joinOrgOrganizationName"
                  color="success"
                  variant="subtle"
                  icon="i-fa7-solid:circle-check"
                >
                  <template #title>
                    {{ t('settings.groups.codeValidPrefix') }} <strong>{{ joinOrgOrganizationName }}</strong>
                  </template>
                </UAlert>
              </template>
            </UFormField>

            <UAlert
              v-if="joinOrgError"
              color="error"
              variant="subtle"
              icon="i-fa7-solid:circle-xmark"
              :title="joinOrgError"
            />
          </template>
        </div>
      </template>

      <template #footer>
        <template v-if="!joinOrgSuccess">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="outline"
            :disabled="joinOrgLoading"
            @click="showJoinOrgDialog = false"
          />
          <UButton
            :label="t('common.join')"
            icon="i-fa7-solid:user-plus"
            :loading="joinOrgLoading"
            :disabled="!joinOrgCodeValid || !joinOrgOrganizationName || joinOrgLoading"
            @click="submitJoinOrg"
          />
        </template>
        <UButton v-else :label="t('common.close')" @click="showJoinOrgDialog = false" />
      </template>
    </UModal>

    <!-- Dialog confirmation verrouillage kiosque -->
    <UModal
      v-model:open="showKioskLockDialog"
      :title="t('settings.kiosk.dialogTitle')"
      :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="warning" variant="subtle">
            <template #description>
              <strong>{{ t('settings.kiosk.attention') }}</strong> {{ t('settings.kiosk.dialogWarningBody') }}
            </template>
          </UAlert>
          <p class="text-sm opacity-70">
            {{ t('settings.kiosk.dialogNote') }}
          </p>
        </div>
      </template>

      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          @click="showKioskLockDialog = false"
        />
        <UButton
          :label="t('settings.kiosk.lockShort')"
          icon="i-fa7-solid:lock"
          color="error"
          @click="activateKioskLock"
        />
      </template>
    </UModal>

    <!-- Dialog changement de mot de passe -->
    <UModal
      v-model:open="showChangePasswordDialog"
      :title="t('settings.password.title')"
      :dismissible="!authLoading"
      :close="!authLoading"
    >
      <template #body>
        <UAlert
          v-if="changePasswordSuccess"
          color="success"
          variant="subtle"
          icon="i-fa7-solid:check"
          :title="t('settings.password.success')"
        />

        <UForm
          v-else
          :schema="changePasswordSchema"
          :state="passwordForm"
          :disabled="authLoading"
          class="space-y-4"
          @submit="onChangePassword"
        >
          <UFormField name="currentPassword" :label="t('settings.password.current')" size="xl">
            <PasswordInput id="current-password" v-model="passwordForm.currentPassword" />
          </UFormField>

          <UFormField name="newPassword" :label="t('settings.password.new')" size="xl">
            <PasswordInput id="new-password" v-model="passwordForm.newPassword" autocomplete="new-password" />
          </UFormField>

          <UFormField name="passwordConfirm" :label="t('settings.password.confirm')" size="xl">
            <PasswordInput
              id="password-confirm"
              v-model="passwordForm.passwordConfirm"
              autocomplete="new-password"
            />
          </UFormField>

          <UAlert v-if="authError" color="error" variant="subtle" :title="authError" />

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="outline"
              :disabled="authLoading"
              @click="showChangePasswordDialog = false"
            />
            <UButton
              type="submit"
              :label="t('common.confirm')"
              icon="i-fa7-solid:check"
              :loading="authLoading"
            />
          </div>
        </UForm>

        <div v-if="changePasswordSuccess" class="flex justify-end pt-4">
          <UButton :label="t('common.close')" @click="showChangePasswordDialog = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'
import { useRouter } from 'vue-router'
import { useNotificationPush } from '@/composables/notification/notification.push'
import { usePWAInstall } from '@/composables/pwa/pwa.install'
import { useAuth } from '@/composables/useAuth'
import { z } from 'zod'
import { changePasswordSchema, type ChangePasswordFormData } from '@/schemas/auth.schema'
import { displayNameRegex } from '@skol-arena/shared'
import { userApi } from '@/composables/user/user.api'
import { useInvitationService } from '@/composables/invitation/invitation.service'
import { useDebounceFn } from '@vueuse/core'
import AvatarEditor from '@/components/avatar/AvatarEditor.vue'
import PasswordInput from '@/components/forms/PasswordInput.vue'
import SettingsSection from '@/components/settings/SettingsSection.vue'

const { t } = useI18n()
const { currentLocale, availableLocales } = useLocale()
const currentLocaleFlag = computed(
  () => availableLocales.find((l) => l.code === currentLocale.value)?.flag,
)

const { isInstalled, isIOS, canInstall, showIOSInstructions, triggerInstall } = usePWAInstall()

const pushEnabled = ref(false)
const pushLoading = ref(false)

const notificationSupported = computed(
  () => typeof window !== 'undefined' && 'Notification' in window,
)

const router = useRouter()
const { enablePush, disablePush } = useNotificationPush()
const {
  changePassword,
  requestPasswordReset,
  listAuthProviders,
  loading: authLoading,
  error: authError,
  userRole,
  lockKioskSettings,
  fetchUserData,
  appUser,
} = useAuth()

// Kiosk lock
const showKioskLockDialog = ref(false)

function activateKioskLock() {
  lockKioskSettings()
  showKioskLockDialog.value = false
  router.push('/')
}

// Profile form — schema is reactive so validation messages follow the locale
const profileSchema = computed(() =>
  z.object({
    displayName: z
      .string()
      .trim()
      .min(3, t('settings.validation.min3'))
      .max(50, t('settings.validation.displayNameMax'))
      .regex(displayNameRegex, t('settings.validation.nameRegex')),
    shortName: z
      .string()
      .trim()
      .min(3, t('settings.validation.min3'))
      .max(8, t('settings.validation.shortNameMax'))
      .regex(displayNameRegex, t('settings.validation.nameRegex'))
      .transform((v) => v.toUpperCase()),
  }),
)
type ProfileFormData = z.output<typeof profileSchema.value>

const profileLoading = ref(false)
const profileSuccess = ref(false)
const profileError = ref<string | null>(null)
const profile = reactive({ displayName: '', shortName: '' })

async function onSubmitProfile({ data: values }: FormSubmitEvent<ProfileFormData>) {
  profileLoading.value = true
  profileSuccess.value = false
  profileError.value = null
  try {
    await userApi.updateProfile(values)
    // The header reads app_users through `appUser`: without this refetch it keeps
    // showing the previous name until the next full page load.
    await fetchUserData()
    profileSuccess.value = true
  } catch {
    profileError.value = t('settings.profile.updateError')
  } finally {
    profileLoading.value = false
  }
}

// Change password form
const showChangePasswordDialog = ref(false)
const changePasswordSuccess = ref(false)

// Defaults to true so a failed provider lookup keeps the existing flow rather
// than hiding it: a user with a password must never lose the ability to change it.
const hasNativePassword = ref(true)
const userEmail = ref<string | null>(null)
const setPasswordLoading = ref(false)
const setPasswordSent = ref(false)
const setPasswordError = ref<string | null>(null)

/**
 * Better Auth exposes no set-password endpoint: the reset mail is the only way to
 * give a password to an SSO account, and it also proves the address belongs to them.
 */
async function sendSetPasswordLink() {
  if (!userEmail.value) return
  setPasswordLoading.value = true
  setPasswordError.value = null
  try {
    await requestPasswordReset(userEmail.value)
    setPasswordSent.value = true
  } catch (err: unknown) {
    setPasswordError.value =
      err instanceof Error ? err.message : t('settings.account.setPasswordError')
  } finally {
    setPasswordLoading.value = false
  }
}

const passwordForm = reactive<ChangePasswordFormData>({
  currentPassword: '',
  newPassword: '',
  passwordConfirm: '',
})

function resetPasswordForm() {
  Object.assign(passwordForm, { currentPassword: '', newPassword: '', passwordConfirm: '' })
}

function openChangePasswordDialog() {
  changePasswordSuccess.value = false
  authError.value = null
  resetPasswordForm()
  showChangePasswordDialog.value = true
}

async function onChangePassword({ data: values }: FormSubmitEvent<ChangePasswordFormData>) {
  try {
    await changePassword(values.currentPassword, values.newPassword)
    changePasswordSuccess.value = true
    resetPasswordForm()
  } catch {
    // error displayed via authError
  }
}

// Join organization dialog
const { joinOrganization, validateCode: validateInvitationCode } = useInvitationService()

const showJoinOrgDialog = ref(false)
const joinOrgCode = ref('')
const joinOrgIsValidating = ref(false)
const joinOrgCodeValid = ref(false)
const joinOrgCodeError = ref<string | null>(null)
const joinOrgOrganizationName = ref<string | null>(null)
const joinOrgLoading = ref(false)
const joinOrgSuccess = ref(false)
const joinOrgSuccessName = ref('')
const joinOrgError = ref<string | null>(null)

function openJoinOrgDialog() {
  resetJoinOrgDialog()
  showJoinOrgDialog.value = true
}

function resetJoinOrgDialog() {
  joinOrgCode.value = ''
  joinOrgIsValidating.value = false
  joinOrgCodeValid.value = false
  joinOrgCodeError.value = null
  joinOrgOrganizationName.value = null
  joinOrgSuccess.value = false
  joinOrgSuccessName.value = ''
  joinOrgError.value = null
}

const debouncedValidateOrgCode = useDebounceFn(async () => {
  if (!/^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/.test(joinOrgCode.value)) {
    joinOrgCodeValid.value = false
    joinOrgCodeError.value = null
    joinOrgOrganizationName.value = null
    return
  }
  joinOrgIsValidating.value = true
  joinOrgCodeError.value = null
  joinOrgCodeValid.value = false
  joinOrgOrganizationName.value = null
  try {
    const result = await validateInvitationCode(joinOrgCode.value)
    if (!result.organizationId) {
      joinOrgCodeError.value = t('settings.groups.notGroupCode')
      return
    }
    joinOrgCodeValid.value = true
    joinOrgOrganizationName.value = result.organizationName ?? null
  } catch (err: unknown) {
    joinOrgCodeError.value = err instanceof Error ? err.message : t('settings.groups.invalidCode')
  } finally {
    joinOrgIsValidating.value = false
  }
}, 500)

async function submitJoinOrg() {
  if (!joinOrgCodeValid.value || joinOrgLoading.value) return
  joinOrgLoading.value = true
  joinOrgError.value = null
  try {
    const result = await joinOrganization(joinOrgCode.value)
    joinOrgSuccessName.value = result.organizationName
    joinOrgSuccess.value = true
  } catch (err: unknown) {
    joinOrgError.value = err instanceof Error ? err.message : t('settings.groups.joinError')
  } finally {
    joinOrgLoading.value = false
  }
}

onMounted(async () => {
  if ('Notification' in window) {
    pushEnabled.value = Notification.permission === 'granted'
  }

  try {
    const user = await userApi.me()
    Object.assign(profile, { displayName: user.displayName, shortName: user.shortName })
    userEmail.value = user.betterAuth.email
  } catch {
    profileError.value = t('settings.profile.loadError')
  }

  try {
    hasNativePassword.value = (await listAuthProviders()).includes('credential')
  } catch {
    // Keep the default: showing the change-password flow is the safe failure mode.
  }
})

async function togglePushNotifications(newValue: boolean) {
  console.log('[Settings] Toggle push notifications:', newValue, 'current:', pushEnabled.value)
  pushLoading.value = true
  try {
    if (newValue) {
      console.log('[Settings] Enabling push notifications...')
      const result = await enablePush()
      console.log('[Settings] Enable push result:', result)
      if (result) {
        pushEnabled.value = true
        console.log('[Settings] Push notifications enabled successfully')
      } else {
        console.warn('[Settings] Failed to enable push notifications, result was false')
        pushEnabled.value = false
      }
    } else {
      console.log('[Settings] Disabling push notifications...')
      const result = await disablePush()
      console.log('[Settings] Disable push result:', result)
      if (result) {
        pushEnabled.value = false
        console.log('[Settings] Push notifications disabled successfully')
      } else {
        console.warn('[Settings] Failed to disable push notifications, result was false')
        // Keep current state if disable failed
      }
    }
  } catch (error) {
    console.error('[Settings] Error toggling push notifications:', error)
    console.error('[Settings] Error details:', error instanceof Error ? error.message : error)
    console.error('[Settings] Error stack:', error instanceof Error ? error.stack : 'No stack')
    // Reset to actual state on error
    pushEnabled.value = Notification.permission === 'granted'
  } finally {
    pushLoading.value = false
    console.log('[Settings] Final push state:', pushEnabled.value)
  }
}
</script>
