import { describe, it, expect, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";

const testDb = await createTestDatabase();

afterAll(async () => {
  await closeTestDatabase();
});

describe("notifications indexes", () => {
  it("indexes match_id and announcement_id, filtered on every match open and announcement list", async () => {
    const result = await testDb.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'notifications'`,
    );
    const defs = result.rows.map((r) => r.indexdef).join("\n");
    expect(defs).toContain("(match_id)");
    expect(defs).toContain("(announcement_id)");
  });
});
