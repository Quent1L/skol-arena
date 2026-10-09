<template>
  <UInputMenu
    :id="inputId"
    v-model="selected"
    v-model:search-term="searchTerm"
    :items="suggestions"
    label-key="displayName"
    by="id"
    ignore-filter
    :placeholder="placeholder"
    size="xl"
    class="w-full"
    @update:model-value="onSelect"
  >
    <template #item="{ item }">
      <div class="flex items-center gap-2">
        <PlayerAvatar :name="item.displayName" :player-id="item.id" size="sm" shape="square" />
        <div class="min-w-0">
          <div class="font-medium text-white truncate">{{ item.displayName }}</div>
          <div v-if="item.shortName" class="text-xs text-gray-400">{{ item.shortName }}</div>
        </div>
      </div>
    </template>
  </UInputMenu>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { usePlayerComparisonService } from '@/composables/player/player.comparison.service'
import type { PlayerProfile } from '@skol-arena/shared/types/index'

const props = defineProps<{
  modelValue: PlayerProfile | null
  placeholder?: string
  inputId?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PlayerProfile | null): void
}>()

const { searchPlayers } = usePlayerComparisonService()

const selected = ref<PlayerProfile | undefined>(props.modelValue ?? undefined)
const searchTerm = ref('')
const suggestions = ref<PlayerProfile[]>([])

watch(
  () => props.modelValue,
  (value) => {
    selected.value = value ?? undefined
  },
)

/** Server-side search, debounced like the former 300 ms autocomplete delay. */
watchDebounced(
  searchTerm,
  async (term) => {
    const query = term.trim()
    // The menu writes the picked player's name back into the input: not a new search.
    if (!query || query === selected.value?.displayName) {
      suggestions.value = selected.value ? [selected.value] : []
      return
    }
    suggestions.value = await searchPlayers(query)
  },
  { debounce: 300 },
)

function onSelect(value: PlayerProfile | undefined) {
  emit('update:modelValue', value ?? null)
}
</script>
