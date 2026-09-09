import { describe, it, expect, afterEach } from "bun:test";

import { isRateLimitEnabled } from "../../config/rate-limit";

/**
 * The first version of this armed rate limiting unconditionally. Production was
 * fine; everything else was not — the e2e suite signs in six times in a row and
 * started collecting 429s, and local iteration on the login form locked the
 * developer out of their own machine.
 *
 * These pin the trade-off so it cannot drift back either way: silently off in
 * production would be a security regression, silently on everywhere else breaks
 * the suite that is supposed to catch security regressions.
 */
describe("isRateLimitEnabled", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    override: process.env.RATE_LIMIT_ENABLED,
  };

  afterEach(() => {
    restore("NODE_ENV", original.nodeEnv);
    restore("RATE_LIMIT_ENABLED", original.override);
  });

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  it("is armed in production", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    process.env.NODE_ENV = "production";

    expect(isRateLimitEnabled()).toBe(true);
  });

  it("is off in development, so the login form stays usable", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    process.env.NODE_ENV = "development";

    expect(isRateLimitEnabled()).toBe(false);
  });

  it("is off when no environment is declared at all", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.NODE_ENV;

    expect(isRateLimitEnabled()).toBe(false);
  });

  it("can be forced on outside production, to exercise the limits", () => {
    process.env.NODE_ENV = "development";
    process.env.RATE_LIMIT_ENABLED = "true";

    expect(isRateLimitEnabled()).toBe(true);
  });

  it("can be forced off in production, for an operator who limits upstream", () => {
    process.env.NODE_ENV = "production";
    process.env.RATE_LIMIT_ENABLED = "false";

    expect(isRateLimitEnabled()).toBe(false);
  });
});
