import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { isRateLimitEnabled } from "../config/rate-limit";
import { rateLimitRepository } from "../repository/rate-limit.repository";
import { ErrorCode, TooManyRequestsError } from "../types/errors";
import { resolveClientIp } from "../utils/client-ip";
import { logger } from "../utils/logger";

/** How often the expired-row sweep is allowed to run, at most. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** Rows older than this can no longer belong to any live window. */
const SWEEP_HORIZON_MS = 24 * 60 * 60 * 1000;

let lastSweep = 0;

/**
 * The socket address, when the runtime can name it. Hono's Bun helper throws when
 * the server is not in the environment — which is the case for `app.request()` in a
 * test — so a failure here means "unknown", not a broken request.
 */
function socketAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * The address a window is counted against.
 *
 * Resolution lives in utils/client-ip so that this limiter and Better Auth's own
 * agree on who the caller is — see TRUSTED_PROXY_HOPS. Callers that cannot be placed
 * collapse onto one shared window: that fails closed, which is the right way round.
 */
function clientAddress(c: Context): string {
  return resolveClientIp(c.req.header("x-forwarded-for"), socketAddress(c)) ?? "unknown";
}

/**
 * Fixed-window limit for routes that are open to anyone.
 *
 * Better Auth covers its own subtree (see `rateLimit` in config/auth.ts); this is
 * for the business endpoints that answer before a session exists — where an
 * unlimited caller can either enumerate (invitation codes) or make the server do
 * real work for free (match validation).
 *
 * Keyed by route and client address, the latter resolved without trusting anything
 * the caller sends — see utils/client-ip and TRUSTED_PROXY_HOPS.
 */
export function rateLimit(options: {
  /** Window length in seconds. */
  window: number;
  /** Requests allowed per window, per client. */
  max: number;
}): MiddlewareHandler {
  return async (c, next) => {
    // Armed on the same terms as Better Auth's own limiter, so the two never
    // disagree about whether this instance limits anything.
    if (!isRateLimitEnabled()) return await next();

    const key = `route:${c.req.method}:${c.req.routePath}:${clientAddress(c)}`;

    let allowed: boolean;
    try {
      allowed = await rateLimitRepository.consume(key, options.window, options.max);
    } catch (error) {
      // A limiter that cannot reach the database must not take the endpoint down
      // with it. Let the request through and say so.
      logger.error({ err: error, key }, "Rate limit check failed — allowing the request");
      return await next();
    }

    if (!allowed) {
      c.header("Retry-After", String(options.window));
      throw new TooManyRequestsError(ErrorCode.TOO_MANY_REQUESTS, {
        retryAfter: options.window,
      });
    }

    void sweepOccasionally();
    await next();
  };
}

async function sweepOccasionally(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  try {
    await rateLimitRepository.deleteExpired(now - SWEEP_HORIZON_MS);
  } catch (error) {
    logger.warn({ err: error }, "Failed to sweep expired rate limit rows");
  }
}
