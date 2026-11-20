<template>
  <div
    class="skol-logo"
    :class="{ 'is-loaded': loaded, 'no-animate': !animated }"
    data-brand-logo
    :data-brand-variant="variant"
  >
    <svg
      :width="renderedWidth"
      :height="renderedHeight"
      :viewBox="lockup.viewBox"
      xmlns="http://www.w3.org/2000/svg"
      class="skol-svg"
      role="img"
      :aria-label="t('skolLogo.ariaLabel')"
    >
      <defs>
        <linearGradient
          v-for="gradient in GRADIENTS"
          :id="uid(`g-${gradient.key}`)"
          :key="gradient.key"
          gradientUnits="userSpaceOnUse"
          :x1="gradient.x1"
          :y1="gradient.y1"
          :x2="gradient.x2"
          :y2="gradient.y2"
        >
          <stop
            v-for="(stop, index) in stopsFor(gradient)"
            :key="index"
            :offset="stop.offset"
            :stop-color="stop.color"
            :stop-opacity="stop.opacity ?? 1"
          />
        </linearGradient>

        <!-- Narrow highlight band; the rect carrying it is what actually travels. -->
        <linearGradient :id="uid('sweep')" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.35" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0.5" />
          <stop offset="0.65" stop-color="#fff" stop-opacity="0" />
        </linearGradient>

        <!-- Wipes SKOL in left to right. A scaled rect rather than an animated
             clip-path inset: plain transforms are the one thing every engine
             interpolates the same way. -->
        <clipPath v-if="hasWord" :id="uid('wipe')">
          <rect x="155" y="42" width="260" height="74" class="sk-wipe" />
        </clipPath>

        <!-- Geometry only: a clipPath ignores the fill of what it references, so
             the shapes can be reused as-is instead of being duplicated in white. -->
        <clipPath :id="uid('ink')">
          <!-- A <use> clones the referenced element alone, never its ancestors'
               transforms, so the mark's placement has to be restated here. -->
          <use
            v-for="key in shapeKeys"
            :key="key"
            :href="`#${uid(`s-${key}`)}`"
            :transform="shapeTransform(key)"
          />
        </clipPath>
      </defs>

      <g :transform="lockup.markTransform">
        <path
          :id="uid('s-markUpper')"
          :d="MARK_UPPER"
          :fill="`url(#${uid('g-mark')})`"
          class="sk-shape sk-mark-upper"
        />
        <path
          :id="uid('s-markLower')"
          :d="MARK_LOWER"
          :fill="`url(#${uid('g-mark')})`"
          class="sk-shape sk-mark-lower"
        />
        <path
          :id="uid('s-markDot')"
          :d="MARK_DOT"
          :fill="`url(#${uid('g-mark')})`"
          class="sk-shape sk-mark-dot"
        />
      </g>

      <template v-if="hasWord">
        <path
          :id="uid('s-skol')"
          :d="WORD_SKOL"
          :fill="`url(#${uid('g-skol')})`"
          fill-rule="evenodd"
          :clip-path="`url(#${uid('wipe')})`"
          class="sk-shape sk-skol"
        />
      </template>

      <template v-if="isFull">
        <path
          :id="uid('s-lineL')"
          :d="LINE_LEFT"
          :fill="`url(#${uid('g-lineL')})`"
          class="sk-shape sk-line sk-line-left"
        />
        <path
          :id="uid('s-lineR')"
          :d="LINE_RIGHT"
          :fill="`url(#${uid('g-lineR')})`"
          class="sk-shape sk-line sk-line-right"
        />
        <path
          :id="uid('s-arena')"
          :d="WORD_ARENA"
          :fill="`url(#${uid('g-arena')})`"
          fill-rule="evenodd"
          class="sk-shape sk-arena"
        />
      </template>

      <g :clip-path="`url(#${uid('ink')})`" class="sk-sweep" aria-hidden="true">
        <rect x="-400" y="0" width="400" height="180" :fill="`url(#${uid('sweep')})`" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  GRADIENTS,
  LINE_LEFT,
  LINE_RIGHT,
  LOCKUP,
  MARK_DOT,
  MARK_LOWER,
  MARK_STOPS,
  MARK_UPPER,
  WORD_ARENA,
  WORD_SKOL,
  type GradientStop,
  type LinearGradientDef,
  type LogoVariant,
} from './logo-paths'

const props = withDefaults(
  defineProps<{
    /** Rendered width in px. The height always follows the artwork's ratio. */
    width?: number | string
    variant?: LogoVariant
    animated?: boolean
  }>(),
  { width: 360, variant: 'full', animated: true },
)

const { t } = useI18n()
const instanceId = useId()

/**
 * SVG ids live in one global namespace, so two logos on the same page would
 * otherwise fight over `url(#mark)` — which is exactly what the header and the
 * update overlay do.
 */
function uid(key: string): string {
  return `${instanceId}-${key}`
}

const lockup = computed(() => LOCKUP[props.variant])
const isFull = computed(() => props.variant === 'full')
/** Every variant but the bare monogram carries SKOL. */
const hasWord = computed(() => props.variant !== 'mark')

const renderedWidth = computed(() => Number(props.width) || 360)
const renderedHeight = computed(() => Math.round(renderedWidth.value / lockup.value.aspectRatio))

function stopsFor(gradient: LinearGradientDef): GradientStop[] {
  return gradient.key === 'mark' ? MARK_STOPS : gradient.stops
}

const MARK_KEYS: readonly string[] = ['markUpper', 'markLower', 'markDot']

/** What the sweep highlight is allowed to touch. */
const shapeKeys = computed<readonly string[]>(() => {
  if (props.variant === 'mark') return MARK_KEYS
  if (props.variant === 'compact') return [...MARK_KEYS, 'skol']
  return [...MARK_KEYS, 'skol', 'lineL', 'lineR', 'arena']
})

// A <use> does not inherit its target's ancestor transforms, so the mark's
// placement inside the lockup has to be repeated on the clip.
function shapeTransform(key: string): string | undefined {
  return MARK_KEYS.includes(key) ? lockup.value.markTransform : undefined
}

const loaded = ref(false)
let raf = 0

// Two frames: the first paints the from-state, the second flips the class so the
// browser has something to interpolate away from.
onMounted(() => {
  if (!props.animated) {
    loaded.value = true
    return
  }
  raf = requestAnimationFrame(() => {
    raf = requestAnimationFrame(() => (loaded.value = true))
  })
})

onUnmounted(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.skol-logo {
  display: inline-block;
  line-height: 0;
  user-select: none;
}

.skol-svg {
  overflow: visible;
  transition: filter 0.3s ease;
}

.skol-logo:hover .skol-svg {
  filter: drop-shadow(0 0 22px rgba(147, 68, 245, 0.4));
}

/* Every animated piece scales and rotates about its own centre. */
.sk-shape,
.sk-wipe {
  transform-box: fill-box;
  transform-origin: center;
}

/* ============================================================
   FROM-STATE — the lockup is assembled by .is-loaded below
   ============================================================ */
.sk-mark-upper,
.sk-mark-lower,
.sk-mark-dot,
.sk-arena {
  opacity: 0;
}

.sk-mark-upper {
  transform: translate(-18px, -14px) scale(0.92);
}

.sk-mark-lower {
  transform: translate(16px, 14px) scale(0.92);
}

.sk-mark-dot {
  transform: translateY(-26px) scale(0.6);
}

.sk-arena {
  transform: translateY(6px);
}

.sk-wipe {
  transform-origin: left center;
  transform: scaleX(0);
}

.sk-line {
  transform: scaleX(0);
}

/* The traits grow outwards from ARENA, each away from the word. */
.sk-line-left {
  transform-origin: right center;
}

.sk-line-right {
  transform-origin: left center;
}

.sk-sweep {
  opacity: 0;
}

/* ============================================================
   ENTRANCE — the mark hooks itself together, then the wordmark
   ============================================================ */
.is-loaded .sk-mark-upper {
  animation: sk-assemble 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.is-loaded .sk-mark-lower {
  animation: sk-assemble 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards;
}

.is-loaded .sk-wipe {
  animation: sk-wipe-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.3s forwards;
}

/* The dot lands last and overshoots: it is the full stop of the question mark. */
.is-loaded .sk-mark-dot {
  animation:
    sk-drop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 0.34s forwards,
    sk-dot-pulse 2.8s ease-in-out 1.6s infinite;
}

.is-loaded .sk-line {
  animation: sk-line-grow 0.4s ease-out 0.55s forwards;
}

.is-loaded .sk-arena {
  animation: sk-rise 0.4s ease-out 0.62s forwards;
}

.is-loaded .sk-sweep {
  opacity: 1;
  animation: sk-sweep-across 5.5s ease-in-out 1.8s infinite;
}

@keyframes sk-assemble {
  to {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}

@keyframes sk-drop {
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes sk-wipe-in {
  to {
    transform: scaleX(1);
  }
}

@keyframes sk-line-grow {
  to {
    transform: scaleX(1);
  }
}

@keyframes sk-rise {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes sk-dot-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.75;
    transform: scale(1.14);
  }
}

/* The band sits off-canvas at both ends of the travel, so it needs no fade to
   hide its arrival or its reset — it rests out of frame for most of the cycle.
   A glint, not a strobe. */
@keyframes sk-sweep-across {
  0% {
    transform: translateX(0);
  }
  45% {
    transform: translateX(830px);
  }
  100% {
    transform: translateX(830px);
  }
}

/* ============================================================
   STATIC — consumers that want the finished lockup, nothing more
   ============================================================ */
.no-animate .sk-shape,
.no-animate .sk-wipe {
  animation: none !important;
  opacity: 1;
  transform: none;
}

.no-animate .sk-sweep {
  opacity: 0;
}

/* The global rule in main.css already collapses durations; this drops the
   looping pieces entirely rather than leaving them to flicker at 0.01ms. */
@media (prefers-reduced-motion: reduce) {
  .sk-shape,
  .sk-wipe {
    animation: none !important;
    opacity: 1;
    transform: none;
  }

  .sk-sweep {
    animation: none !important;
    opacity: 0;
  }
}
</style>
