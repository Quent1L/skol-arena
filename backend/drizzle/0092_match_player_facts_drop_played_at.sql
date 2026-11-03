-- The snapshot's played_at copied matches.played_at, which every count filters and
-- orders on instead, and which a correction can move: drop the copy, index the lookup.
DROP INDEX IF EXISTS "match_player_facts_season_player_idx";
ALTER TABLE "match_player_facts" DROP COLUMN IF EXISTS "played_at";
CREATE INDEX IF NOT EXISTS "match_player_facts_season_player_idx"
  ON "match_player_facts" ("season_id", "player_id");
