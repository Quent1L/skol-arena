<template>
  <div>
    <AdminPageHeader :title="t('disciplineList.title')">
      <template #actions>
        <UButton
          :label="t('disciplineList.newDiscipline')"
          icon="i-fa7-solid:plus"
          to="/admin/disciplines/new"
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
      :data="disciplines"
      :columns="columns"
      :loading="loading"
      :initial-sorting="[{ id: 'name', desc: false }]"
    >
      <template #name-cell="{ row }">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            :to="`/admin/disciplines/${row.original.id}`"
            class="font-semibold text-primary hover:underline"
          >
            {{ row.original.name }}
          </RouterLink>
          <UBadge
            v-if="row.original.archivedAt"
            color="neutral"
            variant="subtle"
            :label="t('disciplineList.archivedTag')"
          />
        </div>
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-4 py-8">
          <p class="text-muted">{{ t('disciplineList.emptyState') }}</p>
          <UButton
            :label="t('disciplineList.createFirst')"
            icon="i-fa7-solid:plus"
            to="/admin/disciplines/new"
          />
        </div>
      </template>
    </AdminTable>

    <!-- Not useConfirmDialog: three outcomes, archiving being the way out of a blocked delete. -->
    <UModal
      v-model:open="deleteDialogVisible"
      :title="t('disciplineList.deleteDialogHeader', { name: disciplineToDelete?.name })"
      :ui="{ footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    >
      <template #body>
        <div class="flex items-start gap-3">
          <UIcon name="i-fa7-solid:triangle-exclamation" class="size-6 shrink-0 text-error" />
          <p class="text-sm">{{ t('disciplineList.deleteConfirmMessage') }}</p>
        </div>
      </template>
      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="closeDialog"
        />
        <UButton
          :label="t('common.delete')"
          icon="i-fa7-solid:trash"
          color="error"
          variant="soft"
          class="justify-center"
          :loading="loading"
          @click="handleDelete"
        />
        <UButton
          :label="t('disciplineList.archive')"
          icon="i-fa7-solid:box-archive"
          class="justify-center"
          :loading="loading"
          @click="handleArchive"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, sortableHeader } from '@/components/admin/table-columns'
import { useDisciplineService } from '@/composables/discipline/discipline.service'
import type { Discipline } from '@skol-arena/shared/types/discipline'

const { t } = useI18n()
const {
  disciplines,
  loading,
  error,
  listDisciplines,
  deleteDiscipline,
  archiveDiscipline,
  restoreDiscipline,
} = useDisciplineService()

const columns: TableColumn<Discipline>[] = [
  { accessorKey: 'name', header: sortableHeader(t('common.name')) },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function rowActions(discipline: Discipline): RowAction[] {
  return [
    { label: t('common.edit'), icon: 'i-fa7-solid:pen', to: `/admin/disciplines/${discipline.id}` },
    {
      label: t('disciplineList.restore'),
      icon: 'i-fa7-solid:rotate-left',
      hidden: !discipline.archivedAt,
      onSelect: () => handleRestore(discipline),
    },
    {
      label: t('common.delete'),
      icon: 'i-fa7-solid:trash',
      color: 'error',
      hidden: !!discipline.archivedAt,
      onSelect: () => confirmDelete(discipline),
    },
  ]
}

const deleteDialogVisible = ref(false)
const disciplineToDelete = ref<Discipline | null>(null)

function confirmDelete(discipline: Discipline) {
  disciplineToDelete.value = discipline
  deleteDialogVisible.value = true
}

/**
 * A discipline referenced by a tournament, a rule or a match answers 409 with the
 * blocking resources. The toast carries that message; the dialog stays open so
 * archiving is one click away.
 */
async function handleDelete() {
  if (!disciplineToDelete.value) return

  try {
    await deleteDiscipline(disciplineToDelete.value.id)
    closeDialog()
    await refresh()
  } catch {
    // Handled by the service toast, which names the blocking resources.
  }
}

async function handleArchive() {
  if (!disciplineToDelete.value) return

  try {
    await archiveDiscipline(disciplineToDelete.value.id)
    closeDialog()
    await refresh()
  } catch {
    // Handled by the service toast.
  }
}

async function handleRestore(discipline: Discipline) {
  try {
    await restoreDiscipline(discipline.id)
    await refresh()
  } catch {
    // Handled by the service toast.
  }
}

function closeDialog() {
  deleteDialogVisible.value = false
  disciplineToDelete.value = null
}

/** Archived disciplines stay listed here, greyed by their tag, so they can be restored. */
function refresh() {
  return listDisciplines(true)
}

onMounted(refresh)
</script>
