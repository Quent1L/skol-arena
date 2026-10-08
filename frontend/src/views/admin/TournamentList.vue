<template>
  <div>
    <AdminPageHeader :title="t('tournamentList.title')">
      <template v-if="canCreateTournament" #actions>
        <UButton
          :label="t('tournamentList.newTournament')"
          icon="i-fa7-solid:plus"
          to="/admin/tournaments/new"
        />
      </template>
    </AdminPageHeader>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
      <USelectMenu
        v-model="selectedStatus"
        :items="statusOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('tournamentList.allStatuses')"
        class="sm:w-48"
        @update:model-value="applyFilters"
      />
      <USelectMenu
        v-model="selectedMode"
        :items="modeOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('tournamentList.allModes')"
        class="sm:w-48"
        @update:model-value="applyFilters"
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

    <AdminTable :data="tournaments" :columns="columns" :loading="loading">
      <template #name-cell="{ row }">
        <RouterLink
          :to="`/admin/tournaments/${row.original.id}/edit`"
          class="font-semibold text-primary hover:underline"
        >
          {{ row.original.name }}
        </RouterLink>
        <!-- Mode and status columns are hidden on phones. -->
        <div class="mt-1 flex flex-wrap gap-1 md:hidden">
          <UBadge v-bind="modeBadge(row.original.mode)" variant="subtle" size="sm" />
          <UBadge v-bind="statusBadge(row.original.status)" variant="subtle" size="sm" />
        </div>
      </template>
      <template #mode-cell="{ row }">
        <UBadge v-bind="modeBadge(row.original.mode)" variant="subtle" />
      </template>
      <template #teamMode-cell="{ row }">
        {{
          row.original.teamMode === 'static'
            ? t('tournamentList.teamModeStatic')
            : t('tournamentList.teamModeFlex')
        }}
        ({{ row.original.teamSize }}v{{ row.original.teamSize }})
      </template>
      <template #startDate-cell="{ row }">{{ formatDate(row.original.startDate) }}</template>
      <template #endDate-cell="{ row }">{{ formatDate(row.original.endDate) }}</template>
      <template #status-cell="{ row }">
        <UBadge v-bind="statusBadge(row.original.status)" variant="subtle" />
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-4 py-8">
          <p class="text-muted">{{ t('tournamentList.empty') }}</p>
          <UButton
            v-if="canCreateTournament"
            :label="t('tournamentList.createFirst')"
            icon="i-fa7-solid:plus"
            to="/admin/tournaments/new"
          />
        </div>
      </template>
    </AdminTable>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import type { TournamentResponse } from '@/composables/tournament/tournament.api'

const { t } = useI18n()
const confirm = useConfirmDialog()
const {
  tournaments,
  loading,
  error,
  canCreateTournament,
  canManageTournament,
  canDeleteTournament,
  listTournaments,
  deleteTournament,
} = useTournamentService()

const selectedStatus = ref()
const selectedMode = ref()

const columns: TableColumn<TournamentResponse>[] = [
  { accessorKey: 'name', header: sortableHeader(t('common.name')) },
  {
    accessorKey: 'mode',
    header: sortableHeader(t('tournamentList.colMode')),
    meta: hiddenBelow('md'),
  },
  {
    accessorKey: 'teamMode',
    header: sortableHeader(t('tournamentList.colTeams')),
    meta: hiddenBelow('xl'),
  },
  {
    accessorKey: 'startDate',
    header: sortableHeader(t('tournamentList.colStart')),
    meta: hiddenBelow('lg'),
  },
  {
    accessorKey: 'endDate',
    header: sortableHeader(t('tournamentList.colEnd')),
    meta: hiddenBelow('lg'),
  },
  {
    accessorKey: 'status',
    header: sortableHeader(t('tournamentList.colStatus')),
    meta: hiddenBelow('md'),
  },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

const statusOptions = [
  { label: t('tournamentList.statusDraft'), value: 'draft' },
  { label: t('tournamentList.statusOpen'), value: 'open' },
  { label: t('tournamentList.statusOngoing'), value: 'ongoing' },
  { label: t('tournamentList.statusFinished'), value: 'finished' },
]

const modeOptions = [
  { label: t('tournamentList.modeChampionship'), value: 'championship' },
  { label: t('tournamentList.modeBracket'), value: 'bracket' },
]

function formatDate(date: Date): string {
  return format(date, 'dd MMM yyyy', { locale: fr })
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: t('tournamentList.statusDraft'),
    open: t('tournamentList.statusOpen'),
    ongoing: t('tournamentList.statusOngoing'),
    finished: t('tournamentList.statusFinished'),
  }
  return labels[status] || status
}

const STATUS_COLORS = {
  draft: 'neutral',
  open: 'info',
  ongoing: 'success',
  finished: 'error',
} as const

function statusBadge(status: string) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'neutral'
  return { label: getStatusLabel(status), color }
}

function modeBadge(mode: string) {
  return mode === 'championship'
    ? { label: t('tournamentList.modeChampionship'), color: 'info' as const }
    : { label: t('tournamentList.modeBracket'), color: 'warning' as const }
}

function rowActions(tournament: TournamentResponse): RowAction[] {
  return [
    {
      label: t('common.edit'),
      icon: 'i-fa7-solid:pen',
      to: `/admin/tournaments/${tournament.id}/edit`,
      hidden: !canManageTournament(tournament),
    },
    {
      label: t('common.delete'),
      icon: 'i-fa7-solid:trash',
      color: 'error',
      hidden: !canDeleteTournament(tournament),
      onSelect: () => confirmDelete(tournament),
    },
  ]
}

function applyFilters() {
  listTournaments({
    status: selectedStatus.value,
    mode: selectedMode.value,
  })
}

async function confirmDelete(tournament: TournamentResponse) {
  const confirmed = await confirm({
    title: t('tournamentList.deleteDialogTitle', { name: tournament.name }),
    message: t('tournamentList.deleteConfirm'),
    confirmLabel: t('common.delete'),
    color: 'error',
  })
  if (!confirmed) return
  try {
    await deleteTournament(tournament.id)
  } catch (err) {
    console.error('Erreur lors de la suppression:', err)
  }
}

onMounted(() => {
  listTournaments()
})
</script>
