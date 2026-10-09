<template>
  <div>
    <AdminPageHeader :title="t('rulesEngineList.title')">
      <template #actions>
        <UButton
          :label="t('rulesEngineList.statsButton')"
          icon="i-fa7-solid:chart-pie"
          color="neutral"
          variant="outline"
          to="/admin/rules-engine/stats"
        />
        <UTooltip :text="t('rulesEngineList.recalculateBadgesTooltip')">
          <UButton
            :label="t('rulesEngineList.recalculateBadges')"
            icon="i-fa7-solid:rotate"
            color="neutral"
            variant="outline"
            class="w-full justify-center sm:w-auto"
            :loading="reconciling"
            @click="handleReconcile"
          />
        </UTooltip>
        <UButton
          :label="t('rulesEngineList.newRule')"
          icon="i-fa7-solid:plus"
          to="/admin/rules-engine/new"
        />
      </template>
    </AdminPageHeader>

    <div class="mb-4 space-y-3">
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-fa7-solid:triangle-exclamation"
        :title="t('rulesEngineList.betaTag')"
        :description="t('rulesEngineList.betaWarning')"
      />

      <!-- Rules the startup patch chain could not rewrite. They stay deactivated until
           someone edits them, so they need to be visible without opening each one. -->
      <UAlert
        v-if="migrationDisabled.length"
        color="error"
        variant="subtle"
        :title="t('rulesEngineList.migrationDisabledTitle', { count: migrationDisabled.length })"
      >
        <template #description>
          <p>{{ t('rulesEngineList.migrationDisabledHelp') }}</p>
          <ul class="mt-2 list-inside list-disc">
            <li v-for="rule in migrationDisabled" :key="rule.id">
              <RouterLink :to="`/admin/rules-engine/${rule.id}/edit`" class="underline">
                {{ rule.name }}
              </RouterLink>
              <span class="text-muted"> — {{ rule.disabledReason }}</span>
            </li>
          </ul>
        </template>
      </UAlert>

      <UAlert
        v-if="reconciliationStatus?.dirty"
        color="info"
        variant="subtle"
        icon="i-fa7-solid:circle-info"
        :description="t('rulesEngineList.dirtyWarning')"
      />
      <p v-if="reconciliationStatus?.lastRunAt" class="text-xs text-muted">
        {{ t('rulesEngineList.lastRun', { date: formatRunDate(reconciliationStatus.lastRunAt) }) }}
      </p>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-fa7-solid:circle-xmark"
        :description="error"
      />
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
      <USelectMenu
        v-model="filters.type"
        :items="typeOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('rulesEngineList.filterType')"
        class="sm:w-48"
        @update:model-value="reload"
      />
      <USelectMenu
        v-model="filters.scope"
        :items="scopeOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('rulesEngineList.filterScope')"
        class="sm:w-48"
        @update:model-value="reload"
      />
      <USelectMenu
        v-model="filters.isActive"
        :items="statusOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('common.status')"
        class="sm:w-48"
        @update:model-value="reload"
      />
    </div>

    <AdminTable :data="rows" :columns="columns" :loading="loading">
      <template #name-cell="{ row }">
        <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
        <!-- Type and activity columns are hidden on phones. -->
        <div class="mt-1 flex flex-wrap items-center gap-1 md:hidden">
          <UBadge v-bind="typeBadge(row.original.type)" variant="subtle" size="sm" />
          <UBadge v-bind="activeBadge(row.original.isActive)" variant="subtle" size="sm" />
        </div>
      </template>
      <template #type-cell="{ row }">
        <UBadge v-bind="typeBadge(row.original.type)" variant="subtle" />
      </template>
      <template #scope-cell="{ row }">{{ scopeLabel(row.original.scope) }}</template>
      <!-- How often the conditions evaluated true. Zero is the signal: a rule that
           never fires, as opposed to one that fires and goes unread. -->
      <template #fired-cell="{ row }">
        <span :class="row.original.stats.fired === 0 ? 'text-muted' : 'font-semibold'">
          {{ row.original.stats.fired }}
        </span>
        <span v-if="row.original.stats.superseded > 0" class="ms-1 text-xs text-muted">
          {{ t('rulesEngineList.supersededSuffix', { count: row.original.stats.superseded }) }}
        </span>
      </template>
      <!-- Message rules only: badges have their own reveal and no recap to drown in. -->
      <template #seen-cell="{ row }">
        <span
          v-if="row.original.type === 'badge' || row.original.stats.delivered === 0"
          class="text-muted"
        >
          —
        </span>
        <span v-else>
          {{ seenRate(row.original.stats) }}%
          <UTooltip v-if="row.original.stats.recap > 0" :text="t('rulesEngineList.recapTooltip')">
            <span class="ms-1 text-xs text-warning">
              {{ t('rulesEngineList.recapSuffix', { count: row.original.stats.recap }) }}
            </span>
          </UTooltip>
        </span>
      </template>
      <template #isActive-cell="{ row }">
        <div class="flex items-center gap-2">
          <UBadge v-bind="activeBadge(row.original.isActive)" variant="subtle" />
          <UTooltip v-if="row.original.disabledReason" :text="row.original.disabledReason">
            <UIcon name="i-fa7-solid:triangle-exclamation" class="text-error" />
          </UTooltip>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="rowActions(row.original)" />
      </template>
      <template #empty>
        <div class="flex flex-col items-center gap-4 py-8">
          <p class="text-muted">{{ t('rulesEngineList.empty') }}</p>
          <UButton
            :label="t('rulesEngineList.createRule')"
            icon="i-fa7-solid:plus"
            to="/admin/rules-engine/new"
          />
        </div>
      </template>
    </AdminTable>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useAppToast } from '@/composables/useAppToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useRulesService } from '@/composables/rules/rules.service'
import type { ClientRule, CreateRuleData } from '@skol-arena/shared/types/index'

const { t } = useI18n()
const confirm = useConfirmDialog()
const {
  rules,
  loading,
  error,
  loadRules,
  deleteRule,
  createRule,
  getBadgeCount,
  firingStats,
  loadFiringStats,
  reconciliationStatus,
  loadReconciliationStatus,
  triggerReconciliation,
} = useRulesService()

/** Stands in while the stats call is still in flight. */
const EMPTY_STATS = {
  fired: 0,
  distinctPlayers: 0,
  selected: 0,
  superseded: 0,
  awarded: 0,
  delivered: 0,
  neverDelivered: 0,
  seen: 0,
  recap: 0,
}

/**
 * The rules with their firing counters attached. The stats endpoint already returns
 * a row per rule, zeros included, but the filters here narrow the rule list — hence
 * the lookup rather than using the stats payload directly.
 */
const rows = computed(() => {
  const byId = new Map(firingStats.value.map((s) => [s.ruleId, s]))
  return rules.value.map((rule) => ({ ...rule, stats: byId.get(rule.id) ?? EMPTY_STATS }))
})

/** Share of delivered messages that actually reached the player's eyes. */
function seenRate(stats: { seen: number; delivered: number }) {
  return Math.round((stats.seen / stats.delivered) * 100)
}

const reconciling = ref(false)
const toast = useAppToast()

/**
 * Rules the engine migration deactivated. Derived from the loaded list, so an active
 * filter can hide them — acceptable because no filter is applied by default, which is
 * when an admin would run into them.
 */
const migrationDisabled = computed(() => rules.value.filter((rule) => rule.disabledReason))

const filters = reactive<{
  type?: 'message' | 'badge'
  scope?: 'global' | 'discipline'
  isActive?: boolean
}>({})

const typeOptions = [
  { label: t('rulesEngineList.typeMessage'), value: 'message' },
  { label: t('rulesEngineList.typeBadge'), value: 'badge' },
]
const scopeOptions = [
  { label: t('rulesEngineList.scopeGlobal'), value: 'global' },
  { label: t('common.discipline'), value: 'discipline' },
]
const statusOptions = [
  { label: t('rulesEngineList.statusActive'), value: true },
  { label: t('rulesEngineList.statusInactive'), value: false },
]

type RuleRow = (typeof rows.value)[number]

const columns: TableColumn<RuleRow>[] = [
  { accessorKey: 'name', header: sortableHeader(t('common.name')) },
  {
    accessorKey: 'type',
    header: sortableHeader(t('rulesEngineList.colType')),
    meta: hiddenBelow('md'),
  },
  {
    accessorKey: 'triggerEvent',
    header: sortableHeader(t('rulesEngineList.colEvent')),
    meta: hiddenBelow('2xl'),
  },
  {
    accessorKey: 'scope',
    header: sortableHeader(t('rulesEngineList.colScope')),
    meta: hiddenBelow('xl'),
  },
  {
    accessorKey: 'priority',
    header: sortableHeader(t('rulesEngineList.colPriority')),
    meta: hiddenBelow('2xl'),
  },
  {
    id: 'fired',
    accessorFn: (rule) => rule.stats.fired,
    header: sortableHeader(t('rulesEngineList.colFired')),
    meta: hiddenBelow('lg'),
  },
  {
    id: 'seen',
    accessorFn: (rule) => rule.stats.seen,
    header: sortableHeader(t('rulesEngineList.colSeen')),
    meta: hiddenBelow('xl'),
  },
  {
    accessorKey: 'isActive',
    header: sortableHeader(t('rulesEngineList.colActive')),
    meta: hiddenBelow('md'),
  },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function typeBadge(type: string) {
  return {
    label: typeLabel(type),
    color: type === 'badge' ? ('warning' as const) : ('info' as const),
  }
}

function activeBadge(active: boolean) {
  return active
    ? { label: t('rulesEngineList.yes'), color: 'success' as const }
    : { label: t('rulesEngineList.no'), color: 'neutral' as const }
}

function rowActions(rule: ClientRule): RowAction[] {
  return [
    {
      label: t('rulesEngineList.tooltipStats'),
      icon: 'i-fa7-solid:chart-line',
      to: `/admin/rules-engine/${rule.id}/stats`,
    },
    { label: t('common.edit'), icon: 'i-fa7-solid:pen', to: `/admin/rules-engine/${rule.id}/edit` },
    {
      label: t('rulesEngineList.tooltipDuplicate'),
      icon: 'i-fa7-solid:copy',
      disabled: loading.value,
      onSelect: () => handleDuplicate(rule),
    },
    {
      label: t('common.delete'),
      icon: 'i-fa7-solid:trash',
      color: 'error',
      onSelect: () => confirmDelete(rule),
    },
  ]
}

function typeLabel(type: string) {
  return type === 'badge' ? t('rulesEngineList.typeBadge') : t('rulesEngineList.typeMessage')
}
function scopeLabel(scope: string) {
  return scope === 'discipline' ? t('common.discipline') : t('rulesEngineList.scopeGlobal')
}

function reload() {
  loadRules({ type: filters.type, scope: filters.scope, isActive: filters.isActive })
}

function formatRunDate(date: Date) {
  return new Date(date).toLocaleString('fr-FR')
}

async function handleReconcile() {
  reconciling.value = true
  const ok = await triggerReconciliation()
  reconciling.value = false
  toast.add({
    severity: ok ? 'success' : 'error',
    summary: ok ? t('rulesEngineList.recalcLaunchedSummary') : t('rulesEngineList.errorSummary'),
    detail: ok ? t('rulesEngineList.recalcDetail') : t('rulesEngineList.recalcErrorDetail'),
    life: 4000,
  })
}

async function handleDuplicate(rule: ClientRule) {
  const copy: CreateRuleData = {
    triggerEvent: rule.triggerEvent,
    type: rule.type,
    scope: rule.scope,
    disciplineId: rule.disciplineId,
    priority: rule.priority,
    name: t('rulesEngineList.copyName', { name: rule.name }),
    description: rule.description,
    conditions: rule.conditions,
    action: rule.action,
    isActive: false,
  }
  await createRule(copy)
}

/** A badge rule warns how many players would lose the badge it awarded. */
async function confirmDelete(rule: ClientRule) {
  const holders = rule.type === 'badge' ? await getBadgeCount(rule.id) : 0
  const message = t('rulesEngineList.deleteConfirm', { name: rule.name })
  const confirmed = await confirm({
    title: t('rulesEngineList.deleteDialogTitle'),
    message:
      holders > 0
        ? `${message}\n\n${t('rulesEngineList.badgeHolderWarning', { count: holders })}`
        : message,
    confirmLabel: t('common.delete'),
    color: 'error',
  })
  if (confirmed) await deleteRule(rule.id)
}

onMounted(() => {
  loadRules()
  loadFiringStats()
  loadReconciliationStatus()
})
</script>
