<template>
  <div
    v-if="store.tournament"
    class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
    data-testid="tournament-settings"
  >
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
      {{ t('tournamentSettingsTab.intro') }}
    </p>
    <ul class="space-y-2">
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg"
        :data-testid="`settings-row-${row.id}`"
      >
        <i
          :class="['fa', row.icon]"
          class="text-primary-500 w-4 shrink-0 text-sm text-center mt-0.5"
        />
        <div class="min-w-0">
          <div class="font-medium text-gray-700 dark:text-gray-300 text-sm">{{ row.title }}</div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ row.text }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import { summarizeTournamentSettings } from '@/utils/tournament-settings-summary'

/** The settings that shape a player's matches, said in plain words. */
const store = useTournamentDetailStore()
const { t } = useI18n()

const rows = computed(() =>
  store.tournament ? summarizeTournamentSettings(store.tournament, t) : [],
)
</script>
