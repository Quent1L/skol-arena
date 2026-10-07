<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/85">
      <div
        class="w-full max-w-sm rounded-3xl sm:rounded-3xl bg-gray-900 text-white shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex justify-center pt-5 pb-2">
          <span
            class="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full bg-gray-700 text-gray-300"
          >
            {{ t('mmrRecapCard.title') }}
          </span>
        </div>

        <!-- Net total -->
        <div class="flex flex-col items-center py-4 px-6">
          <div
            class="text-4xl font-black font-mono"
            :class="netDelta >= 0 ? 'text-emerald-400' : 'text-red-400'"
          >
            {{ netDelta >= 0 ? '+' : '' }}{{ netDelta }}
          </div>
          <div class="text-gray-400 text-sm mt-1">
            {{ summaryText }}
          </div>
        </div>

        <!-- Overall progression across every event in the recap -->
        <div v-if="segments.length" class="px-6 pb-5">
          <div class="flex items-center justify-between mb-1.5 text-xs">
            <span class="uppercase tracking-widest font-semibold text-gray-500">
              {{ t('mmrRecapCard.progression') }}
            </span>
            <span class="font-mono text-gray-300">{{ startMmr }} → {{ displayMmr }}</span>
          </div>
          <MmrProgressBar
            :segments="segments"
            :active-index="activeIndex"
            :progressed="progressed"
            :completed="completed"
            :instant="instant"
            :resetting="resetting"
            :duration-ms="RECAP_TIMING.segment"
          />
        </div>

        <!-- Per-match breakdown, folded away when there is too much of it to scan -->
        <div class="px-6 pb-3">
          <button
            v-if="isCollapsible"
            class="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
            @click="showDetail = !showDetail"
          >
            <i class="fa" :class="showDetail ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            {{
              showDetail
                ? t('mmrRecapCard.hideDetail')
                : t('mmrRecapCard.showDetail', { count: events.length })
            }}
          </button>
        </div>

        <div
          v-if="showDetail"
          class="mx-6 mb-4 rounded-xl bg-gray-800 divide-y divide-gray-700 max-h-48 overflow-y-auto"
        >
          <div
            v-for="event in events"
            :key="event.id"
            class="flex items-center justify-between px-4 py-2.5 text-sm gap-2"
          >
            <div class="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <!-- Teams: [teammates] vs [opponents] -->
              <div class="flex items-center gap-1.5">
                <PlayerAvatarStack
                  v-if="(event.teammates ?? []).length > 0"
                  :players="event.teammates ?? []"
                  size="xs"
                />
                <span class="text-gray-500 text-xs font-medium">vs</span>
                <PlayerAvatarStack :players="event.opponents ?? []" size="xs" />
              </div>
              <!-- Rank change / recalc badges -->
            </div>
            <div class="flex flex-wrap flex-col gap-1.5">
              <div
                v-if="event.rankChanged"
                class="text-xs shrink-0"
                :class="
                  (event.tierAfterLevel ?? 0) > (event.tierBeforeLevel ?? 0)
                    ? 'text-amber-400'
                    : 'text-sky-300'
                "
              >
                {{ (event.tierAfterLevel ?? 0) > (event.tierBeforeLevel ?? 0) ? '↑' : '↓' }}
                {{ reachedTierName(event) }}
              </div>
              <div v-if="event.reason === 'recalculated'" class="text-sky-400 text-xs shrink-0">
                <i class="fa-solid fa-rotate"></i> {{ t('mmrRecapCard.recalculated') }}
              </div>
              <div v-if="event.reason === 'match_corrected'" class="text-sky-400 text-xs shrink-0">
                <i class="fa-solid fa-pen-to-square"></i> {{ t('mmrRecapCard.corrected') }}
              </div>
              <div
                v-if="event.reason === 'match_cancelled' || event.reason === 'cascade'"
                class="text-red-400 text-xs shrink-0"
              >
                <i class="fa-solid fa-ban"></i> {{ t('mmrRecapCard.cancelled') }}
              </div>
            </div>
            <!-- Date -->
            <div v-if="event.playedAt" class="text-gray-500 text-xs shrink-0">
              {{ formatMatchDate(event.playedAt) }}
            </div>
            <!-- Delta -->
            <span
              class="font-bold font-mono shrink-0"
              :class="shown(event) >= 0 ? 'text-emerald-400' : 'text-red-400'"
            >
              {{ shown(event) >= 0 ? '+' : '' }}{{ shown(event) }}
            </span>
          </div>
        </div>

        <!-- Dismiss -->
        <div class="px-6 pb-6">
          <button
            class="w-full py-3 rounded-xl font-semibold text-sm bg-gray-700 hover:bg-gray-600 transition-colors"
            @click="$emit('close')"
          >
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { format } from 'date-fns'
import type { MmrAnimationEventResponse, ClientRankTier } from '@skol-arena/shared'
import PlayerAvatarStack from '@/components/PlayerAvatarStack.vue'
import MmrProgressBar from '@/components/ranked/MmrProgressBar.vue'
import { buildMmrBarSegments, type MmrBarSegment } from '@/composables/ranked/mmr-progress'
import { useMmrBarPlayback, MMR_RECAP_TIMING } from '@/composables/ranked/useMmrBarPlayback'
import { useCountUp } from '@/composables/ui/useCountUp'
import { useServerLabels } from '@/i18n/serverLabels'

const { t } = useI18n()
const { tierName } = useServerLabels()

const props = withDefaults(
  defineProps<{
    events: MmrAnimationEventResponse[]
    /** Optional: without the tier table there is nothing to draw a bar against. */
    tiers?: ClientRankTier[]
  }>(),
  { tiers: () => [] },
)

defineEmits<{ (e: 'close'): void }>()

/** Above this many matches the list stops being scannable, so it starts folded. */
const DETAIL_AUTO_COLLAPSE_ABOVE = 3

// Shorter beats than the single reveal: the recap is a summary, not a ceremony.
const RECAP_TIMING = MMR_RECAP_TIMING

// Points to show/sum: the differential for recalculated/cancelled matches,
// the full delta for new matches. Legacy rows without displayDelta fall back.
const shown = (e: MmrAnimationEventResponse) => e.displayDelta ?? e.mmrDelta
const netDelta = computed(() => props.events.reduce((acc, e) => acc + shown(e), 0))

const isCollapsible = computed(() => props.events.length > DETAIL_AUTO_COLLAPSE_ABOVE)
const showDetail = ref(!isCollapsible.value)

// The bar has to tell the same story as the headline, which counts `displayDelta`
// — what changed since the player last looked. A recalculation rewrites the whole
// chain, so `events[0].mmrBefore` is the start of matches they have already seen:
// anchoring on it would draw a long climb next to a "-12" headline. The end is
// where they stand now; the start is that minus the points being announced.
const endMmr = computed(() => props.events[props.events.length - 1]?.mmrAfter ?? 0)
const startMmr = computed(() => endMmr.value - netDelta.value)

const segments = computed((): MmrBarSegment[] => {
  if (!props.tiers.length || !props.events.length) return []
  // The starting tier is derived from `startMmr`, not read off the first event:
  // that event's tier belongs to a different point in the rewritten chain.
  return buildMmrBarSegments(startMmr.value, endMmr.value, props.tiers, {
    tierAfterLevel: props.events[props.events.length - 1].tierAfterLevel,
  })
})

/**
 * Name of the tier a rank change landed on. The event carries its own copy, but it
 * was rendered when the match was played: the ladder is what answers in the locale
 * the app is set to, and the snapshot only covers a tier since removed from it.
 */
function reachedTierName(event: MmrAnimationEventResponse): string | null {
  const tier = props.tiers.find((candidate) => candidate.level === event.tierAfterLevel)
  return tier ? tierName(tier) : event.tierAfterName
}

const counter = useCountUp(() => endMmr.value, { from: startMmr.value, manual: true })
const displayMmr = counter.value

const playback = useMmrBarPlayback(
  () => segments.value,
  {
    onSegmentStart: (segment) =>
      counter.start({
        from: segment.mmrFrom,
        to: segment.mmrTo,
        durationMs: RECAP_TIMING.segment,
      }),
  },
  RECAP_TIMING,
)
const { activeIndex, progressed, completed, resetting, instant } = playback

const countByReason = (reasons: MmrAnimationEventResponse['reason'][]) =>
  props.events.filter((e) => reasons.includes(e.reason)).length

// Build "{count} <kind> match(es)" using the kind's singular/plural keys.
const matchesText = (count: number, kind: 'new' | 'recalc' | 'corrected' | 'cancelled') => {
  const suffix = count > 1 ? 'Plural' : 'Singular'
  const key = {
    new: 'newMatches',
    recalc: 'recalcMatches',
    corrected: 'correctedMatches',
    cancelled: 'cancelledMatches',
  }[kind]
  return t(`mmrRecapCard.${key}${suffix}`, { count })
}

// One fragment per non-empty category so the badges (recalculated vs cancelled)
// and the summary line agree.
const summaryText = computed(() => {
  const parts: string[] = []
  const newCount = countByReason(['match_finalized'])
  const recalcCount = countByReason(['recalculated'])
  const correctedCount = countByReason(['match_corrected'])
  const cancelledCount = countByReason(['match_cancelled', 'cascade'])
  if (newCount > 0) parts.push(matchesText(newCount, 'new'))
  if (recalcCount > 0) parts.push(matchesText(recalcCount, 'recalc'))
  if (correctedCount > 0) parts.push(matchesText(correctedCount, 'corrected'))
  if (cancelledCount > 0) parts.push(matchesText(cancelledCount, 'cancelled'))
  return parts.join(', ')
})

function formatMatchDate(date: Date) {
  return format(date, 'dd/MM HH:mm')
}

onMounted(() => {
  if (segments.value.length) playback.play()
})
</script>
