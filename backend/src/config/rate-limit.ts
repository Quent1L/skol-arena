/**
 * Whether request rate limiting is armed.
 *
 * Production, always. Elsewhere it is off by default, and that is a workflow
 * decision rather than a security one: the end-to-end suite signs in half a dozen
 * times in a row, and anyone iterating on the login form would lock themselves out
 * of their own machine for a minute at a time. Better Auth's built-in default draws
 * the line in the same place — the point of declaring it here is that the line is
 * now visible in the repository instead of buried in a dependency.
 *
 * `RATE_LIMIT_ENABLED` overrides either way, so the limits can be exercised
 * deliberately outside production.
 */
export function isRateLimitEnabled(): boolean {
  const override = process.env.RATE_LIMIT_ENABLED;
  if (override !== undefined) return override !== "false";

  return process.env.NODE_ENV === "production";
}
