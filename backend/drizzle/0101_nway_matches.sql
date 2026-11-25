-- N-way matches (1v1v1, 2v2v2, …). A match used to oppose exactly two sides, and its result was
-- the one A/B letter in matches.winner_side. With three sides or more a single winner says
-- nothing about who came second, so every side now stores its own placement.
--
-- `rank` is competition ranking (1 = first, ties share a rank: 1, 1, 3). It becomes the source
-- of truth for every result; winner_side stays written for two-side matches only, which is all
-- brackets and every match stored before this migration. Scheduled matches keep a null rank:
-- they have no result yet.
ALTER TABLE "match_sides" ADD COLUMN IF NOT EXISTS "rank" integer;

--> statement-breakpoint
-- Backfill from the stored A/B result: a null winner on a match that has a result is a draw.
UPDATE "match_sides" AS ms
SET "rank" = CASE
  WHEN m."winner_side" IS NULL THEN 1
  WHEN m."winner_side" = 'A' AND ms."position" = 1 THEN 1
  WHEN m."winner_side" = 'B' AND ms."position" = 2 THEN 1
  ELSE 2
END
FROM "matches" AS m
WHERE ms."match_id" = m."id"
  AND ms."rank" IS NULL
  AND m."status" IN ('reported', 'pending_confirmation', 'confirmed', 'disputed', 'finalized');

--> statement-breakpoint
-- Upper bound on the number of sides a match of the competition may hold. Two keeps every
-- existing competition exactly as it was.
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "max_sides_per_match" integer DEFAULT 2 NOT NULL;

--> statement-breakpoint
-- Where a side's championship points come from: the win/draw/loss points ('match_result', the
-- existing behaviour), a table of points per placement ('rank', read from rank_points), or the
-- side's raw score ('score').
ALTER TABLE "tournament_scoring_configs" ADD COLUMN IF NOT EXISTS "points_source" text DEFAULT 'match_result' NOT NULL;

--> statement-breakpoint
ALTER TABLE "tournament_scoring_configs" ADD COLUMN IF NOT EXISTS "rank_points" jsonb;

--> statement-breakpoint
-- Rules-engine snapshots frozen before this migration carry no `sideCount`/placement facts. The
-- lazy backfill rebuilds missing rows on the next count, so clearing them is lossless.
DELETE FROM "match_player_facts";

--> statement-breakpoint
-- Cached player stats predate ranked placements and the N-way match formats (1v1v1). Both
-- caches are read-through: dropping the rows only costs one recompute on the next read.
DELETE FROM "player_computed_data";

--> statement-breakpoint
DELETE FROM "computed_data" WHERE "key" = 'stats';
