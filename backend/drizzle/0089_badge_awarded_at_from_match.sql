-- Dates every badge from the match that earned it. Badges replayed by the nightly
-- reconciliation used to be stamped with the night of the pass, so a badge earned
-- seasons ago showed up as won yesterday. Live awards move too, from the moment the
-- match was finalized to when it was played, so both paths now mean the same thing.
-- A badge whose match was deleted (match_id nulled) keeps the date it has.
UPDATE "player_badges" AS pb
SET "awarded_at" = m."played_at"
FROM "matches" AS m
WHERE pb."match_id" = m."id"
  AND pb."awarded_at" IS DISTINCT FROM m."played_at";
