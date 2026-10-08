<template>
  <div class="max-w-5xl">
    <AdminPageHeader :title="t('rankedTiersView.title')">
      <template #actions>
        <UButton
          :label="t('rankedTiersView.addRank')"
          icon="i-fa7-solid:plus"
          @click="openCreateDialog"
        />
        <UButton
          :label="t('rankedTiersView.recalculateThresholds')"
          icon="i-fa7-solid:calculator"
          color="neutral"
          variant="soft"
          @click="confirmRecalculate"
        />
      </template>
    </AdminPageHeader>
    <p v-if="currentSeason" class="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
      {{ currentSeason.name }}
      <UBadge v-bind="statusBadge(currentSeason.status)" variant="subtle" />
    </p>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <AdminTable
      :data="tiers"
      :columns="columns"
      :loading="loading"
      :page-size="0"
      :empty="t('rankedTiersView.empty')"
      :initial-sorting="[{ id: 'level', desc: false }]"
    >
      <template #icon-cell="{ row }">
        <i :class="getTierIconClass(row.original)" class="text-xl" />
      </template>
      <template #name-cell="{ row }">
        <span class="font-medium">{{ tierName(row.original) }}</span>
        <!-- The numeric columns are hidden on phones: keep the threshold in sight. -->
        <p class="text-xs text-muted sm:hidden">
          {{ Math.round(row.original.percentile * 100) }}% · {{ row.original.minMmr }} MMR
        </p>
      </template>
      <template #percentile-cell="{ row }"
        >{{ Math.round(row.original.percentile * 100) }}%</template
      >
      <template #subRanks-cell="{ row }">
        {{ row.original.subRanks > 1 ? row.original.subRanks : '—' }}
      </template>
      <template #calculatedAt-cell="{ row }">{{ formatDate(row.original.calculatedAt) }}</template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
    </AdminTable>

    <!-- Create / Edit -->
    <UModal
      v-model:open="formDialogVisible"
      :title="
        editingTier ? t('rankedTiersView.editDialogTitle') : t('rankedTiersView.addDialogTitle')
      "
      :ui="{ footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField v-if="!editingTier" :label="t('rankedTiersView.formLevel')">
            <UInputNumber v-model="form.level" :min="1" :max="99" class="w-full" />
          </UFormField>
          <UFormField :label="t('rankedTiersView.formName')">
            <UInput
              v-model="form.name"
              :placeholder="t('rankedTiersView.formNamePlaceholder')"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('rankedTiersView.formPercentile')"
              :help="t('rankedTiersView.formPercentileHelp')"
            >
              <UInputNumber
                v-model="form.percentile"
                :min="0"
                :max="1"
                :step="0.01"
                :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('rankedTiersView.formMinMmr')">
              <UInputNumber v-model="form.minMmr" :min="0" class="w-full" />
            </UFormField>
          </div>
          <UFormField
            :label="t('rankedTiersView.formSubRanks')"
            :help="t('rankedTiersView.formSubRanksHelp')"
          >
            <UInputNumber v-model="form.subRanks" :min="1" :max="10" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('rankedTiersView.formIcon')"
            :help="t('rankedTiersView.formIconHelp')"
          >
            <FontAwesomeIconPicker v-model="form.iconClass" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="formDialogVisible = false"
        />
        <UButton
          :label="editingTier ? t('common.save') : t('common.create')"
          icon="i-fa7-solid:check"
          class="justify-center"
          :loading="loading"
          @click="handleSubmit"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useRankedService } from '@/composables/ranked/ranked.service'
import { getTierIconClass } from '@/composables/ranked/tier-style'
import FontAwesomeIconPicker from '@/components/forms/FontAwesomeIconPicker.vue'
import { useServerLabels } from '@/i18n/serverLabels'
import type { ClientRankTier } from '@skol-arena/shared/types/index'

const route = useRoute()
const { t } = useI18n()
const confirm = useConfirmDialog()
const { tierName } = useServerLabels()
const seasonId = route.params.id as string

const {
  tiers,
  currentSeason,
  loading,
  error,
  loadTiers,
  loadSeasonById,
  createTier,
  updateTier,
  deleteTier,
  recalculateTiers,
} = useRankedService()

const formDialogVisible = ref(false)
const editingTier = ref<ClientRankTier | null>(null)

const columns: TableColumn<ClientRankTier>[] = [
  { accessorKey: 'level', header: sortableHeader(t('rankedTiersView.colLevel')) },
  { id: 'icon', header: t('rankedTiersView.formIcon'), meta: hiddenBelow('sm') },
  { id: 'name', header: t('common.name') },
  {
    accessorKey: 'percentile',
    header: sortableHeader(t('rankedTiersView.colPercentile')),
    meta: hiddenBelow('sm'),
  },
  { accessorKey: 'subRanks', header: t('rankedTiersView.colSubRanks'), meta: hiddenBelow('md') },
  {
    accessorKey: 'minMmr',
    header: sortableHeader(t('rankedTiersView.colMinMmr')),
    meta: hiddenBelow('sm'),
  },
  {
    accessorKey: 'calculatedAt',
    header: t('rankedTiersView.colCalculatedAt'),
    meta: hiddenBelow('lg'),
  },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function rowActions(tier: ClientRankTier): RowAction[] {
  return [
    { label: t('common.edit'), icon: 'i-fa7-solid:pen', onSelect: () => openEditDialog(tier) },
    {
      label: t('common.delete'),
      icon: 'i-fa7-solid:trash',
      color: 'error',
      onSelect: () => confirmDelete(tier),
    },
  ]
}

const form = ref({ level: 1, name: '', percentile: 0, minMmr: 0, subRanks: 1, iconClass: '' })

function openCreateDialog() {
  editingTier.value = null
  form.value = {
    level: tiers.value.length > 0 ? Math.max(...tiers.value.map((t) => t.level)) + 1 : 1,
    name: '',
    percentile: 0,
    minMmr: 0,
    subRanks: 1,
    iconClass: '',
  }
  formDialogVisible.value = true
}

function openEditDialog(tier: ClientRankTier) {
  editingTier.value = tier
  // The translated name is what the admin sees, so it is what the field starts from.
  form.value = {
    level: tier.level,
    name: tierName(tier),
    percentile: tier.percentile,
    minMmr: tier.minMmr,
    subRanks: tier.subRanks ?? 1,
    iconClass: tier.iconClass ?? '',
  }
  formDialogVisible.value = true
}

async function handleSubmit() {
  if (editingTier.value) {
    const ok = await updateTier(seasonId, editingTier.value.level, {
      // Sent unconditionally: the server decides whether this is a rename or the
      // ladder label handed back, and it compares across every language it serves.
      // Deciding here would mean comparing a field seeded when the dialog opened
      // against a label that follows the current locale — switch language with the
      // dialog open and the two differ for no reason but the switch.
      name: form.value.name,
      percentile: form.value.percentile,
      minMmr: form.value.minMmr,
      subRanks: form.value.subRanks,
      iconClass: form.value.iconClass || null,
    })
    if (ok) formDialogVisible.value = false
  } else {
    const ok = await createTier(seasonId, {
      ...form.value,
      iconClass: form.value.iconClass || null,
    })
    if (ok) formDialogVisible.value = false
  }
}

async function confirmDelete(tier: ClientRankTier) {
  const confirmed = await confirm({
    title: t('rankedTiersView.deleteDialogTitle'),
    message: `${t('rankedTiersView.deleteConfirm', { name: tierName(tier) })}\n\n${t('rankedTiersView.deleteRenumberHint')}`,
    confirmLabel: t('rankedTiersView.delete'),
    color: 'error',
  })
  if (confirmed) await deleteTier(seasonId, tier.level)
}

async function confirmRecalculate() {
  const confirmed = await confirm({
    title: t('rankedTiersView.recalcDialogTitle'),
    message: t('rankedTiersView.recalcConfirm'),
    confirmLabel: t('rankedTiersView.recalculate'),
    icon: 'i-fa7-solid:circle-info',
  })
  if (confirmed) await recalculateTiers(seasonId)
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: t('rankedTiersView.statusDraft'),
    open: t('rankedTiersView.statusOpen'),
    ongoing: t('rankedTiersView.statusOngoing'),
    finished: t('rankedTiersView.statusFinished'),
    cancelled: t('rankedTiersView.statusCancelled'),
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

onMounted(async () => {
  await Promise.all([loadSeasonById(seasonId), loadTiers(seasonId)])
})
</script>
