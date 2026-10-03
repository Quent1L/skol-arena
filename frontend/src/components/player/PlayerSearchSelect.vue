<template>
  <AutoComplete
    v-model="selected"
    :inputId="inputId"
    :suggestions="suggestions"
    option-label="displayName"
    :placeholder="placeholder"
    :delay="300"
    force-selection
    dropdown-mode="current"
    class="w-full"
    @complete="onComplete"
    @item-select="onSelect"
    @clear="onClear"
  >
    <template #option="{ option }">
      <div class="flex items-center gap-2">
        <PlayerAvatar :name="option.displayName" :player-id="option.id" size="sm" shape="square" />
        <div class="min-w-0">
          <div class="font-medium text-white truncate">{{ option.displayName }}</div>
          <div v-if="option.shortName" class="text-xs text-gray-400">{{ option.shortName }}</div>
        </div>
      </div>
    </template>
  </AutoComplete>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteItemSelectEvent,
} from 'primevue/autocomplete'
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

const selected = ref<PlayerProfile | null>(props.modelValue)
const suggestions = ref<PlayerProfile[]>([])

watch(
  () => props.modelValue,
  (value) => {
    selected.value = value
  },
)

async function onComplete(event: AutoCompleteCompleteEvent) {
  const query = event.query.trim()
  if (!query) {
    suggestions.value = []
    return
  }
  suggestions.value = await searchPlayers(query)
}

function onSelect(event: AutoCompleteItemSelectEvent) {
  emit('update:modelValue', event.value as PlayerProfile)
}

function onClear() {
  emit('update:modelValue', null)
}
</script>
