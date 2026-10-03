import {
  API_VERSION_REQUEST_HEADER,
  API_VERSION_RESPONSE_HEADER,
  LATEST_API_VERSION,
  normalizeVersion,
  type ApiVersion,
} from "./versions";

/**
 * Where the per-version apps are actually mounted. Versioning is negotiated by
 * header, so this prefix is an implementation detail: it never appears in a URL a
 * client is given, and an inbound request that tries to use it is refused below.
 */
export const INTERNAL_PREFIX = "/__api";

/** Public prefix every versioned route keeps in the documented contract. */
export const PUBLIC_PREFIX = "/api";

/**
 * Reached by rewriting a request whose `accept-version` names a version we do not
 * serve. Answering at the fetch boundary would bypass app.onError, and with it the
 * i18n error envelope every other failure uses — so the refusal is routed through a
 * real handler instead.
 */
export const UNSUPPORTED_VERSION_PATH = `${INTERNAL_PREFIX}/unsupported-version`;

/**
 * Paths that keep the /api shape and are never version-negotiated:
 *
 * - /api/auth/*  Better Auth owns the whole subtree and answers c.req.raw directly.
 * - /api/ws      the browser WebSocket API cannot send custom headers, so a client
 *                could never negotiate here in the first place.
 * - /api/docs, /api/openapi  describe the versions rather than living inside one.
 * - /api/avatars  image files loaded by <img>, which cannot send headers either.
 */
const EXEMPT_PREFIXES = [
  `${PUBLIC_PREFIX}/auth/`,
  `${PUBLIC_PREFIX}/ws`,
  `${PUBLIC_PREFIX}/docs`,
  `${PUBLIC_PREFIX}/openapi`,
  `${PUBLIC_PREFIX}/avatars/`,
];

function isVersioned(pathname: string): boolean {
  if (pathname !== PUBLIC_PREFIX && !pathname.startsWith(`${PUBLIC_PREFIX}/`)) {
    return false;
  }
  return !EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

type FetchLike = (request: Request, ...rest: never[]) => Response | Promise<Response>;

/**
 * Wraps the Hono fetch handler with header-based version negotiation.
 *
 * The resolved version is stamped on the way out rather than by a middleware: a
 * post-next() middleware cannot see a response built by app.onError, and we want
 * X-API-VERSION on failures too — including the 400 that rejects an unknown version.
 */
export function withApiVersion<F extends FetchLike>(fetch: F): F {
  const handler = async (request: Request, ...rest: never[]) => {
    const url = new URL(request.url);

    // The internal mount prefix is not part of the public contract.
    if (url.pathname === INTERNAL_PREFIX || url.pathname.startsWith(`${INTERNAL_PREFIX}/`)) {
      return new Response("Not found", { status: 404 });
    }

    if (!isVersioned(url.pathname)) {
      return fetch(request, ...rest);
    }

    const requested = request.headers.get(API_VERSION_REQUEST_HEADER);
    const resolved: ApiVersion | null =
      requested === null ? LATEST_API_VERSION : normalizeVersion(requested);

    url.pathname =
      resolved === null
        ? UNSUPPORTED_VERSION_PATH
        : `${INTERNAL_PREFIX}/${resolved}${url.pathname.slice(PUBLIC_PREFIX.length)}`;

    const response = await fetch(new Request(url.toString(), request), ...rest);

    // Response is immutable once returned by Hono, so re-wrap to add the headers.
    // The body is passed by reference, not copied.
    const stamped = new Response(response.body, response);
    stamped.headers.set(API_VERSION_RESPONSE_HEADER, resolved ?? LATEST_API_VERSION);
    stamped.headers.append("Vary", API_VERSION_REQUEST_HEADER);
    return stamped;
  };

  return handler as unknown as F;
}
