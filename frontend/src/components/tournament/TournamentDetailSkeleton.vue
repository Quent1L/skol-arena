<template>
  <!-- Mirrors the chrome the tournament will render, down to the tab actually being
       opened, so the page settles rather than being rebuilt when the data lands. -->
  <div class="sk-shimmer" :class="variant === 'mobile' ? '' : 'min-h-screen bg-gray-50 dark:bg-gray-900'">
    <!-- Mobile sub-page (teams, badges): its own title bar, no bottom nav. -->
    <div v-if="isMobileSubPage" class="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <div
        class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-14 flex items-center px-4 shadow-sm gap-3"
      >
        <USkeleton class="h-[1rem] w-[8rem]" />
      </div>
      <div class="flex-1 p-4">
        <TournamentTabSkeleton :tab="tab" variant="mobile" />
      </div>
    </div>

    <template v-else-if="variant === 'mobile'">
      <div class="flex flex-col bg-gray-50 dark:bg-gray-900" style="min-height: calc(100vh - 7rem)">
        <div class="flex-1 p-4 pb-20 space-y-4">
          <!-- TournamentHeader lives in the infos tab only. -->
          <template v-if="!tab || tab === 'infos'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <USkeleton class="h-[1.5rem] w-[5rem] rounded-full!" />
                <USkeleton class="h-[1.5rem] w-[4rem] rounded-full!" />
              </div>
              <USkeleton class="size-[2.5rem] rounded-full" />
            </div>
            <USkeleton class="h-[2rem] w-[70%]" />
          </template>

          <TournamentTabSkeleton :tab="tab" variant="mobile" />
        </div>
      </div>

      <!-- MobileBottomNav -->
      <div class="fixed bottom-0 left-0 right-0 bg-gray-800 flex items-center px-2 z-50 sk-nav-bar">
        <div v-for="i in 4" :key="i" class="flex-1 flex flex-col items-center gap-1">
          <USkeleton class="size-[1.5rem] rounded-full" />
          <USkeleton class="h-[0.5rem] w-[2.5rem]" />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-6">
        <div class="max-w-5xl mx-auto">
          <div class="flex items-center gap-3 mb-4">
            <USkeleton class="size-[2.5rem] rounded-full" />
            <USkeleton class="h-[2rem] w-[40%]" />
          </div>
          <USkeleton class="h-[1rem] w-[20%] mb-1" />
        </div>
      </div>
      <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div class="max-w-5xl mx-auto px-6">
          <USkeleton class="h-[3rem] w-full" />
        </div>
      </div>
      <div class="max-w-6xl mx-auto px-6 py-6 min-h-[70vh]">
        <TournamentTabSkeleton :tab="tab" variant="desktop" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TournamentTabSkeleton from './TournamentTabSkeleton.vue'

const props = defineProps<{
  variant: 'mobile' | 'desktop'
  /** Route tab. Absent while the view is still resolving its default tab. */
  tab?: string
}>()

/** Same list as MOBILE_SUB_TABS in TournamentDetailView: these get the title bar. */
const MOBILE_SUB_TABS = ['teams', 'badges']

const isMobileSubPage = computed(
  () => props.variant === 'mobile' && MOBILE_SUB_TABS.includes(props.tab ?? ''),
)
</script>

<style scoped>
/* Same height contract as MobileBottomNav, so the placeholder nav sits exactly
   where the real one will. */
.sk-nav-bar {
  padding-bottom: env(safe-area-inset-bottom);
  height: calc(4rem + env(safe-area-inset-bottom));
}
</style>
