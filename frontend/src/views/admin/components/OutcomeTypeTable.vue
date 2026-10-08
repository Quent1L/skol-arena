<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold text-highlighted">Types de résultat</h2>
      <UButton
        label="Ajouter un type"
        icon="i-fa7-solid:plus"
        size="sm"
        @click="emit('add-outcome-type')"
      />
    </div>

    <UTable
      v-model:expanded="expandedRows"
      :data="outcomeTypes"
      :columns="columns"
      :loading="loading"
      :get-row-id="(row: OutcomeType) => row.id"
      empty="Aucun type de résultat"
      :ui="{ td: 'whitespace-normal' }"
    >
      <template #expand-cell="{ row }">
        <UButton
          :icon="row.getIsExpanded() ? 'i-fa7-solid:chevron-down' : 'i-fa7-solid:chevron-right'"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`Raisons pour ${row.original.name}`"
          :aria-expanded="row.getIsExpanded()"
          @click="row.toggleExpanded()"
        />
      </template>
      <template #name-cell="{ row }">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium" :class="{ 'opacity-60': row.original.archivedAt }">
            {{ row.original.name }}
          </span>
          <UBadge v-if="row.original.isDefault" label="Par défaut" color="success" variant="subtle" />
          <UBadge v-if="row.original.archivedAt" label="Archivé" color="neutral" variant="subtle" />
        </div>
        <!-- The numeric columns are hidden on phones: keep their values reachable. -->
        <p class="mt-1 text-xs text-muted sm:hidden">
          {{ row.original.points }} pts · MMR ×{{ row.original.mmrMultiplier }}
        </p>
      </template>
      <template #actions-cell="{ row }">
        <RowActions :actions="typeActions(row.original)" />
      </template>

      <template #expanded="{ row }">
        <div class="space-y-3 py-2 sm:ps-10">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">Raisons pour "{{ row.original.name }}"</h3>
            <UButton
              label="Ajouter une raison"
              icon="i-fa7-solid:plus"
              size="xs"
              variant="soft"
              @click="emit('add-outcome-reason', row.original)"
            />
          </div>
          <ul
            v-if="getOutcomeReasonsForType(row.original.id).length"
            class="divide-y divide-default rounded-md border border-default"
          >
            <li
              v-for="reason in getOutcomeReasonsForType(row.original.id)"
              :key="reason.id"
              class="flex items-center justify-between gap-2 px-3 py-1.5"
            >
              <span class="text-sm">{{ reason.name }}</span>
              <RowActions :actions="reasonActions(row.original, reason)" />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">Aucune raison de résultat</p>
        </div>
      </template>
    </UTable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import RowActions, { type RowAction } from '@/components/ui/RowActions.vue'
import { ACTIONS_COLUMN_META, hiddenBelow, sortableHeader } from '@/components/admin/table-columns'
import type { OutcomeType } from '@skol-arena/shared/types/outcome-type'
import type { OutcomeReason } from '@skol-arena/shared/types/outcome-reason'

interface Props {
  outcomeTypes: OutcomeType[]
  outcomeReasons: OutcomeReason[]
  loading: boolean
  loadOutcomeReasons: (outcomeTypeId: string) => Promise<void>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'add-outcome-type': []
  'edit-outcome-type': [outcomeType: OutcomeType]
  'delete-outcome-type': [outcomeType: OutcomeType]
  'restore-outcome-type': [outcomeType: OutcomeType]
  'add-outcome-reason': [outcomeType: OutcomeType]
  'edit-outcome-reason': [outcomeType: OutcomeType, outcomeReason: OutcomeReason]
  'delete-outcome-reason': [outcomeReason: OutcomeReason]
}>()

const expandedRows = ref<Record<string, boolean>>({})
const loadedOutcomeTypeIds = ref<Set<string>>(new Set())

// Computed that derives reasons by type from the props (updates automatically)
const outcomeReasonsByType = computed(() => {
  const map = new Map<string, OutcomeReason[]>()
  props.outcomeReasons.forEach((reason) => {
    if (!map.has(reason.outcomeTypeId)) {
      map.set(reason.outcomeTypeId, [])
    }
    map.get(reason.outcomeTypeId)!.push(reason)
  })
  return map
})

const columns: TableColumn<OutcomeType>[] = [
  { id: 'expand', meta: { class: { th: 'w-0', td: 'w-0' } } },
  { accessorKey: 'name', header: sortableHeader('Nom') },
  { accessorKey: 'points', header: 'Pts / résultat', meta: hiddenBelow('sm') },
  { accessorKey: 'mmrMultiplier', header: 'MMR multiplier', meta: hiddenBelow('sm') },
  { id: 'actions', meta: ACTIONS_COLUMN_META },
]

function typeActions(outcomeType: OutcomeType): RowAction[] {
  return [
    {
      label: 'Modifier',
      icon: 'i-fa7-solid:pen',
      onSelect: () => emit('edit-outcome-type', outcomeType),
    },
    {
      label: 'Restaurer',
      icon: 'i-fa7-solid:rotate-left',
      hidden: !outcomeType.archivedAt,
      onSelect: () => emit('restore-outcome-type', outcomeType),
    },
    {
      label: 'Supprimer',
      icon: 'i-fa7-solid:trash',
      color: 'error',
      hidden: !!outcomeType.archivedAt,
      onSelect: () => emit('delete-outcome-type', outcomeType),
    },
  ]
}

function reasonActions(outcomeType: OutcomeType, reason: OutcomeReason): RowAction[] {
  return [
    {
      label: 'Modifier',
      icon: 'i-fa7-solid:pen',
      onSelect: () => emit('edit-outcome-reason', outcomeType, reason),
    },
    {
      label: 'Supprimer',
      icon: 'i-fa7-solid:trash',
      color: 'error',
      onSelect: () => emit('delete-outcome-reason', reason),
    },
  ]
}

// Reasons are fetched the first time a type is expanded.
watch(
  expandedRows,
  (expanded) => {
    for (const [outcomeTypeId, isOpen] of Object.entries(expanded)) {
      if (isOpen && !loadedOutcomeTypeIds.value.has(outcomeTypeId)) {
        loadOutcomeReasonsForType(outcomeTypeId)
      }
    }
  },
  { deep: true },
)

async function loadOutcomeReasonsForType(outcomeTypeId: string) {
  try {
    await props.loadOutcomeReasons(outcomeTypeId)
    loadedOutcomeTypeIds.value.add(outcomeTypeId)
  } catch (err) {
    console.error('Erreur lors du chargement des raisons:', err)
  }
}

function getOutcomeReasonsForType(outcomeTypeId: string): OutcomeReason[] {
  return outcomeReasonsByType.value.get(outcomeTypeId) || []
}

// Expose expandedRows to allow cleanup when a type is deleted
defineExpose({
  expandedRows,
})
</script>
