import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

import { buildVersionApp } from "../build";
import { INTERNAL_PREFIX } from "../dispatch";
import { generateVersionSpec, mountApiDocs } from "../openapi";
import { PUBLIC_ROUTES, isPublicRoute } from "../public-routes";

/**
 * Authentication is applied to the whole version app and lifted only for the
 * PUBLIC_ROUTES allowlist. These tests pin that down from the outside: an anonymous
 * request to anything not on the list is refused before a handler runs, and the
 * list itself only names routes that exist.
 */

type RouterRow = { path: string; method: string };
type SpecOperation = { responses?: Record<string, unknown>; security?: unknown[] };
type Spec = {
  paths: Record<string, Record<string, SpecOperation>>;
  security?: unknown[];
  components?: { securitySchemes?: Record<string, { type?: string; in?: string; name?: string }> };
};

const OPERATION_KEYS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const SAMPLE_ID = "00000000-0000-4000-8000-000000000000";

/** Each `METHOD /path` the version app actually serves, middleware rows left out. */
function servedRoutes(): string[] {
  const rows = (buildVersionApp("v1") as unknown as { routes: RouterRow[] }).routes;
  const routes = rows
    .filter((row) => row.method !== "ALL" && !row.path.includes("*"))
    .map((row) => `${row.method} ${row.path}`);
  return [...new Set(routes)];
}

/** Fills every `:param` (with or without a `{regex}`) with a plausible value. */
const concretePath = (path: string) => path.replace(/:[^/{]+(\{[^}]*\})?/g, SAMPLE_ID);

describe("isPublicRoute", () => {
  it("matches only the listed method and shape", () => {
    expect(isPublicRoute("GET", `/game-rules/${SAMPLE_ID}`)).toBe(true);
    expect(isPublicRoute("GET", "/game-rules")).toBe(false);
    expect(isPublicRoute("PATCH", `/game-rules/${SAMPLE_ID}`)).toBe(false);
    expect(isPublicRoute("GET", `/game-rules/${SAMPLE_ID}/extra`)).toBe(false);
    expect(isPublicRoute("GET", "/tournaments")).toBe(false);
  });

  it("treats HEAD as GET", () => {
    expect(isPublicRoute("HEAD", "/config")).toBe(true);
  });
});

describe("authentication by default", () => {
  it("refuses an anonymous caller on every route outside the allowlist", async () => {
    const app = new Hono().route(`${INTERNAL_PREFIX}/v1`, buildVersionApp("v1"));
    const routes = servedRoutes();
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length);

    const open: string[] = [];
    for (const route of routes) {
      const [method, path] = route.split(" ") as [string, string];
      if (isPublicRoute(method, path)) continue;

      const response = await app.request(`${INTERNAL_PREFIX}/v1${concretePath(path)}`, { method });
      if (response.status !== 401) open.push(`${route} → ${response.status}`);
    }

    // A route landing here answers without a session. If that is intended, add it to
    // PUBLIC_ROUTES; otherwise something bypasses the version-wide guard.
    expect(open).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    const served = new Set(servedRoutes());

    // A stale entry would silently publish whatever route later reuses its path.
    const stale = PUBLIC_ROUTES.filter((entry) => !served.has(entry));
    expect(stale).toEqual([]);
  });

  it("documents a 401 on every protected operation", async () => {
    const spec = (await generateVersionSpec("v1")) as Spec;

    const mismatched = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([key]) => OPERATION_KEYS.includes(key))
        .filter(([key, operation]) => {
          const honoPath = path.replace(/\{([^}]+)\}/g, ":$1");
          const declares401 = operation.responses?.["401"] !== undefined;
          const isPublic = isPublicRoute(key.toUpperCase(), honoPath);
          // A public route may still document a 401 it sends itself (session checks).
          return !isPublic && !declares401;
        })
        .map(([key]) => `${key.toUpperCase()} ${path}`),
    );

    expect(mismatched).toEqual([]);
  });

  it("declares the session cookie and lifts it only on public operations", async () => {
    const spec = (await generateVersionSpec("v1")) as Spec;

    const scheme = spec.components?.securitySchemes?.sessionCookie;
    expect(scheme).toMatchObject({ type: "apiKey", in: "cookie" });
    expect(scheme?.name).toContain("session_token");
    expect(spec.security).toEqual([{ sessionCookie: [] }]);

    const wrong = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([key]) => OPERATION_KEYS.includes(key))
        .filter(([key, operation]) => {
          const isPublic = isPublicRoute(key.toUpperCase(), path.replace(/\{([^}]+)\}/g, ":$1"));
          // Protected: inherits the global requirement. Public: overrides it.
          return isPublic ? operation.security === undefined : operation.security !== undefined;
        })
        .map(([key]) => `${key.toUpperCase()} ${path}`),
    );
    expect(wrong).toEqual([]);
  });

  it("serves the API reference to anonymous callers when docs are enabled", async () => {
    const previous = process.env.API_DOCS_ENABLED;
    process.env.API_DOCS_ENABLED = "true";
    try {
      // Mounted on the root app, outside the version app and so outside its guard.
      const app = new Hono();
      mountApiDocs(app as unknown as Parameters<typeof mountApiDocs>[0]);

      expect((await app.request("/api/docs")).status).toBe(200);
      expect((await app.request("/api/openapi/v1.json")).status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.API_DOCS_ENABLED;
      else process.env.API_DOCS_ENABLED = previous;
    }
  });
});
