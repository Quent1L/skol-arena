<template>
  <Teleport to="body">
    <!-- Sized on the *dynamic* viewport, not `inset-0`: the initial containing
         block follows the URL-bar-hidden viewport, so a plain `fixed inset-0`
         overlay stops short of the visible bottom while the bar is out and lets
         the app's bottom nav show through the gap. -->
    <div
      ref="rootRef"
      class="fixed left-0 top-0 z-[600] flex h-[100dvh] w-full flex-col overscroll-none bg-gradient-to-b from-gray-900 to-black"
      role="dialog"
      aria-modal="true"
    >
      <!-- Story-style progress: one segment per card, filled up to the current one. -->
      <div class="flex shrink-0 gap-1 px-4 pt-4">
        <div
          v-for="(card, position) in deck.cards.value"
          :key="card"
          class="h-1 flex-1 overflow-hidden rounded-full bg-white/15"
        >
          <div
            class="h-full rounded-full bg-white transition-[width] duration-300"
            :style="{ width: position <= deck.index.value ? '100%' : '0%' }"
          />
        </div>
      </div>

      <div class="flex shrink-0 items-center justify-between px-4 py-3">
        <span class="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {{ t('rewind.overlay.title') }}
        </span>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
          :aria-label="t('rewind.overlay.close')"
          @click="$emit('close')"
        >
          <i class="fa fa-xmark" />
        </button>
      </div>

      <!-- `overscroll-contain` stops the card area from chaining its scroll to
           the page behind the overlay, which is what made the URL bar — and the
           bottom nav with it — slide in and out mid-swipe. -->
      <div class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div v-if="loading" class="flex h-full items-center justify-center">
          <i class="fa fa-spinner fa-spin text-2xl text-gray-500" />
        </div>

        <div v-else-if="!bundle" class="flex h-full items-center justify-center px-6 text-center">
          <p class="text-sm text-gray-400">{{ t('rewind.overlay.unavailable') }}</p>
        </div>

        <div v-else class="mx-auto flex min-h-full w-full max-w-md">
          <component
            :is="cardComponent"
            v-if="deck.current.value"
            :key="deck.current.value"
            v-bind="cardProps"
            @join="onJoin"
          />
        </div>
      </div>

      <!-- Story-style tap zones, mobile only. They sit at z-20 while a card's own
           controls sit at z-30, so tapping "join a season" never registers as
           "next card". -->
      <template v-if="isMobile">
        <button
          class="absolute inset-y-28 left-0 z-20 w-1/4 cursor-default"
          :aria-label="t('rewind.overlay.previous')"
          @click="onPrevious"
        />
        <button
          class="absolute inset-y-28 right-0 z-20 w-1/4 cursor-default"
          :aria-label="t('rewind.overlay.next')"
          @click="onNext"
        />
        <RewindTapHint :visible="tapHint.visible.value" />
      </template>

      <div
        class="relative z-30 flex shrink-0 items-center justify-between gap-3 px-6 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <button
          v-if="!isMobile"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
          :disabled="deck.isFirst.value"
          :aria-label="t('rewind.overlay.previous')"
          @click="onPrevious"
        >
          <i class="fa fa-chevron-left" />
        </button>

        <!-- On mobile the tap zones carry navigation, so the footer is reduced to
             the position indicator. -->
        <span class="flex-1 text-center text-xs tabular-nums text-gray-500">
          {{ deck.index.value + 1 }} / {{ deck.cards.value.length }}
        </span>

        <button
          v-if="!isMobile"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          :aria-label="deck.isLast.value ? t('rewind.overlay.finish') : t('rewind.overlay.next')"
          @click="onNext"
        >
          <i :class="deck.isLast.value ? 'fa fa-check' : 'fa fa-chevron-right'" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollLock, useSwipe } from '@vueuse/core'
import type { RewindBundle } from '@skol-arena/shared/types/index'
import { useViewport } from '@/composables/useViewport'
import { useRewindDeck } from '@/composables/ranked/useRewindDeck'
import { useRewindTapHint } from '@/composables/ranked/useRewindTapHint'
import type { RewindCardKey } from '@/composables/ranked/rewind.service'
import RewindTapHint from './RewindTapHint.vue'
import IntroCard from './cards/IntroCard.vue'
import FinalRankCard from './cards/FinalRankCard.vue'
import TotalsCard from './cards/TotalsCard.vue'
import MmrJourneyCard from './cards/MmrJourneyCard.vue'
import BestRankCard from './cards/BestRankCard.vue'
import PeakCard from './cards/PeakCard.vue'
import StreaksCard from './cards/StreaksCard.vue'
import FeatsCard from './cards/FeatsCard.vue'
import BadgesCard from './cards/BadgesCard.vue'
import PercentilesCard from './cards/PercentilesCard.vue'
import AwardsPerformanceCard from './cards/AwardsPerformanceCard.vue'
import AwardsCombatCard from './cards/AwardsCombatCard.vue'
import AwardsEnduranceCard from './cards/AwardsEnduranceCard.vue'
import AwardsCooperationCard from './cards/AwardsCooperationCard.vue'
import AwardsVotesCard from './cards/AwardsVotesCard.vue'
import ConclusionCard from './cards/ConclusionCard.vue'

const props = defineProps<{ bundle: RewindBundle | null; loading?: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'complete'): void
  (e: 'join', seasonId: string): void
}>()

const { t } = useI18n()
const { isMobile } = useViewport()
const rootRef = useTemplateRef<HTMLElement>('rootRef')

const bundle = computed(() => props.bundle)
const deck = useRewindDeck(bundle, {
  onComplete: () => emit('complete'),
  onExit: () => emit('close'),
})

const CARD_COMPONENTS: Record<RewindCardKey, Component> = {
  intro: IntroCard,
  finalRank: FinalRankCard,
  totals: TotalsCard,
  journey: MmrJourneyCard,
  bestRank: BestRankCard,
  peak: PeakCard,
  streaks: StreaksCard,
  feats: FeatsCard,
  badges: BadgesCard,
  percentiles: PercentilesCard,
  awardsPerformance: AwardsPerformanceCard,
  awardsCombat: AwardsCombatCard,
  awardsEndurance: AwardsEnduranceCard,
  awardsCooperation: AwardsCooperationCard,
  awardsVotes: AwardsVotesCard,
  conclusion: ConclusionCard,
}

const SEASON_CARDS = new Set<RewindCardKey>([
  'intro',
  'awardsPerformance',
  'awardsCombat',
  'awardsEndurance',
  'awardsCooperation',
  'awardsVotes',
])

const cardComponent = computed(() =>
  deck.current.value ? CARD_COMPONENTS[deck.current.value] : null,
)

const cardProps = computed(() => {
  const key = deck.current.value
  if (!key || !props.bundle) return {}

  const { season, player } = props.bundle
  if (key === 'conclusion') return { player }
  if (key === 'awardsVotes') return { season, awardsWon: player?.awardsWon ?? [], mine: player?.votes ?? null }
  if (SEASON_CARDS.has(key)) return { season, awardsWon: player?.awardsWon ?? [] }
  // Whether the season ever produced a draw decides which figures a card shows,
  // so it travels with every player card rather than with the season ones.
  return { player, allowDraw: season.season.allowDraw }
})

const tapHint = useRewindTapHint({ enabled: isMobile, index: deck.index })

function onNext(): void {
  tapHint.notifyNavigation()
  if (deck.isLast.value) {
    emit('complete')
    emit('close')
    return
  }
  deck.next()
}

function onPrevious(): void {
  tapHint.notifyNavigation()
  deck.previous()
}

function onJoin(seasonId: string): void {
  emit('join', seasonId)
}

// Same gesture vocabulary as the mobile sub-tab track: swipe left advances.
// The threshold is deliberately higher than the track's axis-lock value — the
// deck only commits on a deliberate swipe, never on a stray finger drift.
useSwipe(rootRef, {
  threshold: 60,
  onSwipeEnd(_event, swipeDirection) {
    if (swipeDirection === 'left') {
      tapHint.notifyNavigation()
      deck.next()
    } else if (swipeDirection === 'right') {
      onPrevious()
    }
  },
})

// The deck owns the whole screen: the page behind it must not scroll under it,
// or the bottom nav resurfaces as soon as a swipe reaches the end of a card.
const bodyLocked = useScrollLock(document.body)
onMounted(() => (bodyLocked.value = true))
onUnmounted(() => (bodyLocked.value = false))
</script>
