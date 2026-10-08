<template>
  <div class="max-w-4xl">
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold text-highlighted">
        {{ currentUser?.displayName ?? t('adminUserFormView.title') }}
      </h1>
      <UBadge
        v-if="currentUser?.deactivatedAt"
        :label="t('adminUsersList.deactivated')"
        color="error"
        variant="subtle"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <div class="space-y-6">
      <UForm :schema="adminUpdateUserSchema" :state="state" @submit="onSubmit">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">{{ t('adminUserFormView.identitySection') }}</h2>
          </template>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField name="displayName" :label="t('adminUserFormView.displayNameLabel')">
              <UInput v-model="state.displayName" class="w-full" />
            </UFormField>
            <UFormField name="shortName" :label="t('adminUserFormView.shortNameLabel')">
              <UInput v-model="state.shortName" class="w-full" />
            </UFormField>
            <UFormField name="role" :label="t('adminUserFormView.roleLabel')">
              <USelect v-model="state.role" :items="roleOptions" class="w-full" />
            </UFormField>
            <UFormField
              name="email"
              :label="t('adminUserFormView.emailLabel')"
              :help="t('adminUserFormView.emailChangeNotice')"
            >
              <UInput v-model="state.email" type="email" class="w-full" />
            </UFormField>
            <UFormField :label="t('adminUserFormView.authProvidersLabel')" class="sm:col-span-2">
              <div v-if="authProviders.length" class="flex flex-wrap gap-1">
                <UBadge
                  v-for="provider in authProviders"
                  :key="provider"
                  :label="t(`adminUsersList.authProviders.${provider}`)"
                  :color="provider === 'keycloak' ? 'warning' : 'info'"
                  variant="subtle"
                />
              </div>
              <span v-else class="text-sm text-dimmed">{{ t('adminUsersList.authProviders.none') }}</span>
            </UFormField>
          </div>
          <template #footer>
            <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <UButton
                :label="t('common.cancel')"
                color="neutral"
                variant="ghost"
                to="/admin/users"
                class="justify-center"
                :disabled="loading"
              />
              <UButton
                type="submit"
                :label="t('common.update')"
                icon="i-fa7-solid:check"
                class="justify-center"
                :loading="loading"
              />
            </div>
          </template>
        </UCard>
      </UForm>

      <!-- Moderation: the picture is the player's own, an admin can only take it down -->
      <UCard v-if="currentUser">
        <template #header>
          <h2 class="font-semibold text-highlighted">{{ t('adminUserFormView.avatarSection') }}</h2>
        </template>
        <div class="flex items-center gap-4">
          <PlayerAvatar
            :name="currentUser.displayName"
            :color-key="currentUser.shortName"
            :player-id="userId"
            size="xl"
            shape="square"
          />
          <div class="flex flex-col items-start gap-2">
            <UButton
              v-if="hasAvatar"
              :label="t('adminUserFormView.removeAvatar')"
              icon="i-fa7-solid:trash"
              color="error"
              variant="outline"
              size="sm"
              :loading="removingAvatar"
              @click="confirmRemoveAvatar"
            />
            <p class="text-sm text-muted">
              {{ hasAvatar ? t('adminUserFormView.removeAvatarHint') : t('adminUserFormView.noAvatar') }}
            </p>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            {{ t('adminUserFormView.organizationsSection') }}
          </h2>
        </template>
        <ul v-if="currentUser?.organizations.length" class="mb-4 divide-y divide-default">
          <li
            v-for="org in currentUser.organizations"
            :key="org.id"
            class="flex items-center justify-between gap-2 py-2"
          >
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="font-medium">{{ org.name }}</span>
              <UBadge
                :label="t(`adminUserFormView.orgRoles.${org.role}`)"
                color="neutral"
                variant="subtle"
              />
            </div>
            <UTooltip :text="t('adminUserFormView.removeFromOrganization')">
              <UButton
                icon="i-fa7-solid:xmark"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="t('adminUserFormView.removeFromOrganization')"
                @click="handleRemoveOrganization(org.id)"
              />
            </UTooltip>
          </li>
        </ul>
        <p v-else class="mb-4 text-muted">{{ t('adminUserFormView.noOrganization') }}</p>

        <div class="flex flex-col gap-3 sm:flex-row">
          <USelectMenu
            v-model="organizationToAdd"
            :items="availableOrganizations"
            value-key="id"
            label-key="name"
            :placeholder="t('adminUserFormView.addOrganizationPlaceholder')"
            class="flex-1"
          />
          <UButton
            :label="t('adminUserFormView.addOrganization')"
            icon="i-fa7-solid:plus"
            class="justify-center"
            :disabled="!organizationToAdd"
            @click="handleAddOrganization"
          />
        </div>
      </UCard>

      <!-- A returning player signs up again, which creates an empty profile.
           Restoring moves that new identity onto this archived history. -->
      <UCard v-if="isArchived">
        <template #header>
          <h2 class="font-semibold text-highlighted">{{ t('adminUserFormView.restoreSection') }}</h2>
        </template>
        <p class="mb-3 text-sm text-muted">{{ t('adminUserFormView.restoreExplanation') }}</p>

        <UInput
          v-model="restoreSearch"
          icon="i-fa7-solid:magnifying-glass"
          :placeholder="t('adminUserFormView.restoreSearchPlaceholder')"
          class="mb-3 w-full"
        />

        <UAlert v-if="deletionBlockers.length" color="error" variant="subtle" class="mb-3">
          <template #description>
            <p class="mb-2">{{ t('adminUserFormView.restoreBlockedIntro') }}</p>
            <ul class="list-disc ps-5">
              <li v-for="blocker in deletionBlockers" :key="blocker.resource">
                {{ t(`adminUsersList.blockers.${blocker.resource}`) }} : {{ blocker.count }}
              </li>
            </ul>
          </template>
        </UAlert>

        <ul v-if="restoreCandidates.length" class="divide-y divide-default">
          <li
            v-for="candidate in restoreCandidates"
            :key="candidate.id"
            class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <span class="font-medium">{{ candidate.displayName }}</span>
              <span class="ms-2 text-sm text-muted">{{ candidate.email ?? '—' }}</span>
            </div>
            <UButton
              :label="t('adminUserFormView.restoreAction')"
              icon="i-fa7-solid:rotate-left"
              size="sm"
              class="justify-center"
              :loading="loading"
              @click="handleRestore(candidate.id)"
            />
          </li>
        </ul>
        <p v-else-if="restoreSearch.trim()" class="text-muted">
          {{ t('adminUserFormView.restoreNoCandidate') }}
        </p>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">{{ t('adminUserFormView.dangerSection') }}</h2>
        </template>
        <UAlert
          v-if="isArchived"
          color="neutral"
          variant="subtle"
          :description="t('adminUserFormView.archivedNotice')"
        />
        <div v-else class="flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:justify-center">
          <UButton
            :label="t('adminUsersList.resetPassword')"
            icon="i-fa7-solid:key"
            color="neutral"
            variant="soft"
            @click="handleResetPassword"
          />
          <UButton
            :label="t('adminUsersList.archive')"
            icon="i-fa7-solid:box-archive"
            color="warning"
            variant="soft"
            :loading="loading"
            @click="openArchiveDialog"
          />
          <UButton
            v-if="currentUser?.deactivatedAt"
            :label="t('adminUsersList.reactivate')"
            icon="i-fa7-solid:user-check"
            color="success"
            variant="soft"
            :loading="loading"
            @click="handleActivation(true)"
          />
          <UButton
            v-else
            :label="t('adminUsersList.deactivate')"
            icon="i-fa7-solid:user-slash"
            color="warning"
            variant="soft"
            :loading="loading"
            @click="handleActivation(false)"
          />
          <UButton
            :label="t('adminUsersList.deletePermanently')"
            icon="i-fa7-solid:trash"
            color="error"
            :loading="loading"
            @click="deleteDialogVisible = true"
          />
        </div>
        <p v-if="hasNoNativePassword" class="mt-3 text-sm text-warning">
          {{ t('adminUserFormView.resetPasswordHintSso') }}
        </p>
        <p class="mt-3 text-sm text-muted">{{ t('adminUsersList.deactivateCacheNotice') }}</p>
      </UCard>
    </div>

    <UModal
      v-model:open="deleteDialogVisible"
      :title="t('adminUsersList.deleteDialogHeader')"
      :ui="{ footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    >
      <template #body>
        <div class="flex items-start gap-3">
          <UIcon name="i-fa7-solid:triangle-exclamation" class="size-6 shrink-0 text-error" />
          <div class="text-sm">
            <i18n-t keypath="adminUsersList.deleteConfirmMessage" tag="p" scope="global">
              <template #name><strong>{{ currentUser?.displayName }}</strong></template>
            </i18n-t>
            <p class="mt-2 text-muted">{{ t('adminUsersList.deleteIrreversibleNotice') }}</p>
          </div>
        </div>
        <UAlert v-if="deletionBlockers.length" color="error" variant="subtle" class="mt-4">
          <template #description>
            <p class="mb-2">{{ t('adminUsersList.deleteBlockedIntro') }}</p>
            <ul class="list-disc ps-5">
              <li v-for="blocker in deletionBlockers" :key="blocker.resource">
                {{ t(`adminUsersList.blockers.${blocker.resource}`) }} : {{ blocker.count }}
              </li>
            </ul>
            <p class="mt-2">{{ t('adminUsersList.archiveInstead') }}</p>
          </template>
        </UAlert>
      </template>
      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="deleteDialogVisible = false"
        />
        <UButton
          :label="t('adminUsersList.deletePermanently')"
          icon="i-fa7-solid:trash"
          color="error"
          class="justify-center"
          :loading="loading"
          @click="handleDelete"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="archiveDialogVisible"
      :title="t('adminUserFormView.archiveDialogHeader')"
      :ui="{ footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    >
      <template #body>
        <div class="mb-4 flex items-start gap-3">
          <UIcon name="i-fa7-solid:triangle-exclamation" class="size-6 shrink-0 text-warning" />
          <div class="text-sm">
            <i18n-t keypath="adminUserFormView.archiveConfirmMessage" tag="p" scope="global">
              <template #name><strong>{{ currentUser?.displayName }}</strong></template>
            </i18n-t>
            <p class="mt-2 text-muted">{{ t('adminUserFormView.archiveExplanation') }}</p>
          </div>
        </div>
        <div class="space-y-3">
          <UFormField :label="t('adminUsersList.archiveDisplayNameLabel')">
            <UInput v-model="archiveDisplayName" class="w-full" />
          </UFormField>
          <UFormField :label="t('adminUsersList.archiveShortNameLabel')">
            <UInput
              v-model="archiveShortName"
              class="w-full"
              :maxlength="8"
              @update:model-value="archiveShortName = String($event).toUpperCase()"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="archiveDialogVisible = false"
        />
        <UButton
          :label="t('adminUsersList.archive')"
          icon="i-fa7-solid:box-archive"
          color="warning"
          class="justify-center"
          :loading="loading"
          @click="handleArchive"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent } from '@nuxt/ui'
import { adminUpdateUserSchema } from '@skol-arena/shared/types/index'
import type {
  AdminUpdateUserInput,
  AdminUserListItem,
  OrganizationWithMemberCount,
  UserRole,
} from '@skol-arena/shared/types/index'
import { useAdminUsersService } from '@/composables/admin-users/admin-users.service'
import { organizationApi } from '@/composables/organization/organization.api'
import { adminUsersApi } from '@/composables/admin-users/admin-users.api'
import { useDebounceFn } from '@vueuse/core'
import { useAppToast } from '@/composables/useAppToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useAvatarService } from '@/composables/avatar/avatar.service'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useAppToast()
const confirm = useConfirmDialog()
const avatarService = useAvatarService()
const {
  currentUser,
  stats,
  deletionBlockers,
  loading,
  error,
  loadUserById,
  loadStats,
  updateUser,
  resetPassword,
  setActivation,
  archiveUser,
  restoreUser,
  deleteUser,
  addOrganization,
  removeOrganization,
} = useAdminUsersService()

const userId = computed(() => route.params.id as string)

const hasAvatar = computed(() => !!avatarService.versionFor(userId.value))
const removingAvatar = ref(false)

async function confirmRemoveAvatar() {
  const confirmed = await confirm({
    title: t('adminUserFormView.removeAvatarConfirmHeader'),
    message: t('adminUserFormView.removeAvatarConfirmMessage', {
      name: currentUser.value?.displayName ?? '',
    }),
    confirmLabel: t('adminUserFormView.removeAvatar'),
    color: 'error',
  })
  if (confirmed) await removeAvatar()
}

async function removeAvatar() {
  removingAvatar.value = true
  try {
    await avatarService.removeFor(userId.value)
    toast.add({ severity: 'success', summary: t('adminUserFormView.avatarRemoved'), life: 3000 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: t('adminUserFormView.avatarRemoveError'),
      detail: err instanceof Error ? err.message : undefined,
      life: 5000,
    })
  } finally {
    removingAvatar.value = false
  }
}
const deleteDialogVisible = ref(false)
const archiveDialogVisible = ref(false)
const archiveDisplayName = ref('')
const archiveShortName = ref('')
const isArchived = computed(() => !!currentUser.value?.archivedAt)
const restoreSearch = ref('')
const restoreCandidates = ref<AdminUserListItem[]>([])
const organizations = ref<OrganizationWithMemberCount[]>([])
const organizationToAdd = ref<string | null>(null)

const roleOptions = computed(() =>
  (['player', 'tournament_admin', 'super_admin', 'kiosk'] as UserRole[]).map((value) => ({
    value,
    label: t(`adminUsersList.roles.${value}`),
  })),
)

const authProviders = computed(() => currentUser.value?.authProviders ?? [])

// Better Auth creates the missing `credential` account on reset, so resetting an
// SSO-only account grants it a native password it did not have before.
const hasNoNativePassword = computed(
  () => !!currentUser.value && !authProviders.value.includes('credential'),
)

const availableOrganizations = computed(() => {
  const joined = new Set(currentUser.value?.organizations.map((o) => o.id) ?? [])
  return organizations.value.filter((o) => !joined.has(o.id))
})

const state = reactive<{
  displayName?: string
  shortName?: string
  role?: UserRole
  email?: string
}>({})

async function onSubmit({ data: values }: FormSubmitEvent<AdminUpdateUserInput>) {
  const updated = await updateUser(userId.value, values)
  if (updated) {
    toast.add({
      severity: 'success',
      summary: t('adminUserFormView.savedSummary'),
      detail: t('adminUserFormView.savedDetail'),
      life: 3000,
    })
  }
}

async function handleResetPassword() {
  const success = await resetPassword(userId.value)
  if (success) {
    toast.add({
      severity: 'success',
      summary: t('adminUsersList.resetPasswordSentSummary'),
      detail: t('adminUsersList.resetPasswordSent', { name: currentUser.value?.displayName }),
      life: 3000,
    })
    return
  }

  toast.add({
    severity: 'error',
    summary: t('adminUsersList.resetPasswordFailedSummary'),
    detail: error.value ?? t('adminUsersService.errors.resetPasswordFailed'),
    life: 5000,
  })
}

async function handleActivation(active: boolean) {
  await setActivation(userId.value, active)
}

async function handleDelete() {
  const success = await deleteUser(userId.value)
  if (success) {
    deleteDialogVisible.value = false
    router.push('/admin/users')
  }
}

/** Prefilled with the label the backend would generate, but free to change. */
function openArchiveDialog() {
  const next = (stats.value?.archived ?? 0) + 1
  archiveDisplayName.value = `Archive ${next}`
  archiveShortName.value = `ARCH${next}`.slice(0, 8)
  archiveDialogVisible.value = true
}

async function handleArchive() {
  const success = await archiveUser(userId.value, {
    displayName: archiveDisplayName.value.trim() || undefined,
    shortName: archiveShortName.value.trim() || undefined,
  })
  if (success) archiveDialogVisible.value = false
}

// Debounced like the admin list search: one request per pause, not per keystroke.
const searchCandidates = useDebounceFn(async () => {
  const term = restoreSearch.value.trim()
  if (term.length < 2) {
    restoreCandidates.value = []
    return
  }
  const response = await adminUsersApi.list({ search: term, status: 'active', limit: 10 })
  restoreCandidates.value = response.data.filter((u) => u.id !== userId.value && !u.archivedAt)
}, 300)

watch(restoreSearch, () => {
  searchCandidates()
})

async function handleRestore(sourceUserId: string) {
  const success = await restoreUser(userId.value, sourceUserId)
  if (success) {
    restoreSearch.value = ''
    restoreCandidates.value = []
  }
}

async function handleAddOrganization() {
  if (!organizationToAdd.value) return
  const success = await addOrganization(userId.value, organizationToAdd.value)
  if (success) organizationToAdd.value = null
}

async function handleRemoveOrganization(organizationId: string) {
  await removeOrganization(userId.value, organizationId)
}

onMounted(async () => {
  await loadUserById(userId.value)
  if (currentUser.value) {
    Object.assign(state, {
      displayName: currentUser.value.displayName,
      shortName: currentUser.value.shortName,
      role: currentUser.value.role,
      email: currentUser.value.email ?? undefined,
    })
  }
  organizations.value = await organizationApi.list()
  await loadStats()
})
</script>
