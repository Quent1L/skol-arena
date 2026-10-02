<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2">{{ t('organizationsView.title') }}</h1>
      <p class="text-gray-600">{{ t('organizationsView.subtitle') }}</p>
    </div>

    <Card class="mb-6">
      <template #title>
        <div class="flex items-center gap-2">
          <i class="fa fa-plus-circle"></i>
          {{ t('organizationsView.createOrganization') }}
        </div>
      </template>
      <template #content>
        <form @submit.prevent="handleCreate" class="flex gap-4 items-end">
          <div class="flex flex-col gap-2 flex-1">
            <label for="orgName" class="font-medium">{{ t('organizationsView.orgNameLabel') }}</label>
            <InputText
              id="orgName"
              v-model="newOrgName"
              :placeholder="t('organizationsView.orgNamePlaceholder')"
              class="w-full"
              :class="{ 'p-invalid': createError }"
            />
            <small v-if="createError" class="p-error">{{ createError }}</small>
          </div>
          <Button type="submit" :loading="isCreating" :label="t('common.create')" icon="fa fa-plus" />
        </form>
      </template>
    </Card>

    <Card>
      <template #title>
        <div class="flex items-center gap-2">
          <i class="fa fa-list"></i>
          {{ t('organizationsView.existingOrgs') }}
        </div>
      </template>
      <template #content>
        <DataTable :value="organizations" :loading="isLoading" striped-rows removable-sort>
          <template #empty>
            <div class="text-center py-6 text-gray-500">{{ t('organizationsView.noOrgs') }}</div>
          </template>

          <Column field="name" :header="t('common.name')" sortable />

          <Column field="memberCount" :header="t('organizationsView.columnMembers')" sortable>
            <template #body="{ data }">
              <Tag severity="info">{{ t('organizationsView.memberCount', data.memberCount) }}</Tag>
            </template>
          </Column>

          <Column field="createdAt" :header="t('organizationsView.columnCreatedAt')" sortable>
            <template #body="{ data }">
              {{ formatDate(data.createdAt) }}
            </template>
          </Column>

          <Column :header="t('organizationsView.columnActions')" :exportable="false">
            <template #body="{ data }">
              <Button icon="fa fa-cog" :label="t('organizationsView.manage')" size="small" text @click="openManageDialog(data)" />
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>

    <!-- Management Dialog -->
    <Dialog
      v-model:visible="showManageDialog"
      :header="t('organizationsView.manageDialogHeader', { name: selectedOrg?.name })"
      :modal="true"
      :style="{ width: '700px' }"
      @hide="closeManageDialog"
    >
      <!-- Rename section -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-3">{{ t('organizationsView.orgNameSectionTitle') }}</h3>
        <div class="flex gap-2 items-center">
          <InputText
            v-model="editingName"
            class="flex-1"
            :placeholder="t('organizationsView.orgNameRenamePlaceholder')"
            :maxlength="100"
          />
          <Button
            :label="t('common.save')"
            icon="fa fa-check"
            size="small"
            :loading="isSavingName"
            :disabled="!editingName.trim() || editingName.trim() === selectedOrg?.name"
            @click="handleSaveName"
          />
        </div>
      </div>

      <Divider />

      <!-- Members section -->
      <div>
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold">
            {{ t('organizationsView.membersSection') }}
            <Tag severity="info" class="ml-2">{{ members.length }}</Tag>
          </h3>
          <Button :label="t('organizationsView.addMemberButton')" icon="fa fa-user-plus" size="small" @click="showAddMemberDialog = true" />
        </div>

        <div v-if="isLoadingMembers" class="flex justify-center py-4">
          <ProgressSpinner />
        </div>

        <div v-else-if="members.length === 0" class="text-center py-4 text-gray-500">
          {{ t('organizationsView.noMembers') }}
        </div>

        <div v-else class="flex flex-col gap-2">
          <div
            v-for="member in members"
            :key="member.id"
            class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <Avatar :label="member.user.displayName.charAt(0).toUpperCase()" class="bg-blue-500 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ member.user.displayName }}</div>
              <div class="flex items-center gap-2 mt-0.5">
                <Tag :severity="member.role === 'owner' ? 'warning' : 'secondary'" size="small">
                  {{ member.role === 'owner' ? t('organizationsView.roleOwner') : t('organizationsView.roleMember') }}
                </Tag>
                <span class="text-sm text-gray-500">{{ t('organizationsView.addedAt', { date: formatDate(member.joinedAt) }) }}</span>
              </div>
            </div>
            <Button
              icon="fa fa-user-minus"
              severity="danger"
              text
              rounded
              size="small"
              v-tooltip="t('organizationsView.removeMemberTooltip')"
              @click="handleRemoveMember(member.userId)"
            />
          </div>
        </div>
      </div>

      <!-- Add member sub-dialog -->
      <Dialog
        v-model:visible="showAddMemberDialog"
        :header="t('organizationsView.addMembersDialogHeader')"
        :modal="true"
        :style="{ width: '500px' }"
        @hide="selectedUserIds = []"
      >
        <div class="flex flex-col gap-4">
          <div v-if="isLoadingUsers" class="flex justify-center py-4">
            <ProgressSpinner />
          </div>
          <div v-else>
            <label for="addMembersSelect" class="block text-sm font-medium mb-2">{{ t('organizationsView.selectUsersLabel') }}</label>
            <MultiSelect
              inputId="addMembersSelect"
              v-model="selectedUserIds"
              :options="availableUsers"
              option-label="displayName"
              option-value="id"
              :placeholder="t('organizationsView.selectUsersPlaceholder')"
              class="w-full"
              filter
              filter-match-mode="accentInsensitive"
              display="chip"
            />
          </div>
        </div>
        <template #footer>
          <Button
            :label="t('common.cancel')"
            severity="secondary"
            @click="showAddMemberDialog = false"
            :disabled="isAddingMembers"
          />
          <Button
            :label="t('organizationsView.add')"
            icon="fa fa-check"
            :disabled="selectedUserIds.length === 0 || isAddingMembers"
            :loading="isAddingMembers"
            @click="handleAddMembers"
          />
        </template>
      </Dialog>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppToast } from '@/composables/useAppToast'
import { useOrganizationService } from '@/composables/organization/organization.service'
import { useUserService } from '@/composables/user/user.service'
import type { OrganizationWithMemberCount, OrganizationMemberWithUser } from '@skol-arena/shared'

const { t } = useI18n()
const toast = useAppToast()
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
const showAddMemberDialog = ref(false)
const selectedUserIds = ref<string[]>([])
const isAddingMembers = ref(false)

const memberUserIds = computed(() => members.value.map((m) => m.userId))
const availableUsers = computed(() => users.value.filter((u) => !memberUserIds.value.includes(u.id)))

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

async function handleAddMembers() {
  if (!selectedOrg.value || selectedUserIds.value.length === 0) return
  isAddingMembers.value = true
  try {
    await Promise.all(selectedUserIds.value.map((uid) => addMember(selectedOrg.value!.id, uid)))
    members.value = await getMembers(selectedOrg.value.id)
    const idx = organizations.value.findIndex((o) => o.id === selectedOrg.value!.id)
    if (idx !== -1) organizations.value[idx].memberCount = members.value.length
    showAddMemberDialog.value = false
    selectedUserIds.value = []
    toast.add({ severity: 'success', summary: t('organizationsView.membersAddedSummary'), life: 2000 })
  } catch (error: unknown) {
    toast.add({ severity: 'error', summary: t('organizationsView.errorSummary'), detail: error instanceof Error ? error.message : t('organizationsView.errorGeneric'), life: 3000 })
  } finally {
    isAddingMembers.value = false
  }
}

watch(showAddMemberDialog, async (visible) => {
  if (visible && users.value.length === 0) {
    await listUsers()
  }
})

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>
