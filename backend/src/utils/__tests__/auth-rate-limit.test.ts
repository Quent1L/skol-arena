import { describe, it, expect } from "bun:test";

import { normalizeAuthRateLimitResponse } from "../auth-rate-limit";
import { runWithLang } from "../i18n-context";

/**
 * Better Auth's own limiter answers a bare English sentence, untyped, with the delay
 * in a header it invented. A client can do nothing with any of that: hence this.
 */
describe("normalizeAuthRateLimitResponse", () => {
  function throttled(retryAfter?: string): Response {
    return new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: retryAfter === undefined ? {} : { "X-Retry-After": retryAfter },
    });
  }

  it("answers JSON carrying the error code and the delay", async () => {
    const response = normalizeAuthRateLimitResponse(throttled("42"));

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryAfter: 42,
    });
  });

  it("translates the message with the request language", async () => {
    const [fr, en] = [
      await runWithLang("fr", () => normalizeAuthRateLimitResponse(throttled("10")).json()),
      await runWithLang("en", () => normalizeAuthRateLimitResponse(throttled("10")).json()),
    ];

    expect(fr.message).not.toBe(en.message);
    expect(fr.message).not.toContain("Too many");
  });

  it("still answers a usable body when the delay header is missing", async () => {
    const response = normalizeAuthRateLimitResponse(throttled());

    expect(response.headers.get("retry-after")).toBeNull();
    expect(await response.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("leaves anything that is not a 429 alone", () => {
    const original = new Response("{}", { status: 401 });

    expect(normalizeAuthRateLimitResponse(original)).toBe(original);
  });
});
