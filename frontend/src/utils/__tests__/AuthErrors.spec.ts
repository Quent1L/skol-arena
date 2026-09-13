import { describe, it, expect } from 'vitest'
import { translateAuthError } from '@/utils/AuthErrors'
import { i18n } from '@/i18n'

describe('translateAuthError', () => {
  it('translates a known Better Auth code instead of its English message', () => {
    i18n.global.locale.value = 'fr'

    const message = translateAuthError(
      { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      'auth.errors.login',
    )

    expect(message).toBe('Email ou mot de passe incorrect.')
  })

  it('follows the active locale', () => {
    i18n.global.locale.value = 'en'

    const message = translateAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD' }, 'auth.errors.login')

    expect(message).toBe('Incorrect email or password.')
  })

  it('keeps the raw message for an unmapped code', () => {
    const message = translateAuthError(
      { code: 'SOME_FUTURE_CODE', message: 'Something new' },
      'auth.errors.login',
    )

    expect(message).toBe('Something new')
  })

  it('replaces the throttle answer with a localised one carrying the wait', () => {
    i18n.global.locale.value = 'fr'

    const message = translateAuthError(
      {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
        retryAfter: 45,
      },
      'auth.errors.login',
    )

    expect(message).toBe('Trop de tentatives. Réessayez dans 45 secondes.')
  })

  it('falls back to the provided key when there is nothing usable', () => {
    i18n.global.locale.value = 'fr'

    expect(translateAuthError(null, 'auth.errors.login')).toBe('Erreur de connexion')
    expect(translateAuthError({}, 'auth.errors.login')).toBe('Erreur de connexion')
  })
})
