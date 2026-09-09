import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { logger } from "./logger";

/**
 * Header this app writes the resolved client address into before handing a request
 * to Better Auth, so its own rate limiter keys on the address *we* trust rather than
 * on whatever the caller put in `x-forwarded-for`.
 *
 * Never read from an incoming request: it is overwritten on every request that
 * reaches the auth handler.
 */
export const CLIENT_IP_HEADER = "x-skol-client-ip";

/**
 * Written into CLIENT_IP_HEADER when the caller cannot be placed at all. Not an IP,
 * on purpose: whatever reads the header has to treat it as "no address" rather than
 * as a client.
 */
export const UNKNOWN_CLIENT_IP = "unknown";

let hopsWarningLogged = false;

/**
 * How many proxies sit between the client and this process, from `TRUSTED_PROXY_HOPS`.
 *
 * Zero — the default — means the app is reached directly, so `x-forwarded-for` is
 * whatever the caller decided to send and is ignored entirely. One is the usual
 * single reverse proxy; two is a CDN in front of that proxy.
 */
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw === "") return 0;

  const hops = Number.parseInt(raw, 10);
  if (!Number.isInteger(hops) || hops < 0) {
    if (!hopsWarningLogged) {
      hopsWarningLogged = true;
      logger.warn(
        `TRUSTED_PROXY_HOPS is not a non-negative integer ("${raw}"): treating the app ` +
          "as directly reachable, so x-forwarded-for is ignored.",
      );
    }
    return 0;
  }

  return hops;
}

/**
 * The caller's address, as far as it can be established without trusting the caller.
 *
 * `x-forwarded-for` is a list each hop appends to, so the rightmost entries are the
 * ones written by infrastructure and the leftmost are whatever the client typed. With
 * `n` trusted proxies the client is the entry `n` from the right — anything further
 * left was supplied by the client and is worthless. Reading the *leftmost* entry, the
 * obvious thing to do, hands the key straight to the caller: a rotating header then
 * gives every request its own counter and the limit stops existing.
 *
 * Returns null when nothing can be established, which callers should treat as a
 * single shared bucket: too strict rather than too permissive.
 */
export function resolveClientIp(
  forwardedFor: string | null | undefined,
  socketAddress: string | null | undefined,
): string | null {
  const socket = socketAddress || null;
  const hops = trustedProxyHops();

  // No proxy declared: the socket address is the only one the caller cannot choose.
  if (hops === 0) return socket;
  if (!forwardedFor) return socket;

  const forwarded = forwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Fewer entries than declared hops means the header did not come from the proxies
  // it was supposed to: fall back rather than pick an attacker-chosen entry.
  const clientIndex = forwarded.length - hops;
  if (clientIndex < 0) return socket;

  return forwarded[clientIndex] ?? socket;
}

/**
 * The address the runtime saw the connection come from, when it can name it.
 *
 * Hono's Bun helper throws when the server is not in the environment — which is the
 * case for `app.request()` in a test — so a failure here means "unknown" rather than
 * a broken request.
 */
export function socketAddressOf(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * The caller behind a request, for anything that has a context in hand: the rate
 * limiter counting a window, and the error handler naming who hit the failure. They
 * have to agree — a throttled caller and the log line about it are the same person.
 */
export function clientIpFor(c: Context): string | null {
  return resolveClientIp(c.req.header("x-forwarded-for"), socketAddressOf(c));
}

/**
 * Hands Better Auth a request whose client address has already been decided here.
 *
 * Its own resolver reads `x-forwarded-for` directly, and refuses a multi-valued one
 * unless it is given the proxy CIDRs — which drops every caller into a single shared
 * window per path. Anyone able to send that header could therefore push the whole
 * instance's sign-ins into one bucket of five per minute. Pointing Better Auth at a
 * header only this process writes removes the caller from that decision entirely:
 * `ipAddressHeaders` in config/auth.ts names it, and it is overwritten here, so an
 * incoming one cannot survive.
 */
export function withResolvedClientIp(
  request: Request,
  socketAddress: string | null | undefined,
): Request {
  const headers = new Headers(request.headers);
  const clientIp = resolveClientIp(headers.get("x-forwarded-for"), socketAddress);

  // Always written, never deleted. Deleting would be the obvious way to say "no
  // address", but Bun ignores an empty Headers init when copying a Request and keeps
  // the original ones — so on a request carrying nothing else, a forged value would
  // survive. A placeholder cannot: Better Auth rejects anything that is not an IP and
  // falls back to its shared window, which is what "unknown" is meant to mean.
  headers.set(CLIENT_IP_HEADER, clientIp ?? UNKNOWN_CLIENT_IP);

  return new Request(request, { headers });
}
