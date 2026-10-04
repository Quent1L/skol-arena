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
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import { FilterService } from '@primevue/core/api'
import frLocale from 'primelocale/fr.json'
import enLocale from 'primelocale/en.json'
import themePreset from './config/PrimevuePreset'
import { errorService } from './composables/useErrorService'
import { checkVersion } from './composables/pwa/pwa.update'
import { markLeaving } from './utils/app-lifecycle'
import { i18n, getInitialLocale } from './i18n'
import { matchesSearch } from './utils/StringUtils'

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

// Force dark mode
document.documentElement.classList.add('my-app-dark')

// Initialize the theme from localStorage
//const savedTheme = localStorage.getItem('theme') || 'dark'

/**if (savedTheme === 'dark') {
  console.log('Dark mode applied')
} else {
  document.documentElement.classList.remove('my-app-dark')
}**/

// Install the global error interceptors right at startup
// Errors will be logged to the console until the Toast is available
errorService.install()

// Apply the initial language (localStorage) to <html> and PrimeVue
const initialLocale = getInitialLocale()
document.documentElement.lang = initialLocale
const primevueLocale = initialLocale === 'en' ? enLocale.en : frLocale.fr

// Create the Vue application
const app = createApp(App)

// Configure PrimeVue and the services
app.use(PrimeVue, {
  locale: primevueLocale,
  theme: {
    preset: themePreset,
    options: {
      prefix: 'p',
      darkModeSelector: '.my-app-dark',
      cssLayer: false,
    },
  },
})

// Select/MultiSelect `filter` only folds case: register an accent-insensitive mode so
// "eloise" finds "Éloïse" there too (use with filter-match-mode="accentInsensitive").
FilterService.register('accentInsensitive', (value: unknown, filter: unknown) =>
  matchesSearch(value == null ? '' : String(value), filter == null ? '' : String(filter)),
)

app.use(i18n)
app.use(createPinia())
app.use(ToastService)
app.use(ConfirmationService)
app.use(router)

app.mount('#app')
