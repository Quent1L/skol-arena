import { i18n } from '@/i18n'
import { isRateLimited, rateLimitMessage, retryAfterFrom } from '@/utils/RateLimit'

/** Error shape returned by the Better Auth client on a failed call. */
export interface AuthClientError {
  code?: string
  message?: string
  status?: number
  /** Seconds before a throttled caller may try again; only on a 429. */
  retryAfter?: number
}

/**
 * Better Auth answers with a hardcoded English message (its BASE_ERROR_CODES table)
 * next to a stable `code`. Translate on the code; the raw message is only a last
 * resort so an unmapped code still says something rather than nothing.
 */
export function translateAuthError(
  error: AuthClientError | null | undefined,
  fallbackKey: string,
): string {
  // Throttling is answered with a delay rather than a fixed sentence, so it cannot
  // go through the code table: the number is part of the message.
  if (isRateLimited(error)) return rateLimitMessage(retryAfterFrom(error))

  const key = error?.code ? `auth.errors.codes.${error.code}` : null
  if (key && i18n.global.te(key)) {
    return i18n.global.t(key)
  }
  return error?.message || i18n.global.t(fallbackKey)
}
