import {
  MATCH_COUNT_FACT,
  type MatchCountWindow,
  type RuleConditions,
} from '@skol-arena/shared/types/index'
import { toCalendarDate } from '@/utils/calendar-date'

/**
 * Internal builder representation of the condition tree. Easier to manipulate
 * with drag & drop than the keyed `all`/`any` json-rules-engine format.
 */
export type BuilderNode =
  | { kind: 'group'; operator: 'all' | 'any'; children: BuilderNode[] }
  | { kind: 'leaf'; fact: string; operator: string; value: unknown }
  // The season counter: the number of matches meeting `where`, compared with `value`.
  | { kind: 'count'; operator: string; value: unknown; where: GroupNode; window?: MatchCountWindow }

export type GroupNode = { kind: 'group'; operator: 'all' | 'any'; children: BuilderNode[] }

/** A palette block; its label is `conditionPalette.items.<paletteType>`. */
export type PaletteItem = {
  paletteType: 'leaf' | 'group-all' | 'group-any' | 'count'
}

/** Option for player-reference facts (winnerId / loserId). */
export interface PlayerOption {
  id: string
  displayName: string
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { paletteType: 'leaf' },
  { paletteType: 'group-all' },
  { paletteType: 'group-any' },
  { paletteType: 'count' },
]

export function emptyLeaf(): BuilderNode {
  return { kind: 'leaf', fact: '', operator: '', value: '' }
}

export function emptyGroup(operator: 'all' | 'any' = 'all'): BuilderNode {
  return { kind: 'group', operator, children: [] }
}

export function emptyCount(): BuilderNode {
  return {
    kind: 'count',
    operator: 'greaterThanInclusive',
    value: 1,
    where: { kind: 'group', operator: 'all', children: [emptyLeaf()] },
  }
}

/** Build a fresh BuilderNode from a dragged palette descriptor. */
export function nodeFromPalette(item: PaletteItem): BuilderNode {
  if (item.paletteType === 'group-all') return emptyGroup('all')
  if (item.paletteType === 'group-any') return emptyGroup('any')
  if (item.paletteType === 'count') return emptyCount()
  return emptyLeaf()
}

/** A bare node wrapped into an AND group, as the builder only edits groups at the top. */
export function ensureGroup(node: BuilderNode): GroupNode {
  return node.kind === 'group' ? node : { kind: 'group', operator: 'all', children: [node] }
}

/** Serialize the builder tree into the json-rules-engine conditions format. */
export function toConditions(node: BuilderNode): RuleConditions {
  if (node.kind === 'group') {
    const children = node.children.map(toConditions)
    return node.operator === 'all' ? { all: children } : { any: children }
  }
  if (node.kind === 'count') {
    return {
      fact: MATCH_COUNT_FACT,
      params: {
        conditions: toConditions(node.where),
        // The season is the default: stored rules keep the shape they always had.
        ...(node.window === 'discipline' ? { window: node.window } : {}),
      },
      operator: node.operator,
      value: node.value,
    }
  }
  return { fact: node.fact, operator: node.operator, value: node.value }
}

/** Parse json-rules-engine conditions into the builder tree. */
export function fromConditions(conditions: RuleConditions | null | undefined): BuilderNode {
  if (!conditions) return emptyGroup('all')
  if ('all' in conditions) {
    return { kind: 'group', operator: 'all', children: conditions.all.map(fromConditions) }
  }
  if ('any' in conditions) {
    return { kind: 'group', operator: 'any', children: conditions.any.map(fromConditions) }
  }
  if (conditions.fact === MATCH_COUNT_FACT) {
    return {
      kind: 'count',
      operator: conditions.operator,
      value: conditions.value,
      where: ensureGroup(fromConditions(conditions.params?.conditions)),
      window: conditions.params?.window,
    }
  }
  return { kind: 'leaf', fact: conditions.fact, operator: conditions.operator, value: conditions.value }
}

const COUNTER_SELECTOR = '[data-palette-type="count"], [data-condition-count]'

/** Whether a dragged block is, or holds, a counter: counters do not nest. */
export function holdsCounter(dragged: Element): boolean {
  return dragged.matches(COUNTER_SELECTOR) || dragged.querySelector(COUNTER_SELECTOR) !== null
}

/** True when the tree has at least one leaf with a fact + operator set. */
export function hasValidLeaf(node: BuilderNode): boolean {
  if (node.kind === 'leaf') return !!node.fact && !!node.operator
  if (node.kind === 'count') {
    return !!node.operator && typeof node.value === 'number' && hasValidLeaf(node.where)
  }
  return node.children.some(hasValidLeaf)
}

/** A `Date` revived by the HTTP interceptor, back to the `YYYY-MM-DD` it was sent as. */
export function restoreDateValue<T>(value: T): T | string {
  // Revived at local midnight, so the local calendar day is the original string.
  return value instanceof Date ? toCalendarDate(value)!.toString() : value
}

/**
 * The response interceptor turns every `YYYY-MM-DD` string into a `Date`, condition
 * values included: left as is, the date input cannot show them and a save sends an
 * ISO instant, shifted by the time zone, that no longer compares with `matchDate`.
 */
export function restoreDateValues(conditions: RuleConditions): RuleConditions {
  if ('all' in conditions) return { all: conditions.all.map(restoreDateValues) }
  if ('any' in conditions) return { any: conditions.any.map(restoreDateValues) }
  const { value, params } = conditions
  return {
    ...conditions,
    value: Array.isArray(value) ? value.map(restoreDateValue) : restoreDateValue(value),
    ...(params ? { params: { ...params, conditions: restoreDateValues(params.conditions) } } : {}),
  }
}
