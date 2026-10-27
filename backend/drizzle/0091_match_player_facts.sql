-- Frozen facts of each (match, player) evaluation, counted by the rules engine's
-- `matchCount` condition. Older matches are backfilled lazily on first count.
CREATE TABLE IF NOT EXISTS "match_player_facts" (
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "season_id" uuid NOT NULL REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "played_at" timestamp with time zone NOT NULL,
  "facts" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "match_player_facts_match_id_player_id_pk" PRIMARY KEY ("match_id", "player_id")
);

CREATE INDEX IF NOT EXISTS "match_player_facts_season_player_idx"
  ON "match_player_facts" ("season_id", "player_id", "played_at");
