<template>
  <div class="flex flex-col gap-6 pt-4">
    <div>
      <h3 class="text-base font-semibold">{{ t('participantsStep.title') }}</h3>
      <p v-if="formatHint" class="mt-1 text-sm text-muted" data-testid="format-hint">
        {{ formatHint }}
      </p>
    </div>

    <div>
      <!-- Desktop: AutoComplete -->
      <UInputMenu
        v-if="!isMobile"
        v-model="pickedPlayer"
        v-model:search-term="searchQuery"
        :items="filteredPlayers"
        label-key="displayName"
        ignore-filter
        open-on-click
        :placeholder="t('participantsStep.searchPlaceholder')"
        :disabled="loadingPlayers"
        size="xl"
        class="w-full"
        @update:model-value="addPlayer"
      />

      <!-- Mobile: open picker dialog -->
      <UButton
        v-else
        :label="t('participantsStep.addPlayers')"
        icon="i-fa7-solid:user-plus"
        variant="outline"
        size="xl"
        block
        :disabled="loadingPlayers"
        @click="pickerVisible = true"
      />
    </div>

    <div v-if="allPlayerIdsModel.length > 0">
      <div class="text-sm font-medium mb-2">{{ t('participantsStep.selectedParticipants') }}</div>
      <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <div
          v-for="playerId in allPlayerIdsModel"
          :key="playerId"
          class="flex items-center pl-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0"
        >
          <PlayerAvatar :name="getPlayerName(playerId)" :player-id="playerId" size="sm" />
          <span class="text-sm truncate flex-1 ml-2">{{ getPlayerName(playerId) }}</span>
          <UButton
            color="error"
            variant="link"
            icon="i-fa7-solid:xmark"
            :aria-label="t('common.delete')"
            @click="removePlayer(playerId)"
          />
        </div>
      </div>
    </div>

    <UAlert
      v-if="tooManyError"
      color="error"
      variant="subtle"
      :title="tooManyError"
      data-testid="too-many-players"
    />

    <div v-if="errors.length > 0" class="flex flex-col gap-2">
      <UAlert v-for="err in errors" :key="err" color="error" variant="subtle" :title="err" />
    </div>

    <div v-if="warnings.length > 0" class="flex flex-col gap-2">
      <UAlert v-for="w in warnings" :key="w" color="warning" variant="subtle" :title="w" />
    </div>

    <div v-if="!hideNavigation" class="flex justify-between pt-2">
      <UButton
        :label="t('participantsStep.previous')"
        color="neutral"
        variant="ghost"
        size="lg"
        icon="i-fa7-solid:arrow-left"
        @click="emit('previous')"
      />
      <UButton
        :label="props.nextLabel ?? t('participantsStep.next')"
        :icon="props.nextLabel ? 'i-fa7-solid:calendar-check' : undefined"
        :trailing-icon="props.nextLabel ? undefined : 'i-fa7-solid:arrow-right'"
        size="lg"
        :loading="validating"
        :disabled="allPlayerIdsModel.length < 2 || errors.length > 0 || !!tooManyError"
        @click="onNext"
      />
    </div>

    <PlayerPickerDialog
      v-model:visible="pickerVisible"
      :title="t('participantsStep.pickerTitle')"
      :players="allPlayers"
      :selected-ids="allPlayerIdsModel"
      @update:selected-ids="allPlayerIdsModel = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesSearch } from '@/utils/StringUtils'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useParticipantService } from '@/composables/participant.service'
import { useMatchService } from '@/composables/match/match.service'
import { useViewport } from '@/composables/useViewport'
import PlayerPickerDialog from '@/components/match/mobile/PlayerPickerDialog.vue'

interface Player {
  id: string
  displayName: string
}

interface Props {
  tournamentId: string
  playedAt?: Date | null
  matchId?: string
  hideNavigation?: boolean
  nextLabel?: string
  players?: Player[]
  /** Players per side allowed by the tournament; absent = no live check. */
  minTeamSize?: number
  maxTeamSize?: number
}

interface Emits {
  (e: 'previous'): void
  (e: 'next'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const allPlayerIdsModel = defineModel<string[]>('allPlayerIds', { required: true })

const { getTournamentParticipants } = useParticipantService()
const { validateParticipants } = useMatchService()
const { isMobile } = useViewport()

const allPlayers = ref<Player[]>([])
const searchQuery = ref('')
/** Only a relay for the menu's selection: a pick is added, then cleared. */
const pickedPlayer = ref<Player | undefined>()
const loadingPlayers = ref(false)
const validating = ref(false)
const pickerVisible = ref(false)
const errors = ref<string[]>([])
const warnings = ref<string[]>([])

async function loadPlayers() {
  loadingPlayers.value = true
  try {
    const participants = await getTournamentParticipants(props.tournamentId)
    allPlayers.value = participants.map((p) => ({
      id: p.userId,
      displayName: p.user.displayName,
    }))
  } finally {
    loadingPlayers.value = false
  }
}

watch(
  () => props.players,
  (list) => {
    if (list) allPlayers.value = list
  },
  { immediate: true },
)

const filteredPlayers = computed(() =>
  allPlayers.value.filter(
    (p) =>
      matchesSearch(p.displayName, searchQuery.value) && !allPlayerIdsModel.value.includes(p.id),
  ),
)

function addPlayer(player: Player | undefined) {
  if (player && !allPlayerIdsModel.value.includes(player.id)) {
    allPlayerIdsModel.value = [...allPlayerIdsModel.value, player.id]
  }
  // After the menu has written its own label into the input.
  setTimeout(() => {
    pickedPlayer.value = undefined
    searchQuery.value = ''
  }, 0)
}

function removePlayer(id: string) {
  allPlayerIdsModel.value = allPlayerIdsModel.value.filter((p) => p !== id)
}

function getPlayerName(id: string): string {
  return allPlayers.value.find((p) => p.id === id)?.displayName ?? id
}

const fixedFormat = computed(() => props.minTeamSize === props.maxTeamSize)
const formatLabel = computed(() =>
  fixedFormat.value
    ? t('matchFormat.exact', { size: props.minTeamSize })
    : t('matchFormat.range', { min: props.minTeamSize, max: props.maxTeamSize }),
)

/** "Format: 1 vs 1 · 2 players", told upfront rather than after Next. */
const formatHint = computed(() => {
  if (!props.minTeamSize || !props.maxTeamSize) return null
  return fixedFormat.value
    ? t('participantsStep.formatHint.exact', {
        format: formatLabel.value,
        total: props.minTeamSize * 2,
      })
    : t('participantsStep.formatHint.range', {
        format: formatLabel.value,
        min: props.minTeamSize * 2,
        max: props.maxTeamSize * 2,
      })
})

/** Live: too many players is known as soon as one too many is picked. */
const tooManyError = computed(() => {
  if (!props.minTeamSize || !props.maxTeamSize) return null
  const count = allPlayerIdsModel.value.length
  const max = props.maxTeamSize * 2
  if (count <= max) return null
  const key = fixedFormat.value
    ? 'participantsStep.tooMany.exact'
    : 'participantsStep.tooMany.range'
  return t(key, { format: formatLabel.value, total: max, max, count })
})

async function runValidation() {
  validating.value = true
  try {
    const result = await validateParticipants(
      props.tournamentId,
      allPlayerIdsModel.value,
      props.playedAt ?? undefined,
      props.matchId,
    )
    errors.value = result.errors
    warnings.value = result.warnings
    return result
  } finally {
    validating.value = false
  }
}

watch([allPlayerIdsModel, () => props.playedAt], () => {
  errors.value = []
  warnings.value = []
})

async function onNext() {
  if (tooManyError.value) return
  const result = await runValidation()
  if (!result?.valid) return
  emit('next')
}

defineExpose({ triggerNext: onNext })

if (props.players === undefined) {
  void loadPlayers()
}
</script>
