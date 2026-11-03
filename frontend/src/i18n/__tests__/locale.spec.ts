import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { baseTournamentFormSchema } from '@skol-arena/shared'
import { detectBrowserLocale, getInitialLocale, i18n, LOCALE_STORAGE_KEY } from '@/i18n'
import { loginSchema } from '@/schemas/auth.schema'

function firstMessage(result: { success: boolean; error?: z.ZodError }, path: string): string {
  return result.error?.issues.find((issue) => issue.path.join('.') === path)?.message ?? ''
}

describe('detectBrowserLocale', () => {
  it('matches a regional variant on its base language', () => {
    expect(detectBrowserLocale(['fr-CA', 'en-US'])).toBe('fr')
  })

  it('skips languages the app does not speak', () => {
    expect(detectBrowserLocale(['de-DE', 'en-GB'])).toBe('en')
  })

  it('finds nothing when no language is supported', () => {
    expect(detectBrowserLocale(['de-DE', 'es'])).toBeNull()
  })
})

describe('getInitialLocale', () => {
  afterEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY)
    vi.restoreAllMocks()
  })

  it('keeps the language chosen before', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
    expect(getInitialLocale()).toBe('fr')
  })

  it("follows the browser's language on a first visit", () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR'])
    expect(getInitialLocale()).toBe('fr')
  })

  it('falls back to English for a language the app does not speak', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    expect(getInitialLocale()).toBe('en')
  })
})

describe('validation messages', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'en'
  })

  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('renders shared schema messages in the current language', () => {
    const empty = { name: '' }
    expect(firstMessage(baseTournamentFormSchema.safeParse(empty), 'name')).toBe(
      'Name must be at least 3 characters',
    )

    i18n.global.locale.value = 'fr'
    expect(firstMessage(baseTournamentFormSchema.safeParse(empty), 'name')).toBe(
      'Le nom doit contenir au moins 3 caractères',
    )
  })

  it('follows a language switch in schemas built before it', () => {
    const empty = { email: '', password: '' }
    expect(firstMessage(loginSchema.safeParse(empty), 'email')).toBe('Email address is required')

    i18n.global.locale.value = 'fr'
    expect(firstMessage(loginSchema.safeParse(empty), 'email')).not.toBe(
      'Email address is required',
    )
  })

  it("renders Zod's own messages in the current language", () => {
    const schema = z.number()
    const english = firstMessage(schema.safeParse('x'), '')

    i18n.global.locale.value = 'fr'
    const french = firstMessage(schema.safeParse('x'), '')

    expect(english).toMatch(/expected number/i)
    expect(french).not.toBe(english)
  })
})
