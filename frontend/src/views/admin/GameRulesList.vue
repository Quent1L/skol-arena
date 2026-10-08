<template>
  <div>
    <AdminPageHeader :title="t('gameRulesList.title')">
      <template #actions>
        <UButton
          :label="t('gameRulesList.newRule')"
          icon="i-fa7-solid:plus"
          to="/admin/rules/new"
        />
      </template>
    </AdminPageHeader>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <AdminTable
      :data="rules"
      :columns="columns"
      :loading="loading"
      :initial-sorting="[{ id: 'title', desc: false }]"
    >
      <template #title-cell="{ row }">
        <span class="font-semibold text-highlighted">{{ row.original.title }}</span>
      </template>
      <template #createdAt-cell="{ row }">
        {{ formatDate(row.original.createdAt) }}
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-4 py-8">
          <p class="text-muted">{{ t('gameRulesList.emptyState') }}</p>
          <UButton
            :label="t('gameRulesList.createFirst')"
            icon="i-fa7-solid:plus"
            to="/admin/rules/new"
          />
        </div>
      </template>
    </AdminTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import { useGameRulesService } from '@/composables/game-rules/game-rules.service'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import type { ClientGameRule } from '@skol-arena/shared/types/index'

const { t } = useI18n()
const confirm = useConfirmDialog()
const { rules, loading, error, loadRules, deleteRule } = useGameRulesService()

const columns: TableColumn<ClientGameRule>[] = [
  { accessorKey: 'title', header: sortableHeader(t('gameRulesList.columnTitle')) },
  {
    accessorKey: 'createdAt',
    header: sortableHeader(t('gameRulesList.columnCreatedAt')),
    meta: hiddenBelow('sm'),
  },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function rowActions(rule: ClientGameRule): RowAction[] {
  return [
    { label: t('common.edit'), icon: 'i-fa7-solid:pen', to: `/admin/rules/${rule.id}/edit` },
    {
      label: t('common.delete'),
      icon: 'i-fa7-solid:trash',
      color: 'error',
      onSelect: () => confirmDelete(rule),
    },
  ]
}

async function confirmDelete(rule: ClientGameRule) {
  const confirmed = await confirm({
    title: t('gameRulesList.deleteDialogHeader'),
    message: t('gameRulesList.deleteConfirmMessage', { title: rule.title }),
    confirmLabel: t('common.delete'),
    color: 'error',
  })
  if (confirmed) await deleteRule(rule.id)
}

onMounted(loadRules)
</script>
