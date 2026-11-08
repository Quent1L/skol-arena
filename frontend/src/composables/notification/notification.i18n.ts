import { useI18n } from 'vue-i18n'
import type { RawNotification } from './notification.api'

/**
 * Only an ISO instant may be reformatted. Notifications created before the
 * matchDate migration hold a pre-formatted `dd/MM/yyyy HH:mm` string, and
 * `new Date()` would read `05/06/2026` as MM/DD and silently shift the date.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const PLAYER_NAME_PARAMS = [
  'creatorName',
  'reporterName',
  'disputerName',
  'proposerName',
  'authorName',
]

type Params = Record<string, unknown> | null | undefined

/**
 * Renders notifications from their raw i18n key + params, so the text follows the
 * locale picked in the app and the timezone of this device. Falls back to the
 * server-rendered title/message when the key is unknown to the frontend.
 */
export function useNotificationText() {
  const { t, te, locale } = useI18n()

  function formatMatchDate(raw: unknown): unknown {
    if (raw === null || raw === undefined) return t('notifications.DATE_TBD')

    // The xior interceptor and the WebSocket handler both run convertStringDatesToJS,
    // which turns the stored ISO string into a Date before it reaches us.
    let date: Date | null = null
    if (raw instanceof Date) date = raw
    else if (typeof raw === 'string' && ISO_DATE.test(raw)) date = new Date(raw)
    if (!date || Number.isNaN(date.getTime())) return raw // legacy pre-formatted string

    return new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'short',
      timeStyle: 'short',
      // No timeZone option on purpose: Intl defaults to the device timezone
    }).format(date)
  }

  function resolveParams(params: Params): Record<string, unknown> {
    if (!params) return {}

    const resolved: Record<string, unknown> = { ...params }

    if ('matchDate' in params) {
      resolved.matchDate = formatMatchDate(params.matchDate)
    }
    if ('teammates' in params && !params.teammates) {
      resolved.teammates = t('notifications.NO_TEAMMATES')
    }
    if ('opponents' in params && !params.opponents) {
      resolved.opponents = t('notifications.UNKNOWN_PLAYER')
    }
    for (const key of PLAYER_NAME_PARAMS) {
      if (key in params && !params[key]) {
        resolved[key] = t('notifications.SOME_PLAYER')
      }
    }

    return resolved
  }

  function render(key: string | undefined, fallback: string, params: Params): string {
    if (!key || !te(key)) return fallback
    return t(key, resolveParams(params))
  }

  return {
    renderTitle: (n: RawNotification) => render(n.titleKey, n.title, n.translationParams),
    renderMessage: (n: RawNotification) => render(n.messageKey, n.message, n.translationParams),
  }
}
