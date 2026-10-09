<template>
  <div
    v-if="visible"
    class="mb-4 flex items-center gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/40"
  >
    <i class="fa fa-film text-2xl text-indigo-500 dark:text-indigo-300" />

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-gray-900 dark:text-white">
          {{ t('rewind.entry.title') }}
        </span>
        <span
          v-if="unwatched"
          class="rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white"
        >
          {{ t('rewind.entry.new') }}
        </span>
      </div>
      <p class="truncate text-sm text-gray-600 dark:text-gray-400">
        {{ t('rewind.entry.subtitle') }}
      </p>
    </div>

    <UButton
      :label="t('rewind.entry.action')"
      icon="i-fa7-solid:play"
      class="shrink-0"
      @click="open = true"
      size="md"
    />

    <RewindLauncher v-model:open="open" :season-id="seasonId" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRewindService } from '@/composables/ranked/rewind.service'
import RewindLauncher from './RewindLauncher.vue'

/**
 * Permanent way back into a season's rewind. Unlike the home banner this has no
 * expiry and ignores the viewed state — it is the replay path, available for as
 * long as the season exists.
 */
const props = defineProps<{ seasonId: string; seasonStatus?: string }>()

const { t } = useI18n()
const { promoted } = useRewindService()

const open = ref(false)
const visible = computed(() => props.seasonStatus === 'finished')
const unwatched = computed(() => promoted.value?.seasonId === props.seasonId)
</script>
