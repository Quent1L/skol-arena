import { h } from 'vue'
import type { Column } from '@tanstack/vue-table'
import UButton from '@nuxt/ui/components/Button.vue'

/**
 * Marks a header renderer built by `sortableHeader`: AdminTable reads it back to list the
 * column in its phone sort menu and to label the column in a row's details.
 */
export interface LabelledHeader {
  label: string
  sortable: boolean
}

/** Header cell that toggles the column's sorting, with the current direction as icon. */
export function sortableHeader<T>(label: string) {
  const render = ({ column }: { column: Column<T> }) => {
    const sorted = column.getIsSorted()
    const icon =
      sorted === 'asc'
        ? 'i-fa7-solid:arrow-up-short-wide'
        : sorted === 'desc'
          ? 'i-fa7-solid:arrow-down-wide-short'
          : 'i-fa7-solid:sort'
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      trailingIcon: icon,
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(sorted === 'asc'),
    })
  }
  return Object.assign(render, { label, sortable: true } satisfies LabelledHeader)
}

// Literal class strings so Tailwind picks them up.
const HIDDEN_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
} as const

/** Column `meta` hiding a secondary column on narrow screens. */
export function hiddenBelow(breakpoint: keyof typeof HIDDEN_BELOW) {
  const cls = HIDDEN_BELOW[breakpoint]
  return { class: { th: cls, td: cls } }
}

/** Column `meta` for a narrow trailing actions column. */
export const ACTIONS_COLUMN_META = { class: { th: 'w-0 text-right', td: 'text-right' } }
