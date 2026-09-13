import { i18n } from '@/i18n'

/** Error code both limiters answer a throttled call with. */
export const TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS'

/** Below this, the wait is worth saying in seconds rather than rounded to a minute. */
const SECONDS_THRESHOLD = 60

interface RateLimitedError {
  status?: number
  code?: string
  retryAfter?: number
  details?: { retryAfter?: number }
}

/** Whether a failure is a refusal by one of the rate limiters. */
export function isRateLimited(error: RateLimitedError | null | undefined): boolean {
  return error?.status === 429 || error?.code === TOO_MANY_REQUESTS
}

/**
 * Seconds left before the caller may try again, from wherever the answer carried it.
 *
 * The header is the authoritative spelling but a browser only sees the headers CORS
 * exposes, so both limiters repeat it in the body — `retryAfter` at the top level for
 * the auth subtree, under `details` in our own error envelope.
 */
export function retryAfterFrom(
  error: RateLimitedError | null | undefined,
  headers?: Headers | Record<string, string | undefined>,
): number | null {
  const fromHeader = readHeader(headers, 'retry-after')
  const candidates = [fromHeader, error?.retryAfter, error?.details?.retryAfter]

  for (const candidate of candidates) {
    const seconds = typeof candidate === 'string' ? Number.parseInt(candidate, 10) : candidate
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) return seconds
  }

  return null
}

/**
 * What to show a throttled user, in their own locale.
 *
 * Never the server's sentence: Better Auth's is hardcoded English, and ours follows
 * the browser's Accept-Language rather than the locale picked inside the app.
 */
export function rateLimitMessage(retryAfter: number | null): string {
  const { t } = i18n.global

  if (retryAfter === null) return t('rateLimit.retryLater')
  if (retryAfter < SECONDS_THRESHOLD) return t('rateLimit.retryInSeconds', retryAfter)

  return t('rateLimit.retryInMinutes', Math.ceil(retryAfter / SECONDS_THRESHOLD))
}

function readHeader(
  headers: Headers | Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }

  const record = headers as Record<string, string | undefined>

  return record[name] ?? record[name.toUpperCase()]
}
