import { computed, type Ref } from 'vue'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { TableColumn } from '@nuxt/ui'
import type { LabelledHeader } from './table-columns'

type Breakpoint = keyof typeof breakpointsTailwind

/** Id of the column AdminTable appends to expand a row on narrow screens. */
export const EXPAND_COLUMN_ID = '__details'

const HIDDEN_BELOW_RE = /\bhidden (sm|md|lg|xl|2xl):table-cell\b/

export function columnId<T>(column: TableColumn<T>): string {
  if (column.id) return column.id
  return 'accessorKey' in column ? String(column.accessorKey) : ''
}

/** The breakpoint below which `hiddenBelow()` hides this column, if any. */
function hiddenBelowBreakpoint<T>(column: TableColumn<T>): Breakpoint | null {
  const td = (column.meta?.class as { td?: unknown } | undefined)?.td
  const match = typeof td === 'string' ? HIDDEN_BELOW_RE.exec(td) : null
  return match ? (match[1] as Breakpoint) : null
}

function labelledHeader<T>(column: TableColumn<T>): Partial<LabelledHeader> {
  const header = column.header as unknown
  if (typeof header === 'string') return { label: header, sortable: false }
  return typeof header === 'function' ? (header as Partial<LabelledHeader>) : {}
}

/** The header text of a column, for the row details and the sort menu. */
export function columnLabel<T>(column: TableColumn<T>): string {
  return labelledHeader(column).label ?? columnId(column)
}

/**
 * Phone support for the admin tables. Secondary columns are hidden below a breakpoint
 * (`hiddenBelow()`); this lists the ones hidden at the current width so a row can show
 * them when expanded, and the sortable ones so a menu can sort by a column whose header
 * is not on screen.
 */
export function useResponsiveColumns<T>(columns: Ref<TableColumn<T>[]>) {
  const breakpoints = useBreakpoints(breakpointsTailwind)

  const detailColumns = computed(() =>
    columns.value.filter((column) => {
      const breakpoint = hiddenBelowBreakpoint(column)
      return breakpoint !== null && !breakpoints.greaterOrEqual(breakpoint).value
    }),
  )

  const sortOptions = computed(() =>
    columns.value
      .filter((column) => labelledHeader(column).sortable)
      .map((column) => ({ label: columnLabel(column), value: columnId(column) })),
  )

  const tableColumns = computed<TableColumn<T>[]>(() =>
    detailColumns.value.length === 0
      ? columns.value
      : [
          ...columns.value,
          { id: EXPAND_COLUMN_ID, header: '', meta: { class: { th: 'w-0', td: 'w-0 pl-0' } } },
        ],
  )

  const isNarrow = computed(() => !breakpoints.greaterOrEqual('md').value)

  return { detailColumns, sortOptions, tableColumns, isNarrow }
}
