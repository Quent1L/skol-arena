<template>
  <UModal v-model:open="visible" fullscreen :title="title" :ui="{ content: 'divide-y-0' }">
    <template #content>
    <div class="flex flex-col h-full bg-white dark:bg-gray-900">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <UButton
          icon="i-fa7-solid:xmark"
          variant="ghost"
          size="lg"
          class="rounded-full"
          :aria-label="t('common.close')"
          @click="close"
        />
      </div>

      <!-- Search -->
      <div class="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <UInput
          v-model="searchQuery"
          :placeholder="t('playerPickerDialog.searchPlaceholder')"
          size="xl"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              :icon="searchQuery ? 'i-fa7-solid:xmark' : 'i-fa7-solid:magnifying-glass'"
              :aria-label="t('whenStep.clearButton')"
              :disabled="!searchQuery"
              class="px-0"
              @click="searchQuery = ''"
            />
          </template>
        </UInput>
      </div>

      <!-- Player List -->
      <div class="flex-1 overflow-y-auto p-2">
        <div v-if="searching" class="flex justify-center p-8">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-muted" />
        </div>
        <div v-else-if="displayedPlayers.length === 0" class="text-center p-8 text-gray-500">
          {{ t('playerPickerDialog.noResults') }}
        </div>
        <div
          v-for="player in displayedPlayers"
          :key="player.id"
          class="flex items-center p-3 mb-2 rounded-lg active:bg-gray-100 dark:active:bg-gray-800 transition-colors cursor-pointer"
          :class="{
            'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800':
              !single && isSelected(player.id),
          }"
          @click="pickPlayer(player)"
        >
          <PlayerAvatar
            :name="player.displayName"
            :player-id="player.id"
            shape="square"
            class="mr-3"
            :class="{ 'ring-2 ring-blue-500': !single && isSelected(player.id) }"
          />
          <div class="flex-1">
            <div class="font-medium">{{ player.displayName }}</div>
          </div>
          <div v-if="!single && isSelected(player.id)" class="text-blue-600 dark:text-blue-400">
            <i class="fas fa-check-circle text-xl" />
          </div>
          <div v-else-if="!single" class="text-gray-300 dark:text-gray-600">
            <i class="far fa-circle text-xl" />
          </div>
        </div>
      </div>

      <!-- Footer (multi-select only) -->
      <div v-if="!single" class="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-900">
        <UButton :label="t('playerPickerDialog.done')" size="xl" block @click="close" />
      </div>
    </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesSearch } from '@/utils/StringUtils'
import PlayerAvatar from '@/components/PlayerAvatar.vue'

interface Player {
  id: string
  displayName: string
  avatarUrl?: string
  shortName?: string
}

interface Props {
  title?: string
  players?: Player[]
  selectedIds?: string[]
  single?: boolean
  searchFn?: (query: string) => Promise<Player[]>
}

const { t } = useI18n()

const props = withDefaults(defineProps<Props>(), {
  players: () => [],
  selectedIds: () => [],
  single: false,
})

const title = computed(() => props.title ?? t('playerPickerDialog.defaultTitle'))

const emit = defineEmits<{
  'update:selectedIds': [ids: string[]]
  'select': [player: Player]
  close: []
}>()

const visible = defineModel<boolean>('visible')
const searchQuery = ref('')
const liveResults = ref<Player[]>([])
const searching = ref(false)

const filteredPlayers = computed(() => {
  const query = searchQuery.value.trim()
  if (!query) return props.players
  return props.players.filter((p) => matchesSearch(p.displayName, query))
})

const displayedPlayers = computed(() =>
  props.searchFn ? liveResults.value : filteredPlayers.value,
)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (q) => {
  if (!props.searchFn) return
  if (debounceTimer) clearTimeout(debounceTimer)
  const query = q.trim()
  if (!query) {
    liveResults.value = []
    return
  }
  searching.value = true
  debounceTimer = setTimeout(async () => {
    try {
      liveResults.value = await props.searchFn!(query)
    } finally {
      searching.value = false
    }
  }, 300)
})

function isSelected(id: string) {
  return props.selectedIds.includes(id)
}

function pickPlayer(player: Player) {
  if (props.single) {
    emit('select', player)
    close()
    return
  }
  const newIds = [...props.selectedIds]
  const index = newIds.indexOf(player.id)
  if (index === -1) newIds.push(player.id)
  else newIds.splice(index, 1)
  emit('update:selectedIds', newIds)
}

function close() {
  visible.value = false
  emit('close')
}
</script>
