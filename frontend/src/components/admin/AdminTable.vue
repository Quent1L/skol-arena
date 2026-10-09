<template>
  <div>
    <!-- Below md the sortable headers may be off screen: the sort lives in a menu too. -->
    <div v-if="isNarrow && sortOptions.length > 0" class="mb-3 flex items-center gap-2">
      <USelect
        v-model="sortColumn"
        :items="sortOptions"
        :placeholder="t('adminTable.sortBy')"
        :aria-label="t('adminTable.sortBy')"
        class="min-w-0 flex-1"
      />
      <UButton
        color="neutral"
        variant="outline"
        :icon="sortDesc ? 'i-fa7-solid:arrow-down-wide-short' : 'i-fa7-solid:arrow-up-short-wide'"
        :aria-label="sortDesc ? t('adminTable.descending') : t('adminTable.ascending')"
        :disabled="!sortColumn"
        @click="toggleSortDirection"
      />
    </div>

    <UTable
      v-model:sorting="sorting"
      v-model:pagination="pagination"
      v-model:expanded="expanded"
      :data="data"
      :columns="tableColumns"
      :loading="loading"
      :empty="empty"
      :sorting-options="sortingOptions"
      :pagination-options="paginationOptions"
      :ui="{ td: 'whitespace-normal', base: 'min-w-full' }"
    >
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>

      <template #[`${EXPAND_COLUMN_ID}-cell`]="{ row }">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="row.getIsExpanded() ? 'i-fa7-solid:chevron-up' : 'i-fa7-solid:chevron-down'"
          :aria-label="t('adminTable.showDetails')"
          :aria-expanded="row.getIsExpanded()"
          @click="row.toggleExpanded()"
        />
      </template>

      <template #expanded="{ row }">
        <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <template v-for="column in detailColumns" :key="columnId(column)">
            <dt class="text-muted">{{ columnLabel(column) }}</dt>
            <dd class="min-w-0 break-words">
              <AdminTableCell :row="row" :column-id="columnId(column)">
                <template v-if="$slots[`${columnId(column)}-cell`]" #default="cellProps">
                  <slot :name="`${columnId(column)}-cell`" v-bind="cellProps" />
                </template>
              </AdminTableCell>
            </dd>
          </template>
        </dl>
      </template>
    </UTable>

    <div v-if="paginated" class="flex justify-center border-t border-default pt-3">
      <UPagination
        v-model:page="page"
        :items-per-page="pageSize"
        :total="data.length"
        :sibling-count="1"
        size="sm"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getPaginationRowModel,
  type ExpandedState,
  type SortingOptions,
  type SortingState,
} from '@tanstack/vue-table'
import type { TableColumn } from '@nuxt/ui'
import AdminTableCell from './AdminTableCell.vue'
import {
  EXPAND_COLUMN_ID,
  columnId,
  columnLabel,
  useResponsiveColumns,
} from './useResponsiveColumns'

/**
 * UTable with the client-side sorting and pagination every admin list uses.
 * Cell slots (`#<column>-cell`, `#empty`…) are forwarded to UTable.
 *
 * On a phone, columns hidden by `hiddenBelow()` are not lost: each row gets a toggle
 * that lists them under it, rendered by the same cell slots, and a menu sorts by any
 * `sortableHeader()` column, including the hidden ones.
 */
const props = withDefaults(
  defineProps<{
    data: T[]
    columns: TableColumn<T>[]
    loading?: boolean
    empty?: string
    /** Rows per page; 0 disables pagination (the caller pages, or shows everything). */
    pageSize?: number
    initialSorting?: SortingState
    /** e.g. `{ manualSorting: true }` when the server sorts. */
    sortingOptions?: Partial<SortingOptions<T>>
  }>(),
  {
    loading: false,
    empty: undefined,
    pageSize: 10,
    initialSorting: () => [],
    sortingOptions: undefined,
  },
)

const sorting = defineModel<SortingState>('sorting', { default: undefined })
if (sorting.value === undefined) sorting.value = props.initialSorting

const { t } = useI18n()
const { detailColumns, sortOptions, tableColumns, isNarrow } = useResponsiveColumns(
  toRef(props, 'columns'),
)

const expanded = ref<ExpandedState>({})
const pagination = ref({ pageIndex: 0, pageSize: props.pageSize || Number.MAX_SAFE_INTEGER })

const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }
const paginated = computed(() => props.pageSize > 0 && props.data.length > props.pageSize)

const page = computed({
  get: () => pagination.value.pageIndex + 1,
  set: (value: number) => (pagination.value = { ...pagination.value, pageIndex: value - 1 }),
})

const sortDesc = computed(() => sorting.value?.[0]?.desc ?? false)
const sortColumn = computed({
  get: () => sorting.value?.[0]?.id,
  set: (id: string | undefined) => {
    sorting.value = id ? [{ id, desc: sortDesc.value }] : []
  },
})

function toggleSortDirection() {
  if (sortColumn.value) sorting.value = [{ id: sortColumn.value, desc: !sortDesc.value }]
}
</script>
