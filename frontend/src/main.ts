import '@/assets/css/tailwind-related.css'
import '@/assets/css/main.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
// Curated Iconify icons compiled to `icf icf-<set>--<name>` classes (scripts/generate-iconify-icons.mjs).
import '@/assets/css/iconify-icons.css'
import '@fontsource/exo-2/900.css'
import '@fontsource/rajdhani/700.css'
// Backs the --font-headline / --font-body tokens declared in tailwind-related.css.
// Without these the `font-headline` utility silently falls back to system sans.
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/600.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import ui from '@nuxt/ui/vue-plugin'
import { errorService } from './composables/useErrorService'
import { checkVersion } from './composables/pwa/pwa.update'
import { markLeaving } from './utils/app-lifecycle'
import { i18n, getInitialLocale } from './i18n'

// Deployment detection: these checks only raise a flag, they never reload.
// Navigation is what applies the update (see router/index.ts), so input in
// progress is never interrupted.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(() => {
    const CHECK_INTERVAL = 60 * 60 * 1000 // 60 min
    setInterval(() => void checkVersion(), CHECK_INTERVAL)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void checkVersion()
    })
  })
}

window.addEventListener('vite:preloadError', () => {
  markLeaving()
  window.location.reload()
})

window.addEventListener('error', (event) => {
  if (
    event.message?.includes('Failed to fetch dynamically imported module') ||
    event.message?.includes('Importing a module script failed')
  ) {
    markLeaving()
    window.location.reload()
  }
})

// The app is dark-only: Nuxt UI and Tailwind key their dark styles off this class.
document.documentElement.classList.add('dark')

// Install the global error interceptors right at startup
// Errors will be logged to the console until the Toast is available
errorService.install()

// Apply the initial language (localStorage) to <html>
document.documentElement.lang = getInitialLocale()

// Create the Vue application
const app = createApp(App)

app.use(i18n)
app.use(createPinia())
app.use(router)
app.use(ui)

app.mount('#app')
