import { createI18n } from 'vue-i18n'
import { z } from 'zod'
import { setValidationTranslator } from '@skol-arena/shared'
import fr from './messages/fr.json'
import en from './messages/en.json'

export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: LocaleCode = 'fr'
/** First visit with a browser language the app does not speak. */
export const BROWSER_FALLBACK_LOCALE: LocaleCode = 'en'
export const LOCALE_STORAGE_KEY = 'locale'

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

/** The first browser language the app speaks, `fr-CA` counting as `fr`. */
export function detectBrowserLocale(languages: readonly string[]): LocaleCode | null {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (isSupportedLocale(base)) return base
  }
  return null
}

/** The language chosen before, else the browser's, else English. */
export function getInitialLocale(): LocaleCode {
  const stored = readStoredLocale()
  if (isSupportedLocale(stored)) return stored
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language]
  return detectBrowserLocale(browser.filter(Boolean)) ?? BROWSER_FALLBACK_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en },
})

function currentLocale(): LocaleCode {
  const locale = i18n.global.locale.value
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
}

// Messages are resolved when a form validates, not when its schema is built, so a
// language switch applies to the next validation without rebuilding anything.
// Keys carried by the shared schemas:
setValidationTranslator((key, params) => i18n.global.t(key, params ?? {}))

// Zod's own messages (a field with no custom message), in the same language.
const zodLocales: Record<LocaleCode, ReturnType<typeof z.locales.en>> = {
  fr: z.locales.fr(),
  en: z.locales.en(),
}
z.config({ localeError: (issue) => zodLocales[currentLocale()].localeError(issue) })
