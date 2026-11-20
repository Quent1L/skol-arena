/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lives under services/__tests__ because that glob is what `bun run test:unit` runs.
 * Subject under test: the session-cookie forwarding of the auth middleware.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const REFRESHED_COOKIE = "better-auth.session_token=refreshed; Path=/; Max-Age=2592000; HttpOnly";
const CACHE_COOKIE = "better-auth.session_data=cached; Path=/; Max-Age=300; HttpOnly";

let sessionResult: any = null;
let authHeaders = new Headers();

const mockGetSession = mock((_o: any) => Promise.resolve({ headers: authHeaders, response: sessionResult }));
mock.module("../../config/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

mock.module("../user.service", () => ({
  userService: { recordActivity: mock(() => Promise.resolve()) },
}));

import { addUserContext } from "../../middleware/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.use("*", addUserContext);
  app.all("*", (c) => c.json({ ok: true }));
  return app;
}

function withCookies(...cookies: string[]) {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

beforeEach(() => {
  mockGetSession.mockClear();
  sessionResult = { user: { id: "ext-1" }, session: { id: "sess-1" } };
  authHeaders = new Headers();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("addUserContext cookie forwarding", () => {
  it("forwards the refreshed session cookies to the client", async () => {
    authHeaders = withCookies(REFRESHED_COOKIE, CACHE_COOKIE);

    const res = await makeApp().request("/api/tournaments");

    expect(res.headers.getSetCookie()).toEqual([REFRESHED_COOKIE, CACHE_COOKIE]);
  });

  it("adds nothing when Better Auth emitted no cookie", async () => {
    const res = await makeApp().request("/api/tournaments");

    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("forwards cookies even when the session is gone, so a dead cookie gets cleared", async () => {
    sessionResult = null;
    authHeaders = withCookies("better-auth.session_token=; Path=/; Max-Age=0");

    const res = await makeApp().request("/api/tournaments");

    expect(res.headers.getSetCookie()).toEqual(["better-auth.session_token=; Path=/; Max-Age=0"]);
  });

  it("stays out of the way on /api/auth/*, where the handler emits its own cookies", async () => {
    authHeaders = withCookies(REFRESHED_COOKIE);

    const res = await makeApp().request("/api/auth/get-session");

    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("asks Better Auth for the response headers", async () => {
    await makeApp().request("/api/tournaments");

    expect(mockGetSession.mock.calls[0]?.[0]).toMatchObject({ returnHeaders: true });
  });
});
