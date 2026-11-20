import {
  computed,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface SubTabOption<V extends string = string> {
  value: V
  label: string
}

export interface UseSubTabsOptions<V extends string> {
  options: MaybeRefOrGetter<readonly SubTabOption<V>[]>
  /** Query param carrying the active sub-tab. Omitted: the state stays local. */
  queryKey?: string
  /** The value that leaves the URL clean. Defaults to the first option. */
  defaultValue?: MaybeRefOrGetter<V>
}

export interface UseSubTabs<V extends string> {
  active: Ref<V>
  activeIndex: ComputedRef<number>
  values: ComputedRef<V[]>
  setActive: (value: V) => void
}

/**
 * Shared state for a set of exclusive sub-tabs, whatever renders them (the desktop
 * sidebar or the mobile drag track).
 *
 * The active value is restored from the URL on setup only, like the tabs it replaces:
 * both renderers are unmounted when the user navigates away, so the query is re-read on
 * the way back and no watcher is needed.
 */
export function useSubTabs<V extends string>(opts: UseSubTabsOptions<V>): UseSubTabs<V> {
  const route = useRoute()
  // Undefined outside a router context, e.g. a component mounted in a unit test.
  const router = useRouter()

  const values = computed(() => toValue(opts.options).map((option) => option.value))
  const fallback = () => toValue(opts.defaultValue) ?? values.value[0]

  function fromQuery(): V | undefined {
    if (!opts.queryKey) return undefined
    const raw = route?.query[opts.queryKey]
    const candidate = (Array.isArray(raw) ? raw[0] : raw) as V | undefined
    // A view can be offered or not depending on props, so the URL may name one that
    // does not exist here (`?lbMode=peak` on an ongoing season).
    return candidate && values.value.includes(candidate) ? candidate : undefined
  }

  const active = ref(fromQuery() ?? fallback()) as Ref<V>

  const activeIndex = computed(() => Math.max(0, values.value.indexOf(active.value)))

  function setActive(value: V) {
    active.value = value
    if (!opts.queryKey || !router || !route) return
    const isDefault = value === fallback()
    router.replace({ query: { ...route.query, [opts.queryKey]: isDefault ? undefined : value } })
  }

  // Options are derived from props, which can arrive late or change (a season that ends
  // drops the provisional view). The active value must not survive its own option.
  watch(values, (list) => {
    if (!list.includes(active.value)) active.value = fallback()
  })

  return { active, activeIndex, values, setActive }
}

/** Indexes whose content is mounted around the active one. */
export function subTabWindow(activeIndex: number, length: number, radius: number): number[] {
  const indexes: number[] = []
  for (let i = 0; i < length; i++) {
    if (Math.abs(i - activeIndex) <= radius) indexes.push(i)
  }
  return indexes
}
