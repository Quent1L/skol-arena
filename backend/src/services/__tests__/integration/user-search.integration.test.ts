import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
} from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { userRepository } from "../../../repository/user.repository";
import { detectAccentFolding } from "../../../utils/accent-folding";
import { appUsers } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { join } from "path";

const adminQuery = {
  limit: 20,
  offset: 0,
  sortBy: "displayName",
  sortDir: "asc",
} as const;

async function seedUsers() {
  await testDb.insert(appUsers).values([
    { displayName: "Éloïse Lefèvre", shortName: "ELO", role: "player" },
    { displayName: "Jérôme Martin", shortName: "JER", role: "player" },
    { displayName: "Bob_Smith", shortName: "BOB", role: "player" },
    { displayName: "Bobby Smith", shortName: "BBY", role: "player" },
  ]);
}

describe("user search", () => {
  beforeAll(async () => {
    expect(await detectAccentFolding()).toBe(true);
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await seedUsers();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("searchByName ignores case and accents", async () => {
    for (const query of ["eloise", "ELOISE", "Éloïse", "lefevre"]) {
      const results = await userRepository.searchByName(query);
      expect(results.map((u) => u.displayName)).toEqual(["Éloïse Lefèvre"]);
    }
  });

  it("searchByName matches an unaccented name from an accented query", async () => {
    const results = await userRepository.searchByName("jéróme");
    expect(results.map((u) => u.displayName)).toEqual(["Jérôme Martin"]);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    const results = await userRepository.searchByName("bob_");
    expect(results.map((u) => u.displayName)).toEqual(["Bob_Smith"]);
  });

  it("listUsersAdmin search ignores case and accents", async () => {
    const { data, total } = await userRepository.listUsersAdmin({
      ...adminQuery,
      search: "JEROME",
    });
    expect(total).toBe(1);
    expect(data[0]?.displayName).toBe("Jérôme Martin");
  });

  describe("without the unaccent extension", () => {
    beforeAll(async () => {
      await testDb.execute(sql`DROP EXTENSION unaccent`);
      expect(await detectAccentFolding()).toBe(false);
    });

    afterAll(async () => {
      await testDb.execute(sql`CREATE EXTENSION unaccent`);
      await detectAccentFolding();
    });

    it("falls back to a case-insensitive, accent-sensitive search", async () => {
      expect(await userRepository.searchByName("eloise")).toEqual([]);
      const results = await userRepository.searchByName("ÉLOÏSE");
      expect(results.map((u) => u.displayName)).toEqual(["Éloïse Lefèvre"]);
    });

    it("keeps the admin listing working", async () => {
      const { total } = await userRepository.listUsersAdmin({ ...adminQuery, search: "smith" });
      expect(total).toBe(2);
    });
  });

  it("migration 0085 commits even when unaccent cannot be created", async () => {
    // No contrib extension registered: CREATE EXTENSION fails like it would on a
    // server without contrib or for a role lacking CREATE on the database.
    const bare = new PGlite();
    const migration = readFileSync(
      join(import.meta.dir, "../../../../drizzle/0085_unaccent.sql"),
      "utf-8",
    );
    try {
      await bare.exec(migration);
      const { rows } = await bare.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'unaccent'",
      );
      expect(rows[0]?.n).toBe(0);
    } finally {
      await bare.close();
    }
  });
});
