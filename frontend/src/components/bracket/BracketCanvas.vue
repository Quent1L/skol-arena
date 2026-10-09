<template>
  <section class="bracket-canvas-section">
    <!-- Section title (scrolls with content) -->
    <div class="bracket-title-row">
      <span class="bracket-title-accent" />
      <h4 class="bracket-canvas-section-title">{{ title }}</h4>
    </div>

    <!-- Sticky header: only synced round headers + nav buttons -->
    <div class="bracket-sticky-header">
      <div class="bracket-rounds-strip">
        <div ref="headerScrollEl" class="bracket-rounds-overflow">
          <div class="bracket-rounds-inner" :style="{ width: `${canvasWidth}px` }">
            <div
              v-for="round in rounds"
              :key="`hdr-${round.id}`"
              class="bracket-round-header"
              :style="{ width: `${COLUMN_WIDTH}px`, flexShrink: 0 }"
            >
              {{ roundName(round) }}
            </div>
          </div>
        </div>

        <div v-if="hasOverflow" class="flex gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-fa7-solid:chevron-left"
            :aria-label="t('common.previous')"
            @click="scrollRound(-1)"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-fa7-solid:chevron-right"
            :aria-label="t('common.next')"
            @click="scrollRound(1)"
          />
        </div>
      </div>
    </div>

    <!-- Horizontal scroll container -->
    <div ref="scrollEl" class="bracket-canvas-scroll" @scroll="onMainScroll">
      <div class="bracket-canvas-shell" :style="{ width: `${canvasWidth}px` }">
        <!-- Canvas area: SVG + absolutely positioned cards -->
        <div
          :style="{ position: 'relative', width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
        >
          <svg
            :width="canvasWidth"
            :height="canvasHeight"
            :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
            style="position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible"
          >
            <path
              v-for="conn in connectors"
              :key="conn.key"
              :d="conn.d"
              fill="none"
              stroke="var(--ui-color-neutral-400)"
              stroke-width="1.5"
              stroke-linecap="square"
            />
          </svg>

          <template v-for="(round, rIdx) in rounds" :key="`round-${round.id}`">
            <div
              v-for="(matchData, mIdx) in matchesForRound(round.id)"
              :key="`card-${matchData.match.id}`"
              :style="{
                position: 'absolute',
                left: `${rIdx * COLUMN_WIDTH}px`,
                top: `${matchTopY(rIdx, mIdx)}px`,
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
              }"
            >
              <BracketMatchCard
                :match="matchData.match"
                :round-name="roundName(round)"
                :bracket-type="bracketType"
                :is-final="round.id === finalRoundId"
                :seeds="seeds"
                @click="emit('goToMatch', $event)"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ClientBracketRound,
  ClientBracketMatchWithMetadata,
  ClientBracketSeed,
} from '@skol-arena/shared'
import BracketMatchCard from '@/components/bracket/BracketMatchCard.vue'
import { useServerLabels } from '@/i18n/serverLabels'

const { t } = useI18n()

const CARD_HEIGHT = 110
const CARD_WIDTH = 220
const COLUMN_WIDTH = 300
const BASE_UNIT = 150 // CARD_HEIGHT + 40px gap

interface Props {
  title: string
  rounds: ClientBracketRound[]
  allMatches: ClientBracketMatchWithMetadata[]
  seeds: ClientBracketSeed[]
  finalRoundId?: string
  bracketType: 'winners' | 'losers' | 'bronze'
}

const props = defineProps<Props>()
const emit = defineEmits<{ goToMatch: [matchId: string] }>()

const { roundName } = useServerLabels()

const scrollEl = ref<HTMLElement | null>(null)
const headerScrollEl = ref<HTMLElement | null>(null)
const hasOverflow = ref(false)

function scrollRound(direction: -1 | 1) {
  scrollEl.value?.scrollBy({ left: direction * COLUMN_WIDTH, behavior: 'smooth' })
}

function onMainScroll() {
  if (headerScrollEl.value && scrollEl.value)
    headerScrollEl.value.scrollLeft = scrollEl.value.scrollLeft
}

function checkOverflow() {
  if (scrollEl.value) hasOverflow.value = scrollEl.value.scrollWidth > scrollEl.value.clientWidth
}

let ro: ResizeObserver | null = null

onMounted(() => {
  ro = new ResizeObserver(checkOverflow)
  if (scrollEl.value) {
    ro.observe(scrollEl.value)
    checkOverflow()
  }
})

onUnmounted(() => ro?.disconnect())
watch(() => props.rounds.length, checkOverflow)

function matchesForRound(roundId: string): ClientBracketMatchWithMetadata[] {
  return props.allMatches
    .filter((m) => m.round.id === roundId)
    .sort((a, b) => a.metadata.matchNumber - b.metadata.matchNumber)
}

const firstRoundMatchCount = computed<number>(() => {
  const first = props.rounds[0]
  return first ? matchesForRound(first.id).length : 1
})

const matchCountsByRound = computed(() => props.rounds.map((r) => matchesForRound(r.id).length))

/**
 * Position formula using ratio firstCount/matchCount as multiplier.
 * This correctly handles passthrough rounds (same match count as previous)
 * and the winners grand final in double elimination — both stay centered
 * at the same Y as their predecessor instead of doubling the spacing.
 *
 * For normal rounds: firstCount/matchCount = 2^R (same as original formula).
 * For passthrough rounds: firstCount/matchCount stays the same → same positions.
 */
function matchCenterY(rIdx: number, mIdx: number): number {
  const matchCount = matchCountsByRound.value[rIdx] ?? 1
  const multiplier = firstRoundMatchCount.value / matchCount
  return (mIdx + 0.5) * BASE_UNIT * multiplier
}

function matchTopY(rIdx: number, mIdx: number): number {
  return matchCenterY(rIdx, mIdx) - CARD_HEIGHT / 2
}

const canvasWidth = computed(() => props.rounds.length * COLUMN_WIDTH)
const canvasHeight = computed(() => firstRoundMatchCount.value * BASE_UNIT)

function isPassthroughRound(rIdx: number): boolean {
  const countCurrent = matchCountsByRound.value[rIdx]
  const countNext = matchCountsByRound.value[rIdx + 1]
  return countCurrent !== undefined && countNext !== undefined && countCurrent === countNext
}

interface Connector {
  key: string
  d: string
}

interface RoundGeometry {
  rIdx: number
  prevMatchCount: number
  parentRightX: number
  currentLeftX: number
  junctionX: number
}

function passthroughConnector(geo: RoundGeometry, mIdx: number): Connector | null {
  if (mIdx >= geo.prevMatchCount) return null
  return {
    key: `conn-${geo.rIdx}-${mIdx}`,
    d: `M ${geo.parentRightX} ${matchCenterY(geo.rIdx - 1, mIdx)} H ${geo.currentLeftX}`,
  }
}

function mergeConnector(geo: RoundGeometry, mIdx: number): Connector | null {
  const p0 = mIdx * 2
  const p1 = mIdx * 2 + 1
  if (p0 >= geo.prevMatchCount || p1 >= geo.prevMatchCount) return null
  return {
    key: `conn-${geo.rIdx}-${mIdx}`,
    d: [
      `M ${geo.parentRightX} ${matchCenterY(geo.rIdx - 1, p0)}`,
      `H ${geo.junctionX}`,
      `V ${matchCenterY(geo.rIdx - 1, p1)}`,
      `H ${geo.parentRightX}`,
      `M ${geo.junctionX} ${matchCenterY(geo.rIdx, mIdx)}`,
      `H ${geo.currentLeftX}`,
    ].join(' '),
  }
}

const connectors = computed<Connector[]>(() => {
  const paths: Connector[] = []

  for (let rIdx = 1; rIdx < props.rounds.length; rIdx++) {
    const parentRightX = (rIdx - 1) * COLUMN_WIDTH + CARD_WIDTH
    const currentLeftX = rIdx * COLUMN_WIDTH
    const geo: RoundGeometry = {
      rIdx,
      prevMatchCount: matchCountsByRound.value[rIdx - 1],
      parentRightX,
      currentLeftX,
      junctionX: parentRightX + (currentLeftX - parentRightX) / 2,
    }
    const buildConnector = isPassthroughRound(rIdx - 1) ? passthroughConnector : mergeConnector

    for (let mIdx = 0; mIdx < matchCountsByRound.value[rIdx]; mIdx++) {
      const connector = buildConnector(geo, mIdx)
      if (connector) paths.push(connector)
    }
  }

  return paths
})
</script>

<style scoped>
.bracket-canvas-section {
  margin-bottom: 2.5rem;
}

.bracket-sticky-header {
  position: sticky;
  top: var(--bracket-sticky-top, 0px);
  z-index: 10;
  background: var(--ui-color-neutral-800);
  padding-bottom: 0.25rem;
}

.bracket-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem 0.5rem;
}

.bracket-title-accent {
  width: 3px;
  height: 1rem;
  background: var(--ui-primary);
  border-radius: 2px;
  flex-shrink: 0;
}

.bracket-canvas-section-title {
  flex: 1;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
}

.bracket-rounds-strip {
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.25rem;
}

.bracket-rounds-overflow {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.bracket-rounds-inner {
  display: flex;
}

.bracket-canvas-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 0.5rem 1rem 1rem;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-color-neutral-400) transparent;
}

.bracket-canvas-scroll::-webkit-scrollbar {
  height: 6px;
}
.bracket-canvas-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.bracket-canvas-scroll::-webkit-scrollbar-thumb {
  background-color: var(--ui-color-neutral-400);
  border-radius: 3px;
}

.bracket-round-header {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  font-size: 0.8rem;
  font-weight: 600;
  font-style: italic;
  color: var(--ui-text-muted);
  flex-shrink: 0;
}
</style>
