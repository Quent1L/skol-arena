<template>
  <div>
    <UTable
      v-model:sorting="sorting"
      v-model:pagination="pagination"
      :data="data"
      :columns="columns"
      :loading="loading"
      :empty="empty"
      :pagination-options="paginationOptions"
      :ui="{ td: 'whitespace-normal', base: 'min-w-full' }"
    >
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
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
import { computed, ref } from 'vue'
import { getPaginationRowModel, type SortingState } from '@tanstack/vue-table'
import type { TableColumn } from '@nuxt/ui'

/**
 * UTable with the client-side sorting and pagination every admin list uses.
 * Cell slots (`#<column>-cell`, `#empty`…) are forwarded to UTable.
 */
const props = withDefaults(
  defineProps<{
    data: T[]
    columns: TableColumn<T>[]
    loading?: boolean
    empty?: string
    /** Rows per page; 0 disables pagination. */
    pageSize?: number
    initialSorting?: SortingState
  }>(),
  { loading: false, empty: undefined, pageSize: 10, initialSorting: () => [] },
)

const sorting = ref<SortingState>(props.initialSorting)
const pagination = ref({ pageIndex: 0, pageSize: props.pageSize || Number.MAX_SAFE_INTEGER })

const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }
const paginated = computed(() => props.pageSize > 0 && props.data.length > props.pageSize)

const page = computed({
  get: () => pagination.value.pageIndex + 1,
  set: (value: number) => (pagination.value = { ...pagination.value, pageIndex: value - 1 }),
})
</script>
