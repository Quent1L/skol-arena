<template>
  <div class="flex flex-col gap-6 pt-4">
    <h3 class="text-base font-semibold">{{ t('resultStep.title') }}</h3>

    <!-- Side previews — click to pick winner -->
    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium"
        >{{ t('resultStep.selectWinner') }} <span class="text-red-500">*</span></span
      >
      <div class="grid gap-3 grid-cols-2">
        <button
          v-for="(side, idx) in sidesModel"
          :key="side.position"
          type="button"
          class="flex flex-col items-stretch justify-start rounded-lg border p-3 text-left transition-colors cursor-pointer"
          :class="
            winnerModel === side.position
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
          "
          @click="winnerModel = side.position"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-500">{{
              t('resultStep.team', { number: idx + 1 })
            }}</span>
            <span class="flex items-center gap-2">
              <span
                v-if="balance"
                class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold"
                :title="t('matchBalance.title')"
                >{{ idx === 0 ? sidePercents.a : sidePercents.b }}%</span
              >
              <i v-if="winnerModel === side.position" class="fa fa-trophy text-green-500 text-xs" />
            </span>
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="player in sidePlayers(side)"
              :key="player.id"
              class="flex items-center gap-2 text-sm"
            >
              <PlayerAvatar :name="player.name" :player-id="player.id" size="xs" />
              {{ player.name }}
            </div>
          </div>
        </button>
        <button
          v-if="allowDraw"
          type="button"
          class="col-span-2 rounded-lg border p-3 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1"
          :class="
            winnerModel === 0
              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
          "
          @click="winnerModel = 0"
        >
          <i
            class="fa fa-handshake text-slate-400"
            :class="winnerModel === 0 ? 'text-yellow-500' : ''"
          />
          <span class="text-xs font-semibold text-slate-500">{{ t('resultStep.draw') }}</span>
        </button>
      </div>
    </div>

    <!-- Outcome type -->
    <div v-if="outcomeTypes.length > 0" class="flex flex-col gap-2">
      <label for="result-outcome-type" class="text-sm font-medium">{{
        t('resultStep.outcomeType')
      }}</label>
      <USelectMenu
        id="result-outcome-type"
        v-model="outcomeTypeIdModel"
        :items="outcomeTypes"
        value-key="id"
        label-key="name"
        :placeholder="t('resultStep.selectOutcomeType')"
        :loading="loadingOutcomeTypes"
        :search-input="false"
        size="xl"
        class="w-full"
        @update:model-value="onOutcomeTypeChange"
      >
        <template v-if="showMmrMultiplier && selectedOutcomeType" #default>
          <span class="flex items-center gap-2">
            <span>{{ selectedOutcomeType.name }}</span>
            <span
              class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold"
              :title="t('resultStep.mmrMultiplier')"
              >{{ formatMmrMultiplier(selectedOutcomeType.mmrMultiplier) }}</span
            >
          </span>
        </template>
        <template v-if="showMmrMultiplier" #item-trailing="{ item }">
          <span
            class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold"
            :title="t('resultStep.mmrMultiplier')"
            >{{ formatMmrMultiplier(item.mmrMultiplier) }}</span
          >
        </template>
      </USelectMenu>
    </div>

    <!-- Outcome reason -->
    <div v-if="showReasonSelect" class="flex flex-col gap-2">
      <label for="result-outcome-reason" class="text-sm font-medium">{{
        t('resultStep.reason')
      }}</label>
      <USelectMenu
        id="result-outcome-reason"
        v-model="outcomeReasonIdModel"
        :items="filteredOutcomeReasons"
        value-key="id"
        label-key="name"
        :placeholder="t('resultStep.selectReason')"
        :loading="loadingOutcomeReasons"
        :search-input="false"
        size="xl"
        class="w-full"
      />
    </div>

    <!-- Score -->
    <div v-if="scoreEnabled !== false" class="flex flex-col gap-2">
      <span class="text-sm font-medium"
        >{{ t('resultStep.score') }} <span class="text-red-500">*</span></span
      >
      <UAlert v-if="scoreInstructions" color="info" variant="subtle" :title="scoreInstructions" />
      <div class="flex items-center justify-center gap-8">
        <div v-for="(side, idx) in sidesModel" :key="side.position" class="text-center">
          <div class="text-xs text-slate-500 mb-2">
            {{ t('resultStep.team', { number: idx + 1 }) }}
          </div>
          <UInputNumber
            :model-value="scorePerSideModel[side.position] ?? 0"
            :min="minScore ?? 0"
            :max="maxScore ?? undefined"
            :increment="false"
            :decrement="false"
            size="xl"
            class="w-20"
            :ui="{ base: 'text-center px-2' }"
            @update:model-value="(v) => setScore(side.position, v ?? 0)"
          />
        </div>
      </div>
    </div>

    <div v-if="validationMessages.length > 0" class="flex flex-col gap-2">
      <UAlert
        v-for="msg in validationMessages"
        :key="msg"
        color="warning"
        variant="subtle"
        :title="msg"
      />
    </div>

    <div v-if="!hideNavigation" class="flex justify-between pt-2">
      <UButton
        :label="t('resultStep.previous')"
        color="neutral"
        variant="ghost"
        size="lg"
        icon="i-fa7-solid:arrow-left"
        @click="emit('previous')"
      />
      <UButton
        :label="submitLabel || t('resultStep.create')"
        icon="i-fa7-solid:check"
        size="lg"
        :loading="loading"
        :disabled="!canCreate"
        @click="emit('create')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { outcomeTypeApi } from '@/composables/outcome-type.api'
import { outcomeReasonApi } from '@/composables/outcome-reason.api'
import { tournamentApi } from '@/composables/tournament/tournament.api'
import { disciplineApi } from '@/composables/discipline/discipline.api'
import { computeMatchBalance, toPercents } from '@/composables/match/match-balance'
import type { PlayerStandings } from '@/composables/match/match-balance'
import type { OutcomeType, OutcomeReason, MatchSideInput } from '@skol-arena/shared/types/index'

interface Props {
  tournamentId: string
  playerNames: Record<string, string>
  allowDraw?: boolean
  scoreEnabled?: boolean
  minScore?: number | null
  maxScore?: number | null
  loading?: boolean
  submitLabel?: string
  hideNavigation?: boolean
  /** Ranked seasons only: reveals the MMR multiplier carried by each outcome type. */
  isRanked?: boolean
  initialOutcomeTypes?: OutcomeType[]
  initialOutcomeReasons?: OutcomeReason[]
  initialScoreInstructions?: string | null
  /**
   * MMR of each player at the match date. Ranked only. Shown here too because
   * the composition step is skipped for a 1v1 — otherwise the balance would
   * never be seen on those matches.
   */
  standings?: PlayerStandings | null
}

interface Emits {
  (e: 'previous'): void
  (e: 'create'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const sidesModel = defineModel<MatchSideInput[]>('sides', { required: true })
const winnerModel = defineModel<number | null>('winner', { default: null })
const outcomeTypeIdModel = defineModel<string | null>('outcomeTypeId', { default: null })
const outcomeReasonIdModel = defineModel<string | null>('outcomeReasonId', { default: null })
const scorePerSideModel = defineModel<Record<number, number>>('scorePerSide', { required: true })

const outcomeTypes = ref<OutcomeType[]>(props.initialOutcomeTypes ?? [])
const outcomeReasons = ref<OutcomeReason[]>(props.initialOutcomeReasons ?? [])
const loadingOutcomeTypes = ref(false)
const loadingOutcomeReasons = ref(false)
const scoreInstructions = ref<string | null>(props.initialScoreInstructions ?? null)

const filteredOutcomeReasons = computed(() =>
  outcomeReasons.value.filter((r) => r.outcomeTypeId === outcomeTypeIdModel.value),
)

const selectedOutcomeType = computed(
  () => outcomeTypes.value.find((t) => t.id === outcomeTypeIdModel.value) ?? null,
)

const showMmrMultiplier = computed(() => props.isRanked === true)

/** `1.5` → `x 1.5`, `1` → `x 1` — trailing zeros never reach the badge. */
function formatMmrMultiplier(value: number): string {
  return `x ${Number(value.toFixed(2))}`
}

const isNormalOutcome = computed(() => selectedOutcomeType.value?.isDefault === true)

const showReasonSelect = computed(
  () =>
    outcomeTypeIdModel.value && !isNormalOutcome.value && filteredOutcomeReasons.value.length > 0,
)

const balance = computed(() => computeMatchBalance(sidesModel.value, props.standings))
const sidePercents = computed(() => (balance.value ? toPercents(balance.value) : { a: 0, b: 0 }))

function sidePlayers(side: MatchSideInput): { id: string; name: string }[] {
  return (side.playerIds ?? []).map((id) => ({ id, name: props.playerNames[id] ?? id }))
}

function setScore(position: number, value: number) {
  scorePerSideModel.value = { ...scorePerSideModel.value, [position]: value }
}

const canCreate = computed(() => {
  if (winnerModel.value === null) return false
  if (props.scoreEnabled === false) return true
  const inRange = (v: number) =>
    (props.minScore == null || v >= props.minScore) &&
    (props.maxScore == null || v <= props.maxScore)
  return sidesModel.value.every((s) => inRange(scorePerSideModel.value[s.position] ?? 0))
})

const validationMessages = computed<string[]>(() => {
  const msgs: string[] = []
  if (winnerModel.value === null)
    msgs.push(
      props.allowDraw ? t('resultStep.selectWinnerOrDraw') : t('resultStep.selectWinnerOnly'),
    )
  return msgs
})

async function loadOutcomeTypes() {
  if (!props.tournamentId) return
  loadingOutcomeTypes.value = true
  try {
    const tournament = await tournamentApi.getById(props.tournamentId)
    const disciplineId = tournament.disciplineId || undefined
    if (disciplineId) {
      const [types, discipline] = await Promise.all([
        outcomeTypeApi.list(disciplineId),
        disciplineApi.getById(disciplineId),
      ])
      outcomeTypes.value = types
      scoreInstructions.value = discipline.scoreInstructions ?? null
    } else {
      outcomeTypes.value = await outcomeTypeApi.list()
    }
    if (!outcomeTypeIdModel.value) {
      const def = outcomeTypes.value.find((t) => t.isDefault)
      if (def) outcomeTypeIdModel.value = def.id
    }
  } finally {
    loadingOutcomeTypes.value = false
  }
}

async function loadOutcomeReasons(typeId: string) {
  loadingOutcomeReasons.value = true
  try {
    const reasons = await outcomeReasonApi.list(typeId)
    outcomeReasons.value = [
      ...outcomeReasons.value.filter((r) => r.outcomeTypeId !== typeId),
      ...reasons,
    ]
  } finally {
    loadingOutcomeReasons.value = false
  }
}

function onOutcomeTypeChange() {
  outcomeReasonIdModel.value = null
  if (outcomeTypeIdModel.value) loadOutcomeReasons(outcomeTypeIdModel.value)
}

// Sync reactively when parent finishes async loading
watch(
  () => props.initialOutcomeTypes,
  (types) => {
    if (types !== undefined) outcomeTypes.value = types
  },
)
watch(
  () => props.initialOutcomeReasons,
  (reasons) => {
    if (reasons !== undefined) outcomeReasons.value = reasons
  },
)
watch(
  () => props.initialScoreInstructions,
  (si) => {
    if (si !== undefined) scoreInstructions.value = si ?? null
  },
)

// User changes outcome type → load reasons for new type if not cached
// In parent-managed mode (props provided), onOutcomeTypeChange handles user picks; skip here
watch(outcomeTypeIdModel, (val) => {
  if (!val) return
  if (props.initialOutcomeTypes !== undefined) return
  const alreadyLoaded = outcomeReasons.value.some((r) => r.outcomeTypeId === val)
  if (!alreadyLoaded) void loadOutcomeReasons(val)
})

onMounted(async () => {
  if (props.initialOutcomeTypes === undefined) {
    await loadOutcomeTypes()
  }
  if (outcomeTypeIdModel.value) {
    const alreadyLoaded = outcomeReasons.value.some(
      (r) => r.outcomeTypeId === outcomeTypeIdModel.value,
    )
    if (!alreadyLoaded) void loadOutcomeReasons(outcomeTypeIdModel.value)
  }
})
</script>
