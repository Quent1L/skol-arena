<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4"
  >
    <div class="max-w-sm w-full text-center space-y-8">
      <div class="flex justify-center">
        <SkolLogo :width="280" />
      </div>

      <div class="space-y-3">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t(titleKey) }}</h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm">
          {{ t(descriptionKey) }}
        </p>
      </div>

      <div class="space-y-4">
        <!-- The automatic retry must be visible: otherwise the app looks frozen. -->
        <p
          class="text-gray-400 dark:text-gray-500 text-xs flex items-center justify-center gap-2"
          aria-live="polite"
        >
          <template v-if="checking">
            <i class="fa fa-spinner fa-spin" aria-hidden="true"></i>
            {{ t('offlineView.checking') }}
          </template>
          <!-- With no network no attempt runs: announcing a countdown would be false. -->
          <template v-else-if="isDeviceOffline">
            {{ t('offlineView.waitingForNetwork') }}
          </template>
          <template v-else>
            {{ t('offlineView.nextAttempt', { seconds: secondsUntilRetry }) }}
          </template>
        </p>

        <UButton
          :label="t('offlineView.retry')"
          icon="i-fa7-solid:rotate-right"
          :disabled="checking"
          @click="probe"
          size="lg"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SkolLogo from '@/components/brand/SkolLogo.vue'
import { apiBaseURL, API_VERSION, API_VERSION_HEADER } from '@/config/ApiConfig'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const RETRY_INTERVAL_SECONDS = 15

const checking = ref(false)
const secondsUntilRetry = ref(RETRY_INTERVAL_SECONDS)

/**
 * `navigator.onLine` is only reliable one way: false ⇒ the device truly has no network.
 * True proves nothing (flaky wifi, captive portal, ISP outage), so it must not be read
 * as proof that the connection is fine and the server is at fault.
 * When in doubt: a factual message, blaming no one.
 */
const isDeviceOffline = ref(!navigator.onLine)

const titleKey = computed(() =>
  isDeviceOffline.value ? 'offlineView.title' : 'offlineView.unreachableTitle',
)
const descriptionKey = computed(() =>
  isDeviceOffline.value ? 'offlineView.description' : 'offlineView.unreachableDescription',
)

function redirectTarget(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r ? r : '/'
}

async function probe() {
  if (checking.value) return
  secondsUntilRetry.value = RETRY_INTERVAL_SECONDS
  // Device with no network: pointless to try, coming back online triggers the probe.
  if (!navigator.onLine) return
  checking.value = true
  try {
    // Absolute URL: in dev the backend is not on the Vite server's origin, and a
    // relative URL would get index.html as 200 — the probe would wrongly report a
    // recovered backend.
    // The only API call that bypasses the xior wrapper, so it carries the version
    // header itself rather than inheriting it from the request interceptor.
    const res = await fetch(`${apiBaseURL}/api/config`, {
      headers: { [API_VERSION_HEADER]: API_VERSION },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      router.replace(redirectTarget())
      return
    }
  } catch {
    // still offline
  } finally {
    checking.value = false
  }
}

function onOnline() {
  isDeviceOffline.value = false
  probe()
}

function onOffline() {
  isDeviceOffline.value = true
}

let interval: ReturnType<typeof setInterval>

/** The displayed countdown IS the scheduler: it cannot lie about what happens. */
function tick() {
  if (checking.value) return
  secondsUntilRetry.value -= 1
  if (secondsUntilRetry.value <= 0) {
    probe()
  }
}

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  interval = setInterval(tick, 1000)
})

onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  clearInterval(interval)
})
</script>
