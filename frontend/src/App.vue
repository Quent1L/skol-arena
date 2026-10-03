<template>
  <div>
    <SplashLoader :visible="!isAppReady" />
    <UpdateOverlay
      :visible="overlayVisible"
      :phase="updatePhase"
      :progress="downloadProgress"
      :forced="updateForced"
      :done="downloadDone"
      :total="downloadTotal"
      :version="confirmedVersion"
      @dismiss="dismissUpdate"
    />
    <Toast
      position="top-right"
      :breakpoints="{ '640px': { width: 'calc(100vw - 1rem)', right: '0.5rem', left: 'auto' } }"
    />
    <ConfirmDialog />
    <SkillOrLuckOverlay
      :visible="easterEggVisible"
      :variant="easterEggVariant"
      @close="stopEasterEgg"
    />
    <AppWrapper v-if="isAppReady" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { isNetworkError } from '@/utils/HttpErrors'
import { useAppToast } from './composables/useAppToast'
import { useAuth } from './composables/useAuth'
import { useConfigService } from './composables/config/config.service'
import { initErrorService, useErrorService } from './composables/useErrorService'
import { usePWAUpdate } from './composables/pwa/pwa.update'
import { useEasterEgg } from './composables/useEasterEgg'
import AppWrapper from './AppWrapper.vue'
import SkillOrLuckOverlay from './components/brand/SkillOrLuckOverlay.vue'
import SplashLoader from './components/SplashLoader.vue'
import UpdateOverlay from './components/UpdateOverlay.vue'

const { t } = useI18n()
const router = useRouter()
const { initialize } = useAuth()
const { loadConfig } = useConfigService()
const errorService = useErrorService()
const toast = useAppToast()
const {
  overlayVisible,
  updatePhase,
  updateForced,
  confirmedVersion,
  downloadProgress,
  downloadDone,
  downloadTotal,
  checkVersion,
  announceUpdate,
  applyUpdate,
  dismissUpdate,
} = usePWAUpdate()

const { visible: easterEggVisible, variant: easterEggVariant, stop: stopEasterEgg } = useEasterEgg()

const isAppReady = ref(false)

/**
 * Checks the version during the splash without ever delaying startup: if the
 * network drags, boot anyway and the update lands on the next navigation.
 */
const BOOT_CHECK_TIMEOUT_MS = 1500

const checkVersionAtBoot = () =>
  Promise.race([
    checkVersion(),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), BOOT_CHECK_TIMEOUT_MS)),
  ])

onMounted(async () => {
  initErrorService(toast)

  // Runs alongside loading: the user is still looking at the splash.
  const bootUpdateCheck = checkVersionAtBoot()

  const minDelay = new Promise((resolve) => setTimeout(resolve, 250))

  // Unreachable backend: config + session fail together. Record the fact and decide
  // only once, below, whether the user needs to be told.
  let serverUnreachable = false

  try {
    await loadConfig()
    console.log('Configuration loaded successfully')
  } catch (error) {
    console.error('Erreur lors du chargement de la configuration:', error)
    if (isNetworkError(error)) {
      serverUnreachable = true
    } else {
      errorService.showError(error as Error)
    }
  }

  try {
    await initialize()
  } catch (error: unknown) {
    console.error("Erreur lors de l'initialisation de la session:", error)
    if (isNetworkError(error)) {
      serverUnreachable = true
    } else {
      toast.add({
        severity: 'error',
        summary: t('app.errorSummary'),
        detail: t('app.unexpectedError'),
        life: 8000,
      })
    }
  }

  if (serverUnreachable) {
    // The /offline page already says it all: a toast on top would be noise.
    await router.isReady()
    if (router.currentRoute.value.name !== 'offline') {
      errorService.showNetworkError()
    }
  }

  // Notifications and the socket are bootstrapped by NotificationsInit, which watches
  // isAuthenticated. Doing it here too fired a second /me/notifications: this call
  // settled before AppWrapper mounted, so the in-flight guard could not dedupe it.

  // Apply before revealing the app: the user never sees the stale version.
  // A false return means the update could not be applied (download too slow, or
  // the user chose to keep going): boot as usual, it will land at a navigation.
  if (await bootUpdateCheck) {
    const reloading = await applyUpdate()
    if (reloading) return
  }

  await minDelay
  // Runs after the version check so it knows whether the update that just landed was
  // a mandatory one. Nothing to announce on a normal boot: this returns immediately.
  await announceUpdate()
  isAppReady.value = true
})

onUnmounted(() => {
  errorService.uninstall()
})
</script>
