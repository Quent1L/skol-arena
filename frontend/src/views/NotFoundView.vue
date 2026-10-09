<template>
  <div
    class="not-found-view min-h-screen p-6 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 relative z-20"
  >
    <div class="max-w-md w-full text-center relative z-30">
      <div class="space-y-8">
        <!-- Error icon -->
        <div class="flex justify-center">
          <div class="relative">
            <div
              class="w-32 h-32 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center"
            >
              <i class="fa fa-exclamation-triangle text-6xl text-blue-600 dark:text-blue-400"></i>
            </div>
            <!-- Pulse animation -->
            <div
              class="absolute inset-0 w-32 h-32 bg-blue-200 dark:bg-blue-800/30 rounded-full animate-ping opacity-20"
            ></div>
          </div>
        </div>

        <!-- Main content -->
        <div class="space-y-4">
          <h1 class="text-6xl font-bold text-gray-900 dark:text-white">404</h1>

          <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200">{{ t('notFoundView.title') }}</h2>

          <p class="text-gray-600 dark:text-gray-400 leading-relaxed">
            {{ t('notFoundView.description') }}
          </p>
        </div>

        <!-- Actions -->
        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <UButton
              :label="t('notFoundView.goHome')"
              icon="i-fa7-solid:house"
              size="lg"
              class="flex-1 sm:flex-none justify-center"
              @click="goHome"
            />

            <UButton
              :label="t('notFoundView.goBack')"
              icon="i-fa7-solid:arrow-left"
              color="neutral"
              variant="subtle"
              size="lg"
              class="flex-1 sm:flex-none justify-center"
              @click="goBack"
            />
          </div>

          <!-- Quick links for logged-in users -->
          <div v-if="isAuthenticated" class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">{{ t('notFoundView.quickLinks') }}</p>
            <div class="flex flex-wrap gap-2 justify-center">
              <UButton :label="t('notFoundView.tournaments')" variant="ghost" size="sm" @click="router.push('/')" />
              <UButton
                v-if="canManageTournaments"
                :label="t('notFoundView.administration')"
                variant="ghost"
                size="sm"
                @click="router.push('/admin/tournaments')"
              />
            </div>
          </div>
        </div>

        <!-- Message for logged-out users -->
        <div v-if="!isAuthenticated" class="pt-6 border-t border-gray-200 dark:border-gray-700">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">{{ t('notFoundView.notLoggedIn') }}</p>
          <div class="flex gap-2 justify-center">
            <UButton :label="t('notFoundView.login')" variant="ghost" size="sm" @click="router.push('/login')" />
            <UButton :label="t('notFoundView.register')" variant="ghost" size="sm" @click="router.push('/register')" />
          </div>
        </div>
      </div>
    </div>

    <!-- Decorative element -->
    <div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
      <div
        class="absolute top-20 left-10 w-4 h-4 bg-blue-300 dark:bg-blue-600 rounded-full opacity-30 animate-float"
      ></div>
      <div
        class="absolute top-40 right-20 w-6 h-6 bg-indigo-300 dark:bg-indigo-600 rounded-full opacity-20 animate-float-delay"
      ></div>
      <div
        class="absolute bottom-32 left-20 w-3 h-3 bg-purple-300 dark:bg-purple-600 rounded-full opacity-25 animate-float"
      ></div>
      <div
        class="absolute bottom-20 right-32 w-5 h-5 bg-pink-300 dark:bg-pink-600 rounded-full opacity-15 animate-float-delay"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'

const { t } = useI18n()
const router = useRouter()
const { isAuthenticated, isSuperAdmin } = useAuth()

// Permissions
const canManageTournaments = computed(() => {
  return isAuthenticated.value && isSuperAdmin.value
})

// Actions
function goHome() {
  if (isAuthenticated.value) {
    router.push('/')
  } else {
    router.push('/public')
  }
}

function goBack() {
  // Check if there is history
  if (globalThis.history.length > 1) {
    router.back()
  } else {
    goHome()
  }
}
</script>

<style scoped>
/* Ensure clickability of interactive elements */
.not-found-view {
  pointer-events: auto;
}

.not-found-view button,
.not-found-view .p-button {
  pointer-events: auto;
  position: relative;
  z-index: 100;
}

/* Custom animations */
@keyframes float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes float-delay {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-15px);
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

.animate-float-delay {
  animation: float-delay 4s ease-in-out infinite;
  animation-delay: 1s;
}

/* Dark mode style */
.dark .not-found-view {
  color: white;
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .not-found-view h1 {
    font-size: 4rem;
  }

  .not-found-view h2 {
    font-size: 1.5rem;
  }
}
</style>
