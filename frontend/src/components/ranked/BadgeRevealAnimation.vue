<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[500] flex items-center justify-center bg-black/85 px-4">
      <div class="w-full max-w-sm rounded-3xl bg-gray-900 text-white shadow-2xl overflow-hidden">
        <div class="flex flex-col items-center gap-4 py-8 px-6">
          <div class="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/20 text-amber-400">
            {{ t('badgeRevealAnimation.newBadge') }}
          </div>

          <Transition name="badge-pop" appear>
            <div v-if="show" class="flex flex-col items-center gap-3">
              <div class="relative flex items-center justify-center">
                <div class="absolute inset-0 rounded-full bg-amber-400/20 blur-xl animate-pulse" />
                <i
                  :class="badge.icon || 'fa fa-medal'"
                  class="relative text-7xl text-amber-400 badge-icon-glow"
                />
              </div>
              <div class="text-2xl font-black text-amber-300">{{ badge.label }}</div>
              <div class="text-center text-sm text-gray-400 px-4">{{ badge.description }}</div>
            </div>
          </Transition>
        </div>

        <div class="px-6 pb-6">
          <Transition name="fade-up">
            <button
              v-if="show"
              class="w-full py-3 rounded-xl font-semibold text-sm bg-gray-700 hover:bg-gray-600 transition-colors"
              @click="$emit('close')"
            >
              {{ t('badgeRevealAnimation.continue') }}
            </button>
          </Transition>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BadgeAnimationResponse } from '@skol-arena/shared'
import { holdScreen } from '@/composables/useScreenTakeover'

const { t } = useI18n()

defineProps<{ badge: BadgeAnimationResponse }>()
defineEmits<{ (e: 'close'): void }>()

// A full-screen moment: secondary messages wait for it to close.
holdScreen()

const show = ref(false)
onMounted(() => {
  setTimeout(() => {
    show.value = true
  }, 150)
})
</script>

<style scoped>
.badge-pop-enter-active {
  animation: badge-bounce 0.6s ease-out;
}
@keyframes badge-bounce {
  0% { transform: scale(0) rotate(-20deg); opacity: 0; }
  55% { transform: scale(1.25) rotate(6deg); }
  80% { transform: scale(0.92) rotate(-2deg); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}

.badge-icon-glow {
  animation: icon-glow 1.6s ease-in-out infinite;
}
@keyframes icon-glow {
  0%, 100% { filter: drop-shadow(0 0 8px #fbbf24); transform: scale(1); }
  50% { filter: drop-shadow(0 0 24px #fbbf24); transform: scale(1.08); }
}

.fade-up-enter-active {
  transition: opacity 0.4s, transform 0.4s;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
</style>
