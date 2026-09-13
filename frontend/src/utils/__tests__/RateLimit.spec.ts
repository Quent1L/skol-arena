import { describe, it, expect, beforeEach } from 'vitest'
import { isRateLimited, rateLimitMessage, retryAfterFrom } from '@/utils/RateLimit'
import { i18n } from '@/i18n'

describe('isRateLimited', () => {
  it('recognises both the status and the code', () => {
    expect(isRateLimited({ status: 429 })).toBe(true)
    expect(isRateLimited({ code: 'TOO_MANY_REQUESTS' })).toBe(true)
    expect(isRateLimited({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(false)
    expect(isRateLimited(null)).toBe(false)
  })
})

describe('retryAfterFrom', () => {
  it('prefers the header, which is the authoritative spelling', () => {
    const headers = new Headers({ 'Retry-After': '30' })

    expect(retryAfterFrom({ retryAfter: 300 }, headers)).toBe(30)
  })

  it('falls back to the body when CORS hides the header', () => {
    expect(retryAfterFrom({ retryAfter: 45 })).toBe(45)
    expect(retryAfterFrom({ details: { retryAfter: 12 } })).toBe(12)
  })

  it('reads a plain header record as well as a Headers instance', () => {
    expect(retryAfterFrom({}, { 'retry-after': '7' })).toBe(7)
  })

  it('answers null when nothing usable is carried', () => {
    expect(retryAfterFrom({})).toBeNull()
    expect(retryAfterFrom({ retryAfter: 0 })).toBeNull()
    expect(retryAfterFrom({}, new Headers({ 'Retry-After': 'soon' }))).toBeNull()
  })
})

describe('rateLimitMessage', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('says the wait in seconds below a minute', () => {
    expect(rateLimitMessage(30)).toBe('Trop de tentatives. Réessayez dans 30 secondes.')
    expect(rateLimitMessage(1)).toBe('Trop de tentatives. Réessayez dans 1 seconde.')
  })

  it('rounds a longer wait up to whole minutes', () => {
    expect(rateLimitMessage(61)).toBe('Trop de tentatives. Réessayez dans 2 minutes.')
    expect(rateLimitMessage(60)).toBe('Trop de tentatives. Réessayez dans 1 minute.')
  })

  it('drops the delay entirely when it is unknown', () => {
    expect(rateLimitMessage(null)).toBe(
      'Trop de tentatives. Patientez un instant avant de réessayer.',
    )
  })

  it('follows the active locale', () => {
    i18n.global.locale.value = 'en'

    expect(rateLimitMessage(30)).toBe('Too many attempts. Try again in 30 seconds.')
  })
})
