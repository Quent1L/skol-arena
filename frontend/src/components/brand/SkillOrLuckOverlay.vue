<template>
  <Transition name="egg-fade">
    <div
      v-if="visible"
      class="egg"
      :class="{ 'is-running': running, 'is-both': isBoth }"
      aria-hidden="true"
      @click="emit('close')"
    >
      <!-- Shards of the wordmark. They blow apart and never come back: the only
           piece that survives is the mark, which the headline needs. -->
      <div v-if="sourceBox" class="egg-shards" :style="shardsStyle">
        <svg :viewBox="sourceLockup.viewBox" class="egg-svg">
          <defs>
            <linearGradient
              v-for="gradient in wordGradients"
              :id="uid(gradient.key)"
              :key="gradient.key"
              gradientUnits="userSpaceOnUse"
              :x1="gradient.x1"
              :y1="gradient.y1"
              :x2="gradient.x2"
              :y2="gradient.y2"
            >
              <stop
                v-for="(stop, index) in gradient.stops"
                :key="index"
                :offset="stop.offset"
                :stop-color="stop.color"
                :stop-opacity="stop.opacity ?? 1"
              />
            </linearGradient>
          </defs>
          <path
            v-if="sourceVariant !== 'mark'"
            :d="WORD_SKOL"
            :fill="`url(#${uid('skol')})`"
            fill-rule="evenodd"
            class="shard"
            style="--ex: -70px; --ey: -46px; --er: -17deg"
          />
          <path
            v-if="sourceVariant === 'full'"
            :d="LINE_LEFT"
            :fill="`url(#${uid('lineL')})`"
            class="shard"
            style="--ex: -96px; --ey: 40px; --er: 24deg"
          />
          <path
            v-if="sourceVariant === 'full'"
            :d="LINE_RIGHT"
            :fill="`url(#${uid('lineR')})`"
            class="shard"
            style="--ex: 96px; --ey: 44px; --er: -22deg"
          />
          <path
            v-if="sourceVariant === 'full'"
            :d="WORD_ARENA"
            :fill="`url(#${uid('arena')})`"
            fill-rule="evenodd"
            class="shard"
            style="--ex: 44px; --ey: 74px; --er: 13deg"
          />
        </svg>
      </div>

      <!-- The mark: bursts, pulls itself back together, then flies into the slot
           the headline left for it. -->
      <div v-if="sourceBox" class="egg-mark" :style="markStyle">
        <svg :viewBox="VIEW_BOX.mark" class="egg-svg">
          <defs>
            <linearGradient
              :id="uid('mark')"
              gradientUnits="userSpaceOnUse"
              :x1="markGradient.x1"
              :y1="markGradient.y1"
              :x2="markGradient.x2"
              :y2="markGradient.y2"
            >
              <stop
                v-for="(stop, index) in MARK_STOPS"
                :key="index"
                :offset="stop.offset"
                :stop-color="stop.color"
              />
            </linearGradient>
          </defs>
          <!-- Own group so the nod can rotate while the svg itself slides. -->
          <g class="mark-nod">
            <path
              :d="MARK_UPPER"
              :fill="`url(#${uid('mark')})`"
              class="piece"
              style="--ex: -52px; --ey: -44px; --er: -28deg"
            />
            <path
              :d="MARK_LOWER"
              :fill="`url(#${uid('mark')})`"
              class="piece"
              style="--ex: 56px; --ey: -12px; --er: 32deg"
            />
            <path
              :d="MARK_DOT"
              :fill="`url(#${uid('mark')})`"
              class="piece"
              style="--ex: 10px; --ey: 78px; --er: 64deg"
            />
          </g>
        </svg>
      </div>

      <div class="egg-line">
        <template v-for="(letter, index) in LETTERS" :key="index">
          <!-- `both`: the OR flips into an AND once the question has landed. -->
          <span
            v-if="isBoth && SWAP[index]"
            class="egg-char egg-flip"
            :style="{ '--i': index, '--j': SWAP[index].beat }"
            ><span class="flip-from">{{ letter }}</span
            ><span class="flip-to">{{ SWAP[index].to }}</span></span
          >
          <span
            v-else
            class="egg-char"
            :class="{ 'is-space': letter === ' ' }"
            :style="{ '--i': index }"
            >{{ letter }}</span
          >
          <span
            v-if="isBoth && index === GROW_AFTER"
            class="egg-char egg-grow"
            :style="{ '--i': index, '--j': 2 }"
            ><span class="flip-to">D</span></span
          >
        </template>
        <!-- Reserves the mark's place on the baseline. Nothing is drawn here: the
             mark itself lands on top of it. -->
        <span ref="slotEl" class="egg-slot" />
      </div>

      <div v-for="burst in bursts" :key="burst" class="egg-burst" :class="burst">
        <span
          v-for="(spark, index) in SPARKS"
          :key="index"
          class="spark"
          :style="{
            '--sx': `${spark.x}px`,
            '--sy': `${spark.y}px`,
            '--sd': `${spark.delay}ms`,
            width: `${spark.size}px`,
            height: `${spark.size}px`,
          }"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, useTemplateRef, watch } from 'vue'
import {
  ASPECT_RATIO,
  GRADIENTS,
  LOCKUP,
  LINE_LEFT,
  LINE_RIGHT,
  MARK_DOT,
  MARK_LOWER,
  MARK_STOPS,
  MARK_UPPER,
  VIEW_BOX,
  WORD_ARENA,
  WORD_SKOL,
  type LogoVariant,
} from './logo-paths'
import type { EasterEggVariant } from '@/composables/useEasterEgg'

/** How long the whole thing runs before it bows out on its own. */
const AUTO_DISMISS_MS = 2600
/** `both` plays the classic run, then the OR → AND swap on top. */
const AUTO_DISMISS_BOTH_MS = 3900
/** Width of the stand-in lockup when no logo is on screen to blow up. */
const FALLBACK_WIDTH = 200

const props = withDefaults(defineProps<{ visible: boolean; variant?: EasterEggVariant }>(), {
  variant: 'classic',
})
const emit = defineEmits<{ close: [] }>()

const instanceId = useId()

function uid(key: string): string {
  return `${instanceId}-${key}`
}

const markGradient = GRADIENTS.find((gradient) => gradient.key === 'mark')!
const wordGradients = GRADIENTS.filter((gradient) => gradient.key !== 'mark')

/** Rendered per character so each can be thrown in on its own beat. */
const LETTERS = [...'SKILL OR LUCK']

/** Letters of "OR" that turn into "AN"; `beat` staggers the flips. */
const SWAP: Partial<Record<number, { to: string; beat: number }>> = {
  6: { to: 'A', beat: 0 },
  7: { to: 'N', beat: 1 },
}
/** The "D" has no letter to replace: it grows in right after the "N". */
const GROW_AFTER = 7

const isBoth = computed(() => props.variant === 'both')
/** A second, differently coloured burst marks the swap. */
const bursts = computed(() => (isBoth.value ? ['is-impact', 'is-encore'] : ['is-impact']))

const SPARKS = [
  { x: -160, y: -90, size: 5, delay: 0 },
  { x: 150, y: -110, size: 4, delay: 40 },
  { x: -210, y: 30, size: 3, delay: 90 },
  { x: 205, y: 20, size: 5, delay: 20 },
  { x: -110, y: 130, size: 4, delay: 120 },
  { x: 120, y: 140, size: 3, delay: 60 },
  { x: -60, y: -160, size: 3, delay: 150 },
  { x: 70, y: -150, size: 4, delay: 110 },
  { x: -260, y: -30, size: 3, delay: 170 },
  { x: 250, y: 90, size: 4, delay: 30 },
  { x: 20, y: 180, size: 3, delay: 190 },
  { x: -30, y: -200, size: 4, delay: 80 },
]

const slotEl = useTemplateRef<HTMLElement>('slotEl')

type Box = { left: number; top: number; width: number; height: number }

const sourceBox = ref<Box | null>(null)
/**
 * `both` only: the "D" widens the centred headline after the mark has landed,
 * pushing its slot right by half the letter. The mark follows by that much,
 * in its own (scaled) coordinates.
 */
const growShift = ref(0)
const travel = ref({ dx: 0, dy: 0, scale: 1 })
/**
 * Held until the slot has been measured. The three layers are choreographed
 * against one clock, so none of them may start before the target is known —
 * otherwise the mark flies at a landing spot that changes mid-flight.
 */
const running = ref(false)

/** Which lockup the explosion started from — the header swaps variant by width. */
const sourceVariant = ref<LogoVariant>('full')
const sourceLockup = computed(() => LOCKUP[sourceVariant.value])

const shardsStyle = computed(() => boxToStyle(sourceBox.value))

/** The mark's on-screen box inside the logo the explosion starts from. */
function markBoxOf(box: Box): Box {
  const f = sourceLockup.value.markFraction
  return {
    left: box.left + box.width * f.left,
    top: box.top + box.height * f.top,
    width: box.width * f.width,
    height: box.height * f.height,
  }
}

const markStyle = computed(() => {
  const box = sourceBox.value
  if (!box) return undefined
  const start = markBoxOf(box)
  return {
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    '--dx': `${travel.value.dx}px`,
    '--dy': `${travel.value.dy}px`,
    '--scale': `${travel.value.scale}`,
    '--grow-shift': `${growShift.value}px`,
  }
})

function boxToStyle(box: Box | null) {
  if (!box) return undefined
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  }
}

/** Where the explosion starts: the logo on screen, or the middle of nowhere. */
function readSourceBox(): Box {
  const host = document.querySelector('[data-brand-logo]')
  const logo = host?.querySelector('svg')
  if (host && logo) {
    sourceVariant.value = (host.getAttribute('data-brand-variant') as LogoVariant) ?? 'full'
    const rect = logo.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }
  sourceVariant.value = 'full'
  const height = FALLBACK_WIDTH / ASPECT_RATIO.full
  return {
    left: (window.innerWidth - FALLBACK_WIDTH) / 2,
    top: window.innerHeight / 2 - height,
    width: FALLBACK_WIDTH,
    height,
  }
}

/**
 * Maps the mark's starting box onto the gap the headline reserved for it. Both
 * layers use `transform-origin: top left`, so a translate plus a uniform scale
 * lands it exactly.
 */
async function measure(): Promise<void> {
  sourceBox.value = readSourceBox()
  // The slot is sized in `em`, so its box is only final once Exo 2 is in.
  await document.fonts?.ready
  await nextTick()
  const slot = slotEl.value
  const box = sourceBox.value
  if (!slot || !box) return
  const target = slot.getBoundingClientRect()
  const start = markBoxOf(box)
  travel.value = {
    dx: target.left - start.left,
    dy: target.top - start.top,
    scale: start.width > 0 ? target.width / start.width : 1,
  }
  growShift.value = measureGrowShift() / travel.value.scale
  running.value = true
}

/** Half the "D" the headline will gain, or 0 when it is already laid out. */
function measureGrowShift(): number {
  if (!isBoth.value) return 0
  const grow = slotEl.value?.parentElement?.querySelector<HTMLElement>('.egg-grow')
  const letter = grow?.querySelector<HTMLElement>('.flip-to')
  if (!grow || !letter) return 0
  // Already full width (reduced motion): the slot was measured with the D in.
  const hidden = letter.getBoundingClientRect().width - grow.getBoundingClientRect().width
  return Math.max(0, hidden) / 2
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null

function clearDismiss(): void {
  if (dismissTimer !== null) clearTimeout(dismissTimer)
  dismissTimer = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    clearDismiss()
    running.value = false
    sourceBox.value = null
    if (!visible) {
      window.removeEventListener('keydown', onKeydown)
      return
    }
    window.addEventListener('keydown', onKeydown)
    // The countdown starts with the animation, not with the trigger: waiting on
    // the font must not eat into the time the thing is on screen.
    void measure().then(() => {
      const duration = isBoth.value ? AUTO_DISMISS_BOTH_MS : AUTO_DISMISS_MS
      dismissTimer = setTimeout(() => emit('close'), duration)
    })
  },
  { immediate: true },
)

onUnmounted(() => {
  clearDismiss()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.egg {
  position: fixed;
  inset: 0;
  z-index: 10050;
  overflow: hidden;
  cursor: pointer;
  /* Opaque from the first frame: the shards appear exactly where the real logo
     was, so the screen reads as the logo shattering rather than a panel opening
     over it. */
  background: #000006;
}

.egg-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.egg-shards,
.egg-mark {
  position: fixed;
  transform-origin: top left;
}

.shard,
.piece {
  transform-box: fill-box;
  transform-origin: center;
}

/* ============================================================
   BLAST — the wordmark leaves, the mark holds together
   ============================================================ */
.is-running .shard {
  animation: shard-out 0.62s cubic-bezier(0.32, 0, 0.67, 0) forwards;
}

@keyframes shard-out {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--ex), var(--ey)) rotate(var(--er)) scale(0.6);
  }
}

.is-running .piece {
  animation: piece-burst 1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes piece-burst {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  32% {
    transform: translate(var(--ex), var(--ey)) rotate(var(--er));
  }
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}

/* Rises out of the header, hangs, then drops into the headline. */
.is-running .egg-mark {
  animation: mark-travel 1s cubic-bezier(0.5, 0, 0.2, 1) forwards;
}

@keyframes mark-travel {
  0% {
    transform: translate(0, 0) scale(1);
  }
  32% {
    transform: translate(calc(var(--dx) * 0.2), calc(var(--dy) * 0.2 - 46px)) scale(1.45);
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(var(--scale));
  }
}

/* ============================================================
   HEADLINE — the mark is the question mark, so none is typed
   ============================================================ */
.egg-line {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: baseline;
  font-family: 'Exo 2', 'Rajdhani', sans-serif;
  font-weight: 900;
  font-size: clamp(1.75rem, 8vw, 4.5rem);
  letter-spacing: 0.04em;
  color: #f5f6f8;
  white-space: pre;
}

.egg-char {
  display: inline-block;
  opacity: 0;
}

.is-running .egg-char {
  animation: char-in 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: calc(1000ms + var(--i) * 38ms);
}

.egg-char.is-space {
  width: 0.32em;
}

@keyframes char-in {
  0% {
    opacity: 0;
    transform: translateY(26px) scale(0.7);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Sized off the headline so the mark scales with the type. The diamond sits on
   the baseline, where a question mark's dot belongs; at 1.15em the hook rises
   well above the Exo 2 caps — deliberately oversized, the mark is the punchline
   and read too small at cap height. Width follows the mark's own ratio
   (0.6625); the margin stands in for the space. */
.egg-slot {
  display: inline-block;
  height: 1em;
  width: 0.66em;
  margin-left: 0.22em;
}

/* ============================================================
   SPARKS — fired on the impact, not on the blast
   ============================================================ */
.egg-burst {
  position: absolute;
  top: 50%;
  left: 50%;
  pointer-events: none;
}

.spark {
  position: absolute;
  border-radius: 50%;
  background: #c984fc;
  opacity: 0;
}

.is-running .spark {
  animation: spark-out 0.85s ease-out forwards;
  animation-delay: calc(980ms + var(--sd));
}

@keyframes spark-out {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.2);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--sx), var(--sy)) scale(1);
  }
}

/* ============================================================
   BOTH — "SKILL OR LUCK?" becomes "SKILL AND LUCK?"
   ============================================================ */
.egg-flip {
  display: inline-grid;
  justify-items: center;
  perspective: 400px;
}

.egg-flip > span {
  grid-area: 1 / 1;
}

.flip-to {
  display: inline-block;
  opacity: 0;
  color: #c984fc;
}

.is-running .flip-from {
  display: inline-block;
  animation: flip-out 0.28s ease-in forwards;
  animation-delay: calc(2050ms + var(--j) * 70ms);
}

.is-running .flip-to {
  animation: flip-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: calc(2280ms + var(--j) * 70ms);
}

@keyframes flip-out {
  to {
    opacity: 0;
    transform: rotateX(90deg) translateY(-0.2em);
  }
}

@keyframes flip-in {
  0% {
    opacity: 0;
    transform: rotateX(-90deg) translateY(0.2em);
  }
  100% {
    opacity: 1;
    transform: rotateX(0) translateY(0);
  }
}

/* Opens a gap for the "D" instead of making it overlap the space. */
.egg-grow {
  max-width: 0;
  overflow: hidden;
}

.is-running .egg-grow {
  animation:
    char-in 0.01s forwards,
    grow 0.35s ease-out forwards;
  animation-delay: 0s, 2280ms;
}

@keyframes grow {
  to {
    max-width: 1em;
  }
}

/* The question mark keeps its place after LUCK as the D pushes it along. */
.is-both.is-running .egg-mark .egg-svg {
  animation: mark-shift 0.35s ease-out 2280ms forwards;
}

@keyframes mark-shift {
  to {
    transform: translateX(var(--grow-shift));
  }
}

/* …and nods along. */
.mark-nod {
  transform-box: fill-box;
  transform-origin: center;
}

.is-both.is-running .mark-nod {
  animation: mark-wink 0.6s ease-in-out 2250ms;
}

@keyframes mark-wink {
  0%,
  100% {
    transform: rotate(0deg);
  }
  30% {
    transform: rotate(-16deg);
  }
  65% {
    transform: rotate(10deg);
  }
}

.is-running .is-encore .spark {
  background: #38bdf8;
  animation-delay: calc(2300ms + var(--sd));
}

.egg-fade-leave-active {
  transition: opacity 0.35s ease;
}

.egg-fade-leave-to {
  opacity: 0;
}

/* Nothing flies: the finished composition simply fades up. */
@media (prefers-reduced-motion: reduce) {
  .shard {
    animation: none !important;
    opacity: 0;
  }

  .piece {
    animation: none !important;
  }

  .egg-mark {
    animation: none !important;
    transform: translate(var(--dx), var(--dy)) scale(var(--scale));
  }

  .egg-char {
    animation: char-fade 0.3s ease forwards;
    animation-delay: 0s;
  }

  @keyframes char-fade {
    to {
      opacity: 1;
    }
  }

  .spark {
    animation: none !important;
    opacity: 0;
  }

  /* The answer is shown straight away rather than flipped into. */
  .flip-from {
    display: none !important;
  }

  .flip-to {
    animation: none !important;
    opacity: 1;
  }

  .egg-grow {
    animation: char-fade 0.3s ease forwards !important;
    max-width: none;
  }

  .is-both .egg-mark .egg-svg,
  .is-both .mark-nod {
    animation: none !important;
  }
}
</style>
