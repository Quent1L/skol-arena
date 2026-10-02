<template>
  <div class="user-form-view p-4">
    <div class="flex items-center gap-3 mb-6">
      <h1 class="text-2xl font-bold">
        {{ currentUser?.displayName ?? t('adminUserFormView.title') }}
      </h1>
      <Tag
        v-if="currentUser?.deactivatedAt"
        :value="t('adminUsersList.deactivated')"
        severity="danger"
      />
    </div>

    <Message v-if="error" severity="error" :closable="true" class="mb-4">
      {{ error }}
    </Message>

    <div class="max-w-4xl space-y-6">
      <form @submit="onSubmit">
        <Card>
          <template #title>{{ t('adminUserFormView.identitySection') }}</template>
          <template #content>
            <div class="space-y-4">
              <div>
                <label for="displayName" class="block text-sm font-medium mb-2">
                  {{ t('adminUserFormView.displayNameLabel') }}
                </label>
                <InputText
                  id="displayName"
                  v-model="displayName"
                  class="w-full"
                  :class="{ 'p-invalid': errors.displayName }"
                />
                <small class="p-error">{{ errors.displayName }}</small>
              </div>

              <div>
                <label for="shortName" class="block text-sm font-medium mb-2">
                  {{ t('adminUserFormView.shortNameLabel') }}
                </label>
                <InputText
                  id="shortName"
                  v-model="shortName"
                  class="w-full"
                  :class="{ 'p-invalid': errors.shortName }"
                />
                <small class="p-error">{{ errors.shortName }}</small>
              </div>

              <div>
                <label for="role" class="block text-sm font-medium mb-2">
                  {{ t('adminUserFormView.roleLabel') }}
                </label>
                <Select
                  id="role"
                  v-model="role"
                  :options="roleOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  :class="{ 'p-invalid': errors.role }"
                />
                <small class="p-error">{{ errors.role }}</small>
              </div>

              <div>
                <label for="email" class="block text-sm font-medium mb-2">
                  {{ t('adminUserFormView.emailLabel') }}
                </label>
                <InputText
                  id="email"
                  v-model="email"
                  class="w-full"
                  :class="{ 'p-invalid': errors.email }"
                />
                <small class="p-error">{{ errors.email }}</small>
                <p class="text-sm text-gray-500 mt-1">
                  {{ t('adminUserFormView.emailChangeNotice') }}
                </p>
              </div>

              <div>
                <span class="block text-sm font-medium mb-2">
                  {{ t('adminUserFormView.authProvidersLabel') }}
                </span>
                <div v-if="authProviders.length" class="flex flex-wrap gap-1">
                  <Tag
                    v-for="provider in authProviders"
                    :key="provider"
                    :value="t(`adminUsersList.authProviders.${provider}`)"
                    :severity="provider === 'keycloak' ? 'warn' : 'info'"
                  />
                </div>
                <span v-else class="text-sm text-gray-400">
                  {{ t('adminUsersList.authProviders.none') }}
                </span>
              </div>

              <div class="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
                <Button
                  :label="t('common.cancel')"
                  severity="secondary"
                  :disabled="loading"
                  class="w-full sm:w-auto"
                  @click="router.push('/admin/users')"
                />
                <Button
                  type="submit"
                  :label="t('common.update')"
                  icon="fa fa-check"
                  :loading="loading"
                  class="w-full sm:w-auto"
                />
              </div>
            </div>
          </template>
        </Card>
      </form>

      <Card>
        <template #title>{{ t('adminUserFormView.organizationsSection') }}</template>
        <template #content>
          <ul v-if="currentUser?.organizations.length" class="mb-4 divide-y">
            <li
              v-for="org in currentUser.organizations"
              :key="org.id"
              class="flex items-center justify-between py-2"
            >
              <div>
                <span class="font-medium">{{ org.name }}</span>
                <Tag
                  :value="t(`adminUserFormView.orgRoles.${org.role}`)"
                  severity="secondary"
                  class="ml-2"
                />
              </div>
              <Button
                icon="fa fa-xmark"
                size="small"
                severity="danger"
                text
                rounded
                v-tooltip.top="t('adminUserFormView.removeFromOrganization')"
                @click="handleRemoveOrganization(org.id)"
              />
            </li>
          </ul>
          <p v-else class="text-gray-500 mb-4">{{ t('adminUserFormView.noOrganization') }}</p>

          <div class="flex gap-3">
            <Select
              v-model="organizationToAdd"
              :options="availableOrganizations"
              option-label="name"
              option-value="id"
              :placeholder="t('adminUserFormView.addOrganizationPlaceholder')"
              class="flex-1"
            />
            <Button
              :label="t('adminUserFormView.addOrganization')"
              icon="fa fa-plus"
              :disabled="!organizationToAdd"
              @click="handleAddOrganization"
            />
          </div>
        </template>
      </Card>

      <!-- A returning player signs up again, which creates an empty profile.
           Restoring moves that new identity onto this archived history. -->
      <Card v-if="isArchived">
        <template #title>{{ t('adminUserFormView.restoreSection') }}</template>
        <template #content>
          <p class="text-sm text-gray-500 mb-3">{{ t('adminUserFormView.restoreExplanation') }}</p>

          <InputText
            v-model="restoreSearch"
            :placeholder="t('adminUserFormView.restoreSearchPlaceholder')"
            class="w-full mb-3"
          />

          <Message v-if="deletionBlockers.length" severity="error" :closable="false" class="mb-3">
            <p class="mb-2">{{ t('adminUserFormView.restoreBlockedIntro') }}</p>
            <ul class="list-disc pl-5">
              <li v-for="blocker in deletionBlockers" :key="blocker.resource">
                {{ t(`adminUsersList.blockers.${blocker.resource}`) }} : {{ blocker.count }}
              </li>
            </ul>
          </Message>

          <ul v-if="restoreCandidates.length" class="divide-y">
            <li
              v-for="candidate in restoreCandidates"
              :key="candidate.id"
              class="flex items-center justify-between py-2"
            >
              <div>
                <span class="font-medium">{{ candidate.displayName }}</span>
                <span class="text-sm text-gray-500 ml-2">{{ candidate.email ?? '—' }}</span>
              </div>
              <Button
                :label="t('adminUserFormView.restoreAction')"
                icon="fa fa-rotate-left"
                size="small"
                :loading="loading"
                @click="handleRestore(candidate.id)"
              />
            </li>
          </ul>
          <p v-else-if="restoreSearch.trim()" class="text-gray-500">
            {{ t('adminUserFormView.restoreNoCandidate') }}
          </p>
        </template>
      </Card>

      <Card>
        <template #title>{{ t('adminUserFormView.dangerSection') }}</template>
        <template #content>
          <div class="flex flex-wrap gap-3">
            <Button
              v-if="!isArchived"
              :label="t('adminUsersList.resetPassword')"
              icon="fa fa-key"
              severity="secondary"
              @click="handleResetPassword"
            />
            <Button
              v-if="!isArchived"
              :label="t('adminUsersList.archive')"
              icon="fa fa-box-archive"
              severity="warn"
              :loading="loading"
              @click="openArchiveDialog"
            />
            <Button
              v-if="!isArchived && currentUser?.deactivatedAt"
              :label="t('adminUsersList.reactivate')"
              icon="fa fa-user-check"
              severity="success"
              :loading="loading"
              @click="handleActivation(true)"
            />
            <Button
              v-else-if="!isArchived"
              :label="t('adminUsersList.deactivate')"
              icon="fa fa-user-slash"
              severity="warn"
              :loading="loading"
              @click="handleActivation(false)"
            />
            <Button
              v-if="!isArchived"
              :label="t('adminUsersList.deletePermanently')"
              icon="fa fa-trash"
              severity="danger"
              :loading="loading"
              @click="deleteDialogVisible = true"
            />
            <Message v-if="isArchived" severity="secondary" :closable="false" class="w-full">
              {{ t('adminUserFormView.archivedNotice') }}
            </Message>
          </div>
          <p v-if="hasNoNativePassword" class="text-sm text-amber-600 mt-3">
            {{ t('adminUserFormView.resetPasswordHintSso') }}
          </p>
          <p class="text-sm text-gray-500 mt-3">
            {{ t('adminUsersList.deactivateCacheNotice') }}
          </p>
        </template>
      </Card>
    </div>

    <Dialog
      v-model:visible="deleteDialogVisible"
      :header="t('adminUsersList.deleteDialogHeader')"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <div>
          <i18n-t keypath="adminUsersList.deleteConfirmMessage" tag="p" scope="global">
            <template #name><strong>{{ currentUser?.displayName }}</strong></template>
          </i18n-t>
          <p class="text-sm text-gray-500 mt-2">{{ t('adminUsersList.deleteIrreversibleNotice') }}</p>
        </div>
      </div>

      <Message v-if="deletionBlockers.length" severity="error" :closable="false" class="mt-3">
        <p class="mb-2">{{ t('adminUsersList.deleteBlockedIntro') }}</p>
        <ul class="list-disc pl-5">
          <li v-for="blocker in deletionBlockers" :key="blocker.resource">
            {{ t(`adminUsersList.blockers.${blocker.resource}`) }} : {{ blocker.count }}
          </li>
        </ul>
        <p class="mt-2">{{ t('adminUsersList.archiveInstead') }}</p>
      </Message>

      <template #footer>
        <Button :label="t('common.cancel')" icon="pi pi-times" text @click="deleteDialogVisible = false" />
        <Button
          :label="t('adminUsersList.deletePermanently')"
          icon="pi pi-check"
          severity="danger"
          :loading="loading"
          @click="handleDelete"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="archiveDialogVisible"
      :header="t('adminUserFormView.archiveDialogHeader')"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-amber-500"></i>
        <div>
          <i18n-t keypath="adminUserFormView.archiveConfirmMessage" tag="p" scope="global">
            <template #name><strong>{{ currentUser?.displayName }}</strong></template>
          </i18n-t>
          <p class="text-sm text-gray-500 mt-2">{{ t('adminUserFormView.archiveExplanation') }}</p>
        </div>
      </div>

      <div class="space-y-3 mt-4">
        <div class="flex flex-col gap-1">
          <label for="form-archive-display-name" class="text-sm font-medium">
            {{ t('adminUsersList.archiveDisplayNameLabel') }}
          </label>
          <InputText id="form-archive-display-name" v-model="archiveDisplayName" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="form-archive-short-name" class="text-sm font-medium">
            {{ t('adminUsersList.archiveShortNameLabel') }}
          </label>
          <InputText
            id="form-archive-short-name"
            v-model="archiveShortName"
            class="w-full"
            maxlength="8"
            @input="archiveShortName = archiveShortName.toUpperCase()"
          />
        </div>
      </div>

      <template #footer>
        <Button :label="t('common.cancel')" icon="pi pi-times" text @click="archiveDialogVisible = false" />
        <Button
          :label="t('adminUsersList.archive')"
          icon="fa fa-box-archive"
          severity="warn"
          :loading="loading"
          @click="handleArchive"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { adminUpdateUserSchema } from '@skol-arena/shared/types/index'
import type {
  AdminUserListItem,
  OrganizationWithMemberCount,
  UserRole,
} from '@skol-arena/shared/types/index'
import { useAdminUsersService } from '@/composables/admin-users/admin-users.service'
import { organizationApi } from '@/composables/organization/organization.api'
import { adminUsersApi } from '@/composables/admin-users/admin-users.api'
import { useDebounceFn } from '@vueuse/core'
import { useAppToast } from '@/composables/useAppToast'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useAppToast()
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

const { handleSubmit, defineField, errors, setValues } = useForm({
  validationSchema: toTypedSchema(adminUpdateUserSchema),
})

const [displayName] = defineField('displayName')
const [shortName] = defineField('shortName')
const [role] = defineField('role')
const [email] = defineField('email')

const onSubmit = handleSubmit(async (values) => {
  const updated = await updateUser(userId.value, values)
  if (updated) {
    toast.add({
      severity: 'success',
      summary: t('adminUserFormView.savedSummary'),
      detail: t('adminUserFormView.savedDetail'),
      life: 3000,
    })
  }
})

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
    setValues({
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

<style scoped>
.user-form-view {
  max-width: 1200px;
  justify-content: center;
  align-items: center;
  display: flex;
  flex-direction: column;
  margin: 0 auto;
}
</style>
