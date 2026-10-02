<template>
  <Dialog
    v-model:visible="visible"
    modal
    :style="{ width: '100%', height: '100%', margin: 0, maxHeight: '100%' }"
    :pt="{
      root: { class: 'h-full w-full border-0 rounded-none' },
      header: { class: 'border-b p-4' },
      content: { class: 'p-0 h-full' },
      footer: { class: 'border-t p-4' },
    }"
    :showHeader="false"
  >
    <div class="flex flex-col h-full bg-white dark:bg-gray-900">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <Button icon="fas fa-times" text rounded @click="close" />
      </div>

      <!-- Search -->
      <div class="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <IconField>
          <InputText v-model="searchQuery" :placeholder="t('playerPickerDialog.searchPlaceholder')" class="w-full" />
          <InputIcon :class="inputFilterIcon" @click="searchQuery = ''" />
        </IconField>
      </div>

      <!-- Player List -->
      <div class="flex-1 overflow-y-auto p-2">
        <div v-if="searching" class="flex justify-center p-8">
          <ProgressSpinner style="width: 32px; height: 32px" />
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
        <Button :label="t('playerPickerDialog.done')" class="w-full" @click="close" />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesSearch } from '@/utils/StringUtils'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import ProgressSpinner from 'primevue/progressspinner'

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

const inputFilterIcon = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return 'fas fa-search'
  return 'fas fa-x cursor-pointer'
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
