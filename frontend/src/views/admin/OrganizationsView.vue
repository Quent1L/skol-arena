<template>
  <div>
    <AdminPageHeader
      :title="t('organizationsView.title')"
      :description="t('organizationsView.subtitle')"
    />

    <UCard class="mb-6">
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-fa7-solid:circle-plus" />
          {{ t('organizationsView.createOrganization') }}
        </h2>
      </template>
      <form class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="handleCreate">
        <UFormField
          :label="t('organizationsView.orgNameLabel')"
          :error="createError ?? undefined"
          class="flex-1"
        >
          <UInput
            v-model="newOrgName"
            :placeholder="t('organizationsView.orgNamePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          :loading="isCreating"
          :label="t('common.create')"
          icon="i-fa7-solid:plus"
          class="justify-center sm:mt-6"
        />
      </form>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-fa7-solid:list" />
          {{ t('organizationsView.existingOrgs') }}
        </h2>
      </template>
      <AdminTable
        :data="organizations"
        :columns="columns"
        :loading="isLoading"
        :empty="t('organizationsView.noOrgs')"
        :initial-sorting="[{ id: 'name', desc: false }]"
      >
        <template #memberCount-cell="{ row }">
          <UBadge
            color="info"
            variant="subtle"
            :label="t('organizationsView.memberCount', row.original.memberCount)"
          />
        </template>
        <template #createdAt-cell="{ row }">{{ formatDate(row.original.createdAt) }}</template>
        <template #actions-cell="{ row }">
          <UButton
            icon="i-fa7-solid:gear"
            :label="t('organizationsView.manage')"
            size="sm"
            variant="ghost"
            @click="openManageDialog(row.original)"
          />
        </template>
      </AdminTable>
    </UCard>

    <!-- A side panel rather than a dialog: room for a long member list on any screen. -->
    <USlideover
      v-model:open="showManageDialog"
      :title="t('organizationsView.manageDialogHeader', { name: selectedOrg?.name })"
      :ui="{ content: 'max-w-xl' }"
      @after:leave="closeManageDialog"
    >
      <template #body>
        <section class="mb-6">
          <h3 class="mb-3 font-semibold">{{ t('organizationsView.orgNameSectionTitle') }}</h3>
          <div class="flex flex-col gap-2 sm:flex-row">
            <UInput
              v-model="editingName"
              class="flex-1"
              :placeholder="t('organizationsView.orgNameRenamePlaceholder')"
              :maxlength="100"
            />
            <UButton
              :label="t('common.save')"
              icon="i-fa7-solid:check"
              class="justify-center"
              :loading="isSavingName"
              :disabled="!editingName.trim() || editingName.trim() === selectedOrg?.name"
              @click="handleSaveName"
            />
          </div>
        </section>

        <USeparator class="mb-6" />

        <section>
          <h3 class="mb-3 flex items-center gap-2 font-semibold">
            {{ t('organizationsView.membersSection') }}
            <UBadge color="info" variant="subtle" :label="String(members.length)" />
          </h3>

          <div class="mb-4 flex flex-col gap-2 sm:flex-row">
            <USelectMenu
              v-model="selectedUserIds"
              :items="availableUsers"
              value-key="id"
              label-key="displayName"
              multiple
              :loading="isLoadingUsers"
              :placeholder="t('organizationsView.selectUsersPlaceholder')"
              :aria-label="t('organizationsView.selectUsersLabel')"
              class="flex-1"
              @update:open="(open) => open && ensureUsersLoaded()"
            />
            <UButton
              :label="t('organizationsView.add')"
              icon="i-fa7-solid:user-plus"
              class="justify-center"
              :disabled="selectedUserIds.length === 0 || isAddingMembers"
              :loading="isAddingMembers"
              @click="handleAddMembers"
            />
          </div>

          <div v-if="isLoadingMembers" class="flex justify-center py-4">
            <UIcon name="i-fa7-solid:spinner" class="size-6 animate-spin text-muted" />
          </div>
          <p v-else-if="members.length === 0" class="py-4 text-center text-muted">
            {{ t('organizationsView.noMembers') }}
          </p>
          <ul v-else class="flex flex-col gap-2">
            <li
              v-for="member in members"
              :key="member.id"
              class="flex items-center gap-3 rounded-lg bg-elevated p-3"
            >
              <PlayerAvatar
                :name="member.user.displayName"
                :color-key="member.user.shortName"
                :player-id="member.user.id"
                size="md"
                shape="square"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ member.user.displayName }}</div>
                <div class="mt-0.5 flex flex-wrap items-center gap-2">
                  <UBadge
                    :color="member.role === 'owner' ? 'warning' : 'neutral'"
                    variant="subtle"
                    size="sm"
                    :label="
                      member.role === 'owner'
                        ? t('organizationsView.roleOwner')
                        : t('organizationsView.roleMember')
                    "
                  />
                  <span class="text-xs text-muted">
                    {{ t('organizationsView.addedAt', { date: formatDate(member.joinedAt) }) }}
                  </span>
                </div>
              </div>
              <RowActions :actions="memberActions(member)" />
            </li>
          </ul>
        </section>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useAppToast } from '@/composables/useAppToast'
import { useOrganizationService } from '@/composables/organization/organization.service'
import { useUserService } from '@/composables/user/user.service'
import { useAvatarService } from '@/composables/avatar/avatar.service'
import type { OrganizationWithMemberCount, OrganizationMemberWithUser } from '@skol-arena/shared'

const { t } = useI18n()
const toast = useAppToast()
const { versionFor, removeFor: removeAvatarFor } = useAvatarService()
const { listOrganizations, createOrganization, getMembers, addMember, removeMember, renameOrganization } = useOrganizationService()
const { users, loading: isLoadingUsers, listUsers } = useUserService()

const organizations = ref<OrganizationWithMemberCount[]>([])
const isLoading = ref(false)
const isCreating = ref(false)
const newOrgName = ref('')
const createError = ref<string | null>(null)

// Management dialog state
const selectedOrg = ref<OrganizationWithMemberCount | null>(null)
const showManageDialog = ref(false)
const members = ref<OrganizationMemberWithUser[]>([])
const isLoadingMembers = ref(false)
const editingName = ref('')
const isSavingName = ref(false)
const selectedUserIds = ref<string[]>([])
const isAddingMembers = ref(false)

const memberUserIds = computed(() => members.value.map((m) => m.userId))
const availableUsers = computed(() => users.value.filter((u) => !memberUserIds.value.includes(u.id)))

const columns: TableColumn<OrganizationWithMemberCount>[] = [
  { accessorKey: 'name', header: sortableHeader(t('common.name')) },
  {
    accessorKey: 'memberCount',
    header: sortableHeader(t('organizationsView.columnMembers')),
    meta: hiddenBelow('sm'),
  },
  {
    accessorKey: 'createdAt',
    header: sortableHeader(t('organizationsView.columnCreatedAt')),
    meta: hiddenBelow('md'),
  },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function memberActions(member: OrganizationMemberWithUser): RowAction[] {
  return [
    {
      label: t('organizationsView.removeAvatarTooltip'),
      icon: 'i-fa7-solid:user-slash',
      hidden: !versionFor(member.userId),
      onSelect: () => handleRemoveAvatar(member.userId),
    },
    {
      label: t('organizationsView.removeMemberTooltip'),
      icon: 'i-fa7-solid:user-minus',
      color: 'error',
      onSelect: () => handleRemoveMember(member.userId),
    },
  ]
}

onMounted(loadOrganizations)

async function loadOrganizations() {
  isLoading.value = true
  try {
    organizations.value = await listOrganizations()
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorLoading'), life: 3000 })
  } finally {
    isLoading.value = false
  }
}

async function handleCreate() {
  if (!newOrgName.value.trim()) {
    createError.value = t('organizationsView.nameRequired')
    return
  }
  createError.value = null
  isCreating.value = true
  try {
    await createOrganization(newOrgName.value.trim())
    toast.add({ severity: 'success', summary: t('organizationsView.orgCreatedSummary'), detail: t('organizationsView.orgCreatedDetail', { name: newOrgName.value }), life: 3000 })
    newOrgName.value = ''
    await loadOrganizations()
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorCreating'), life: 3000 })
  } finally {
    isCreating.value = false
  }
}

async function openManageDialog(org: OrganizationWithMemberCount) {
  selectedOrg.value = org
  editingName.value = org.name
  showManageDialog.value = true
  isLoadingMembers.value = true
  try {
    members.value = await getMembers(org.id)
  } finally {
    isLoadingMembers.value = false
  }
}

function closeManageDialog() {
  selectedOrg.value = null
  members.value = []
  selectedUserIds.value = []
}

async function handleSaveName() {
  if (!selectedOrg.value || !editingName.value.trim()) return
  isSavingName.value = true
  try {
    await renameOrganization(selectedOrg.value.id, editingName.value.trim())
    const name = editingName.value.trim()
    const idx = organizations.value.findIndex((o) => o.id === selectedOrg.value!.id)
    if (idx !== -1) organizations.value[idx].name = name
    selectedOrg.value.name = name
    toast.add({ severity: 'success', summary: t('organizationsView.renamedSummary'), detail: t('organizationsView.renamedDetail', { name }), life: 3000 })
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorRenaming'), life: 3000 })
  } finally {
    isSavingName.value = false
  }
}

async function handleRemoveMember(userId: string) {
  if (!selectedOrg.value) return
  try {
    await removeMember(selectedOrg.value.id, userId)
    members.value = members.value.filter((m) => m.userId !== userId)
    const idx = organizations.value.findIndex((o) => o.id === selectedOrg.value!.id)
    if (idx !== -1) organizations.value[idx].memberCount--
    toast.add({ severity: 'success', summary: t('organizationsView.memberRemovedSummary'), life: 2000 })
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorGeneric'), life: 3000 })
  }
}

/** Moderation: drops an inappropriate picture, the member stays. */
async function handleRemoveAvatar(userId: string) {
  try {
    await removeAvatarFor(userId)
    toast.add({ severity: 'success', summary: t('organizationsView.avatarRemovedSummary'), life: 2000 })
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorGeneric'), life: 3000 })
  }
}

async function handleAddMembers() {
  if (!selectedOrg.value || selectedUserIds.value.length === 0) return
  isAddingMembers.value = true
  try {
    await Promise.all(selectedUserIds.value.map((uid) => addMember(selectedOrg.value!.id, uid)))
    members.value = await getMembers(selectedOrg.value.id)
    const idx = organizations.value.findIndex((o) => o.id === selectedOrg.value!.id)
    if (idx !== -1) organizations.value[idx].memberCount = members.value.length
    selectedUserIds.value = []
    toast.add({ severity: 'success', summary: t('organizationsView.membersAddedSummary'), life: 2000 })
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorGeneric'), life: 3000 })
  } finally {
    isAddingMembers.value = false
  }
}

async function ensureUsersLoaded() {
  if (users.value.length === 0) await listUsers()
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>
