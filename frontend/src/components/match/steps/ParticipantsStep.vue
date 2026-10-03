<template>
  <div class="flex flex-col gap-6 pt-4">
    <h3 class="text-base font-semibold">{{ t('participantsStep.title') }}</h3>

    <div>
      <!-- Desktop: AutoComplete -->
      <AutoComplete
        v-if="!isMobile"
        v-model="searchQuery"
        :suggestions="filteredPlayers"
        option-label="displayName"
        :placeholder="t('participantsStep.searchPlaceholder')"
        class="w-full"
        :disabled="loadingPlayers"
        dropdown
        @complete="searchPlayers"
        @item-select="addPlayer"
      />

      <!-- Mobile: open picker dialog -->
      <Button
        v-else
        :label="t('participantsStep.addPlayers')"
        icon="fas fa-user-plus"
        outlined
        class="w-full"
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
          class="flex items-center pl-3 py-2 rounded-md bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 min-w-0"
        >
          <PlayerAvatar :name="getPlayerName(playerId)" :player-id="playerId" size="sm" />
          <span class="text-sm truncate flex-1 ml-2">{{ getPlayerName(playerId) }}</span>
          <Button
            severity="danger"
            outlined
            text
            class="p-0"
            icon="fas fa-times"
            @click="removePlayer(playerId)"
          >
          </Button>
        </div>
      </div>
    </div>

    <div v-if="errors.length > 0" class="flex flex-col gap-2">
      <Message v-for="err in errors" :key="err" severity="error" :closable="false">{{
        err
      }}</Message>
    </div>

    <div v-if="warnings.length > 0" class="flex flex-col gap-2">
      <Message v-for="w in warnings" :key="w" severity="warn" :closable="false">{{ w }}</Message>
    </div>

    <div v-if="!hideNavigation" class="flex justify-between pt-2">
      <Button
        :label="t('participantsStep.previous')"
        severity="secondary"
        icon="fas fa-arrow-left"
        @click="emit('previous')"
      />
      <Button
        :label="props.nextLabel ?? t('participantsStep.next')"
        :icon="props.nextLabel ? 'fas fa-calendar-check' : 'fas fa-arrow-right'"
        :icon-pos="props.nextLabel ? undefined : 'right'"
        :class="props.nextLabel ? 'bg-green-600 hover:bg-green-700' : ''"
        :loading="validating"
        :disabled="allPlayerIdsModel.length < 2 || errors.length > 0"
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
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesSearch } from '@/utils/StringUtils'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'
import Message from 'primevue/message'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useParticipantService } from '@/composables/participant.service'
import { useMatchService } from '@/composables/match/match.service'
import { useViewport } from '@/composables/useViewport'
import PlayerPickerDialog from '@/components/match/mobile/PlayerPickerDialog.vue'
import type { AutoCompleteCompleteEvent } from 'primevue/autocomplete'

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
const filteredPlayers = ref<Player[]>([])
const searchQuery = ref('')
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

function searchPlayers(e: AutoCompleteCompleteEvent) {
  filteredPlayers.value = allPlayers.value.filter(
    (p) => matchesSearch(p.displayName, e.query) && !allPlayerIdsModel.value.includes(p.id),
  )
}

function addPlayer(event: { value: Player }) {
  const player = event.value
  if (player && !allPlayerIdsModel.value.includes(player.id)) {
    allPlayerIdsModel.value = [...allPlayerIdsModel.value, player.id]
  }
  setTimeout(() => {
    searchQuery.value = ''
  }, 0)
}

function removePlayer(id: string) {
  allPlayerIdsModel.value = allPlayerIdsModel.value.filter((p) => p !== id)
}

function getPlayerName(id: string): string {
  return allPlayers.value.find((p) => p.id === id)?.displayName ?? id
}

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
  const result = await runValidation()
  if (!result?.valid) return
  emit('next')
}

defineExpose({ triggerNext: onNext })

if (props.players === undefined) {
  void loadPlayers()
}
</script>
