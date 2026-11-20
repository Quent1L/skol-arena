<template>
  <div v-if="segment">
    <!-- Bounds + tier name, crossfaded when the bar moves on to the next tier -->
    <div class="bar-labels h-4 mb-1.5 text-[11px] font-semibold relative">
      <Transition name="bar-label" mode="out-in">
        <div :key="activeIndex" class="absolute inset-0 flex items-center justify-between">
          <span class="font-mono text-gray-500">{{ segment.minMmr }}</span>
          <span
            v-if="showTierName && segment.tier"
            class="uppercase tracking-widest"
            :style="{ color: tierHex }"
            >{{ tierName(segment.tier) }}</span
          >
          <span class="font-mono text-gray-500">{{
            segment.isOpenEnded ? '∞' : segment.maxMmr
          }}</span>
        </div>
      </Transition>
    </div>

    <div class="track-wrap" :class="{ 'is-complete': completed, 'is-instant': isSnapping }">
      <div class="track">
        <div class="fill base" :style="baseStyle"><span class="sweep" /></div>
        <div v-if="!provisional" class="fill delta" :style="deltaStyle"><span class="sweep" /></div>
        <span
          v-for="tick in tickPositions"
          :key="tick"
          class="tick"
          :style="{ left: `${tick}%` }"
        />
        <div class="flash" />
      </div>
      <div class="head" :style="headStyle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { MmrBarSegment } from '@/composables/ranked/mmr-progress'
import { getTierBarHex } from '@/composables/ranked/tier-style'
import { useServerLabels } from '@/i18n/serverLabels'

/**
 * easeOutCubic, the same curve `useCountUp` runs the MMR number on, so the bar
 * and the counter stay in step. Deliberately gentler than an easeOutQuint,
 * which front-loads so hard the fill looks finished a third of the way in.
 */
const EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'

const GAIN_FROM = '#10b981'
const GAIN_TO = '#6ee7b7'
const LOSS_FROM = '#b91c1c'
const LOSS_TO = '#f87171'
const PROVISIONAL_STRIPES = 'repeating-linear-gradient(45deg, #6b7280 0px 4px, #4b5563 4px 8px)'

const props = withDefaults(
  defineProps<{
    segments: MmrBarSegment[]
    /** Which segment is on screen. The parent owns the timing. */
    activeIndex?: number
    /** false renders `fromPct`, true animates to `toPct`. */
    progressed?: boolean
    /** Flashes the bar — the beat where a tier is cleared. */
    completed?: boolean
    provisional?: boolean
    /**
     * Drops the transition: under reduced motion every beat fires at once, so
     * the bar has to land on each of them rather than travel.
     */
    instant?: boolean
    /** Same, for the single frame the bar jumps back to a new tier's edge. */
    resetting?: boolean
    /**
     * Names the tier between the two bounds. Off where the tier is already the
     * headline — the reveal shows it as a badge right above the bar.
     */
    showTierName?: boolean
    durationMs?: number
  }>(),
  {
    activeIndex: 0,
    progressed: false,
    completed: false,
    provisional: false,
    instant: false,
    resetting: false,
    showTierName: true,
    durationMs: 1600,
  },
)

const { tierName } = useServerLabels()

const segment = computed((): MmrBarSegment | null => props.segments[props.activeIndex] ?? null)

const tierHex = computed(() => getTierBarHex(segment.value?.tier ?? null))
const currentPct = computed(() =>
  props.progressed ? (segment.value?.toPct ?? 0) : (segment.value?.fromPct ?? 0),
)
const isGain = computed(() => segment.value?.direction === 'up')

const deltaHex = computed(() => (isGain.value ? GAIN_TO : LOSS_TO))

// Snapping, not travelling: reduced motion lands on the end state, a reset lands
// on the next tier's starting edge. Either way the move must not animate.
const isSnapping = computed(() => props.instant || props.resetting)

const transition = computed(() =>
  isSnapping.value
    ? 'none'
    : `width ${props.durationMs}ms ${EASING}, left ${props.durationMs}ms ${EASING}`,
)

// Sub-rank dividers, so a player reads their position inside the tier at a glance.
const tickPositions = computed(() => {
  const subRanks = segment.value?.tier?.subRanks ?? 1
  if (subRanks <= 1) return []
  return Array.from({ length: subRanks - 1 }, (_, i) => ((i + 1) / subRanks) * 100)
})

// On a gain the tier-coloured base stays put and the delta grows past it; on a
// loss the base recedes and the delta marks the ground given up behind it.
const baseStyle = computed((): CSSProperties => {
  if (props.provisional) {
    return {
      width: `${currentPct.value}%`,
      background: PROVISIONAL_STRIPES,
      transition: transition.value,
    }
  }
  const width = isGain.value ? (segment.value?.fromPct ?? 0) : currentPct.value
  return {
    width: `${width}%`,
    background: `linear-gradient(90deg, ${tierHex.value}b3, ${tierHex.value})`,
    transition: transition.value,
  }
})

const deltaStyle = computed((): CSSProperties => {
  const from = segment.value?.fromPct ?? 0
  const left = isGain.value ? from : currentPct.value
  const width = Math.max(0, isGain.value ? currentPct.value - from : from - currentPct.value)
  const [start, end] = isGain.value ? [GAIN_FROM, GAIN_TO] : [LOSS_FROM, LOSS_TO]
  return {
    left: `${left}%`,
    width: `${width}%`,
    background: `linear-gradient(90deg, ${start}, ${end})`,
    transition: transition.value,
  }
})

const headStyle = computed(
  (): CSSProperties =>
    ({
      left: `${currentPct.value}%`,
      '--head-glow': segment.value?.direction === 'flat' ? tierHex.value : deltaHex.value,
      transition: isSnapping.value ? 'none' : `left ${props.durationMs}ms ${EASING}`,
    }) as CSSProperties,
)
</script>

<style scoped>
.track-wrap {
  position: relative;
}

.track {
  position: relative;
  height: 14px;
  border-radius: 9999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.07);
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06);
}

.fill {
  position: absolute;
  top: 0;
  bottom: 0;
  overflow: hidden;
}

.base {
  left: 0;
}

/* Glass highlight across the top of whatever is filled. */
.fill::after {
  content: '';
  position: absolute;
  inset: 0 0 55% 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.35), transparent);
}

.sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  animation: bar-sweep 2.4s ease-in-out infinite;
}

.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(0, 0, 0, 0.45);
}

.head {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 10px 2px var(--head-glow, #fff);
  animation: head-pulse 1.3s ease-in-out infinite;
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
}

.is-complete .flash {
  animation: bar-flash 0.5s ease-out;
}

.is-complete .track {
  animation: bar-pop 0.5s ease-out;
}

.is-instant .fill,
.is-instant .head {
  transition: none !important;
}

.bar-label-enter-active,
.bar-label-leave-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.bar-label-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.bar-label-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes bar-sweep {
  0% {
    transform: translateX(-160%);
  }
  60%,
  100% {
    transform: translateX(340%);
  }
}

@keyframes head-pulse {
  0%,
  100% {
    opacity: 0.75;
    box-shadow: 0 0 8px 1px var(--head-glow, #fff);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 16px 4px var(--head-glow, #fff);
  }
}

@keyframes bar-flash {
  0% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
  }
}

@keyframes bar-pop {
  0% {
    transform: scaleY(1);
  }
  40% {
    transform: scaleY(1.45);
  }
  100% {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sweep,
  .head {
    animation: none;
  }
}
</style>
