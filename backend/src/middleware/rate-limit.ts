import type { Context, MiddlewareHandler } from "hono";
import { isRateLimitEnabled } from "../config/rate-limit";
import { rateLimitRepository } from "../repository/rate-limit.repository";
import { ErrorCode, TooManyRequestsError } from "../types/errors";
import { logger } from "../utils/logger";

/** How often the expired-row sweep is allowed to run, at most. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** Rows older than this can no longer belong to any live window. */
const SWEEP_HORIZON_MS = 24 * 60 * 60 * 1000;

let lastSweep = 0;

/**
 * Same resolution order as the error handler uses for its request log, so a
 * throttled caller and its log line name the same address.
 */
function clientAddress(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

/**
 * Fixed-window limit for routes that are open to anyone.
 *
 * Better Auth covers its own subtree (see `rateLimit` in config/auth.ts); this is
 * for the business endpoints that answer before a session exists — where an
 * unlimited caller can either enumerate (invitation codes) or make the server do
 * real work for free (match validation).
 *
 * Keyed by route and client address. Behind a proxy that does not set a forwarded
 * header every caller collapses onto "unknown" and shares one window: that fails
 * closed, which is the right way round, but it is worth setting the header.
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
