<template>
  <div class="team-selector">
    <div class="mb-4">
      <AutoComplete
        v-model="searchQuery"
        :suggestions="filteredPlayers"
        @complete="searchPlayers"
        @item-select="addPlayer"
        option-label="displayName"
        :placeholder="t('teamSelector.searchPlaceholder')"
        class="w-full"
        :disabled="loading"
        dropdown
      />
    </div>

    <div v-if="modelValue && modelValue.length > 0" class="mb-4">
      <div class="text-sm font-medium mb-2">{{ t('teamSelector.selectedPlayers') }}</div>
      <div class="flex flex-wrap gap-2">
        <Chip
          v-for="playerId in modelValue"
          :key="playerId"
          :label="getPlayerName(playerId)"
          removable
          @remove="removePlayer(playerId)"
          class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesSearch } from '@/utils/StringUtils'
import { useParticipantService } from '@/composables/participant.service'
import type { AutoCompleteCompleteEvent } from 'primevue/autocomplete'

const { t } = useI18n()

interface Player {
  id: string
  displayName: string
}

interface Props {
  tournamentId: string
}

const props = defineProps<Props>()

const modelValue = defineModel<string[]>({ required: true })

const emit = defineEmits<{
  validate: []
}>()

const { getTournamentParticipants } = useParticipantService()

const searchQuery = ref('')
const allPlayers = ref<Player[]>([])
const loading = ref(false)
const filteredPlayers = ref<Player[]>([])

async function loadPlayers() {
  if (!props.tournamentId) return

  loading.value = true
  try {
    const participants = await getTournamentParticipants(props.tournamentId)
    allPlayers.value = participants.map((p) => ({
      id: p.userId,
      displayName: p.user.displayName,
    }))
  } catch (error) {
    console.error('Erreur lors du chargement des joueurs:', error)
  } finally {
    loading.value = false
  }
}

function searchPlayers(e: AutoCompleteCompleteEvent) {
  if (!e.query || e.query.trim() === '') {
    filteredPlayers.value = [...allPlayers.value]
    return
  }

  filteredPlayers.value = allPlayers.value.filter(
    (player) => matchesSearch(player.displayName, e.query) && !modelValue.value.includes(player.id),
  )
}

function addPlayer(event: { value: Player }) {
  const player = event.value
  if (player && !modelValue.value.includes(player.id)) {
    modelValue.value = [...modelValue.value, player.id]
    emit('validate')
  }
  setTimeout(() => {
    searchQuery.value = ''
  }, 0)
}

function removePlayer(playerId: string) {
  modelValue.value = modelValue.value.filter((id) => id !== playerId)
  emit('validate')
}

function getPlayerName(playerId: string): string {
  const player = allPlayers.value.find((p) => p.id === playerId)
  return player ? player.displayName : t('teamSelector.playerFallback', { playerId })
}

watch(() => props.tournamentId, loadPlayers, { immediate: true })

defineExpose({
  loadPlayers,
})
</script>
