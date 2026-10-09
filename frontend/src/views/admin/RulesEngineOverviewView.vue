<template>
  <div>
    <AdminPageHeader
      :title="t('rulesEngineOverview.title')"
      :description="t('rulesEngineOverview.description')"
    >
      <template #actions>
        <USelect
          v-model="days"
          :items="rangeOptions"
          class="w-full sm:w-44"
          @update:model-value="loadOverview"
        />
        <UButton
          :label="t('rulesEngineOverview.refresh')"
          icon="i-fa7-solid:rotate"
          color="neutral"
          variant="outline"
          :loading="overviewLoading"
          @click="refresh"
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

    <div v-if="overview" class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <UCard v-for="kpi in kpis" :key="kpi.label" :ui="{ body: 'p-3 sm:p-4' }">
        <p class="text-xs tracking-wide text-muted uppercase">{{ kpi.label }}</p>
        <p class="text-2xl font-bold" :class="kpi.tone">{{ kpi.value }}</p>
        <p v-if="kpi.hint" class="mt-1 text-xs text-muted">{{ kpi.hint }}</p>
      </UCard>
    </div>

    <UCard v-if="overview" class="mb-6">
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('rulesEngineStats.timelineTitle') }}</h2>
      </template>
      <RuleFiringTimeline :timeline="overview.timeline" :days="overview.days" />
    </UCard>

    <UCard class="mb-6">
      <template #header>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="font-semibold text-highlighted">{{ t('rulesEngineOverview.rulesTitle') }}</h2>
          <USwitch v-model="silentOnly" :label="t('rulesEngineOverview.silentOnly')" />
        </div>
      </template>
      <AdminTable
        :data="rankedRules"
        :columns="ruleColumns"
        :loading="overviewLoading"
        :initial-sorting="[{ id: 'fired', desc: true }]"
        :empty="t('rulesEngineOverview.noRules')"
      >
        <template #name-cell="{ row }">
          <RouterLink
            :to="`/admin/rules-engine/${row.original.ruleId}/stats`"
            class="font-semibold text-highlighted hover:underline"
          >
            {{ row.original.name }}
          </RouterLink>
          <!-- Type and activity are hidden on phones. -->
          <div class="mt-1 flex flex-wrap items-center gap-1 md:hidden">
            <UBadge v-bind="typeBadge(row.original.type)" variant="subtle" size="sm" />
            <UBadge
              v-if="!row.original.isActive"
              :label="t('rulesEngineList.statusInactive')"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </template>
        <template #type-cell="{ row }">
          <UBadge v-bind="typeBadge(row.original.type)" variant="subtle" />
        </template>
        <template #fired-cell="{ row }">
          <span :class="row.original.fired === 0 ? 'text-muted' : 'font-semibold'">
            {{ row.original.fired }}
          </span>
        </template>
        <template #seenRate-cell="{ row }">
          <span v-if="row.original.seenRate === null" class="text-muted">—</span>
          <span v-else :class="{ 'text-warning': row.original.seenRate < 50 }">
            {{ row.original.seenRate }}%
          </span>
        </template>
        <template #lastFiredAt-cell="{ row }">
          <span v-if="row.original.lastFiredAt">{{
            row.original.lastFiredAt.toLocaleString(locale)
          }}</span>
          <span v-else class="text-muted">{{ t('rulesEngineOverview.never') }}</span>
        </template>
        <template #isActive-cell="{ row }">
          <UBadge
            :label="
              row.original.isActive
                ? t('rulesEngineList.statusActive')
                : t('rulesEngineList.statusInactive')
            "
            :color="row.original.isActive ? 'success' : 'neutral'"
            variant="subtle"
          />
        </template>
      </AdminTable>
    </UCard>

    <RuleFiringFeed ref="feedRef" :rules="overview?.rules ?? []" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTable from '@/components/admin/AdminTable.vue'
import RuleFiringFeed from '@/components/rules/RuleFiringFeed.vue'
import RuleFiringTimeline from '@/components/rules/RuleFiringTimeline.vue'
import { hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useRuleFiringOverview } from '@/composables/rules/rule-firing-overview.service'

const { t, locale } = useI18n()
const { overview, overviewLoading, error, loadOverview } = useRuleFiringOverview()
const feedRef = useTemplateRef<InstanceType<typeof RuleFiringFeed>>('feedRef')

const days = ref(30)
const silentOnly = ref(false)

const rangeOptions = [
  { label: t('rulesEngineStats.range7'), value: 7 },
  { label: t('rulesEngineStats.range30'), value: 30 },
  { label: t('rulesEngineStats.range90'), value: 90 },
]

/** Share of delivered messages that were read; null when none was delivered. */
function readRate(stats: { seen: number; delivered: number }) {
  return stats.delivered === 0 ? null : Math.round((stats.seen / stats.delivered) * 100)
}

const kpis = computed(() => {
  const data = overview.value
  if (!data) return []
  const window = data.windowTotals
  const active = data.rules.filter((r) => r.isActive)
  const silent = active.filter((r) => r.fired === 0).length
  const rate = readRate(window)
  return [
    {
      label: t('rulesEngineStats.kpiFired'),
      value: window.fired,
      tone: '',
      hint: t('rulesEngineOverview.kpiAllTimeHint', { count: data.totals.fired }),
    },
    { label: t('rulesEngineStats.kpiPlayers'), value: window.distinctPlayers, tone: '', hint: '' },
    {
      label: t('rulesEngineOverview.kpiActiveRules'),
      value: `${active.length} / ${data.rules.length}`,
      tone: '',
      hint: silent > 0 ? t('rulesEngineOverview.kpiSilentHint', { count: silent }, silent) : '',
    },
    {
      label: t('rulesEngineOverview.kpiReadRate'),
      value: rate === null ? '—' : `${rate}%`,
      tone: rate !== null && rate < 50 ? 'text-warning' : 'text-success',
      hint: t('rulesEngineOverview.kpiReadRateHint', {
        seen: window.seen,
        delivered: window.delivered,
      }),
    },
    {
      label: t('rulesEngineStats.kpiRecap'),
      value: window.recap,
      tone: window.recap > 0 ? 'text-warning' : '',
      hint: t('rulesEngineStats.kpiRecapHint'),
    },
    { label: t('rulesEngineOverview.kpiBadges'), value: window.awarded, tone: '', hint: '' },
  ]
})

/**
 * All-time counters per rule. "Silent" narrows to active rules that never fired —
 * the ones whose conditions may be unreachable.
 */
const rankedRules = computed(() =>
  (overview.value?.rules ?? [])
    .filter((rule) => !silentOnly.value || (rule.isActive && rule.fired === 0))
    .map((rule) => ({ ...rule, seenRate: rule.type === 'badge' ? null : readRate(rule) })),
)

type RankedRule = (typeof rankedRules.value)[number]

const ruleColumns: TableColumn<RankedRule>[] = [
  { accessorKey: 'name', header: sortableHeader(t('common.name')) },
  {
    accessorKey: 'type',
    header: sortableHeader(t('rulesEngineList.colType')),
    meta: hiddenBelow('md'),
  },
  { accessorKey: 'fired', header: sortableHeader(t('rulesEngineList.colFired')) },
  {
    id: 'seenRate',
    accessorFn: (rule) => rule.seenRate ?? -1,
    header: sortableHeader(t('rulesEngineList.colSeen')),
    meta: hiddenBelow('lg'),
  },
  {
    id: 'lastFiredAt',
    accessorFn: (rule) => rule.lastFiredAt?.getTime() ?? 0,
    header: sortableHeader(t('rulesEngineOverview.colLastFired')),
    meta: hiddenBelow('lg'),
  },
  {
    accessorKey: 'isActive',
    header: sortableHeader(t('rulesEngineList.colActive')),
    meta: hiddenBelow('md'),
  },
]

function typeBadge(type: string) {
  return type === 'badge'
    ? { label: t('rulesEngineList.typeBadge'), color: 'warning' as const }
    : { label: t('rulesEngineList.typeMessage'), color: 'info' as const }
}

function refresh() {
  loadOverview(days.value)
  feedRef.value?.refresh()
}

onMounted(() => loadOverview(days.value))
</script>
