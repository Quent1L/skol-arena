/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";
import type { Pool } from "pg";

const { withAdvisoryLock } = await import("../advisory-lock");

function fakePool(acquired: boolean) {
  const query = mock(async (sql: string, _params?: unknown[]) => ({
    rows: sql.includes("pg_try_advisory_lock") ? [{ acquired }] : [],
  }));
  const release = mock(() => {});
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  return { pool, query, release };
}

describe("withAdvisoryLock", () => {
  it("runs the task, then unlocks and releases the connection", async () => {
    const { pool, query, release } = fakePool(true);
    const fn = mock(async () => 42);

    const out = await withAdvisoryLock(pool, 7, fn);

    expect(out).toEqual({ ran: true, result: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][0]).toContain("pg_advisory_unlock");
    expect(query.mock.calls[1][1]).toEqual([9_876_543, 7]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("skips the task when another instance holds the lock", async () => {
    const { pool, query, release } = fakePool(false);
    const fn = mock(async () => 1);

    const out = await withAdvisoryLock(pool, 7, fn);

    expect(out).toEqual({ ran: false });
    expect(fn).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("unlocks, releases and rethrows when the task fails", async () => {
    const { pool, query, release } = fakePool(true);

    await expect(
      withAdvisoryLock(pool, 7, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(query.mock.calls[1][0]).toContain("pg_advisory_unlock");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
