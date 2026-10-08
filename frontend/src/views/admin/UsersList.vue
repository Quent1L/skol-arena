<template>
  <div>
    <AdminPageHeader :title="t('adminUsersList.title')" />

    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <UCard v-for="kpi in kpis" :key="kpi.label" :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-center">
          <div class="text-2xl font-bold text-highlighted">{{ kpi.value }}</div>
          <div class="text-xs text-muted sm:text-sm">{{ kpi.label }}</div>
        </div>
      </UCard>
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem]">
      <UInput
        v-model="search"
        icon="i-fa7-solid:magnifying-glass"
        :placeholder="t('adminUsersList.searchPlaceholder')"
        class="sm:col-span-2 lg:col-span-1"
      />
      <USelectMenu
        v-model="roleFilter"
        :items="roleOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('adminUsersList.filterRole')"
      />
      <USelectMenu
        v-model="statusFilter"
        :items="statusOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('adminUsersList.filterStatus')"
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

    <!-- Server-side sorting and paging: the list can hold every member of the instance. -->
    <UTable
      v-model:sorting="sorting"
      :data="users"
      :columns="columns"
      :loading="loading"
      :sorting-options="{ manualSorting: true, enableSortingRemoval: false }"
      :empty="t('adminUsersList.emptyState')"
      :ui="{ td: 'whitespace-normal' }"
    >
      <template #displayName-cell="{ row }">
        <div class="flex items-center gap-2">
          <PlayerAvatar
            :name="row.original.displayName"
            :color-key="row.original.shortName"
            :player-id="row.original.id"
            size="sm"
            shape="square"
          />
          <div class="flex min-w-0 flex-col">
            <span class="font-semibold whitespace-nowrap text-highlighted">
              {{ row.original.displayName }}
            </span>
            <span class="text-xs text-muted">{{ row.original.shortName }}</span>
          </div>
        </div>
        <!-- The status column is hidden on phones: keep the state visible. -->
        <div class="mt-1 sm:hidden">
          <UBadge v-bind="statusBadge(row.original)" variant="subtle" size="sm" />
        </div>
      </template>
      <template #email-cell="{ row }">
        <span class="inline-flex items-center gap-2">
          {{ row.original.email ?? '—' }}
          <UTooltip
            v-if="row.original.email && !row.original.emailVerified"
            :text="t('adminUsersList.emailNotVerified')"
          >
            <UIcon name="i-fa7-solid:triangle-exclamation" class="text-warning" />
          </UTooltip>
        </span>
      </template>
      <template #authProviders-cell="{ row }">
        <div v-if="row.original.authProviders.length" class="flex flex-wrap gap-1">
          <UBadge
            v-for="provider in row.original.authProviders"
            :key="provider"
            :label="t(`adminUsersList.authProviders.${provider}`)"
            :color="provider === 'keycloak' ? 'warning' : 'info'"
            variant="subtle"
          />
        </div>
        <span v-else class="text-sm text-dimmed">{{ t('adminUsersList.authProviders.none') }}</span>
      </template>
      <template #role-cell="{ row }">
        <UBadge
          :label="t(`adminUsersList.roles.${row.original.role}`)"
          :color="roleColor(row.original.role)"
          variant="subtle"
        />
      </template>
      <template #createdAt-cell="{ row }">{{ formatDate(row.original.createdAt) }}</template>
      <template #lastLoginAt-cell="{ row }">
        <span :class="row.original.lastLoginAt ? '' : 'text-dimmed'">
          {{
            row.original.lastLoginAt
              ? formatDate(row.original.lastLoginAt)
              : t('adminUsersList.never')
          }}
        </span>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-bind="statusBadge(row.original)" variant="subtle" />
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
    </UTable>

    <div
      v-if="total > pageSize"
      class="flex flex-col items-center gap-3 border-t border-default pt-3 sm:flex-row sm:justify-between"
    >
      <USelect v-model="pageSize" :items="[10, 20, 50, 100]" size="sm" class="w-24" />
      <UPagination
        v-model:page="page"
        :items-per-page="pageSize"
        :total="total"
        :sibling-count="1"
        size="sm"
      />
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
              <template #name><strong>{{ targetUser?.displayName }}</strong></template>
            </i18n-t>
            <p class="mt-2 text-muted">{{ t('adminUsersList.deleteIrreversibleNotice') }}</p>
          </div>
        </div>

        <!-- Populated when the backend refused: the user has data that a purge
             would destroy, so archiving is the only remaining option. -->
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
          :label="t('adminUsersList.archive')"
          icon="i-fa7-solid:box-archive"
          color="warning"
          variant="soft"
          class="justify-center"
          @click="switchToArchiveDialog"
        />
        <UButton
          v-if="!deletionBlockers.length"
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
      :title="t('adminUsersList.archiveDialogHeader')"
      :ui="{ footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    >
      <template #body>
        <div class="mb-4 flex items-start gap-3">
          <UIcon name="i-fa7-solid:triangle-exclamation" class="size-6 shrink-0 text-warning" />
          <div class="text-sm">
            <i18n-t keypath="adminUsersList.archiveConfirmMessage" tag="p" scope="global">
              <template #name><strong>{{ targetUser?.displayName }}</strong></template>
            </i18n-t>
            <p class="mt-2 text-muted">{{ t('adminUsersList.archiveExplanation') }}</p>
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
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import type { SortingState } from '@tanstack/vue-table'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useAdminUsersService } from '@/composables/admin-users/admin-users.service'
import { useAppToast } from '@/composables/useAppToast'
import type {
  AdminUserListItem,
  AdminUserSort,
  AdminUserStatus,
  UserRole,
} from '@skol-arena/shared/types/index'

const { t } = useI18n()
const confirm = useConfirmDialog()
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
const pageSize = ref(20)
const page = ref(1)
const sorting = ref<SortingState>([{ id: 'createdAt', desc: true }])

const deleteDialogVisible = ref(false)
const archiveDialogVisible = ref(false)
const archiveDisplayName = ref('')
const archiveShortName = ref('')
const targetUser = ref<AdminUserListItem | null>(null)

const columns: TableColumn<AdminUserListItem>[] = [
  { accessorKey: 'displayName', header: sortableHeader(t('adminUsersList.columnName')) },
  { accessorKey: 'email', header: t('adminUsersList.columnEmail'), meta: hiddenBelow('md') },
  // Aggregated from the `account` rows, so not a sortable SQL column.
  { accessorKey: 'authProviders', header: t('adminUsersList.columnAuth'), meta: hiddenBelow('2xl') },
  {
    accessorKey: 'role',
    header: sortableHeader(t('adminUsersList.columnRole')),
    meta: hiddenBelow('md'),
  },
  {
    accessorKey: 'createdAt',
    header: sortableHeader(t('adminUsersList.columnCreatedAt')),
    meta: hiddenBelow('xl'),
  },
  {
    accessorKey: 'lastLoginAt',
    header: sortableHeader(t('adminUsersList.columnLastLogin')),
    meta: hiddenBelow('md'),
  },
  { accessorKey: 'matchCount', header: t('adminUsersList.columnMatches'), meta: hiddenBelow('2xl') },
  {
    accessorKey: 'tournamentCount',
    header: t('adminUsersList.columnTournaments'),
    meta: hiddenBelow('2xl'),
  },
  { id: 'status', header: t('common.status'), meta: hiddenBelow('sm') },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

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

function roleColor(role: UserRole) {
  if (role === 'super_admin') return 'error'
  if (role === 'tournament_admin') return 'warning'
  if (role === 'kiosk') return 'info'
  return 'neutral'
}

function statusBadge(user: AdminUserListItem) {
  if (user.archivedAt) return { label: t('adminUsersList.archived'), color: 'neutral' as const }
  return user.deactivatedAt
    ? { label: t('adminUsersList.deactivated'), color: 'error' as const }
    : { label: t('adminUsersList.active'), color: 'success' as const }
}

// An archived user has no sign-in identity left: resetting a password or
// toggling activation would be meaningless.
function rowActions(user: AdminUserListItem): RowAction[] {
  const archived = !!user.archivedAt
  return [
    { label: t('common.edit'), icon: 'i-fa7-solid:pen', to: `/admin/users/${user.id}/edit` },
    {
      label: t('adminUsersList.resetPassword'),
      icon: 'i-fa7-solid:key',
      hidden: archived,
      onSelect: () => handleResetPassword(user),
    },
    {
      label: user.deactivatedAt ? t('adminUsersList.reactivate') : t('adminUsersList.deactivate'),
      icon: user.deactivatedAt ? 'i-fa7-solid:user-check' : 'i-fa7-solid:user-slash',
      color: user.deactivatedAt ? 'success' : 'warning',
      hidden: archived,
      onSelect: () => confirmActivation(user),
    },
    {
      label: t('adminUsersList.archive'),
      icon: 'i-fa7-solid:box-archive',
      color: 'warning',
      hidden: archived,
      onSelect: () => openArchiveDialog(user),
    },
    {
      label: t('adminUsersList.deletePermanently'),
      icon: 'i-fa7-solid:trash',
      color: 'error',
      hidden: archived,
      onSelect: () => openDeleteDialog(user),
    },
  ]
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fetchUsers() {
  const [sort] = sorting.value
  return loadUsers({
    search: search.value.trim() || undefined,
    role: roleFilter.value ?? undefined,
    status: statusFilter.value ?? undefined,
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
    sortBy: (sort?.id ?? 'createdAt') as AdminUserSort,
    sortDir: sort?.desc === false ? 'asc' : 'desc',
  })
}

/** Back to the first page, or straight to the fetch when already there. */
function restartFromFirstPage() {
  if (page.value === 1) fetchUsers()
  else page.value = 1
}

watch(page, fetchUsers)
watch([sorting, pageSize], restartFromFirstPage, { deep: true })

// Debounced so typing in the search box does not fire a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(restartFromFirstPage, 300)
})

watch([roleFilter, statusFilter], restartFromFirstPage)

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

async function confirmActivation(target: AdminUserListItem) {
  const reactivating = !!target.deactivatedAt
  const name = target.displayName
  const confirmed = await confirm({
    title: reactivating
      ? t('adminUsersList.reactivateDialogHeader')
      : t('adminUsersList.deactivateDialogHeader'),
    message: reactivating
      ? t('adminUsersList.reactivateConfirmMessage', { name })
      : `${t('adminUsersList.deactivateConfirmMessage', { name })}\n\n${t('adminUsersList.deactivateCacheNotice')}`,
    confirmLabel: reactivating ? t('adminUsersList.reactivate') : t('adminUsersList.deactivate'),
    color: reactivating ? 'primary' : 'warning',
  })
  if (!confirmed) return
  const success = await setActivation(target.id, reactivating)
  if (success) await Promise.all([fetchUsers(), loadStats()])
}

function openDeleteDialog(target: AdminUserListItem) {
  targetUser.value = target
  deletionBlockers.value = []
  deleteDialogVisible.value = true
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
