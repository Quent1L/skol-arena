import i18next from "../config/i18n";

/**
 * Timezone used when rendering a notification server-side and the target device
 * did not report its own (WebSocket payloads, push devices registered before the
 * locale/timezone columns existed).
 */
export const FALLBACK_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Paris";

const LOCALES: Record<string, string> = { fr: "fr-FR", en: "en-GB" };

/**
 * Only an ISO instant may be reformatted. Legacy rows hold a pre-formatted
 * `dd/MM/yyyy HH:mm` string, and `new Date()` would read `05/06/2026` as MM/DD
 * and silently shift the date — so match the shape explicitly.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

type Params = Record<string, unknown> | null | undefined;

function formatMatchDate(raw: unknown, lng: string, timeZone: string): unknown {
  if (raw === null || raw === undefined) {
    return i18next.t("notifications.DATE_TBD", { lng });
  }
  if (typeof raw !== "string" || !ISO_DATE.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString(LOCALES[lng] ?? LOCALES.fr, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  });
}

/**
 * Resolves the locale-dependent placeholders of a notification for server-side
 * rendering. The client re-renders from the raw params whenever it knows the key,
 * so this only backs the fallback text and web-push payloads.
 */
export function localizeNotificationParams(
  params: Params,
  lng: string,
  timeZone: string = FALLBACK_TIMEZONE,
): Record<string, unknown> {
  if (!params) return {};

  const resolved: Record<string, unknown> = { ...params };

  if ("matchDate" in params) {
    resolved.matchDate = formatMatchDate(params.matchDate, lng, timeZone);
  }
  if ("teammates" in params && !params.teammates) {
    resolved.teammates = i18next.t("notifications.NO_TEAMMATES", { lng });
  }
  if ("opponents" in params && !params.opponents) {
    resolved.opponents = i18next.t("notifications.UNKNOWN_PLAYER", { lng });
  }
  for (const key of ["creatorName", "reporterName", "disputerName", "proposerName"]) {
    if (key in params && !params[key]) {
      resolved[key] = i18next.t("notifications.SOME_PLAYER", { lng });
    }
  }

  return resolved;
}
