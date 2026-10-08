<template>
  <div>
    <AdminPageHeader :title="t('rankedSeasonsList.title')">
      <template #actions>
        <UButton
          :label="t('rankedSeasonsList.newSeason')"
          icon="i-fa7-solid:plus"
          to="/admin/ranked/new"
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

    <AdminTable :data="seasons" :columns="columns" :loading="loading">
      <template #name-cell="{ row }">
        <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
        <!-- Status and discipline columns are hidden on phones. -->
        <div class="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted md:hidden">
          <UBadge v-bind="statusBadge(row.original.status)" variant="subtle" size="sm" />
          <span v-if="row.original.discipline">{{ row.original.discipline.name }}</span>
        </div>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-bind="statusBadge(row.original.status)" variant="subtle" />
      </template>
      <template #startDate-cell="{ row }">{{ formatDate(row.original.startDate) }}</template>
      <template #endDate-cell="{ row }">{{ formatDate(row.original.endDate) }}</template>
      <template #chaining-cell="{ row }">
        <UTooltip
          v-if="row.original.automation?.enabled"
          :text="
            row.original.automation.mode === 'close'
              ? t('rankedSeasonsList.tooltipClosing')
              : t('rankedSeasonsList.tooltipChaining')
          "
        >
          <UBadge color="info" variant="subtle" :label="chainingLabel(row.original)" />
        </UTooltip>
        <span v-else class="text-dimmed">—</span>
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-4 py-8">
          <p class="text-muted">{{ t('rankedSeasonsList.empty') }}</p>
          <UButton
            :label="t('rankedSeasonsList.createSeason')"
            icon="i-fa7-solid:plus"
            to="/admin/ranked/new"
          />
        </div>
      </template>
    </AdminTable>
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
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useRankedService } from '@/composables/ranked/ranked.service'
import { rewindApi } from '@/composables/ranked/rewind.api'
import { useAppToast } from '@/composables/useAppToast'
import type { RankedSeason } from '@/composables/ranked/ranked.api'

const { t } = useI18n()
const confirm = useConfirmDialog()
const toast = useAppToast()
const { seasons, loading, error, loadSeasons, startSeason, endSeason, rolloverNow } =
  useRankedService()

const regeneratingId = ref<string | null>(null)

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * "Auto · 12/04/2026" while a term is scheduled, plain "Auto" on a draft that has none yet;
 * the "Clôture" variants for an automation that only ends the season.
 */
function chainingLabel(season: RankedSeason) {
  const at = season.automation?.nextRolloverAt
  const prefix = season.automation?.mode === 'close' ? 'closing' : 'chaining'
  return at
    ? t(`rankedSeasonsList.${prefix}Next`, { date: formatDate(at) })
    : t(`rankedSeasonsList.${prefix}On`)
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: t('rankedSeasonsList.statusDraft'),
    open: t('rankedSeasonsList.statusOpen'),
    ongoing: t('rankedSeasonsList.statusOngoing'),
    finished: t('rankedSeasonsList.statusFinished'),
    cancelled: t('rankedSeasonsList.statusCancelled'),
  }
  return labels[status] ?? status
}

const STATUS_COLORS = {
  draft: 'neutral',
  open: 'info',
  ongoing: 'success',
  finished: 'secondary',
  cancelled: 'error',
} as const

function statusBadge(status: string) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'neutral'
  return { label: statusLabel(status), color }
}

const columns: TableColumn<RankedSeason>[] = [
  { accessorKey: 'name', header: sortableHeader(t('common.name')) },
  {
    id: 'discipline',
    accessorFn: (season) => season.discipline?.name ?? '',
    header: sortableHeader(t('common.discipline')),
    meta: hiddenBelow('lg'),
  },
  { accessorKey: 'status', header: sortableHeader(t('common.status')), meta: hiddenBelow('md') },
  {
    accessorKey: 'startDate',
    header: sortableHeader(t('rankedSeasonsList.colStart')),
    meta: hiddenBelow('xl'),
  },
  {
    accessorKey: 'endDate',
    header: sortableHeader(t('rankedSeasonsList.colEnd')),
    meta: hiddenBelow('xl'),
  },
  { id: 'chaining', header: t('rankedSeasonsList.colChaining'), meta: hiddenBelow('2xl') },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

// A running season is no longer frozen: its metadata is always editable and its MMR
// settings replay the season when changed. Only a finished one is closed for good.
function rowActions(season: RankedSeason): RowAction[] {
  const chains = season.automation?.enabled && season.automation.mode === 'chain'
  return [
    {
      label: t('rankedSeasonsList.tooltipView'),
      icon: 'i-fa7-solid:eye',
      to: `/tournaments/${season.id}`,
    },
    {
      label: t('rankedSeasonsList.tooltipManageRanks'),
      icon: 'i-fa7-solid:trophy',
      to: `/admin/ranked/${season.id}/tiers`,
      hidden: season.status === 'draft',
    },
    {
      label: t('common.edit'),
      icon: 'i-fa7-solid:pen',
      to: `/admin/ranked/${season.id}/edit`,
      hidden: season.status === 'finished',
    },
    {
      label: t('rankedSeasonsList.tooltipStart'),
      icon: 'i-fa7-solid:play',
      color: 'success',
      hidden: season.status !== 'draft',
      onSelect: () => handleStart(season),
    },
    {
      label: t('rankedSeasonsList.tooltipEnd'),
      icon: 'i-fa7-solid:stop',
      color: 'error',
      hidden: season.status !== 'ongoing',
      onSelect: () => confirmEnd(season),
    },
    {
      label: t('rankedSeasonsList.tooltipRollover'),
      icon: 'i-fa7-solid:forward',
      color: 'warning',
      hidden: season.status !== 'ongoing' || !chains,
      onSelect: () => confirmRollover(season),
    },
    {
      label: t('rankedSeasonsList.tooltipRegenerateRewind'),
      icon: 'i-fa7-solid:film',
      loading: regeneratingId.value === season.id,
      hidden: season.status !== 'finished',
      onSelect: () => handleRegenerateRewind(season),
    },
  ]
}

async function handleStart(season: RankedSeason) {
  await startSeason(season.id)
  await loadSeasons()
}

async function confirmEnd(season: RankedSeason) {
  const confirmed = await confirm({
    title: t('rankedSeasonsList.endDialogHeader'),
    message: t('rankedSeasonsList.endDialogConfirm', { name: season.name }),
    confirmLabel: t('rankedSeasonsList.end'),
    color: 'error',
  })
  if (confirmed && (await endSeason(season.id))) await loadSeasons()
}

/**
 * Queues a rebuild of the season rewind. Only useful after the underlying data
 * moved (an MMR recalculation, a cancelled match); players keep their promotion
 * window and their viewed state across a rebuild.
 */
async function handleRegenerateRewind(season: RankedSeason) {
  regeneratingId.value = season.id
  try {
    await rewindApi.regenerate(season.id)
    toast.add({
      severity: 'success',
      summary: t('rankedSeasonsList.rewindQueued'),
      detail: t('rankedSeasonsList.rewindQueuedDetail'),
      life: 4000,
    })
  } catch (err) {
    // The backend refuses a rebuild for a reason the admin needs to read
    // (a frozen payload version, missing rights): the interceptor already
    // carries the translated message, so surface it rather than drop it.
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: err instanceof Error ? err.message : t('rankedSeasonsList.rewindFailedDetail'),
      life: 6000,
    })
  } finally {
    regeneratingId.value = null
  }
}

async function confirmRollover(season: RankedSeason) {
  const confirmed = await confirm({
    title: t('rankedSeasonsList.rolloverDialogHeader'),
    message: `${t('rankedSeasonsList.rolloverDialogConfirm', { name: season.name })}\n\n${t('rankedSeasonsList.rolloverDialogDetail')}`,
    confirmLabel: t('rankedSeasonsList.rollover'),
    color: 'warning',
  })
  if (confirmed) await handleRollover(season)
}

async function handleRollover(season: RankedSeason) {
  const next = await rolloverNow(season.id)
  if (!next) {
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: error.value ?? t('rankedSeasonsList.rolloverFailedDetail'),
      life: 6000,
    })
    return
  }
  toast.add({
    severity: 'success',
    summary: t('rankedSeasonsList.rolloverDone'),
    detail: t('rankedSeasonsList.rolloverDoneDetail', { name: next.name }),
    life: 5000,
  })
  await loadSeasons()
}

onMounted(() => {
  loadSeasons()
})
</script>
