<template>
  <div class="flex flex-col md:flex-row items-center md:items-stretch md:justify-between gap-4">
    <div class="w-full md:w-1/2 p-4 bg-white dark:bg-gray-900 rounded-lg shadow-sm animate-fade-in">
      <h4 class="text-sm font-semibold mb-2">{{ t('teamPreview.teamA') }}</h4>
      <h4 v-if="teamAName" class="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
        {{ teamAName }}
      </h4>
      <ul class="text-sm space-y-1">
        <li v-if="teamAPlayers.length === 0" class="text-gray-500">
          {{ t('teamPreview.noPlayersSelected') }}
        </li>
        <li v-for="(p, idx) in teamAPlayers" :key="`a-${idx}`">{{ p }}</li>
      </ul>
    </div>

    <div class="w-full md:w-1/2 p-4 bg-white dark:bg-gray-900 rounded-lg shadow-sm animate-fade-in">
      <h4 class="text-sm font-semibold mb-2">{{ t('teamPreview.teamB') }}</h4>
      <h4 v-if="teamBName" class="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
        {{ teamBName }}
      </h4>
      <ul class="text-sm space-y-1">
        <li v-if="teamBPlayers.length === 0" class="text-gray-500">
          {{ t('teamPreview.noPlayersSelected') }}
        </li>
        <li v-for="(p, idx) in teamBPlayers" :key="`b-${idx}`">{{ p }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  teamAPlayers: string[]
  teamBPlayers: string[]
  teamAName?: string
  teamBName?: string
}

defineProps<Props>()
</script>
