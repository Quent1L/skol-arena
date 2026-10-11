<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm text-slate-500">
      {{ scoreEnabled ? t('rankingInput.instructionScores') : t('rankingInput.instruction') }}
    </p>
    <VueDraggable
      v-model="order"
      tag="ol"
      class="flex flex-col gap-2"
      handle=".ranking-handle"
      :animation="150"
      @end="emitRanks"
    >
      <li
        v-for="(position, index) in order"
        :key="position"
        class="flex items-center gap-2 rounded-lg border p-2 sm:gap-3 sm:p-3"
        :class="
          rankOf(position) === 1
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
            : 'border-slate-200 dark:border-slate-700'
        "
        data-testid="ranking-row"
      >
        <span
          class="ranking-handle flex min-h-11 cursor-grab touch-none items-center px-1 text-slate-400"
          :aria-label="t('rankingInput.drag')"
        >
          <i class="fas fa-grip-vertical" />
        </span>
        <span
          class="w-7 shrink-0 text-center text-lg font-bold tabular-nums"
          :class="placeClass(rankOf(position))"
          data-testid="ranking-place"
          >{{ rankOf(position) }}</span
        >
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold text-slate-500">
            {{ t('rankingInput.side', { number: position }) }}
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <span
              v-for="player in playersOf(position)"
              :key="player.id"
              class="flex min-w-0 items-center gap-1.5 text-sm"
            >
              <PlayerAvatar :name="player.name" :player-id="player.id" size="xs" />
              <span class="truncate">{{ player.name }}</span>
            </span>
          </div>
        </div>
        <UInputNumber
          v-if="scoreEnabled"
          :model-value="scoresModel[position] ?? 0"
          :min="minScore ?? 0"
          :max="maxScore ?? undefined"
          :increment="false"
          :decrement="false"
          :aria-label="t('rankingInput.score', { number: position })"
          class="w-16 shrink-0"
          :ui="{ base: 'text-center px-2' }"
          data-testid="ranking-score"
          @update:model-value="(value) => setScore(position, value ?? 0)"
        />
        <UButton
          v-if="index > 0"
          icon="i-fa7-solid:equals"
          :color="tied[position] ? 'primary' : 'neutral'"
          :variant="tied[position] ? 'solid' : 'outline'"
          size="sm"
          class="shrink-0"
          :aria-pressed="tied[position] ? 'true' : 'false'"
          :aria-label="t('rankingInput.tie')"
          :title="t('rankingInput.tie')"
          data-testid="ranking-tie"
          @click="toggleTie(position)"
        />
        <span v-else class="w-8 shrink-0" />
      </li>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import {
  isCompleteRanking,
  orderFromRanks,
  ranksFromOrder,
  ranksFromScoreMap,
  tiesFromRanks,
  type RankMap,
} from '@/composables/match/match-ranking'
import type { MatchSideInput } from '@skol-arena/shared/types/index'

/**
 * Placement of the sides of a match of three sides or more. The list is the
 * finishing order: drag a side to move it, and the "=" toggle makes a side share
 * the place of the one above. With scores, the order follows them (highest
 * first, equal scores tied) and can still be adjusted by hand afterwards.
 */
interface Props {
  sides: MatchSideInput[]
  playerNames: Record<string, string>
  scoreEnabled?: boolean
  minScore?: number | null
  maxScore?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  scoreEnabled: true,
  minScore: null,
  maxScore: null,
})
const { t } = useI18n()

const ranksModel = defineModel<RankMap>('ranks', { required: true })
const scoresModel = defineModel<Record<number, number>>('scores', { required: true })

const positions = computed(() => props.sides.map((side) => side.position))
const order = ref<number[]>(orderFromRanks(positions.value, ranksModel.value))
const tied = ref<Record<number, boolean>>(tiesFromRanks(order.value, ranksModel.value))

function rankOf(position: number): number {
  return ranksModel.value[position] ?? order.value.indexOf(position) + 1
}

function placeClass(rank: number): string {
  if (rank === 1) return 'text-yellow-500'
  if (rank === 2) return 'text-slate-400'
  if (rank === 3) return 'text-amber-700'
  return 'text-slate-500'
}

function playersOf(position: number): { id: string; name: string }[] {
  const side = props.sides.find((s) => s.position === position)
  return (side?.playerIds ?? []).map((id) => ({ id, name: props.playerNames[id] ?? id }))
}

function applyRanks(ranks: RankMap) {
  order.value = orderFromRanks(positions.value, ranks)
  tied.value = tiesFromRanks(order.value, ranks)
  ranksModel.value = ranks
}

/** The first side cannot tie with the one above it: there is none. */
function emitRanks() {
  tied.value = { ...tied.value, [order.value[0]]: false }
  ranksModel.value = ranksFromOrder(order.value, tied.value)
}

function toggleTie(position: number) {
  tied.value = { ...tied.value, [position]: !tied.value[position] }
  emitRanks()
}

function setScore(position: number, value: number) {
  // Rank from the new map: a bound model only reads it back once the parent re-renders.
  const scores = { ...scoresModel.value, [position]: value }
  scoresModel.value = scores
  applyRanks(ranksFromScoreMap(positions.value, scores))
}

onMounted(() => {
  if (isCompleteRanking(positions.value, ranksModel.value)) return
  if (props.scoreEnabled) applyRanks(ranksFromScoreMap(positions.value, scoresModel.value))
  else emitRanks()
})
</script>
