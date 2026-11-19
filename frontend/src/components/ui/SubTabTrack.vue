<template>
  <div ref="rootRef">
    <!--
      Sticks to the top of the viewport on its own, without the surrounding header, so the
      panes can be scrolled while staying one tap away from each other. `top-0` is enough
      because AppHeader scrolls away with the page rather than being fixed.
    -->
    <div class="sticky top-0 z-20 bg-gray-50 dark:bg-gray-900 px-3 py-1.5">
      <div
        role="tablist"
        :aria-label="label"
        class="relative flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5 shadow-sm"
      >
        <!--
          One pill shared by every tab rather than a background per button, so it can
          travel continuously with the drag instead of jumping once the swipe commits.
          Its offset and the label colours are written by `applyVisuals` rather than
          bound: they change on every touchmove, and re-rendering a template this size at
          touch frequency is what made swiping stutter.
        -->
        <span
          ref="pillRef"
          class="subtab-synced subtab-synced-transform absolute top-0.5 bottom-0.5 left-0.5 rounded-md bg-primary-500 shadow-md"
          :style="{ width: `calc((100% - 0.25rem) / ${options.length})` }"
        />
        <button
          v-for="(option, index) in options"
          :key="option.value"
          :ref="(el) => setLabelRef(el, index)"
          role="tab"
          :aria-selected="current === option.value"
          class="subtab-synced subtab-synced-color relative flex-1 h-7 px-1 truncate text-[11px] font-semibold uppercase tracking-wide [--subtab-idle:var(--color-gray-500)] dark:[--subtab-idle:var(--color-gray-400)]"
          :data-test="`subtab-${option.value}`"
          @click="select(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div class="relative overflow-hidden">
      <!--
        Every pane stays mounted side by side in a flex track, so the finger can drag the
        track directly and whatever the panes embed (Chart.js canvases) is never rebuilt.
      -->
      <div ref="trackRef" class="subtab-synced subtab-synced-transform flex">
        <!--
          The idle panes are collapsed to zero height so the page scrolls to the active
          one, not to the tallest. They are re-expanded for the whole drag *and* for the
          settle animation that follows it. The inner wrapper is never collapsed, so it
          can be measured at any time, and it carries the scroll-alignment shift (see
          `measurePaneShifts`).
        -->
        <div
          v-for="(option, index) in options"
          :key="option.value"
          class="w-full shrink-0"
          :class="{ 'max-h-0 overflow-hidden': !allPanesExpanded && current !== option.value }"
          :aria-hidden="current !== option.value"
          :inert="current !== option.value"
        >
          <div
            :ref="(el) => setPaneRef(el, index)"
            :class="paneClass"
            :style="{ transform: `translateY(${paneShifts[index] ?? 0}px)` }"
          >
            <slot v-if="renderedIndexes.includes(index)" :name="option.value" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="V extends string">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEventListener, useSwipe } from '@vueuse/core'
import { subTabWindow, type SubTabOption } from '@/composables/ui/useSubTabs'

const props = withDefaults(
  defineProps<{
    options: readonly SubTabOption<V>[]
    modelValue: V
    label?: string
    /** Panes are dragged only while this is true (the track can sit under a hidden tab). */
    enabled?: boolean
    /**
     * Element whose trailing padding keeps content clear of a fixed bottom bar; it is
     * subtracted when aligning the panes. Defaults to the track itself.
     */
    scrollRoot?: HTMLElement | null
    /** How many panes on each side of the active one keep their content mounted. */
    renderRadius?: number
    /** Padding of each pane. Replaced rather than merged, so it can be dropped entirely. */
    paneClass?: string
  }>(),
  { enabled: true, scrollRoot: null, renderRadius: 1, label: undefined, paneClass: 'p-2' },
)

const emit = defineEmits<{
  'update:modelValue': [V]
  'visible-values': [V[]]
}>()

/** Must match the `.subtab-synced` transition duration. */
const SETTLE_MS = 140
/** Movement below this is still ambiguous, so the drag axis is not locked yet. */
const AXIS_LOCK_PX = 8
/** Past a quarter of the viewport width the swipe commits instead of snapping back. */
const COMMIT_RATIO = 0.25
const COMMIT_MIN_PX = 60

const rootRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const pillRef = ref<HTMLElement | null>(null)
const labelEls = ref<(HTMLElement | null)[]>([])
const paneEls = ref<(HTMLElement | null)[]>([])
const paneShifts = ref<number[]>([])
const allPanesExpanded = ref(false)

let dragAxis: 'none' | 'x' | 'y' = 'none'
let dragOffset = 0
let gestureWidth = 0
let collapseTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Mirrors `modelValue` but is written synchronously on commit: the settle animation is
 * placed from the new position in the same tick, before the parent has re-rendered.
 */
const current = ref(props.modelValue)
const values = computed(() => props.options.map((option) => option.value))
const currentIndex = computed(() => Math.max(0, values.value.indexOf(current.value)))

const renderedIndexes = computed(() =>
  subTabWindow(currentIndex.value, props.options.length, props.renderRadius),
)

watch(
  renderedIndexes,
  (indexes) => emit('visible-values', indexes.map((i) => values.value[i]!)),
  { immediate: true },
)

function setLabelRef(el: unknown, index: number) {
  labelEls.value[index] = (el as HTMLElement | null) ?? null
}

function setPaneRef(el: unknown, index: number) {
  paneEls.value[index] = (el as HTMLElement | null) ?? null
}

/** Elements whose transition and layer hints are driven by hand during a gesture. */
function animatedEls() {
  return [trackRef.value, pillRef.value, ...labelEls.value]
}

/** Where the switcher sits between the panes once settled, as a pane index. */
function settledProgress() {
  return currentIndex.value
}

/**
 * Panes, pill and label colours all derive from one progress value, so they cannot drift
 * apart. Written straight to the DOM instead of through bindings: this runs on every
 * touchmove, and re-rendering a template this size at touch frequency is what made a
 * swipe stutter.
 */
function applyVisuals(progress: number) {
  const position = Math.min(props.options.length - 1, Math.max(0, progress))

  if (trackRef.value) trackRef.value.style.transform = `translateX(${-position * 100}%)`
  // The pill is exactly one slot wide, so a full slot is one of its own widths.
  if (pillRef.value) pillRef.value.style.transform = `translateX(${position * 100}%)`

  // Labels fade between white (over the pill) and the idle grey carried by `--subtab-idle`,
  // which the template switches per theme. `color-mix` is unsupported on older engines,
  // where the declaration is dropped and the label simply keeps its inherited colour.
  labelEls.value.forEach((label, index) => {
    if (!label) return
    const share = Math.round((1 - Math.min(1, Math.abs(position - index))) * 100)
    label.style.color = `color-mix(in oklab, white ${share}%, var(--subtab-idle))`
  })
}

/** While the finger is down the visuals are pinned to it, with no easing in between. */
function pinVisuals(pinned: boolean) {
  for (const el of animatedEls()) {
    if (el) el.style.transitionDuration = pinned ? '0s' : ''
  }
}

/**
 * Kept to the length of a gesture on purpose: a permanent `will-change` would leave the
 * whole chart-heavy track promoted to its own compositor layer, which is by itself enough
 * to make ordinary vertical scrolling stutter on mobile.
 */
function promoteLayers(promoted: boolean) {
  for (const el of [trackRef.value, pillRef.value]) {
    if (el) el.style.willChange = promoted ? 'transform' : ''
  }
}

/** Places the visuals without easing, so a tab restored from the URL does not slide in. */
function placeVisuals() {
  pinVisuals(true)
  applyVisuals(settledProgress())
  requestAnimationFrame(() => pinVisuals(false))
}

// Button taps go through this watcher; drags apply their own settle in `onSwipeEnd`.
watch(current, () => applyVisuals(settledProgress()), { flush: 'post' })
onMounted(placeVisuals)

/**
 * The panes share the document scroll but rarely have the same height, so a deep scroll on
 * a tall one sits past the end of a shorter one: revealing it mid-swipe would show blank
 * space, and releasing would snap the page back up to its end. Shifting the shorter pane
 * down by that overshoot puts its end on screen instead. The shift is dropped again
 * together with a matching scroll correction, so nothing moves on settle.
 */
function measurePaneShifts() {
  const scrollRoot = props.scrollRoot ?? rootRef.value
  if (!scrollRoot) return

  const scrollY = window.scrollY
  const viewport = window.innerHeight
  // Trailing padding that normally keeps the last rows clear of a fixed bottom bar.
  const trailing = Number.parseFloat(getComputedStyle(scrollRoot).paddingBottom) || 0

  paneShifts.value = paneEls.value.slice(0, props.options.length).map((el) => {
    if (!el) return 0
    const paneEnd = el.getBoundingClientRect().bottom + scrollY + trailing
    return Math.max(0, scrollY - Math.max(0, paneEnd - viewport))
  })
}

function expandAllPanes() {
  if (collapseTimer) clearTimeout(collapseTimer)
  // Measuring while a previous shift is still applied would compound it.
  if (!allPanesExpanded.value) measurePaneShifts()
  allPanesExpanded.value = true
}

/**
 * Undoes the shift of whichever pane ended up active and scrolls by the same amount, so
 * the two cancel out and the page does not jump when the idle panes collapse.
 */
function collapseIdlePanes() {
  const shift = paneShifts.value[currentIndex.value] ?? 0
  if (shift > 0) window.scrollTo({ top: Math.max(0, window.scrollY - shift), behavior: 'auto' })
  paneShifts.value = []
  allPanesExpanded.value = false
  promoteLayers(false)
}

/** Collapses the idle panes only once the settle animation has finished. */
function scheduleCollapse() {
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = setTimeout(collapseIdlePanes, SETTLE_MS + 30)
}

onBeforeUnmount(() => {
  if (collapseTimer) clearTimeout(collapseTimer)
})

function moveTo(value: V) {
  expandAllPanes()
  current.value = value
  scheduleCollapse()
}

function select(value: V) {
  if (value === current.value) return
  moveTo(value)
  emit('update:modelValue', value)
}

// A value pushed from the outside (restored from the URL, or clamped away) animates like a tap.
watch(
  () => props.modelValue,
  (value) => {
    if (value !== current.value) moveTo(value)
  },
)

/** There is nothing beyond the first and last pane, so drags outward are ignored. */
function clampDrag(offset: number) {
  if (offset < 0 && currentIndex.value >= props.options.length - 1) return 0
  if (offset > 0 && currentIndex.value <= 0) return 0
  return offset
}

function resetDrag() {
  dragOffset = 0
  dragAxis = 'none'
}

/**
 * `useSwipe` only reports past its own `threshold`, which is lowered here so `onSwipe`
 * fires early enough to track the finger.
 */
const { lengthX, lengthY } = useSwipe(rootRef, {
  threshold: AXIS_LOCK_PX,
  onSwipeStart() {
    dragAxis = 'none'
    dragOffset = 0
  },
  onSwipe() {
    if (!props.enabled) return
    // Lock to one axis on the first significant movement, so a vertical scroll
    // never drags the track sideways (and vice versa).
    if (dragAxis === 'none') {
      const dx = Math.abs(lengthX.value)
      const dy = Math.abs(lengthY.value)
      if (Math.max(dx, dy) < AXIS_LOCK_PX) return
      dragAxis = dx > dy ? 'x' : 'y'
      if (dragAxis !== 'x') return
      // The page cannot scroll while the track is being dragged, so the width is
      // measured once here instead of being read back on every frame.
      gestureWidth = rootRef.value?.clientWidth ?? 0
      expandAllPanes()
      pinVisuals(true)
      promoteLayers(true)
    }
    if (dragAxis !== 'x') return
    // `lengthX` is positive when the finger moves left; the track follows it.
    dragOffset = clampDrag(-lengthX.value)
    applyVisuals(settledProgress() - (gestureWidth ? dragOffset / gestureWidth : 0))
  },
  onSwipeEnd() {
    if (!props.enabled || dragAxis !== 'x') {
      resetDrag()
      return
    }

    const threshold = Math.max(COMMIT_MIN_PX, gestureWidth * COMMIT_RATIO)
    const next = values.value[currentIndex.value + 1]
    const prev = values.value[currentIndex.value - 1]

    if (dragOffset <= -threshold && next) select(next)
    else if (dragOffset >= threshold && prev) select(prev)
    else scheduleCollapse() // below the threshold: snap back to the current pane

    // Restoring the easing before writing the settled position makes the track animate
    // from wherever the finger left it, whether the swipe committed or snapped back.
    pinVisuals(false)
    applyVisuals(settledProgress())
    resetDrag()
  },
})

/**
 * Dragging the track and scrolling the page at the same time is both meaningless and
 * expensive, so once the gesture is known to be horizontal the scroll is cancelled. The
 * listener has to be non-passive to do that, and it is registered after `useSwipe` so
 * `dragAxis` is already up to date for the event being handled.
 */
useEventListener(
  rootRef,
  'touchmove',
  (e: TouchEvent) => {
    if (dragAxis === 'x') e.preventDefault()
  },
  { passive: false },
)
</script>

<style scoped>
/* Panes, pill and labels share one clock, so the switcher cannot drift away from
   the track mid-swipe. This is deliberately quicker than the 300ms of the bottom
   nav: the pill has to keep up with a finger, not answer a tap. Only the settle
   animation is timed; while the finger is down everything is pinned to it. The
   decelerating curve front-loads the movement, so 140ms still lands as "instant"
   without looking cut off. */
.subtab-synced {
  transition-duration: 0.14s;
  transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
}

.subtab-synced-transform {
  transition-property: transform;
}

.subtab-synced-color {
  transition-property: color;
}

@media (prefers-reduced-motion: reduce) {
  .subtab-synced {
    transition-duration: 0.01ms;
  }
}
</style>
