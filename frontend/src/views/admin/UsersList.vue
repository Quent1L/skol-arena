<template>
  <div class="users-list-view p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold">{{ t('adminUsersList.title') }}</h1>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
      <Card v-for="kpi in kpis" :key="kpi.label">
        <template #content>
          <div class="text-center">
            <div class="text-2xl font-bold">{{ kpi.value }}</div>
            <div class="text-sm text-gray-500">{{ kpi.label }}</div>
          </div>
        </template>
      </Card>
    </div>

    <div class="flex flex-wrap gap-3 mb-4">
      <InputText
        v-model="search"
        :placeholder="t('adminUsersList.searchPlaceholder')"
        class="flex-1 min-w-60"
      />
      <Select
        v-model="roleFilter"
        :options="roleOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('adminUsersList.filterRole')"
        show-clear
        class="min-w-48"
      />
      <Select
        v-model="statusFilter"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('adminUsersList.filterStatus')"
        show-clear
        class="min-w-48"
      />
    </div>

    <Message v-if="error" severity="error" :closable="true">
      {{ error }}
    </Message>

    <DataTable
      :value="users"
      :loading="loading"
      lazy
      striped-rows
      paginator
      :rows="rows"
      :first="first"
      :total-records="total"
      :rows-per-page-options="[10, 20, 50, 100]"
      sort-mode="single"
      :sort-field="sortField"
      :sort-order="sortOrder"
      responsive-layout="scroll"
      class="p-datatable-sm"
      @page="onPage"
      @sort="onSort"
    >
      <Column field="displayName" :header="t('adminUsersList.columnName')" sortable>
        <template #body="{ data }">
          <div class="flex flex-col">
            <span class="font-semibold">{{ data.displayName }}</span>
            <span class="text-xs text-gray-500">{{ data.shortName }}</span>
          </div>
        </template>
      </Column>

      <Column field="email" :header="t('adminUsersList.columnEmail')">
        <template #body="{ data }">
          <span>{{ data.email ?? '—' }}</span>
          <i
            v-if="data.email && !data.emailVerified"
            class="fa fa-triangle-exclamation text-amber-500 ml-2"
            v-tooltip.top="t('adminUsersList.emailNotVerified')"
          ></i>
        </template>
      </Column>

      <!-- Aggregated from the `account` rows, so not a sortable SQL column. -->
      <Column :header="t('adminUsersList.columnAuth')">
        <template #body="{ data }">
          <div v-if="data.authProviders.length" class="flex flex-wrap gap-1">
            <Tag
              v-for="provider in data.authProviders"
              :key="provider"
              :value="t(`adminUsersList.authProviders.${provider}`)"
              :severity="providerSeverity(provider)"
            />
          </div>
          <span v-else class="text-sm text-gray-400">
            {{ t('adminUsersList.authProviders.none') }}
          </span>
        </template>
      </Column>

      <Column field="role" :header="t('adminUsersList.columnRole')" sortable>
        <template #body="{ data }">
          <Tag :value="t(`adminUsersList.roles.${data.role}`)" :severity="roleSeverity(data.role)" />
        </template>
      </Column>

      <Column field="createdAt" :header="t('adminUsersList.columnCreatedAt')" sortable>
        <template #body="{ data }">{{ formatDate(data.createdAt) }}</template>
      </Column>

      <Column field="lastLoginAt" :header="t('adminUsersList.columnLastLogin')" sortable>
        <template #body="{ data }">
          <span :class="data.lastLoginAt ? '' : 'text-gray-400'">
            {{ data.lastLoginAt ? formatDate(data.lastLoginAt) : t('adminUsersList.never') }}
          </span>
        </template>
      </Column>

      <Column field="matchCount" :header="t('adminUsersList.columnMatches')" />
      <Column field="tournamentCount" :header="t('adminUsersList.columnTournaments')" />

      <Column :header="t('common.status')">
        <template #body="{ data }">
          <Tag v-if="data.archivedAt" :value="t('adminUsersList.archived')" severity="secondary" />
          <Tag
            v-else
            :value="data.deactivatedAt ? t('adminUsersList.deactivated') : t('adminUsersList.active')"
            :severity="data.deactivatedAt ? 'danger' : 'success'"
          />
        </template>
      </Column>

      <Column :header="t('common.actions')" style="width: 12rem">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button
              icon="fa fa-edit"
              size="small"
              text
              rounded
              @click="router.push(`/admin/users/${data.id}/edit`)"
              v-tooltip.top="t('common.edit')"
            />
            <!-- An archived user has no sign-in identity left: resetting a password
                 or toggling activation would be meaningless. -->
            <Button
              v-if="!data.archivedAt"
              icon="fa fa-key"
              size="small"
              text
              rounded
              @click="handleResetPassword(data)"
              v-tooltip.top="t('adminUsersList.resetPassword')"
            />
            <Button
              v-if="!data.archivedAt"
              :icon="data.deactivatedAt ? 'fa fa-user-check' : 'fa fa-user-slash'"
              size="small"
              text
              rounded
              :severity="data.deactivatedAt ? 'success' : 'warn'"
              @click="openActivationDialog(data)"
              v-tooltip.top="data.deactivatedAt ? t('adminUsersList.reactivate') : t('adminUsersList.deactivate')"
            />
            <Button
              v-if="!data.archivedAt"
              icon="fa fa-box-archive"
              size="small"
              text
              rounded
              severity="warn"
              @click="openArchiveDialog(data)"
              v-tooltip.top="t('adminUsersList.archive')"
            />
            <Button
              v-if="!data.archivedAt"
              icon="fa fa-trash"
              size="small"
              severity="danger"
              text
              rounded
              @click="openDeleteDialog(data)"
              v-tooltip.top="t('adminUsersList.deletePermanently')"
            />
          </div>
        </template>
      </Column>

      <template #empty>
        <div class="text-center py-8">
          <p class="text-gray-500">{{ t('adminUsersList.emptyState') }}</p>
        </div>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="activationDialogVisible"
      :header="targetIsDeactivated ? t('adminUsersList.reactivateDialogHeader') : t('adminUsersList.deactivateDialogHeader')"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="flex items-start gap-3 mb-2">
        <i class="pi pi-exclamation-triangle text-3xl text-amber-500"></i>
        <div>
          <p v-if="targetIsDeactivated">
            {{ t('adminUsersList.reactivateConfirmMessage', { name: targetUser?.displayName }) }}
          </p>
          <template v-else>
            <p>{{ t('adminUsersList.deactivateConfirmMessage', { name: targetUser?.displayName }) }}</p>
            <p class="text-sm text-gray-500 mt-2">{{ t('adminUsersList.deactivateCacheNotice') }}</p>
          </template>
        </div>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" icon="pi pi-times" text @click="activationDialogVisible = false" />
        <Button
          :label="targetIsDeactivated ? t('adminUsersList.reactivate') : t('adminUsersList.deactivate')"
          icon="pi pi-check"
          :severity="targetIsDeactivated ? 'success' : 'warn'"
          :loading="loading"
          @click="handleActivation"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      :header="t('adminUsersList.deleteDialogHeader')"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="flex items-start gap-3 mb-2">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <div>
          <i18n-t keypath="adminUsersList.deleteConfirmMessage" tag="p" scope="global">
            <template #name><strong>{{ targetUser?.displayName }}</strong></template>
          </i18n-t>
          <p class="text-sm text-gray-500 mt-2">{{ t('adminUsersList.deleteIrreversibleNotice') }}</p>
        </div>
      </div>

      <!-- Populated when the backend refused: the user has data that a purge
           would destroy, so archiving is the only remaining option. -->
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
          :label="t('adminUsersList.archive')"
          icon="fa fa-box-archive"
          severity="warn"
          @click="switchToArchiveDialog"
        />
        <Button
          v-if="!deletionBlockers.length"
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
      :header="t('adminUsersList.archiveDialogHeader')"
      :modal="true"
      :style="{ width: '480px' }"
    >
      <div class="flex items-start gap-3 mb-4">
        <i class="pi pi-exclamation-triangle text-3xl text-amber-500"></i>
        <div>
          <i18n-t keypath="adminUsersList.archiveConfirmMessage" tag="p" scope="global">
            <template #name><strong>{{ targetUser?.displayName }}</strong></template>
          </i18n-t>
          <p class="text-sm text-gray-500 mt-2">{{ t('adminUsersList.archiveExplanation') }}</p>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex flex-col gap-1">
          <label for="archive-display-name" class="text-sm font-medium">
            {{ t('adminUsersList.archiveDisplayNameLabel') }}
          </label>
          <InputText id="archive-display-name" v-model="archiveDisplayName" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="archive-short-name" class="text-sm font-medium">
            {{ t('adminUsersList.archiveShortNameLabel') }}
          </label>
          <InputText
            id="archive-short-name"
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
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminUsersService } from '@/composables/admin-users/admin-users.service'
import { useAppToast } from '@/composables/useAppToast'
import type {
  AdminUserListItem,
  AdminUserSort,
  AdminUserStatus,
  UserRole,
} from '@skol-arena/shared/types/index'

const { t } = useI18n()
const router = useRouter()
const toast = useAppToast()
const {
  users,
  total,
  stats,
  deletionBlockers,
  loading,
  error,
  loadUsers,
  loadStats,
  resetPassword,
  setActivation,
  archiveUser,
  deleteUser,
} = useAdminUsersService()

const search = ref('')
const roleFilter = ref<UserRole | null>(null)
const statusFilter = ref<AdminUserStatus | null>(null)
const rows = ref(20)
const first = ref(0)
const sortField = ref<AdminUserSort>('createdAt')
const sortOrder = ref<1 | -1>(-1)

const activationDialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const archiveDialogVisible = ref(false)
const archiveDisplayName = ref('')
const archiveShortName = ref('')
const targetUser = ref<AdminUserListItem | null>(null)
const targetIsDeactivated = computed(() => !!targetUser.value?.deactivatedAt)

const roleOptions = computed(() =>
  (['player', 'tournament_admin', 'super_admin', 'kiosk'] as UserRole[]).map((value) => ({
    value,
    label: t(`adminUsersList.roles.${value}`),
  })),
)

const statusOptions = computed(() => [
  { value: 'active', label: t('adminUsersList.active') },
  { value: 'deactivated', label: t('adminUsersList.deactivated') },
])

const kpis = computed(() => [
  { label: t('adminUsersList.kpiTotal'), value: stats.value?.total ?? 0 },
  { label: t('adminUsersList.kpiActive7'), value: stats.value?.activeLast7Days ?? 0 },
  { label: t('adminUsersList.kpiActive30'), value: stats.value?.activeLast30Days ?? 0 },
  { label: t('adminUsersList.kpiNewThisMonth'), value: stats.value?.newThisMonth ?? 0 },
  { label: t('adminUsersList.kpiDeactivated'), value: stats.value?.deactivated ?? 0 },
  { label: t('adminUsersList.kpiArchived'), value: stats.value?.archived ?? 0 },
])

function roleSeverity(role: UserRole) {
  if (role === 'super_admin') return 'danger'
  if (role === 'tournament_admin') return 'warn'
  if (role === 'kiosk') return 'info'
  return 'secondary'
}

function providerSeverity(provider: string) {
  return provider === 'keycloak' ? 'warn' : 'info'
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fetchUsers() {
  return loadUsers({
    search: search.value.trim() || undefined,
    role: roleFilter.value ?? undefined,
    status: statusFilter.value ?? undefined,
    limit: rows.value,
    offset: first.value,
    sortBy: sortField.value,
    sortDir: sortOrder.value === 1 ? 'asc' : 'desc',
  })
}

function onPage(event: { first: number; rows: number }) {
  first.value = event.first
  rows.value = event.rows
  fetchUsers()
}

function onSort(event: { sortField: string; sortOrder: number }) {
  sortField.value = event.sortField as AdminUserSort
  sortOrder.value = event.sortOrder === 1 ? 1 : -1
  first.value = 0
  fetchUsers()
}

// Debounced so typing in the search box does not fire a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    first.value = 0
    fetchUsers()
  }, 300)
})

watch([roleFilter, statusFilter], () => {
  first.value = 0
  fetchUsers()
})

async function handleResetPassword(target: AdminUserListItem) {
  const success = await resetPassword(target.id)
  if (success) {
    toast.add({
      severity: 'success',
      summary: t('adminUsersList.resetPasswordSentSummary'),
      detail: t('adminUsersList.resetPasswordSent', { name: target.displayName }),
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

function openActivationDialog(target: AdminUserListItem) {
  targetUser.value = target
  activationDialogVisible.value = true
}

function openDeleteDialog(target: AdminUserListItem) {
  targetUser.value = target
  deletionBlockers.value = []
  deleteDialogVisible.value = true
}

async function handleActivation() {
  if (!targetUser.value) return
  const success = await setActivation(targetUser.value.id, targetIsDeactivated.value)
  if (success) {
    activationDialogVisible.value = false
    await Promise.all([fetchUsers(), loadStats()])
  }
}

async function handleDelete() {
  if (!targetUser.value) return
  const success = await deleteUser(targetUser.value.id)
  if (success) {
    deleteDialogVisible.value = false
    targetUser.value = null
    await loadStats()
  }
}

/**
 * Prefilled with the label the backend would generate anyway, so the admin can
 * replace it with something meaningful ("Ancien membre 2022") without having to.
 */
function openArchiveDialog(target: AdminUserListItem) {
  targetUser.value = target
  const next = (stats.value?.archived ?? 0) + 1
  archiveDisplayName.value = `Archive ${next}`
  archiveShortName.value = `ARCH${next}`.slice(0, 8)
  archiveDialogVisible.value = true
}

function switchToArchiveDialog() {
  if (!targetUser.value) return
  const target = targetUser.value
  deleteDialogVisible.value = false
  openArchiveDialog(target)
}

async function handleArchive() {
  if (!targetUser.value) return
  const success = await archiveUser(targetUser.value.id, {
    displayName: archiveDisplayName.value.trim() || undefined,
    shortName: archiveShortName.value.trim() || undefined,
  })
  if (success) {
    archiveDialogVisible.value = false
    targetUser.value = null
    await Promise.all([fetchUsers(), loadStats()])
  }
}

onMounted(() => {
  fetchUsers()
  loadStats()
})
</script>

<style scoped>
.users-list-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
