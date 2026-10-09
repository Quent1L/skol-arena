<template>
  <Teleport to="body">
    <div
      class="reveal-backdrop fixed inset-0 z-[500] flex items-center justify-center px-4"
      :class="{ 'is-counting': phase !== 'entry' }"
    >
      <!-- Tier-tinted halo, so the card sits in the colour of the rank at stake -->
      <div class="halo" :style="{ '--halo-color': haloHex }" />

      <div
        class="reveal-card relative w-full max-w-sm rounded-3xl bg-gray-900 text-white shadow-2xl overflow-hidden"
        :class="{ 'is-demoted': rankRevealed && rankDirection === 'down' }"
        role="dialog"
        aria-modal="true"
      >
        <!-- Rank badge area -->
        <div class="relative flex flex-col items-center gap-2 py-6 px-6 min-h-32">
          <div
            v-if="reasonLabel"
            class="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full bg-gray-800 text-gray-400"
          >
            {{ reasonLabel }}
          </div>

          <div v-if="burst" class="sparks" aria-hidden="true">
            <span
              v-for="(spark, i) in SPARKS"
              :key="i"
              class="spark"
              :style="{
                '--sx': `${spark.x}px`,
                '--sy': `${spark.y}px`,
                '--sd': `${spark.delay}ms`,
                background: haloHex,
              }"
            />
          </div>

          <Transition name="badge-swap" mode="out-in">
            <div :key="badgeIndex" class="relative flex flex-col items-center gap-2">
              <i
                :class="[badgeIconClass, rankRevealed ? 'tier-icon-glow' : '']"
                class="text-6xl"
                :style="{ color: haloHex, '--glow-color': haloHex }"
              />
              <div class="text-3xl font-black" :class="tierNameClass">{{ badgeTierName }}</div>
            </div>
          </Transition>

          <Transition name="rank-up-text">
            <div
              v-if="rankRevealed"
              class="font-black text-base uppercase tracking-widest"
              :class="rankChangeTextClass"
            >
              {{ rankChangeText }}
            </div>
          </Transition>
        </div>

        <!-- MMR counter -->
        <div class="flex items-center justify-center gap-3 px-6 pb-3">
          <span class="text-gray-400 text-xl font-mono">{{ event.mmrBefore }}</span>
          <span class="text-gray-500">→</span>
          <span
            data-testid="mmr-counter"
            class="text-3xl font-black font-mono transition-colors duration-500"
            :class="mmrCounterClass"
            >{{ displayMmr }}</span
          >
          <Transition name="delta-pop">
            <span
              v-if="phase !== 'entry' && !isProvisional"
              class="text-2xl font-black"
              :class="event.mmrDelta >= 0 ? 'text-emerald-400' : 'text-red-400'"
            >
              {{ event.mmrDelta >= 0 ? '+' : '' }}{{ event.mmrDelta }}
            </span>
          </Transition>
        </div>

        <!-- Encouragement message -->
        <Transition name="fade-up">
          <div
            v-if="event.encouragementMessage && (phase === 'settled' || phase === 'done')"
            class="text-center px-6 pb-2 text-sm font-semibold"
            :class="encouragementClass"
          >
            {{ event.encouragementMessage }}
          </div>
        </Transition>

        <!-- Progress bar -->
        <div class="px-6 pb-5">
          <MmrProgressBar
            :segments="segments"
            :active-index="activeIndex"
            :progressed="progressed"
            :completed="completed"
            :provisional="isProvisional"
            :instant="instant"
            :resetting="resetting"
            :show-tier-name="false"
            :duration-ms="TIMING.segment"
          />
        </div>

        <!-- Dismiss -->
        <div class="px-6 pb-6 min-h-14">
          <Transition name="fade-up">
            <button
              v-if="phase === 'done'"
              ref="continueButton"
              type="button"
              class="w-full py-3 rounded-xl font-semibold text-sm bg-gray-700 hover:bg-gray-600 transition-colors"
              @click="emit('close')"
            >
              {{ t('mmrRevealAnimation.continue') }}
            </button>
          </Transition>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MmrAnimationEventResponse, ClientRankTier } from '@skol-arena/shared'
import { getTierIconClass, getTierTextHex } from '@/composables/ranked/tier-style'
import { buildMmrBarSegments, type MmrBarSegment } from '@/composables/ranked/mmr-progress'
import { useMmrBarPlayback, MMR_REVEAL_TIMING } from '@/composables/ranked/useMmrBarPlayback'
import { useCountUp } from '@/composables/ui/useCountUp'
import { useServerLabels } from '@/i18n/serverLabels'
import MmrProgressBar from './MmrProgressBar.vue'
import { holdScreen } from '@/composables/useScreenTakeover'

const { t } = useI18n()
const { tierName } = useServerLabels()

const props = defineProps<{
  event: MmrAnimationEventResponse
  tiers: ClientRankTier[]
}>()

// A full-screen moment: secondary messages wait for it to close.
holdScreen()

const emit = defineEmits<{ (e: 'close'): void }>()

type Phase = 'entry' | 'counting' | 'settled' | 'done'

/** Beat lengths, in ms. `swap` must outlast the badge-swap transition below. */
const TIMING = MMR_REVEAL_TIMING

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2
  return { x: Math.cos(angle) * 96, y: Math.sin(angle) * 96, delay: (i % 5) * 45 }
})

const phase = ref<Phase>('entry')
const badgeIndex = ref(0)
const rankRevealed = ref(false)
const burst = ref(false)

const isProvisional = computed(() => props.event.eventType === 'provisional')

// A placement event never changes tier, so it is pinned to a single segment.
const segments = computed(() => {
  const { mmrBefore, mmrAfter, tierBeforeLevel, tierAfterLevel } = props.event
  const before = isProvisional.value ? tierAfterLevel : tierBeforeLevel
  return buildMmrBarSegments(mmrBefore, mmrAfter, props.tiers, {
    tierBeforeLevel: before,
    tierAfterLevel,
  })
})

const counter = useCountUp(() => props.event.mmrAfter, {
  from: props.event.mmrBefore,
  manual: true,
})
const displayMmr = counter.value

const playback = useMmrBarPlayback(
  () => segments.value,
  {
    onSegmentStart: (segment) => onSegmentStart(segment),
    onTierCleared: (nextIndex) => swapBadge(nextIndex),
    onSettled: () => {
      phase.value = 'settled'
    },
    onDone: () => {
      phase.value = 'done'
    },
  },
  TIMING,
)
const { activeIndex, progressed, completed, resetting, instant } = playback

const reasonLabel = computed(() => {
  if (props.event.reason === 'match_cancelled') return t('mmrRevealAnimation.matchCancelled')
  if (props.event.reason === 'cascade') return t('mmrRevealAnimation.mmrRecalculation')
  return null
})

const badgeTier = computed(() => segments.value[badgeIndex.value]?.tier ?? null)
const badgeIconClass = computed(() => getTierIconClass(badgeTier.value))
const haloHex = computed(() => getTierTextHex(badgeTier.value))

const badgeTierName = computed(() => {
  // The event's own tier names are a snapshot in the language of the match: they
  // only answer for a tier the ladder no longer holds.
  const fallback = badgeIndex.value === 0 ? props.event.tierBeforeName : props.event.tierAfterName
  return badgeTier.value ? tierName(badgeTier.value) : (fallback ?? '—')
})

const rankDirection = computed(() =>
  (props.event.tierAfterLevel ?? 0) >= (props.event.tierBeforeLevel ?? 0) ? 'up' : 'down',
)

const rankChangeText = computed(() =>
  rankDirection.value === 'up' ? t('mmrRevealAnimation.rankUp') : t('mmrRevealAnimation.rankDown'),
)

const rankChangeTextClass = computed(() =>
  rankDirection.value === 'up' ? 'text-amber-400 animate-bounce' : 'text-red-400 animate-pulse',
)

const mmrCounterClass = computed(() => {
  if (isProvisional.value) return 'text-gray-300'
  if (phase.value === 'counting') return props.event.mmrDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
  return 'text-white'
})

const tierNameClass = computed(() => {
  if (isProvisional.value) return 'text-gray-400'
  if (rankRevealed.value) return rankDirection.value === 'up' ? 'text-amber-400' : 'text-red-300'
  return 'text-white'
})

const encouragementClass = computed(() => {
  if (isProvisional.value) return 'text-gray-400'
  if (props.event.mmrDelta > 0) return 'text-emerald-400'
  if (props.event.mmrDelta < 0) return 'text-red-400'
  return 'text-gray-400'
})

// The counter is re-targeted per segment so the number and the bar always agree,
// including across the tier boundaries a promotion travels over.
function onSegmentStart(segment: MmrBarSegment): void {
  phase.value = 'counting'
  burst.value = false
  counter.start({ from: segment.mmrFrom, to: segment.mmrTo, durationMs: TIMING.segment })
}

function swapBadge(index: number): void {
  badgeIndex.value = index
  rankRevealed.value = true
  burst.value = rankDirection.value === 'up'
}

// The reveal runs to its end on its own — it is under three seconds, six across
// a rank change — so Escape only dismisses the settled card. Enter and Space are
// left to the focused Continue button, which already handles them.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && phase.value === 'done') emit('close')
}

// Moving the focus onto Continue makes Enter work without a keydown handler and
// keeps it out of the page still rendered behind the overlay.
const continueButton = useTemplateRef<HTMLButtonElement>('continueButton')
watch(phase, async (value) => {
  if (value !== 'done') return
  await nextTick()
  continueButton.value?.focus()
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  playback.play()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.reveal-backdrop {
  background: radial-gradient(circle at 50% 45%, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.94));
  transition: background 1.2s ease-out;
}
.reveal-backdrop.is-counting {
  background: radial-gradient(circle at 50% 45%, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.985));
}

.halo {
  position: absolute;
  width: min(30rem, 90vw);
  aspect-ratio: 1;
  border-radius: 9999px;
  background: radial-gradient(circle, var(--halo-color, #fff) 0%, transparent 62%);
  opacity: 0.16;
  filter: blur(28px);
  pointer-events: none;
  animation: halo-breathe 4.5s ease-in-out infinite;
}

.reveal-card {
  animation: card-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.reveal-card.is-demoted {
  animation: card-shake 0.55s ease-in-out;
}

.sparks {
  position: absolute;
  top: 50%;
  left: 50%;
  pointer-events: none;
}
.spark {
  position: absolute;
  width: 5px;
  height: 5px;
  margin: -2.5px;
  border-radius: 9999px;
  opacity: 0;
  animation: spark-out 0.9s ease-out var(--sd, 0ms) forwards;
}

.badge-swap-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.badge-swap-leave-to {
  opacity: 0;
  transform: translateY(-18px) scale(0.8);
}
.badge-swap-enter-active {
  animation: badge-bounce 0.55s ease-out;
}

.rank-up-text-enter-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.rank-up-text-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-up-enter-active {
  transition:
    opacity 0.4s,
    transform 0.4s;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-up-leave-active {
  transition: opacity 0.2s;
}
.fade-up-leave-to {
  opacity: 0;
}

.delta-pop-enter-active {
  animation: delta-bounce 0.5s ease-out;
}


.tier-icon-glow {
  animation: icon-glow 1.4s ease-in-out infinite;
}

@keyframes card-in {
  0% {
    opacity: 0;
    transform: scale(0.88) translateY(18px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes card-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-9px);
  }
  40% {
    transform: translateX(8px);
  }
  60% {
    transform: translateX(-5px);
  }
  80% {
    transform: translateX(3px);
  }
}

@keyframes halo-breathe {
  0%,
  100% {
    opacity: 0.13;
    transform: scale(1);
  }
  50% {
    opacity: 0.26;
    transform: scale(1.08);
  }
}

@keyframes spark-out {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translate(var(--sx, 0), var(--sy, 0)) scale(0.2);
  }
}

@keyframes badge-bounce {
  0% {
    transform: scale(0);
    opacity: 0;
    filter: brightness(3);
  }
  55% {
    transform: scale(1.32);
    filter: brightness(1.6);
  }
  80% {
    transform: scale(0.92);
  }
  100% {
    transform: scale(1);
    opacity: 1;
    filter: brightness(1);
  }
}

@keyframes delta-bounce {
  0% {
    transform: scale(0.4) translateY(14px);
    opacity: 0;
  }
  55% {
    transform: scale(1.3) translateY(0);
  }
  80% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}


@keyframes icon-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 6px var(--glow-color, #fff));
    transform: scale(1);
  }
  50% {
    filter: drop-shadow(0 0 22px var(--glow-color, #fff));
    transform: scale(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sparks,
  .halo {
    display: none;
  }
}
</style>
