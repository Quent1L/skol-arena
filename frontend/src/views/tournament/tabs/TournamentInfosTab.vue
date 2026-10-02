<template>
  <div class="space-y-4 sm:space-y-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" :class="store.tournament!.teamMode === 'static' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'">
      <!-- Participants -->
      <button
        @click="navigateTo('participants')"
        class="group flex items-center justify-between p-4 sm:p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md active:scale-[0.98] transition-all text-left cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <i class="fa fa-users text-blue-600 dark:text-blue-400 text-sm sm:text-base" />
          </div>
          <div>
            <div class="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{{ t('tournamentInfosTab.participants.title') }}</div>
            <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{{ t('tournamentInfosTab.participants.subtitle') }}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Badge :value="store.participantCount" severity="info" size="small" />
          <i class="fa fa-chevron-right text-gray-400 text-xs sm:text-sm group-hover:text-primary-500 transition-colors" />
        </div>
      </button>

      <!-- Équipes (static uniquement) -->
      <button
        v-if="store.tournament!.teamMode === 'static'"
        @click="navigateTo('teams')"
        class="group flex items-center justify-between p-4 sm:p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md active:scale-[0.98] transition-all text-left cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <i class="fa fa-shield-halved text-green-600 dark:text-green-400 text-sm sm:text-base" />
          </div>
          <div>
            <div class="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{{ t('tournamentInfosTab.teams.title') }}</div>
            <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{{ t('tournamentInfosTab.teams.subtitle') }}</div>
          </div>
        </div>
        <i class="fa fa-chevron-right text-gray-400 text-xs sm:text-sm group-hover:text-primary-500 transition-colors shrink-0" />
      </button>

      <!-- Badges -->
      <button
        v-if="store.tournament!.mode === 'ranked'"
        @click="navigateTo('badges')"
        class="group flex items-center justify-between p-4 sm:p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md active:scale-[0.98] transition-all text-left cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <i class="fa fa-medal text-purple-600 dark:text-purple-400 text-sm sm:text-base" />
          </div>
          <div>
            <div class="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{{ t('tournamentInfosTab.badges.title') }}</div>
            <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{{ t('tournamentInfosTab.badges.subtitle') }}</div>
          </div>
        </div>
        <i class="fa fa-chevron-right text-gray-400 text-xs sm:text-sm group-hover:text-primary-500 transition-colors shrink-0" />
      </button>

      <!-- Rules -->
      <button
        v-if="store.tournament!.rulesId"
        @click="router.push(`/rules/${store.tournament!.rulesId}`)"
        class="group flex items-center justify-between p-4 sm:p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md active:scale-[0.98] transition-all text-left cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <i class="fa fa-scroll text-amber-600 dark:text-amber-400 text-sm sm:text-base" />
          </div>
          <div>
            <div class="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{{ t('tournamentInfosTab.rules.title') }}</div>
            <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{{ t('tournamentInfosTab.rules.subtitle') }}</div>
          </div>
        </div>
        <i class="fa fa-chevron-right text-gray-400 text-xs sm:text-sm group-hover:text-primary-500 transition-colors shrink-0" />
      </button>
    </div>

    <div
      v-if="store.tournament!.description"
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 tournament-description text-gray-700 dark:text-gray-300"
      v-html="safeDescription"
    />

    <MmrExplainerCard
      v-if="store.tournament!.mode === 'ranked'"
      :tournament-id="(route.params.id as string)"
    />

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentDetailStore } from '@/stores/tournamentDetail.store'
import MmrExplainerCard from '@/components/ranked/MmrExplainerCard.vue'
import { sanitizeHtml } from '@/utils/sanitize-html'

const store = useTournamentDetailStore()
const safeDescription = computed(() => sanitizeHtml(store.tournament?.description))
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

function navigateTo(tab: string) {
  router.push({ name: 'tournament-tab', params: { id: route.params.id, tab } })
}
</script>

<style scoped>
:deep(.tournament-description h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}
:deep(.tournament-description h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}
:deep(.tournament-description ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
:deep(.tournament-description ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
:deep(.tournament-description p) {
  margin: 0.5rem 0;
}
:deep(.tournament-description strong) {
  font-weight: 700;
}
:deep(.tournament-description em) {
  font-style: italic;
}
:deep(.tournament-description u) {
  text-decoration: underline;
}
:deep(.tournament-description a) {
  color: rgb(59 130 246);
  text-decoration: underline;
}
</style>
