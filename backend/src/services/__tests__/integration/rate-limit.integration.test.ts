import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { Hono } from "hono";
import { rateLimit } from "../../../db/schema";
import { rateLimitRepository } from "../../../repository/rate-limit.repository";
import { rateLimit as rateLimitMiddleware } from "../../../middleware/rate-limit";
import { errorHandler } from "../../../middleware/error";
import { getTableColumns } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * The `rateLimit` table is shared with Better Auth, which reaches it through its
 * own Drizzle adapter rather than through this repository.
 *
 * That sharing is what made the first version of this table fail in a way no test
 * caught: it had `key` as its primary key and no `id` column at all. Type checking
 * passed, every suite passed, and then every single /api/auth/* request answered 500
 * — the adapter writes an `id` into each row and refuses a model without one. These
 * tests exist so the contract with that adapter is checked here rather than in a
 * browser.
 */
describe("Rate limiting (integration)", () => {
  beforeAll(async () => {
    await testDb.delete(rateLimit);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe("the table Better Auth shares", () => {
    /**
     * What @better-auth/drizzle-adapter looks up by name. `id` is the one that was
     * missing; the other three are the fields the rate limiter reads and writes.
     */
    const REQUIRED_COLUMNS = ["id", "key", "count", "lastRequest"];

    it("exposes every column the Better Auth adapter addresses", () => {
      const columns = Object.keys(getTableColumns(rateLimit));
      for (const required of REQUIRED_COLUMNS) {
        expect(columns).toContain(required);
      }
    });

    it("is actually created that way by the migrations", async () => {
      const result = await testDb.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'rateLimit'`,
      );
      const columns = (result.rows as Array<{ column_name: string }>).map(
        (r) => r.column_name,
      );

      // The physical names, not the Drizzle property names.
      expect(columns).toContain("id");
      expect(columns).toContain("key");
      expect(columns).toContain("count");
      expect(columns).toContain("last_request");
    });

    it("keeps `key` unique so the upsert can resolve on it", async () => {
      await rateLimitRepository.consume("dup-check", 60, 10);
      await rateLimitRepository.consume("dup-check", 60, 10);

      const rows = await testDb
        .select()
        .from(rateLimit)
        .where(sql`${rateLimit.key} = 'dup-check'`);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.count).toBe(2);
      expect(rows[0]!.id).toBeTruthy();
    });
  });

  describe("consume", () => {
    it("allows requests up to the limit and refuses the next one", async () => {
      const key = `burst-${Date.now()}`;

      const verdicts: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        verdicts.push(await rateLimitRepository.consume(key, 60, 3));
      }

      expect(verdicts).toEqual([true, true, true, false]);
    });

    it("counts each key separately", async () => {
      const a = `sep-a-${Date.now()}`;
      const b = `sep-b-${Date.now()}`;

      expect(await rateLimitRepository.consume(a, 60, 1)).toBe(true);
      expect(await rateLimitRepository.consume(a, 60, 1)).toBe(false);
      // b has its own window, untouched by a exhausting its own.
      expect(await rateLimitRepository.consume(b, 60, 1)).toBe(true);
    });

    it("starts a fresh window once the old one has elapsed", async () => {
      const key = `rollover-${Date.now()}`;

      expect(await rateLimitRepository.consume(key, 60, 1)).toBe(true);
      expect(await rateLimitRepository.consume(key, 60, 1)).toBe(false);

      // Age the row past the window rather than waiting for it.
      await testDb
        .update(rateLimit)
        .set({ lastRequest: Date.now() - 61_000 })
        .where(sql`${rateLimit.key} = ${key}`);

      expect(await rateLimitRepository.consume(key, 60, 1)).toBe(true);
    });

    it("does not let concurrent calls both read a stale count", async () => {
      const key = `race-${Date.now()}`;

      // The whole decision is one statement precisely so this cannot over-admit.
      const verdicts = await Promise.all(
        Array.from({ length: 6 }, () => rateLimitRepository.consume(key, 60, 3)),
      );

      expect(verdicts.filter(Boolean)).toHaveLength(3);
    });
  });

  describe("deleteExpired", () => {
    it("drops rows older than the horizon and keeps the rest", async () => {
      const stale = `stale-${Date.now()}`;
      const fresh = `fresh-${Date.now()}`;

      await rateLimitRepository.consume(stale, 60, 10);
      await rateLimitRepository.consume(fresh, 60, 10);
      await testDb
        .update(rateLimit)
        .set({ lastRequest: Date.now() - 100_000 })
        .where(sql`${rateLimit.key} = ${stale}`);

      await rateLimitRepository.deleteExpired(Date.now() - 50_000);

      const remaining = await testDb.select().from(rateLimit);
      const keys = remaining.map((r) => r.key);
      expect(keys).not.toContain(stale);
      expect(keys).toContain(fresh);
    });
  });
  /**
   * The middleware, over HTTP rather than through the repository.
   *
   * The counter was covered above and the key was not, which is where the whole
   * mechanism can be defeated: a key derived from a header the caller writes gives
   * every request a fresh window. These exercise the derivation and the response.
   */
  describe("the middleware", () => {
    const previousArmed = process.env.RATE_LIMIT_ENABLED;
    const previousHops = process.env.TRUSTED_PROXY_HOPS;

    /** A distinct path per test, so one test's window is not another's. */
    function isolated(max: number) {
      const app = new Hono();
      app.onError(errorHandler);
      const path = `/validate-${crypto.randomUUID()}`;
      app.post(path, rateLimitMiddleware({ window: 300, max }), (c) => c.json({ ok: true }));
      return { app, path };
    }

    beforeAll(() => {
      process.env.RATE_LIMIT_ENABLED = "true";
      process.env.TRUSTED_PROXY_HOPS = "1";
    });

    afterAll(() => {
      if (previousArmed === undefined) delete process.env.RATE_LIMIT_ENABLED;
      else process.env.RATE_LIMIT_ENABLED = previousArmed;
      if (previousHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = previousHops;
    });

    it("refuses past the limit, in the canonical envelope", async () => {
      const { app, path } = isolated(2);
      const send = () =>
        app.request(path, {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.10" },
        });

      expect((await send()).status).toBe(200);
      expect((await send()).status).toBe(200);

      const refused = await send();
      expect(refused.status).toBe(429);
      expect(refused.headers.get("retry-after")).toBe("300");
      expect(await refused.json()).toMatchObject({
        error: { code: "TOO_MANY_REQUESTS", details: { retryAfter: 300 } },
      });
    });

    /**
     * The regression this exists for: with the client's own entry read as the key, all
     * four of these would have been allowed.
     */
    it("cannot be escaped by rotating the caller's own x-forwarded-for entry", async () => {
      const { app, path } = isolated(2);
      const statuses: number[] = [];

      for (let i = 0; i < 4; i++) {
        const res = await app.request(path, {
          method: "POST",
          headers: { "x-forwarded-for": `9.9.9.${i}, 203.0.113.20` },
        });
        statuses.push(res.status);
      }

      expect(statuses).toEqual([200, 200, 429, 429]);
    });

    it("still counts two genuinely different callers apart", async () => {
      const { app, path } = isolated(1);

      const first = await app.request(path, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.30" },
      });
      const second = await app.request(path, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.31" },
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it("does nothing at all when rate limiting is not armed", async () => {
      process.env.RATE_LIMIT_ENABLED = "false";
      const { app, path } = isolated(1);

      const first = await app.request(path, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.40" },
      });
      const second = await app.request(path, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.40" },
      });
      process.env.RATE_LIMIT_ENABLED = "true";

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });
  });
});
