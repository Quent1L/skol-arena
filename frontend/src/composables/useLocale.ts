import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type LocaleCode } from '@/i18n'

const LOCALE_LABELS: Record<LocaleCode, string> = {
  fr: 'Français',
  en: 'English',
}

const LOCALE_FLAGS: Record<LocaleCode, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
}

export interface LocaleOption {
  code: LocaleCode
  label: string
  flag: string
}

export function useLocale() {
  const { locale } = useI18n()

  const availableLocales: LocaleOption[] = SUPPORTED_LOCALES.map((code) => ({
    code,
    label: LOCALE_LABELS[code],
    flag: LOCALE_FLAGS[code],
  }))

  const currentLocale = computed<LocaleCode>({
    get: () => locale.value as LocaleCode,
    set: (code) => setLocale(code),
  })

  function setLocale(code: LocaleCode) {
    locale.value = code
    localStorage.setItem(LOCALE_STORAGE_KEY, code)
    document.documentElement.lang = code
  }

  return { currentLocale, availableLocales, setLocale }
}
