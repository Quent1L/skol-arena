import { describe, it, expect, afterEach } from "bun:test";
import {
  CLIENT_IP_HEADER,
  resolveClientIp,
  trustedProxyHops,
  UNKNOWN_CLIENT_IP,
  withResolvedClientIp,
} from "../client-ip";

/**
 * `x-forwarded-for` is appended to by every hop, so its leftmost entries are whatever
 * the caller typed. Reading them is how a rate limiter hands its own key to the
 * attacker: a rotating header then gives each request a fresh window. These tests pin
 * the resolution to the entries the infrastructure actually wrote.
 */
describe("resolveClientIp", () => {
  const original = process.env.TRUSTED_PROXY_HOPS;

  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = original;
  });

  describe("with no proxy declared", () => {
    it("ignores x-forwarded-for entirely and uses the socket", () => {
      delete process.env.TRUSTED_PROXY_HOPS;

      expect(resolveClientIp("1.2.3.4", "10.0.0.9")).toBe("10.0.0.9");
    });

    it("reports nothing when the socket address is unknown", () => {
      delete process.env.TRUSTED_PROXY_HOPS;

      expect(resolveClientIp("1.2.3.4", null)).toBeNull();
    });
  });

  describe("behind one proxy", () => {
    it("takes the address the proxy appended, not the one the caller sent", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";

      expect(resolveClientIp("1.2.3.4, 203.0.113.7", "10.0.0.9")).toBe("203.0.113.7");
    });

    it("gives two spoofing callers the same address", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";

      const first = resolveClientIp("9.9.9.1, 203.0.113.7", "10.0.0.9");
      const second = resolveClientIp("9.9.9.2, 203.0.113.7", "10.0.0.9");

      expect(first).toBe(second);
    });

    it("uses the only entry when the caller sent no header of its own", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";

      expect(resolveClientIp("203.0.113.7", "10.0.0.9")).toBe("203.0.113.7");
    });

    it("falls back to the socket when the header is missing", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";

      expect(resolveClientIp(null, "10.0.0.9")).toBe("10.0.0.9");
    });
  });

  describe("behind a CDN in front of the proxy", () => {
    it("counts two hops from the right", () => {
      process.env.TRUSTED_PROXY_HOPS = "2";

      expect(resolveClientIp("9.9.9.9, 203.0.113.7, 198.51.100.2", null)).toBe(
        "203.0.113.7",
      );
    });

    it("falls back when the header is shorter than the declared hops", () => {
      process.env.TRUSTED_PROXY_HOPS = "3";

      expect(resolveClientIp("203.0.113.7", "10.0.0.9")).toBe("10.0.0.9");
    });
  });

  describe("trustedProxyHops", () => {
    it("defaults to none", () => {
      delete process.env.TRUSTED_PROXY_HOPS;

      expect(trustedProxyHops()).toBe(0);
    });

    it("refuses a value that is not a non-negative integer", () => {
      process.env.TRUSTED_PROXY_HOPS = "behind-nginx";

      expect(trustedProxyHops()).toBe(0);
    });

    it("refuses a negative count", () => {
      process.env.TRUSTED_PROXY_HOPS = "-1";

      expect(trustedProxyHops()).toBe(0);
    });
  });
});

describe("withResolvedClientIp", () => {
  const original = process.env.TRUSTED_PROXY_HOPS;

  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = original;
  });

  it("overwrites a client-supplied value of the header it sets", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        [CLIENT_IP_HEADER]: "127.0.0.1",
        "x-forwarded-for": "9.9.9.9, 203.0.113.7",
      },
    });

    const rewritten = withResolvedClientIp(request, "10.0.0.9");

    expect(rewritten.headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
  });

  it("replaces a forged header with the placeholder when nothing resolves", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { [CLIENT_IP_HEADER]: "127.0.0.1" },
    });

    const rewritten = withResolvedClientIp(request, null);

    expect(rewritten.headers.get(CLIENT_IP_HEADER)).toBe(UNKNOWN_CLIENT_IP);
  });

  it("leaves the rest of the request alone", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ email: "a@b.c" }),
    });

    const rewritten = withResolvedClientIp(request, null);

    expect(rewritten.method).toBe("POST");
    expect(rewritten.url).toBe(request.url);
    expect(rewritten.headers.get("content-type")).toBe("application/json");
  });
});
