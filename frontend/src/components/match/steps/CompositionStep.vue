<template>
  <div class="flex flex-col gap-6 pt-4">
    <h3 class="text-base font-semibold">{{ t('compositionStep.title') }}</h3>

    <p class="text-sm text-surface-500">{{ t('compositionStep.instruction') }}</p>

    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col gap-2">
        <div class="text-sm font-semibold">{{ t('compositionStep.teamA') }}</div>
        <div
          class="relative min-h-20 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 p-3"
        >
          <span
            v-if="playersA.length === 0"
            class="absolute inset-0 flex items-center justify-center text-xs text-surface-400 pointer-events-none"
            >{{ t('compositionStep.empty') }}</span
          >
          <VueDraggable
            v-model="playersA"
            tag="div"
            class="flex flex-col gap-2 min-h-14"
            :group="{ name: 'match-composition', pull: true, put: true }"
          >
            <div
              v-for="player in playersA"
              :key="player.id"
              class="flex items-center gap-2 rounded-md bg-surface-100 dark:bg-surface-800 px-3 py-2 cursor-grab select-none touch-none text-sm hover:bg-surface-200 dark:hover:bg-surface-700 hover:shadow-sm transition-colors duration-150"
              @contextmenu.prevent
            >
              <i class="fas fa-grip-vertical text-surface-400 text-xs" />
              <PlayerAvatar :name="player.displayName" :player-id="player.id" size="xs" />
              {{ player.displayName }}
            </div>
          </VueDraggable>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="text-sm font-semibold">{{ t('compositionStep.teamB') }}</div>
        <div
          class="relative min-h-20 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 p-3"
        >
          <span
            v-if="playersB.length === 0"
            class="absolute inset-0 flex items-center justify-center text-xs text-surface-400 pointer-events-none"
            >{{ t('compositionStep.empty') }}</span
          >
          <VueDraggable
            v-model="playersB"
            tag="div"
            class="flex flex-col gap-2 min-h-14"
            :group="{ name: 'match-composition', pull: true, put: true }"
          >
            <div
              v-for="player in playersB"
              :key="player.id"
              class="flex items-center gap-2 rounded-md bg-surface-100 dark:bg-surface-800 px-3 py-2 cursor-grab select-none touch-none text-sm hover:bg-surface-200 dark:hover:bg-surface-700 hover:shadow-sm transition-colors duration-150"
              @contextmenu.prevent
            >
              <i class="fas fa-grip-vertical text-surface-400 text-xs" />
              <PlayerAvatar :name="player.displayName" :player-id="player.id" size="xs" />
              {{ player.displayName }}
            </div>
          </VueDraggable>
        </div>
      </div>
    </div>

    <MatchBalanceBar v-if="balance" :balance="balance" :allow-draw="allowDraw" />

    <div v-if="emptySide" class="text-sm">
      <Message severity="error" :closable="false">
        {{ t('compositionStep.emptySideError') }}
      </Message>
    </div>

    <div v-if="errors.length > 0" class="flex flex-col gap-2">
      <Message v-for="err in errors" :key="err" severity="error" :closable="false">{{
        err
      }}</Message>
    </div>

    <div v-if="!hideNavigation" class="flex justify-between pt-2">
      <Button
        :label="t('compositionStep.previous')"
        severity="secondary"
        icon="fas fa-arrow-left"
        @click="emit('previous')"
      />
      <Button
        :label="props.nextLabel ?? t('compositionStep.next')"
        :icon="props.nextLabel ? 'fas fa-calendar-check' : 'fas fa-arrow-right'"
        :icon-pos="props.nextLabel ? undefined : 'right'"
        :class="props.nextLabel ? 'bg-green-600 hover:bg-green-700' : ''"
        :loading="validating"
        :disabled="emptySide || errors.length > 0"
        @click="onNext"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { VueDraggable } from 'vue-draggable-plus'
import MatchBalanceBar from '@/components/match/MatchBalanceBar.vue'
import { useMatchService } from '@/composables/match/match.service'
import { computeMatchBalance } from '@/composables/match/match-balance'
import type { PlayerStandings } from '@/composables/match/match-balance'
import type { MatchSideInput } from '@skol-arena/shared/types/index'

interface Player {
  id: string
  displayName: string
}

interface Props {
  tournamentId: string
  playerNames: Record<string, string>
  playedAt?: Date | null
  matchId?: string
  hideNavigation?: boolean
  nextLabel?: string
  /** MMR of each player at the match date. Ranked only; absent = no bar. */
  standings?: PlayerStandings | null
  /** Changes how the balance figure is worded — see `MatchBalanceBar`. */
  allowDraw?: boolean
}

interface Emits {
  (e: 'previous'): void
  (e: 'next'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const { validateMatchSides } = useMatchService()
const validating = ref(false)
const errors = ref<string[]>([])

const sidesModel = defineModel<MatchSideInput[]>('sides', { required: true })
const allPlayerIdsModel = defineModel<string[]>('allPlayerIds', { required: true })

const playersA = ref<Player[]>([])
const playersB = ref<Player[]>([])

function buildAndInit() {
  const existing = sidesModel.value.filter((s) => s.playerIds && s.playerIds.length > 0)

  if (existing.length >= 2) {
    playersA.value = existing[0].playerIds!.map((id) => ({
      id,
      displayName: props.playerNames[id] ?? id,
    }))
    playersB.value = existing[1].playerIds!.map((id) => ({
      id,
      displayName: props.playerNames[id] ?? id,
    }))
    return
  }

  const ids = allPlayerIdsModel.value
  const half = Math.ceil(ids.length / 2)
  playersA.value = ids
    .slice(0, half)
    .map((id) => ({ id, displayName: props.playerNames[id] ?? id }))
  playersB.value = ids.slice(half).map((id) => ({ id, displayName: props.playerNames[id] ?? id }))
}

function syncSidesToModel() {
  sidesModel.value = [
    { position: 1, playerIds: playersA.value.map((p) => p.id) },
    { position: 2, playerIds: playersB.value.map((p) => p.id) },
  ]
}

const emptySide = computed(() => playersA.value.length === 0 || playersB.value.length === 0)

// `sidesModel` is kept in sync by the watchEffect below, so the balance follows
// every drag & drop without a watcher or a request of its own.
const balance = computed(() => computeMatchBalance(sidesModel.value, props.standings))

defineExpose({ triggerNext: () => onNext() })

async function onNext() {
  syncSidesToModel()
  errors.value = []
  validating.value = true
  try {
    const result = await validateMatchSides(
      props.tournamentId,
      sidesModel.value,
      props.playedAt ?? undefined,
      props.matchId,
    )
    if (!result.valid) {
      errors.value = result.errors
      return
    }
    emit('next')
  } finally {
    validating.value = false
  }
}

watchEffect(syncSidesToModel)

watch([playersA, playersB], () => {
  errors.value = []
})

watch(allPlayerIdsModel, () => {
  const idsSet = new Set(allPlayerIdsModel.value)
  playersA.value = playersA.value.filter((p) => idsSet.has(p.id))
  playersB.value = playersB.value.filter((p) => idsSet.has(p.id))

  const assignedIds = new Set([
    ...playersA.value.map((p) => p.id),
    ...playersB.value.map((p) => p.id),
  ])
  for (const id of allPlayerIdsModel.value) {
    if (!assignedIds.has(id)) {
      const player = { id, displayName: props.playerNames[id] ?? id }
      if (playersA.value.length <= playersB.value.length) {
        playersA.value = [...playersA.value, player]
      } else {
        playersB.value = [...playersB.value, player]
      }
      assignedIds.add(id)
    }
  }
})

watch(
  () => props.playerNames,
  (names) => {
    playersA.value = playersA.value.map((p) => ({ ...p, displayName: names[p.id] ?? p.id }))
    playersB.value = playersB.value.map((p) => ({ ...p, displayName: names[p.id] ?? p.id }))
  },
)

onMounted(buildAndInit)
</script>
