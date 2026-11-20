import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

import { validate } from "../validator";
import { errorHandler } from "../../middleware/error";

function makeApp() {
  const app = new Hono();
  app.post("/thing", validate("json", z.object({ name: z.string().min(3), age: z.number().int() })), (c) =>
    c.json(c.req.valid("json")),
  );
  app.get("/search", validate("query", z.object({ q: z.string().min(1) })), (c) => c.json(c.req.valid("query")));
  app.onError(errorHandler);
  return app;
}

const post = (body: unknown) =>
  makeApp().request("/thing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("validate", () => {
  it("passes a valid payload through to the handler", async () => {
    const res = await post({ name: "Ada", age: 36 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Ada", age: 36 });
  });

  /**
   * Regression guard. Throwing a Zod 4 ZodError here would escape the app entirely:
   * it does not extend Error, and Hono's compose rethrows anything failing
   * `instanceof Error` instead of routing it to onError. The symptom is a runtime
   * crash page in place of an API response, which no status assertion would catch
   * on its own — hence the explicit content-type check.
   */
  it("answers a validation failure with the canonical JSON envelope", async () => {
    const res = await post({ name: "no", age: "old" });

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = (await res.json()) as {
      error: { code: string; message: string; details: { target: string; issues: unknown[] } };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.target).toBe("json");
    expect(body.error.details.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "name" })]));
  });

  it("never echoes the rejected payload back to the caller", async () => {
    const res = await post({ name: "no", secret: "hunter2" });

    expect(await res.text()).not.toContain("hunter2");
  });

  it("reports the failing target for a query string too", async () => {
    const res = await makeApp().request("/search?q=");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: { target: string } } };
    expect(body.error.details.target).toBe("query");
  });
});
