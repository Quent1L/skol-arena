<template>
  <template v-if="cell">
    <slot v-bind="cell.getContext()">
      <FlexRender
        v-if="cell.column.columnDef.cell"
        :render="cell.column.columnDef.cell"
        :props="cell.getContext()"
      />
      <template v-else>{{ cell.getValue() ?? '—' }}</template>
    </slot>
  </template>
</template>

<script setup lang="ts" generic="T">
import { computed } from 'vue'
import { FlexRender, type Row } from '@tanstack/vue-table'

/**
 * One cell of a row, outside the table: what the column would have shown in place.
 * The default slot takes the caller's `#<column>-cell` template when there is one.
 */
const props = defineProps<{ row: Row<T>; columnId: string }>()

const cell = computed(() => props.row.getAllCells().find((c) => c.column.id === props.columnId))
</script>
