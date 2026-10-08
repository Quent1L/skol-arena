<template>
  <div>
    <AdminPageHeader
      :title="t('adminInvitationsView.title')"
      :description="t('adminInvitationsView.subtitle')"
    />

    <UCard class="mb-6">
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-fa7-solid:circle-plus" />
          {{ t('adminInvitationsView.generateNewCode') }}
        </h2>
      </template>
      <form
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        @submit.prevent="handleGenerateCode"
      >
        <UFormField :label="t('adminInvitationsView.maxUses')">
          <UInputNumber v-model="formData.maxUses" :min="1" :max="100" class="w-full" />
        </UFormField>
        <UFormField :label="t('adminInvitationsView.expirationDays')">
          <UInputNumber
            v-model="formData.expiresInDays"
            :min="1"
            :max="365"
            :placeholder="t('adminInvitationsView.noExpiration')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('adminInvitationsView.notesOptional')">
          <UInput
            v-model="formData.notes"
            :placeholder="t('adminInvitationsView.notesPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('adminInvitationsView.organizationOptional')">
          <USelectMenu
            v-model="formData.organizationId"
            :items="organizations"
            value-key="id"
            label-key="name"
            clear
            :placeholder="t('adminInvitationsView.generalAccess')"
            class="w-full"
          />
        </UFormField>
        <div class="sm:col-span-2 lg:col-span-4">
          <UButton
            type="submit"
            :loading="isGenerating"
            :label="t('adminInvitationsView.generateCode')"
            icon="i-fa7-solid:plus"
            class="w-full justify-center sm:w-auto"
          />
        </div>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-fa7-solid:list" />
          {{ t('adminInvitationsView.existingCodes') }}
        </h2>
      </template>
      <AdminTable
        :data="codes"
        :columns="columns"
        :loading="isLoading"
        :empty="t('adminInvitationsView.noCodes')"
        :initial-sorting="[{ id: 'createdAt', desc: true }]"
      >
        <template #code-cell="{ row }">
          <div class="flex items-center gap-1">
            <code class="rounded bg-elevated px-2 py-1 font-mono text-sm">{{ row.original.code }}</code>
            <UTooltip :text="t('adminInvitationsView.copyCode')">
              <UButton
                icon="i-fa7-solid:copy"
                variant="ghost"
                size="sm"
                :aria-label="t('adminInvitationsView.copyCode')"
                @click="copyToClipboard(row.original.code)"
              />
            </UTooltip>
            <UTooltip :text="t('adminInvitationsView.copySignupLink')">
              <UButton
                icon="i-fa7-solid:link"
                variant="ghost"
                size="sm"
                :aria-label="t('adminInvitationsView.copySignupLink')"
                @click="copySignupUrl(row.original.code)"
              />
            </UTooltip>
          </div>
        </template>
        <template #usedCount-cell="{ row }">
          <UBadge
            :color="row.original.usedCount >= row.original.maxUses ? 'error' : 'success'"
            variant="subtle"
            :label="`${row.original.usedCount} / ${row.original.maxUses}`"
          />
        </template>
        <template #isActive-cell="{ row }">
          <UBadge
            :color="row.original.isActive ? 'success' : 'neutral'"
            variant="subtle"
            :label="
              row.original.isActive
                ? t('adminInvitationsView.statusActive')
                : t('adminInvitationsView.statusInactive')
            "
          />
        </template>
        <template #expiresAt-cell="{ row }">
          <span v-if="row.original.expiresAt">{{ formatDate(row.original.expiresAt) }}</span>
          <span v-else class="text-muted">{{ t('adminInvitationsView.noExpirationValue') }}</span>
        </template>
        <template #createdAt-cell="{ row }">{{ formatDate(row.original.createdAt) }}</template>
        <template #notes-cell="{ row }">
          <span v-if="row.original.notes" class="text-sm text-muted">{{ row.original.notes }}</span>
          <span v-else class="text-dimmed">-</span>
        </template>
        <template #actions-cell="{ row }">
          <RowActions :actions="rowActions(row.original)" />
        </template>
      </AdminTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useAppToast } from '@/composables/useAppToast'
import { useInvitationService } from '@/composables/invitation/invitation.service'
import { useOrganizationService } from '@/composables/organization/organization.service'
import type { InvitationCode } from '@/composables/invitation/invitation.api'
import type { OrganizationWithMemberCount } from '@skol-arena/shared'

const { t } = useI18n()
const toast = useAppToast()
const { generateCode, getAllCodes, deactivateCode } = useInvitationService()
const { listOrganizations } = useOrganizationService()

const codes = ref<InvitationCode[]>([])
const organizations = ref<OrganizationWithMemberCount[]>([])
const isLoading = ref(false)
const isGenerating = ref(false)

const columns: TableColumn<InvitationCode>[] = [
  { accessorKey: 'code', header: sortableHeader(t('adminInvitationsView.columnCode')) },
  {
    accessorKey: 'usedCount',
    header: sortableHeader(t('adminInvitationsView.columnUsages')),
    meta: hiddenBelow('sm'),
  },
  {
    accessorKey: 'isActive',
    header: sortableHeader(t('common.status')),
    meta: hiddenBelow('md'),
  },
  {
    accessorKey: 'expiresAt',
    header: sortableHeader(t('adminInvitationsView.columnExpiration')),
    meta: hiddenBelow('xl'),
  },
  {
    id: 'creator',
    accessorFn: (code) => code.creator?.displayName ?? '',
    header: sortableHeader(t('adminInvitationsView.columnCreator')),
    meta: hiddenBelow('xl'),
  },
  {
    accessorKey: 'createdAt',
    header: sortableHeader(t('adminInvitationsView.columnCreatedAt')),
    meta: hiddenBelow('lg'),
  },
  { accessorKey: 'notes', header: t('adminInvitationsView.columnNotes'), meta: hiddenBelow('2xl') },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function rowActions(code: InvitationCode): RowAction[] {
  return [
    {
      label: t('adminInvitationsView.deactivate'),
      icon: 'i-fa7-solid:ban',
      color: 'error',
      hidden: !code.isActive,
      onSelect: () => handleDeactivate(code),
    },
  ]
}

const formData = ref({
  maxUses: 1,
  expiresInDays: undefined as number | undefined,
  notes: '',
  organizationId: undefined as string | undefined,
})

onMounted(async () => {
  await Promise.all([loadCodes(), loadOrganizations()])
})

async function loadOrganizations() {
  try {
    organizations.value = await listOrganizations()
  } catch {
    // non-critical, ignore
  }
}

async function loadCodes() {
  isLoading.value = true
  try {
    codes.value = await getAllCodes()
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      summary: t('adminInvitationsView.errorSummary'),
      detail: (error as Error).message || t('adminInvitationsView.errorLoadCodes'),
      life: 3000,
    })
  } finally {
    isLoading.value = false
  }
}

async function handleGenerateCode() {
  isGenerating.value = true
  try {
    const newCode = await generateCode({
      maxUses: formData.value.maxUses,
      expiresInDays: formData.value.expiresInDays,
      notes: formData.value.notes || undefined,
      organizationId: formData.value.organizationId,
    })

    toast.add({
      severity: 'success',
      summary: t('adminInvitationsView.codeCreatedSummary'),
      detail: t('adminInvitationsView.codeCreatedDetail', { code: newCode.code }),
      life: 5000,
    })

    formData.value = {
      maxUses: 1,
      expiresInDays: undefined,
      notes: '',
      organizationId: undefined,
    }

    await loadCodes()
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      summary: t('adminInvitationsView.errorSummary'),
      detail: (error as Error).message || t('adminInvitationsView.errorGenerateCode'),
      life: 3000,
    })
  } finally {
    isGenerating.value = false
  }
}

async function handleDeactivate(code: InvitationCode) {
  try {
    await deactivateCode(code.id)
    toast.add({
      severity: 'success',
      summary: t('adminInvitationsView.codeDeactivatedSummary'),
      detail: t('adminInvitationsView.codeDeactivatedDetail', { code: code.code }),
      life: 3000,
    })
    await loadCodes()
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      summary: t('adminInvitationsView.errorSummary'),
      detail: (error as Error).message || t('adminInvitationsView.errorDeactivateCode'),
      life: 3000,
    })
  }
}

function copyToClipboard(code: string) {
  navigator.clipboard.writeText(code)
  toast.add({
    severity: 'success',
    summary: t('adminInvitationsView.copiedSummary'),
    detail: t('adminInvitationsView.codeCopiedDetail'),
    life: 2000,
  })
}

function copySignupUrl(code: string) {
  const baseUrl = window.location.origin
  const url = `${baseUrl}/signup?code=${code}`
  navigator.clipboard.writeText(url)
  toast.add({
    severity: 'success',
    summary: t('adminInvitationsView.copiedSummary'),
    detail: t('adminInvitationsView.signupLinkCopiedDetail'),
    life: 2000,
  })
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>
