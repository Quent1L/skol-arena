<template>
  <div class="fixed bottom-0 left-0 right-0 bg-gray-800 flex items-center px-2 z-50 nav-bar">
    <template v-if="canCreateMatch">
      <button
        v-for="tab in leftTabs"
        :key="tab.id"
        @click="emit('navigate', tab.id)"
        class="flex-1 relative flex flex-col items-center justify-center py-2 px-1 rounded-xl min-h-[3.5rem]"
      >
        <div
          class="absolute inset-0 rounded-xl transition-all duration-300 ease-out"
          :class="
            activeTab === tab.id
              ? 'opacity-100 scale-100 bg-gray-700/70'
              : 'opacity-0 scale-90 bg-transparent'
          "
        />
        <i
          class="relative z-10 text-xl mb-1 transition-all duration-300"
          :class="[tab.icon, activeTab === tab.id ? 'text-primary-400 scale-110' : 'text-gray-500']"
        />
        <span
          class="relative z-10 text-xs font-semibold uppercase tracking-wide transition-all duration-300"
          :class="activeTab === tab.id ? 'text-white' : 'text-gray-500'"
        >{{ tab.label }}</span>
      </button>

      <button
        @click="emit('create-match')"
        class="flex-none flex flex-col items-center justify-center w-16 mx-2"
        style="transform: translateY(-14px)"
      >
        <div class="w-16 h-16 rounded-full bg-primary-500 flex flex-col items-center justify-center shadow-lg">
          <i class="fas fa-plus text-white  text-xl mb-1 font-bold" />
          <span class="text-white text-[10px] font-bold uppercase tracking-wide">{{ t('common.create') }}</span>
        </div>
      </button>

      <button
        v-for="tab in rightTabs"
        :key="tab.id"
        @click="emit('navigate', tab.id)"
        class="flex-1 relative flex flex-col items-center justify-center py-2 px-1 rounded-xl min-h-[3.5rem]"
      >
        <div
          class="absolute inset-0 rounded-xl transition-all duration-300 ease-out"
          :class="
            activeTab === tab.id
              ? 'opacity-100 scale-100 bg-gray-700/70'
              : 'opacity-0 scale-90 bg-transparent'
          "
        />
        <i
          class="relative z-10 text-xl mb-1 transition-all duration-300"
          :class="[tab.icon, activeTab === tab.id ? 'text-primary-400 scale-110' : 'text-gray-500']"
        />
        <span
          class="relative z-10 text-xs font-semibold uppercase tracking-wide transition-all duration-300"
          :class="activeTab === tab.id ? 'text-white' : 'text-gray-500'"
        >{{ tab.label }}</span>
      </button>
    </template>

    <template v-else>
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="emit('navigate', tab.id)"
        class="flex-1 relative flex flex-col items-center justify-center py-2 px-1 rounded-xl min-h-[3.5rem]"
      >
        <div
          class="absolute inset-0 rounded-xl transition-all duration-300 ease-out"
          :class="
            activeTab === tab.id
              ? 'opacity-100 scale-100 bg-gray-700/70'
              : 'opacity-0 scale-90 bg-transparent'
          "
        />
        <i
          class="relative z-10 text-xl mb-1 transition-all duration-300"
          :class="[tab.icon, activeTab === tab.id ? 'text-primary-400 scale-110' : 'text-gray-500']"
        />
        <span
          class="relative z-10 text-xs font-semibold uppercase tracking-wide transition-all duration-300"
          :class="activeTab === tab.id ? 'text-white' : 'text-gray-500'"
        >{{ tab.label }}</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { registerBottomNav } from '@/composables/ui/useBottomNav'

const { t } = useI18n()
registerBottomNav()

interface NavTab {
  id: string
  label: string
  icon: string
}

const props = defineProps<{
  activeTab: string
  tournamentMode: string
  teamMode: string
  isAuthenticated: boolean
  canCreateMatch?: boolean
}>()

const emit = defineEmits<{
  navigate: [tab: string]
  'create-match': []
}>()

const tabs = computed<NavTab[]>(() => {
  if (props.tournamentMode === 'ranked') {
    return [
      { id: 'infos', label: t('mobileBottomNav.detail'), icon: 'fas fa-info-circle' },
      { id: 'standings', label: t('mobileBottomNav.standings'), icon: 'fas fa-trophy' },
      { id: 'matches', label: t('mobileBottomNav.matches'), icon: 'fas fa-gamepad' },
      { id: 'stats', label: t('mobileBottomNav.stats'), icon: 'fas fa-chart-pie' },
    ]
  }

  if (props.tournamentMode === 'bracket') {
    return [
      { id: 'infos', label: t('mobileBottomNav.info'), icon: 'fas fa-info-circle' },
      { id: 'bracket', label: t('mobileBottomNav.bracket'), icon: 'fas fa-sitemap' },
      { id: 'matches', label: t('mobileBottomNav.matches'), icon: 'fas fa-gamepad' },
      { id: 'stats', label: t('mobileBottomNav.stats'), icon: 'fas fa-chart-pie' },
      ...(props.teamMode === 'static'
        ? [{ id: 'teams', label: t('mobileBottomNav.teams'), icon: 'fas fa-users' }]
        : []),
    ]
  }

  return [
    { id: 'infos', label: t('mobileBottomNav.info'), icon: 'fas fa-info-circle' },
    { id: 'standings', label: t('mobileBottomNav.standings'), icon: 'fas fa-trophy' },
    { id: 'matches', label: t('mobileBottomNav.matches'), icon: 'fas fa-gamepad' },
    { id: 'stats', label: t('mobileBottomNav.stats'), icon: 'fas fa-chart-pie' },
    ...(props.teamMode === 'static'
      ? [{ id: 'teams', label: t('mobileBottomNav.teams'), icon: 'fas fa-users' }]
      : []),
  ]
})

const leftTabs = computed(() => tabs.value.slice(0, Math.floor(tabs.value.length / 2)))
const rightTabs = computed(() => tabs.value.slice(Math.floor(tabs.value.length / 2)))
</script>

<style scoped>
.nav-bar {
  padding-bottom: env(safe-area-inset-bottom);
  height: calc(4rem + env(safe-area-inset-bottom));
}
</style>
