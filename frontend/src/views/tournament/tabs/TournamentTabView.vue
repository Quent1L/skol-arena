<template>
  <component :is="resolvedTab" v-if="resolvedTab" />
  <div v-else class="text-center py-12 text-gray-500 dark:text-gray-400">
    <i class="fa fa-exclamation-circle text-4xl mb-4 block"></i>
    <p>{{ t('tournamentTabView.tabNotFound') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const tabComponents: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  infos: defineAsyncComponent(() => import('./TournamentInfosTab.vue')),
  participants: defineAsyncComponent(() => import('./TournamentParticipantsTab.vue')),
  settings: defineAsyncComponent(() => import('./TournamentSettingsTab.vue')),
  teams: defineAsyncComponent(() => import('./TournamentTeamsTab.vue')),
  stats: defineAsyncComponent(() => import('./TournamentStatsCombinedTab.vue')),
  standings: defineAsyncComponent(() => import('./TournamentStandingsTab.vue')),
  bracket: defineAsyncComponent(() => import('./TournamentBracketTab.vue')),
  matches: defineAsyncComponent(() => import('./TournamentMatchesTab.vue')),
  badges: defineAsyncComponent(() => import('./TournamentBadgesTab.vue')),
}

const resolvedTab = computed(() => {
  const tab = route.params.tab as string
  return tabComponents[tab] ?? null
})
</script>
