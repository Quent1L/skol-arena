import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

import { INTERNAL_PREFIX, UNSUPPORTED_VERSION_PATH, withApiVersion } from "../dispatch";
import { errorHandler } from "../../middleware/error";
import { BadRequestError, ErrorCode } from "../../types/errors";

/**
 * Stands in for the real app: the routes below mirror how index.ts registers the
 * per-version mounts, the unsupported-version handler and the exempt subtrees, so
 * the dispatch layer is exercised without booting migrations or the job worker.
 */
function makeFetch() {
  const app = new Hono();

  app.all(`${INTERNAL_PREFIX}/v1/*`, (c) => c.json({ served: "v1", path: c.req.path }));
  app.all(UNSUPPORTED_VERSION_PATH, (c) => {
    throw new BadRequestError(ErrorCode.UNSUPPORTED_API_VERSION, {
      requested: c.req.header("accept-version") ?? "",
      supported: "v1",
    });
  });
  app.all("/api/auth/*", (c) => c.json({ served: "auth", path: c.req.path }));
  app.all("/api/ws", (c) => c.json({ served: "ws" }));
  app.all("/api/docs", (c) => c.json({ served: "docs" }));
  app.all("*", (c) => c.text("spa-shell"));
  app.onError(errorHandler);

  return withApiVersion(app.fetch);
}

const call = (path: string, headers?: Record<string, string>) =>
  makeFetch()(new Request(`http://localhost${path}`, { headers }));

describe("API version dispatch", () => {
  it("serves the latest version when the client sends no header", async () => {
    const res = await call("/api/config");

    expect(res.status).toBe(200);
    expect(res.headers.get("X-API-VERSION")).toBe("v1");
    expect(await res.json()).toEqual({ served: "v1", path: `${INTERNAL_PREFIX}/v1/config` });
  });

  it("marks the response as varying on the negotiation header", async () => {
    const res = await call("/api/config");

    expect(res.headers.get("Vary")?.toLowerCase()).toContain("accept-version");
  });

  it("routes an explicitly pinned version", async () => {
    const res = await call("/api/config", { "accept-version": "v1" });

    expect(await res.json()).toMatchObject({ served: "v1" });
    expect(res.headers.get("X-API-VERSION")).toBe("v1");
  });

  it("refuses an unknown version with the canonical error envelope", async () => {
    const res = await call("/api/config", { "accept-version": "v9" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: unknown } };
    expect(body.error.code).toBe("UNSUPPORTED_API_VERSION");
    expect(body.error.details).toMatchObject({ requested: "v9", supported: "v1" });
  });

  it("still reports a version on the refusal, so the client learns what it got", async () => {
    const res = await call("/api/config", { "accept-version": "v9" });

    expect(res.headers.get("X-API-VERSION")).toBe("v1");
  });

  it.each([
    ["/api/auth/get-session", "auth"],
    ["/api/ws", "ws"],
    ["/api/docs", "docs"],
  ])("leaves %s outside version negotiation", async (path, served) => {
    const res = await call(path);

    expect(await res.json()).toMatchObject({ served });
    expect(res.headers.get("X-API-VERSION")).toBeNull();
  });

  it("keeps the internal mount prefix unreachable from outside", async () => {
    const res = await call(`${INTERNAL_PREFIX}/v1/config`);

    expect(res.status).toBe(404);
  });

  it("does not touch non-API traffic", async () => {
    const res = await call("/assets/app.js");

    expect(await res.text()).toBe("spa-shell");
    expect(res.headers.get("X-API-VERSION")).toBeNull();
  });
});
