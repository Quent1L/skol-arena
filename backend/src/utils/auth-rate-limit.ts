import { ErrorCode } from "../types/errors";
import { t } from "./i18n-context";

/** Header Better Auth's own limiter writes the remaining window into. */
const BETTER_AUTH_RETRY_HEADER = "X-Retry-After";

/**
 * Rewrites Better Auth's throttle response into something a client can act on.
 *
 * Its limiter answers `{"message":"Too many requests. Please try again later."}`
 * with no content type at all — so the browser files it under
 * `application/octet-stream` — no error code, and the delay only in a non-standard
 * header. Nothing in that is usable: a French user reads an English sentence, and
 * the client has no code to translate on.
 *
 * Replaces it with the shape every other Better Auth error already has (`code` plus
 * `message`), the delay in the body next to the standard `Retry-After` header, and a
 * JSON content type. Any other response is passed through untouched.
 */
export function normalizeAuthRateLimitResponse(response: Response): Response {
  if (response.status !== 429) return response;

  const retryAfter = Number.parseInt(response.headers.get(BETTER_AUTH_RETRY_HEADER) ?? "", 10);
  const details = Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {};

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json");
  // The standard spelling as well: the X- one is Better Auth's invention, and
  // nothing outside it looks there.
  if (details.retryAfter !== undefined) headers.set("Retry-After", String(details.retryAfter));

  return new Response(
    JSON.stringify({
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: t(`errors.${ErrorCode.TOO_MANY_REQUESTS}`, details),
      ...details,
    }),
    { status: response.status, statusText: response.statusText, headers },
  );
}
