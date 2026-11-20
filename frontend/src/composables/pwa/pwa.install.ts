import { ref, computed, onMounted } from 'vue'

const DISMISS_KEY = 'pwa_install_dismissed_at'
const DISMISS_DURATION_MS = 15 * 24 * 60 * 60 * 1000 // 15 days

const isInstalled = ref(false)
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const showIOSInstructions = ref(false)
const dismissed = ref(isDismissedRecently())

function isDismissedRecently(): boolean {
  const stored = localStorage.getItem(DISMISS_KEY)
  if (!stored) return false
  return Date.now() - Number.parseInt(stored, 10) < DISMISS_DURATION_MS
}

function dismissBanner() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, Date.now().toString())
}

export function usePWAInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent)

  const canInstall = computed(() => !isInstalled.value && (deferredPrompt.value !== null || isIOS))

  const shouldShowBanner = computed(
    () => isMobile && canInstall.value && !dismissed.value && !showIOSInstructions.value,
  )

  async function triggerInstall() {
    if (isIOS) {
      showIOSInstructions.value = true
      return
    }
    if (!deferredPrompt.value) return
    await deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    if (outcome === 'accepted') {
      isInstalled.value = true
    }
    deferredPrompt.value = null
  }

  onMounted(() => {
    isInstalled.value =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferredPrompt.value = e
    })

    window.addEventListener('appinstalled', () => {
      isInstalled.value = true
      deferredPrompt.value = null
    })
  })

  return {
    isInstalled,
    isIOS,
    isMobile,
    canInstall,
    shouldShowBanner,
    showIOSInstructions,
    triggerInstall,
    dismissBanner,
  }
}
