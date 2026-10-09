<template>
  <div>
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <h1 class="text-2xl font-bold text-highlighted">
          {{ currentRule?.name ?? t('rulesEngineStats.title') }}
        </h1>
        <UBadge
          v-if="currentRule"
          :color="currentRule.type === 'badge' ? 'warning' : 'info'"
          variant="subtle"
          :label="typeLabel"
        />
      </div>
      <USelect
        v-model="days"
        :items="rangeOptions"
        class="w-full sm:w-44"
        @update:model-value="reload"
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

    <div v-if="totals" class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <UCard v-for="kpi in kpis" :key="kpi.label" :ui="{ body: 'p-3 sm:p-4' }">
        <p class="text-xs tracking-wide text-muted uppercase">{{ kpi.label }}</p>
        <p class="text-2xl font-bold" :class="kpi.tone">{{ kpi.value }}</p>
        <p v-if="kpi.hint" class="mt-1 text-xs text-muted">{{ kpi.hint }}</p>
      </UCard>
    </div>

    <UAlert
      v-if="totals && totals.fired === 0"
      color="info"
      variant="subtle"
      icon="i-fa7-solid:circle-info"
      :description="t('rulesEngineStats.neverFired')"
      class="mb-4"
    />
    <UAlert
      v-else-if="dropRate >= 50"
      color="warning"
      variant="subtle"
      icon="i-fa7-solid:triangle-exclamation"
      :description="t('rulesEngineStats.mostlyUnreadWarning', { percent: dropRate })"
      class="mb-4"
    />

    <!-- Timeline: bars normalised against the busiest day in the window, so a rule
         that fires twice a week is still readable next to one that fires hourly. -->
    <UCard v-if="detail?.timeline.length" class="mb-6">
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('rulesEngineStats.timelineTitle') }}</h2>
      </template>
      <div class="flex h-32 items-end gap-1 overflow-x-auto">
        <UTooltip v-for="day in detail.timeline" :key="day.day" :text="dayTooltip(day)">
          <div class="flex h-full min-w-2 flex-1 flex-col justify-end">
            <div class="rounded-t bg-primary" :style="{ height: `${barHeight(day.fired)}%` }" />
          </div>
        </UTooltip>
      </div>
      <p class="mt-2 text-xs text-muted">{{ t('rulesEngineStats.timelineFootnote', { days }) }}</p>
    </UCard>

    <UCard v-if="detail?.variants.length" class="mb-6">
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('rulesEngineStats.variantsTitle') }}</h2>
      </template>
      <AdminTable :data="detail.variants" :columns="variantColumns" :page-size="0">
        <template #position-cell="{ row }">
          <span v-if="row.original.current">#{{ row.original.position + 1 }}</span>
          <UBadge
            v-else
            color="neutral"
            variant="subtle"
            :label="t('rulesEngineStats.variantRetired')"
          />
        </template>
        <template #text-cell="{ row }">
          <span v-if="row.original.text" :class="{ 'text-muted': !row.original.current }">
            {{ row.original.text }}
          </span>
          <span v-else class="text-muted italic">{{
            t('rulesEngineStats.variantUnrecorded')
          }}</span>
        </template>
      </AdminTable>
      <!-- An edited variant leaves its history behind under the old wording rather
           than folding it into the new one, so the two counts stay honest. -->
      <p v-if="hasRetiredVariants" class="mt-2 text-xs text-muted">
        {{ t('rulesEngineStats.variantsFootnote') }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">{{ t('rulesEngineStats.recipientsTitle') }}</h2>
      </template>
      <AdminTable
        :data="detail?.recipients ?? []"
        :columns="recipientColumns"
        :loading="loading"
        :empty="t('rulesEngineStats.noRecipients')"
      >
        <template #playerName-cell="{ row }">
          <span class="font-medium">{{ row.original.playerName }}</span>
          <!-- Date and fate columns are hidden on phones. -->
          <div class="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted md:hidden">
            {{ formatDate(row.original.createdAt) }}
            <UBadge
              :color="fateColor(row.original)"
              variant="subtle"
              size="sm"
              :label="fateLabel(t, row.original)"
            />
          </div>
        </template>
        <template #createdAt-cell="{ row }">{{ formatDate(row.original.createdAt) }}</template>
        <template #result-cell="{ row }">
          <UBadge
            :color="resultColor(row.original.result)"
            variant="subtle"
            :label="t(`rulesEngineStats.result.${row.original.result}`)"
          />
        </template>
        <template #fate-cell="{ row }">
          <UBadge
            :color="fateColor(row.original)"
            variant="subtle"
            :label="fateLabel(t, row.original)"
          />
        </template>
        <template #message-cell="{ row }">
          <span class="text-sm">{{ row.original.message ?? '—' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <RowActions
            :actions="[
              {
                label: t('rulesEngineStats.openMatch'),
                icon: 'i-fa7-solid:arrow-up-right-from-square',
                to: `/matches/${row.original.matchId}`,
                hidden: !row.original.matchId,
              },
            ]"
          />
        </template>
      </AdminTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import AdminTable from '@/components/admin/AdminTable.vue'
import RowActions from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import { useRulesService } from '@/composables/rules/rules.service'
import { fateColor, fateLabel, resultColor } from '@/components/rules/firing-fate'
import type { ClientRuleFiringRecipient, RuleFiringDayStat } from '@skol-arena/shared/types/index'

const route = useRoute()
const { t } = useI18n()
const { currentRule, loadRuleById, firingDetail, loadFiringDetail, loading, error } =
  useRulesService()

const ruleId = route.params.id as string
const days = ref(30)

const rangeOptions = [
  { label: t('rulesEngineStats.range7'), value: 7 },
  { label: t('rulesEngineStats.range30'), value: 30 },
  { label: t('rulesEngineStats.range90'), value: 90 },
]

const detail = computed(() => firingDetail.value)
const totals = computed(() => firingDetail.value?.totals ?? null)
const typeLabel = computed(() =>
  currentRule.value?.type === 'badge'
    ? t('rulesEngineList.typeBadge')
    : t('rulesEngineList.typeMessage'),
)

/** Share of delivered messages that were consumed by the recap, which shows none. */
const dropRate = computed(() => {
  const stats = totals.value
  if (!stats || stats.delivered === 0) return 0
  return Math.round((stats.recap / stats.delivered) * 100)
})

const kpis = computed(() => {
  const stats = totals.value
  if (!stats) return []
  return [
    { label: t('rulesEngineStats.kpiFired'), value: stats.fired, tone: '', hint: '' },
    {
      label: t('rulesEngineStats.kpiPlayers'),
      value: stats.distinctPlayers,
      tone: '',
      hint: '',
    },
    {
      label: t('rulesEngineStats.kpiDelivered'),
      value: stats.delivered,
      tone: '',
      hint: t('rulesEngineStats.kpiNeverDeliveredHint', { count: stats.neverDelivered }),
    },
    {
      label: t('rulesEngineStats.kpiSeen'),
      value: stats.seen,
      tone: 'text-success',
      hint: '',
    },
    {
      label: t('rulesEngineStats.kpiRecap'),
      value: stats.recap,
      tone: stats.recap > 0 ? 'text-warning' : '',
      hint: t('rulesEngineStats.kpiRecapHint'),
    },
  ]
})

type VariantRow = NonNullable<typeof firingDetail.value>['variants'][number]

const variantColumns: TableColumn<VariantRow>[] = [
  { accessorKey: 'position', header: t('rulesEngineStats.colVariant') },
  { accessorKey: 'text', header: t('rulesEngineStats.colText') },
  { accessorKey: 'fired', header: sortableHeader(t('rulesEngineStats.colSent')) },
  {
    accessorKey: 'seen',
    header: sortableHeader(t('rulesEngineStats.colRead')),
    meta: hiddenBelow('sm'),
  },
]

const recipientColumns: TableColumn<ClientRuleFiringRecipient>[] = [
  { accessorKey: 'playerName', header: t('rulesEngineStats.colPlayer') },
  { accessorKey: 'createdAt', header: t('rulesEngineStats.colDate'), meta: hiddenBelow('md') },
  { accessorKey: 'result', header: t('rulesEngineStats.colResult'), meta: hiddenBelow('lg') },
  { id: 'fate', header: t('rulesEngineStats.colFate'), meta: hiddenBelow('md') },
  { accessorKey: 'message', header: t('rulesEngineStats.colMessage'), meta: hiddenBelow('xl') },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

const hasRetiredVariants = computed(() => (detail.value?.variants ?? []).some((v) => !v.current))

const peak = computed(() => Math.max(1, ...(detail.value?.timeline ?? []).map((d) => d.fired)))

function barHeight(fired: number) {
  return Math.max(4, Math.round((fired / peak.value) * 100))
}

function dayTooltip(day: RuleFiringDayStat) {
  return t('rulesEngineStats.dayTooltip', {
    day: day.day,
    fired: day.fired,
    seen: day.seen,
    recap: day.recap,
  })
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString('fr-FR')
}

function reload() {
  loadFiringDetail(ruleId, days.value)
}

onMounted(() => {
  loadRuleById(ruleId)
  reload()
})
</script>
