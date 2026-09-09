-- Backs `rateLimit: { storage: "database" }` in config/auth.ts, plus the middleware
-- limiting the public business endpoints. Until now nothing rate-limited anything:
-- Better Auth's own default only arms itself in production and was never declared,
-- so a self-hosted instance had no protection it could point at.
--
-- Better Auth owns the shape of this table -- key, count, last_request as epoch
-- milliseconds -- and resolves it by the `rateLimit` key of the schema object it is
-- given, so the Drizzle export name matters as much as the table name here.
--
-- `key` is the natural key but not the primary key: the Drizzle adapter writes an
-- `id` into every row it creates and refuses outright a model without that column.
-- It is a unique column instead, which is what both the adapter's lookups and our
-- own `INSERT ... ON CONFLICT` address the row by.

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL
);

-- Expired rows are swept opportunistically on write rather than by a job, so the
-- sweep has to be able to find them without scanning the table.
CREATE INDEX IF NOT EXISTS "idx_rate_limit_last_request" ON "rateLimit" ("last_request");
